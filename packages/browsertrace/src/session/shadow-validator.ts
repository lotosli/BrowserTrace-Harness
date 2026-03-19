import type { Page } from 'playwright-core';
import type { AppRuntimeConfig } from '../config/config-schema.js';
import type { ValidationResult } from '../types/runtime.js';

export type ObservedResponse = {
  url: string;
  status: number;
};

export const pickCriticalRequest = (
  responses: ObservedResponse[],
  patterns: string[]
): ObservedResponse | undefined => {
  if (patterns.length > 0) {
    return responses.find((response) => patterns.some((pattern) => response.url.includes(pattern)) && response.status >= 200 && response.status < 300);
  }

  return responses.find((response) => response.status >= 200 && response.status < 300);
};

export class ShadowValidator {
  public async validate(
    page: Page,
    appConfig: AppRuntimeConfig | undefined,
    responses: ObservedResponse[]
  ): Promise<ValidationResult> {
    const validation = appConfig?.validation;
    const currentUrl = page.url();
    if (validation?.login_url_contains && currentUrl.includes(validation.login_url_contains)) {
      return {
        status: 'expired',
        currentUrl,
        selectorVisible: false
      };
    }

    const selectorVisible = validation?.page_selector ? await page.locator(validation.page_selector).isVisible().catch(() => false) : true;
    if (!selectorVisible) {
      return {
        status: 'rehydration_failed',
        currentUrl,
        selectorVisible: false
      };
    }

    const apiStatus = validation?.api_url
      ? await page.evaluate(async (apiUrl) => {
          const response = await fetch(apiUrl, { credentials: 'include' });
          return response.status;
        }, validation.api_url).catch(() => undefined)
      : undefined;
    if (validation?.api_url && apiStatus !== 200) {
      return {
        status: 'expired',
        currentUrl,
        selectorVisible,
        apiStatus
      };
    }

    const criticalRequest = pickCriticalRequest(responses, validation?.critical_api_patterns ?? []);
    return {
      status: criticalRequest || responses.length === 0 ? 'validated' : 'rehydration_failed',
      currentUrl,
      selectorVisible,
      apiStatus,
      criticalRequestMatched: criticalRequest?.url
    };
  }
}

