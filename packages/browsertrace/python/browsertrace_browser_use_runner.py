#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import base64
import json
import re
import sys
from pathlib import Path
from typing import Any

from browser_use.browser.session import BrowserSession


TEXT_LIMIT = 20_000
EXCERPT_LIMIT = 5_000


def _safe_step_dir(step_id: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_.-]+', '_', step_id)


def _read_input(path_str: str) -> dict[str, Any]:
    return json.loads(Path(path_str).read_text(encoding='utf-8'))


def _write_json(path: Path, value: Any) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return str(path)


def _write_text(path: Path, value: str) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding='utf-8')
    return str(path)


def _write_base64(path: Path, value: str) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64decode(value))
    return str(path)


def _parse_json(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _build_instrumentation_script(trace_headers: dict[str, str], allow_origins: list[str]) -> str:
    headers_json = json.dumps(trace_headers, ensure_ascii=False)
    allow_origins_json = json.dumps(allow_origins, ensure_ascii=False)
    return f"""
(() => {{
  if (window.__browsertraceInstalled) {{
    if (typeof window.__browsertraceSetTraceHeaders === 'function') {{
      window.__browsertraceSetTraceHeaders({headers_json});
    }}
    return;
  }}

  const ALLOW_ORIGINS = new Set({allow_origins_json});
  const truncateText = (value, limit = {TEXT_LIMIT}) => {{
    if (typeof value !== 'string') return value;
    return value.length > limit ? value.slice(0, limit) + '\\n...<truncated>' : value;
  }};
  const normalizeError = (value) => {{
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.stack || value.message;
    try {{
      return JSON.stringify(value);
    }} catch {{
      return String(value);
    }}
  }};
  const state = window.__browsertraceState = window.__browsertraceState || {{
    sequence: 0,
    requests: [],
    console: [],
    exceptions: []
  }};

  let TRACE_HEADERS = {headers_json};
  const getTraceParts = () => {{
    const traceparent = TRACE_HEADERS.traceparent || '';
    const parts = traceparent.split('-');
    return {{
      traceId: parts[1],
      spanId: parts[2]
    }};
  }};
  const now = () => new Date().toISOString();
  const shouldInject = (input) => {{
    try {{
      const resolved = new URL(input, window.location.href);
      return resolved.origin === window.location.origin || ALLOW_ORIGINS.has(resolved.origin);
    }} catch {{
      return false;
    }}
  }};
  const installConsoleHook = (type) => {{
    const original = console[type].bind(console);
    console[type] = (...args) => {{
      state.console.push({{
        type,
        text: truncateText(args.map((arg) => normalizeError(arg)).join(' ')),
        timestamp: now()
      }});
      return original(...args);
    }};
  }};

  window.__browsertraceInstalled = true;
  window.__browsertraceSetTraceHeaders = (nextHeaders) => {{
    TRACE_HEADERS = nextHeaders || {{}};
  }};

  ['log', 'info', 'warn', 'error', 'debug'].forEach(installConsoleHook);

  window.addEventListener('error', (event) => {{
    state.exceptions.push(normalizeError(event.error || event.message || 'window error'));
  }});
  window.addEventListener('unhandledrejection', (event) => {{
    state.exceptions.push(normalizeError(event.reason || 'unhandled rejection'));
  }});

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {{}}) => {{
    const request = input instanceof Request ? input : undefined;
    const url = request ? request.url : String(input);
    const traceParts = getTraceParts();
    const startedAt = now();
    const record = {{
      sequence: ++state.sequence,
      url,
      method: request ? request.method : (init.method || 'GET'),
      resourceType: 'fetch',
      startedAt,
      requestHeaders: {{}},
      requestBodyText: typeof init.body === 'string' ? truncateText(init.body) : undefined,
      traceId: traceParts.traceId,
      spanId: traceParts.spanId
    }};

    let nextInit = init;
    if (shouldInject(url)) {{
      const nextHeaders = new Headers(request ? request.headers : init.headers || {{}});
      Object.entries(TRACE_HEADERS).forEach(([key, value]) => nextHeaders.set(key, value));
      record.requestHeaders = Object.fromEntries(nextHeaders.entries());
      nextInit = {{ ...init, headers: nextHeaders }};
    }} else {{
      try {{
        record.requestHeaders = Object.fromEntries(new Headers(request ? request.headers : init.headers || {{}}).entries());
      }} catch {{
        record.requestHeaders = {{}};
      }}
    }}

    try {{
      const response = request
        ? await originalFetch(new Request(request, {{ headers: nextInit.headers || request.headers }}), nextInit)
        : await originalFetch(input, nextInit);
      const finishedAt = now();
      record.finishedAt = finishedAt;
      record.durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
      record.status = response.status;
      record.statusText = response.statusText;
      record.ok = response.ok;
      record.responseHeaders = Object.fromEntries(response.headers.entries());

      try {{
        const responseText = await response.clone().text();
        record.responseBodyText = truncateText(responseText);
        try {{
          record.responseBodyJson = JSON.parse(responseText);
        }} catch {{
          record.responseBodyJson = undefined;
        }}
      }} catch {{
        record.responseBodyText = undefined;
      }}

      state.requests.push(record);
      return response;
    }} catch (error) {{
      const finishedAt = now();
      record.finishedAt = finishedAt;
      record.durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
      record.ok = false;
      record.failureText = normalizeError(error);
      state.requests.push(record);
      throw error;
    }}
  }};

  const OriginalOpen = XMLHttpRequest.prototype.open;
  const OriginalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {{
    this.__browsertraceMethod = method;
    this.__browsertraceUrl = url;
    return OriginalOpen.call(this, method, url, async, user, password);
  }};
  XMLHttpRequest.prototype.send = function(body) {{
    const xhr = this;
    const traceParts = getTraceParts();
    const startedAt = now();
    const record = {{
      sequence: ++state.sequence,
      url: String(xhr.__browsertraceUrl || ''),
      method: String(xhr.__browsertraceMethod || 'GET'),
      resourceType: 'xhr',
      startedAt,
      requestHeaders: {{}},
      requestBodyText: typeof body === 'string' ? truncateText(body) : undefined,
      traceId: traceParts.traceId,
      spanId: traceParts.spanId
    }};

    if (shouldInject(record.url)) {{
      Object.entries(TRACE_HEADERS).forEach(([key, value]) => xhr.setRequestHeader(key, value));
      record.requestHeaders = {{ ...TRACE_HEADERS }};
    }}

    xhr.addEventListener('loadend', () => {{
      const finishedAt = now();
      record.finishedAt = finishedAt;
      record.durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
      record.status = xhr.status;
      record.statusText = xhr.statusText;
      record.ok = xhr.status >= 200 && xhr.status < 400;
      record.responseBodyText = truncateText(xhr.responseText);
      try {{
        record.responseBodyJson = JSON.parse(xhr.responseText);
      }} catch {{
        record.responseBodyJson = undefined;
      }}
      state.requests.push(record);
    }});
    xhr.addEventListener('error', () => {{
      const finishedAt = now();
      record.finishedAt = finishedAt;
      record.durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
      record.ok = false;
      record.failureText = 'XMLHttpRequest failed';
      state.requests.push(record);
    }});

    return OriginalSend.call(xhr, body);
  }};
}})();
"""


PAGE_STATE_SCRIPT = f"""
(...args) => {{
  const excerptLimit = args[0] ?? {EXCERPT_LIMIT};
  const normalize = (value) => (value ?? '').replace(/\\s+/g, ' ').trim();
  const visible = (element) => {{
    const htmlElement = element;
    const style = window.getComputedStyle(htmlElement);
    const rect = htmlElement.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  }};

  const elements = Array.from(document.querySelectorAll('[data-testid]')).map((element) => {{
    const base = {{
      testId: element.dataset.testid ?? '',
      tagName: element.tagName.toLowerCase(),
      text: normalize(element.innerText || element.textContent),
      visible: visible(element),
      className: element.className || undefined,
      disabled: 'disabled' in element ? Boolean(element.disabled) : undefined
    }};

    if (element instanceof HTMLSelectElement) {{
      return {{
        ...base,
        value: element.value,
        selectedText: normalize(element.selectedOptions[0]?.textContent)
      }};
    }}
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {{
      return {{
        ...base,
        value: element.value,
        checked: 'checked' in element ? element.checked : undefined
      }};
    }}
    if (element instanceof HTMLAnchorElement) {{
      return {{
        ...base,
        href: element.href
      }};
    }}
    return base;
  }});

  const elementsByTestId = Object.fromEntries(elements.map((element) => [element.testId, element]));
  const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((element) => normalize(element.textContent)).filter(Boolean);
  const buttons = Array.from(document.querySelectorAll('button')).map((element) => normalize(element.textContent)).filter(Boolean);
  const forms = Array.from(document.querySelectorAll('input, select, textarea')).map((element) => ({{
    name: element.getAttribute('name') || element.id || element.getAttribute('data-testid') || element.tagName.toLowerCase(),
    type: element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase(),
    value: element.value,
    checked: element instanceof HTMLInputElement ? element.checked : undefined,
    disabled: element.disabled
  }}));

  const responsePanelText = elementsByTestId['response-panel']?.text;
  let responsePanelJson = undefined;
  if (responsePanelText) {{
    try {{
      responsePanelJson = JSON.parse(responsePanelText);
    }} catch {{
      responsePanelJson = undefined;
    }}
  }}

  const statusChips = {{}};
  for (const chipId of ['api-base-chip', 'http-status-chip', 'expected-status-chip']) {{
    if (elementsByTestId[chipId]?.text) {{
      statusChips[chipId] = elementsByTestId[chipId].text;
    }}
  }}

  return JSON.stringify({{
    title: document.title,
    url: window.location.href,
    textExcerpt: normalize(document.body.innerText).slice(0, excerptLimit),
    headings,
    buttons,
    forms,
    elementsByTestId,
    responsePanelText,
    responsePanelJson,
    failureTitle: elementsByTestId['result-status-badge']?.text,
    failureDetail: elementsByTestId['error-detail']?.text,
    statusChips
  }});
}}
"""

GET_RUNTIME_STATE_SCRIPT = "() => JSON.stringify(window.__browsertraceState || {sequence: 0, requests: [], console: [], exceptions: []})"
GET_HTML_SCRIPT = "() => document.documentElement.outerHTML"
CLICK_SCRIPT = """
(...args) => {
  const selector = args[0];
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Selector not found: ${selector}`);
  }
  element.scrollIntoView({ block: 'center', inline: 'center' });
  if (element instanceof HTMLElement) {
    element.click();
  } else {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }
  return selector;
}
"""
FILL_SCRIPT = """
(...args) => {
  const selector = args[0];
  const value = args[1];
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Selector not found: ${selector}`);
  }
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
    throw new Error(`Selector is not an editable form element: ${selector}`);
  }
  element.focus();
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return value;
}
"""
SELECT_SCRIPT = """
(...args) => {
  const selector = args[0];
  const value = args[1];
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Selector not found: ${selector}`);
  }
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`Selector is not a select element: ${selector}`);
  }
  element.focus();
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return value;
}
"""
WAIT_PRESENT_SCRIPT = """
(...args) => {
  const selector = args[0];
  return Boolean(document.querySelector(selector));
}
"""
WAIT_VISIBLE_SCRIPT = """
(...args) => {
  const selector = args[0];
  const element = document.querySelector(selector);
  if (!element) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
}
"""


async def _evaluate_json(page, script: str, *args) -> Any:
    return _parse_json(await page.evaluate(script, *args), {})


async def _install_instrumentation(session: BrowserSession, trace_headers: dict[str, str], allow_origins: list[str]) -> None:
    script = _build_instrumentation_script(trace_headers, allow_origins)
    await session._cdp_add_init_script(script)
    page = await session.get_current_page()
    if page is not None:
        await page.evaluate("(...args) => { eval(args[0]); return 'ok'; }", script)


async def _update_trace_headers(session: BrowserSession, trace_headers: dict[str, str]) -> None:
    page = await session.get_current_page()
    if page is None:
        return
    await page.evaluate(
        "(...args) => { if (typeof window.__browsertraceSetTraceHeaders === 'function') { window.__browsertraceSetTraceHeaders(args[0]); } return 'ok'; }",
        trace_headers,
    )


async def _capture_runtime_state(session: BrowserSession) -> dict[str, Any]:
    page = await session.must_get_current_page()
    return await _evaluate_json(page, GET_RUNTIME_STATE_SCRIPT)


async def _capture_page_state(session: BrowserSession) -> dict[str, Any]:
    page = await session.must_get_current_page()
    return await _evaluate_json(page, PAGE_STATE_SCRIPT, EXCERPT_LIMIT)


async def _capture_html(session: BrowserSession) -> str:
    page = await session.must_get_current_page()
    return await page.evaluate(GET_HTML_SCRIPT)


async def _capture_screenshot(session: BrowserSession, path: Path) -> str:
    page = await session.must_get_current_page()
    encoded = await page.screenshot()
    return _write_base64(path, encoded)


async def _wait_for_selector(session: BrowserSession, selector: str, state: str, timeout_ms: int) -> None:
    page = await session.must_get_current_page()
    script = WAIT_VISIBLE_SCRIPT if state == 'visible' else WAIT_PRESENT_SCRIPT
    deadline = asyncio.get_running_loop().time() + (timeout_ms / 1000.0)
    while asyncio.get_running_loop().time() < deadline:
        result = await page.evaluate(script, selector)
        if result == 'true' or result is True:
            return
        await asyncio.sleep(0.1)
    raise RuntimeError(f'Timed out waiting for selector {selector} to become {state}')


async def _execute_step(session: BrowserSession, step: dict[str, Any]) -> str | None:
    action = step['action']
    if action == 'goto':
        await session.navigate_to(step['url'])
        return None

    page = await session.must_get_current_page()
    if action == 'click':
        await page.evaluate(CLICK_SCRIPT, step['selector'])
        return None
    if action == 'fill':
        await page.evaluate(FILL_SCRIPT, step['selector'], step['value'])
        return None
    if action == 'select':
        await page.evaluate(SELECT_SCRIPT, step['selector'], step['value'])
        return None
    if action == 'wait':
        if step.get('selector'):
            await _wait_for_selector(session, step['selector'], step.get('state', 'visible'), int(step.get('ms') or 5_000))
        else:
            await asyncio.sleep((int(step.get('ms') or 1_000)) / 1000.0)
        return None
    if action == 'screenshot':
        return None
    if action == 'eval':
        return await page.evaluate(step['script'])

    raise RuntimeError(f'Unsupported step action: {action}')


async def _run(payload: dict[str, Any]) -> dict[str, Any]:
    artifact_root = Path(payload['artifactRoot'])
    runtime_root = artifact_root / 'runtime'
    steps_root = runtime_root / 'steps'
    trace_headers = payload['traceHeaders']
    allow_origins = payload.get('allowOrigins', [])
    spec = payload['spec']
    wait_between_actions_ms = int(payload.get('waitBetweenActionsMs') or 250)

    session = BrowserSession(
        cdp_url=payload.get('cdpUrl'),
        headless=payload.get('headless'),
        executable_path=payload.get('executablePath'),
        user_data_dir=payload.get('userDataDir'),
        keep_alive=True,
        wait_between_actions=max(wait_between_actions_ms / 1000.0, 0.0),
    )

    await session.start()
    try:
        page = await session.get_current_page()
        if page is None:
            await session.new_page('about:blank')

        await _install_instrumentation(session, trace_headers, allow_origins)

        step_results: list[dict[str, Any]] = []

        for step in spec['steps']:
            step_dir = steps_root / _safe_step_dir(step['id'])
            before = await _capture_runtime_state(session)
            before_request_count = len(before.get('requests', []))
            before_console_count = len(before.get('console', []))
            before_exception_count = len(before.get('exceptions', []))
            eval_result: str | None = None
            error_message: str | None = None
            status = 'ok'

            try:
                await _update_trace_headers(session, trace_headers)
                eval_result = await _execute_step(session, step)
                await asyncio.sleep(wait_between_actions_ms / 1000.0)
            except Exception as error:  # noqa: BLE001
                status = 'error'
                error_message = str(error)

            current_url = await session.get_current_page_url()
            current_title = await session.get_current_page_title()
            page_state = await _capture_page_state(session)
            page_html = await _capture_html(session)
            after = await _capture_runtime_state(session)

            page_state_path = _write_json(step_dir / 'page-state.json', page_state)
            page_html_path = _write_text(step_dir / 'page.html', page_html)
            screenshot_path = await _capture_screenshot(session, step_dir / 'post-action.png')

            action_requests = after.get('requests', [])[before_request_count:]
            action_console = after.get('console', [])[before_console_count:]
            action_exceptions = after.get('exceptions', [])[before_exception_count:]

            step_results.append({
                'id': step['id'],
                'action': step['action'],
                'status': status,
                'currentUrl': current_url,
                'pageTitle': current_title,
                'pageHtmlPath': page_html_path,
                'pageStatePath': page_state_path,
                'screenshotPath': screenshot_path,
                'evalResult': eval_result,
                'errorMessage': error_message,
                'pageState': page_state,
                'consoleEntries': after.get('console', []),
                'actionConsoleEntries': action_console,
                'networkDetailed': after.get('requests', []),
                'actionNetworkDetailed': action_requests,
                'exceptions': after.get('exceptions', []),
                'actionExceptions': action_exceptions,
            })

        final_step = step_results[-1]
        return {
            'engine': 'browser_use_python',
            'currentUrl': final_step['currentUrl'],
            'pageTitle': final_step['pageTitle'],
            'pageStatePath': final_step['pageStatePath'],
            'pageHtmlPath': final_step['pageHtmlPath'],
            'screenshotPath': final_step.get('screenshotPath'),
            'steps': step_results,
        }
    finally:
        await session.stop()


def main() -> int:
    if len(sys.argv) != 2:
        sys.stderr.write('Usage: browsertrace_browser_use_runner.py <input-json-path>\\n')
        return 1

    payload = _read_input(sys.argv[1])
    result = asyncio.run(_run(payload))
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
