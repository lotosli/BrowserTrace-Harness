import type { Page } from 'playwright-core';
import type {
  AiDebugOutcome,
  AiDebugSummary,
  BrowserAction,
  ConsoleEntryRecord,
  NetworkDetailedRecord,
  PageStateProbe,
  ValidationResult
} from '../types/runtime.js';

const TEXT_LIMIT = 20_000;
const EXCERPT_LIMIT = 5_000;

const normalizeText = (value: string | undefined): string => value?.replace(/\s+/g, ' ').trim() ?? '';

const truncateText = (value: string | undefined, limit = TEXT_LIMIT): string | undefined => {
  if (!value) {
    return undefined;
  }
  return value.length > limit ? `${value.slice(0, limit)}\n...<truncated>` : value;
};

const tryParseJson = (value: string | undefined): unknown => {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const parseStatusFromTitle = (title: string | undefined): number | undefined => {
  if (!title) {
    return undefined;
  }
  const matched = title.match(/(\d{3})/);
  return matched ? Number.parseInt(matched[1], 10) : undefined;
};

export const findRootRequest = (requests: NetworkDetailedRecord[]): NetworkDetailedRecord | undefined => {
  const apiLike = requests.filter((request) => {
    const loweredUrl = request.url.toLowerCase();
    return request.resourceType === 'fetch'
      || request.resourceType === 'xhr'
      || loweredUrl.includes('/api/')
      || request.method !== 'GET';
  });

  const bySequenceDesc = (left: NetworkDetailedRecord, right: NetworkDetailedRecord) => right.sequence - left.sequence;
  const nonGet = apiLike.filter((request) => request.method !== 'GET').sort(bySequenceDesc)[0];
  if (nonGet) {
    return nonGet;
  }

  const failed = apiLike.filter((request) => request.ok === false || (request.status ?? 0) >= 400).sort(bySequenceDesc)[0];
  if (failed) {
    return failed;
  }

  return apiLike.sort(bySequenceDesc)[0] ?? requests.sort(bySequenceDesc)[0];
};

export const classifyAiOutcome = (input: {
  pageState: PageStateProbe;
  rootRequest?: NetworkDetailedRecord;
  consoleEntries: ConsoleEntryRecord[];
  exceptions: string[];
}): { category: AiDebugOutcome; reason: string; confidence: number } => {
  const failureTitle = input.pageState.failureTitle;
  const failureDetail = input.pageState.failureDetail;
  const titleStatus = parseStatusFromTitle(failureTitle);

  if (failureTitle?.includes('客户端超时')) {
    return {
      category: 'client_timeout',
      reason: failureDetail || failureTitle,
      confidence: 0.99
    };
  }

  if (failureTitle?.includes('返回结构错误')) {
    return {
      category: 'invalid_response_shape',
      reason: failureDetail || failureTitle,
      confidence: 0.99
    };
  }

  if (titleStatus) {
    return {
      category: 'http_error',
      reason: failureDetail || failureTitle || `HTTP ${titleStatus}`,
      confidence: 0.99
    };
  }

  if (input.rootRequest?.status && input.rootRequest.status >= 400) {
    return {
      category: 'http_error',
      reason: `Root request ${input.rootRequest.method} ${input.rootRequest.url} returned ${input.rootRequest.status}`,
      confidence: 0.94
    };
  }

  if (failureTitle?.includes('请求失败')) {
    return {
      category: 'network_error',
      reason: failureDetail || failureTitle,
      confidence: 0.95
    };
  }

  if (failureTitle) {
    return {
      category: 'ui_error',
      reason: failureDetail || failureTitle,
      confidence: 0.8
    };
  }

  const consoleErrors = input.consoleEntries.filter((entry) => entry.type === 'error');
  if (input.exceptions.length > 0 || consoleErrors.length > 0) {
    return {
      category: 'unknown',
      reason: input.exceptions[0] ?? consoleErrors[0].text,
      confidence: 0.55
    };
  }

  return {
    category: 'success',
    reason: 'No UI failure badge, no failed root request, and no runtime exceptions were detected.',
    confidence: 0.92
  };
};

export const capturePageState = async (page: Page): Promise<PageStateProbe> => {
  return page.evaluate(({ excerptLimit }) => {
    const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const visible = (element: Element): boolean => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };

    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-testid]')).map((element) => {
      const base = {
        testId: element.dataset.testid ?? '',
        tagName: element.tagName.toLowerCase(),
        text: normalize(element.innerText || element.textContent),
        visible: visible(element),
        className: element.className || undefined,
        disabled: 'disabled' in element ? Boolean((element as HTMLInputElement).disabled) : undefined
      };
      if (element instanceof HTMLSelectElement) {
        return {
          ...base,
          value: element.value,
          selectedText: normalize(element.selectedOptions[0]?.textContent)
        };
      }
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return {
          ...base,
          value: element.value,
          checked: 'checked' in element ? element.checked : undefined
        };
      }
      if (element instanceof HTMLAnchorElement) {
        return {
          ...base,
          href: element.href
        };
      }
      return base;
    });

    const elementsByTestId = Object.fromEntries(elements.map((element) => [element.testId, element]));
    const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((element) => normalize(element.textContent)).filter(Boolean);
    const buttons = Array.from(document.querySelectorAll('button')).map((element) => normalize(element.textContent)).filter(Boolean);
    const forms = Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')).map((element) => ({
      name: element.getAttribute('name') || element.id || element.getAttribute('data-testid') || element.tagName.toLowerCase(),
      type: element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase(),
      value: element.value,
      checked: element instanceof HTMLInputElement ? element.checked : undefined,
      disabled: element.disabled
    }));

    const responsePanelText = elementsByTestId['response-panel']?.text;
    const statusChips: Record<string, string> = {};
    for (const chipId of ['api-base-chip', 'http-status-chip', 'expected-status-chip']) {
      if (elementsByTestId[chipId]?.text) {
        statusChips[chipId] = elementsByTestId[chipId].text;
      }
    }

    let responsePanelJson: unknown;
    if (responsePanelText) {
      try {
        responsePanelJson = JSON.parse(responsePanelText);
      } catch {
        responsePanelJson = undefined;
      }
    }

    return {
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
    };
  }, { excerptLimit: EXCERPT_LIMIT });
};

export const buildAiDebugSummary = (input: {
  action: BrowserAction;
  currentUrl: string;
  shadowValidation: ValidationResult;
  pageState: PageStateProbe;
  allRequests: NetworkDetailedRecord[];
  actionRequests: NetworkDetailedRecord[];
  consoleEntries: ConsoleEntryRecord[];
  exceptions: string[];
  traceId?: string;
  traceparent?: string;
  tracestate?: string;
  baggage: Record<string, string>;
  artifactPaths: {
    pageStatePath: string;
    pageHtmlPath: string;
    postActionScreenshotPath: string;
    consoleDetailedPath: string;
    networkDetailedPath: string;
    aiSummaryPath: string;
    tempoTracePath?: string;
    lokiLogsPath?: string;
  };
}): AiDebugSummary => {
  const rootRequest = findRootRequest(input.actionRequests);
  const consoleErrors = input.consoleEntries.filter((entry) => entry.type === 'error');
  const failedRequests = input.actionRequests.filter((request) => request.ok === false || (request.status ?? 0) >= 400);
  const outcome = classifyAiOutcome({
    pageState: input.pageState,
    rootRequest,
    consoleEntries: input.consoleEntries,
    exceptions: input.exceptions
  });

  const appSelect = input.pageState.elementsByTestId['app-select'];
  const scenarioSelect = input.pageState.elementsByTestId['scenario-select'];
  const apiBase = input.pageState.statusChips['api-base-chip']?.replace(/^API Base:\s*/, '');
  const observedHttpStatus = input.pageState.statusChips['http-status-chip']?.replace(/^HTTP:\s*/, '');
  const expectedStatus = input.pageState.statusChips['expected-status-chip']?.replace(/^预期:\s*/, '');

  return {
    schemaVersion: 'browsertrace.ai-debug-summary.v1',
    generatedAt: new Date().toISOString(),
    action: input.action,
    currentUrl: input.currentUrl,
    pageTitle: input.pageState.title,
    shadowValidation: input.shadowValidation,
    actionRequestCount: input.actionRequests.length,
    actionErrorCount: failedRequests.length,
    actionExceptionCount: input.exceptions.length,
    outcome,
    page: {
      appId: appSelect?.value,
      appLabel: appSelect?.selectedText,
      scenarioId: scenarioSelect?.value,
      scenarioLabel: scenarioSelect?.selectedText,
      apiBase,
      observedHttpStatus,
      expectedStatus,
      failureTitle: input.pageState.failureTitle,
      failureDetail: input.pageState.failureDetail,
      responsePanelJson: input.pageState.responsePanelJson,
      responsePanelText: truncateText(input.pageState.responsePanelText),
      textExcerpt: truncateText(input.pageState.textExcerpt, EXCERPT_LIMIT) ?? ''
    },
    rootRequest,
    failedRequests,
    consoleErrors,
    exceptions: input.exceptions,
    trace: {
      traceId: input.traceId,
      traceparent: input.traceparent,
      tracestate: input.tracestate,
      baggage: input.baggage
    },
    artifacts: input.artifactPaths
  };
};

export const sanitizeConsoleEntries = (entries: ConsoleEntryRecord[]): ConsoleEntryRecord[] => {
  return entries.map((entry) => ({
    ...entry,
    text: truncateText(normalizeText(entry.text), 4_000) ?? ''
  }));
};

export const sanitizeNetworkDetails = (records: NetworkDetailedRecord[]): NetworkDetailedRecord[] => {
  return records.map((record) => ({
    ...record,
    requestBodyText: truncateText(record.requestBodyText),
    responseBodyText: truncateText(record.responseBodyText),
    responseBodyJson: record.responseBodyJson
  }));
};

export const shouldCaptureResponseBody = (record: {
  resourceType: string;
  url: string;
  responseHeaders?: Record<string, string>;
}): boolean => {
  const contentType = record.responseHeaders?.['content-type']?.toLowerCase() ?? '';
  return record.resourceType === 'fetch'
    || record.resourceType === 'xhr'
    || record.url.toLowerCase().includes('/api/')
    || contentType.includes('application/json')
    || contentType.startsWith('text/');
};

export const enrichResponseBody = (bodyText: string | undefined): { text?: string; json?: unknown } => ({
  text: truncateText(bodyText),
  json: tryParseJson(bodyText)
});
