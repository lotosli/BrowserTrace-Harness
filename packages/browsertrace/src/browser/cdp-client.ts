import type { Browser, Page } from 'playwright-core';
import { chromium } from 'playwright-core';
import { HarnessError } from '../types/errors.js';

export const connectToChromeOverCdp = async (cdpUrl: string): Promise<Browser> => {
  try {
    return await chromium.connectOverCDP(cdpUrl);
  } catch (error) {
    throw new HarnessError('attach_failed', `Failed to attach to CDP endpoint ${cdpUrl}: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
};

export const collectPages = (browser: Browser): Page[] => browser.contexts().flatMap((context) => context.pages());

