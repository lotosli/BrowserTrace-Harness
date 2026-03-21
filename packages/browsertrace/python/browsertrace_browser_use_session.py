#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from browser_use.browser.profile import BrowserProfile
from browser_use.browser.session import BrowserSession
from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog


def _read_payload(path_str: str) -> dict:
    return json.loads(Path(path_str).read_text(encoding='utf-8'))


async def _start(payload: dict) -> dict:
    if payload.get('cdpUrl'):
        session = BrowserSession(
            cdp_url=payload.get('cdpUrl'),
            keep_alive=True,
            wait_between_actions=max((payload.get('waitBetweenActionsMs') or 250) / 1000.0, 0.0),
        )
        await session.start()
        if await session.get_current_page() is None:
            await session.new_page('about:blank')
        result = {
            'cdpUrl': session.cdp_url,
            'browserPid': None,
            'userDataDir': None,
            'headless': None,
            'executablePath': None,
        }
        await session.stop()
        return result

    user_data_dir = payload.get('userDataDir') or tempfile.mkdtemp(prefix='browsertrace-run-session-')
    profile = BrowserProfile(
        executable_path=payload.get('executablePath'),
        headless=payload.get('headless'),
        user_data_dir=user_data_dir,
        keep_alive=True,
    )
    launch_args = profile.get_args()
    debug_port = LocalBrowserWatchdog._find_free_port()
    launch_args.extend([f'--remote-debugging-port={debug_port}'])

    browser_path = profile.executable_path or LocalBrowserWatchdog._find_installed_browser_path(channel=profile.channel)
    if not browser_path:
        raise RuntimeError('No local browser executable could be resolved for persistent run session.')

    proc = subprocess.Popen(
        [str(browser_path), *launch_args],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    cdp_url = await LocalBrowserWatchdog._wait_for_cdp_url(debug_port)

    session = BrowserSession(
        cdp_url=cdp_url,
        keep_alive=True,
        wait_between_actions=max((payload.get('waitBetweenActionsMs') or 250) / 1000.0, 0.0),
    )
    await session.start()
    if await session.get_current_page() is None:
        await session.new_page('about:blank')

    result = {
        'cdpUrl': cdp_url,
        'browserPid': proc.pid,
        'userDataDir': str(user_data_dir) if user_data_dir else None,
        'headless': payload.get('headless'),
        'executablePath': str(browser_path),
    }
    await session.stop()
    return result


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] != 'start':
        sys.stderr.write('Usage: browsertrace_browser_use_session.py start <input-json-path>\n')
        return 1

    payload = _read_payload(sys.argv[2])
    result = asyncio.run(_start(payload))
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
