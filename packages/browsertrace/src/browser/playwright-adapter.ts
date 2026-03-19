import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { BrowserTraceConfig } from '../config/config-schema.js';
import { HarnessError } from '../types/errors.js';
import { detectChromeExecutable } from '../utils/os.js';

export const launchShadowBrowser = async (
  config: BrowserTraceConfig
): Promise<{ browser: Browser; context: BrowserContext; page: Page; executablePath: string }> => {
  const executablePath = await detectChromeExecutable(config.chrome.executable_path);
  if (!executablePath) {
    throw new HarnessError('shadow_launch_failed', 'No Chrome/Chromium executable could be found. Configure chrome.executable_path explicitly.');
  }

  try {
    const browser = await chromium.launch({
      executablePath,
      headless: true
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    return { browser, context, page, executablePath };
  } catch (error) {
    throw new HarnessError('shadow_launch_failed', `Failed to launch headless browser: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
};

