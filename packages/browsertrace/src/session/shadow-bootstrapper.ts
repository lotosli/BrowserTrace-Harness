import path from 'node:path';
import type { Browser, BrowserContext, Page, Response } from 'playwright-core';
import type { AppRuntimeConfig } from '../config/config-schema.js';
import { launchShadowBrowser } from '../browser/playwright-adapter.js';
import { buildPropagationScript } from '../trace/http-header-injector.js';
import { ShadowValidator } from './shadow-validator.js';
import { HarnessError } from '../types/errors.js';
import type { RunContext } from '../cli/run-context.js';
import type { NetworkSummaryRecord, ValidationResult } from '../types/runtime.js';
import type { ShadowBundle } from '../types/session.js';

type RehydratedShadow = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  network: NetworkSummaryRecord[];
  consoleMessages: string[];
  exceptions: string[];
  validation: ValidationResult;
  propagationFilePath: string;
};

const writeStorage = async (
  page: Page,
  localStorageEntries: Record<string, string>,
  sessionStorageEntries: Record<string, string>
): Promise<void> => {
  await page.evaluate(
    ({ localStorageEntries, sessionStorageEntries }) => {
      for (const [key, value] of Object.entries(localStorageEntries)) {
        window.localStorage.setItem(key, value);
      }
      for (const [key, value] of Object.entries(sessionStorageEntries)) {
        window.sessionStorage.setItem(key, value);
      }
    },
    { localStorageEntries, sessionStorageEntries }
  );
};

export class ShadowBootstrapper {
  private readonly validator = new ShadowValidator();

  public async rehydrate(
    bundle: ShadowBundle,
    runContext: RunContext,
    appConfig: AppRuntimeConfig | undefined
  ): Promise<RehydratedShadow> {
    const { browser, context, page } = await launchShadowBrowser(runContext.config);
    const network: NetworkSummaryRecord[] = [];
    const consoleMessages: string[] = [];
    const exceptions: string[] = [];
    const responses: Response[] = [];

    page.on('response', async (response) => {
      responses.push(response);
      network.push({
        url: response.url(),
        method: response.request().method(),
        status: response.status(),
        ok: response.ok(),
        traceId: runContext.traceHeaders.traceparent?.split('-')[1],
        spanId: runContext.traceHeaders.traceparent?.split('-')[2]
      });
    });
    page.on('console', (message) => {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => {
      exceptions.push(error.message);
    });

    try {
      await context.addCookies(bundle.auth.cookies);
      await context.addInitScript({
        content: buildPropagationScript(
          runContext.traceHeaders,
          bundle.source.origin,
          appConfig?.allow_api_origins ?? []
        )
      });

      await page.goto(bundle.source.origin, { waitUntil: 'domcontentloaded' });
      await writeStorage(page, bundle.auth.localStorage, bundle.auth.sessionStorage);
      await page.addScriptTag({
        content: buildPropagationScript(
          runContext.traceHeaders,
          bundle.source.origin,
          appConfig?.allow_api_origins ?? []
        )
      });
      await page.goto(bundle.metadata.targetUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);

      const validation = await this.validator.validate(
        page,
        appConfig,
        responses.map((response) => ({
          url: response.url(),
          status: response.status()
        }))
      );

      const propagationFilePath = await runContext.artifactWriter.writeJson('shadow/propagation.json', {
        currentTraceparent: runContext.traceHeaders.traceparent,
        currentTracestate: runContext.traceHeaders.tracestate ?? '',
        currentBaggage: runContext.traceHeaders.baggage ?? '',
        wrapperInstalled: true
      });
      await runContext.artifactWriter.writeJson('shadow/login-validation.json', validation);
      await page.screenshot({ path: path.join(runContext.artifactWriter.paths.shadowDir, 'login.png'), fullPage: true }).catch(() => undefined);

      return {
        browser,
        context,
        page,
        network,
        consoleMessages,
        exceptions,
        validation,
        propagationFilePath
      };
    } catch (error) {
      await browser.close().catch(() => undefined);
      throw new HarnessError('shadow_launch_failed', error instanceof Error ? error.message : 'Failed to rehydrate shadow browser');
    }
  }
}

