import path from 'node:path';
import type { Browser, BrowserContext, Page, Request, Response } from 'playwright-core';
import type { AppRuntimeConfig } from '../config/config-schema.js';
import { launchShadowBrowser } from '../browser/playwright-adapter.js';
import { buildPropagationScript } from '../trace/http-header-injector.js';
import { ShadowValidator } from './shadow-validator.js';
import { HarnessError } from '../types/errors.js';
import type { RunContext } from '../cli/run-context.js';
import type {
  ConsoleEntryRecord,
  NetworkDetailedRecord,
  NetworkSummaryRecord,
  ValidationResult
} from '../types/runtime.js';
import type { ShadowBundle } from '../types/session.js';
import { enrichResponseBody, shouldCaptureResponseBody } from '../runtime/ai-debug-artifacts.js';

type RehydratedShadow = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  network: NetworkSummaryRecord[];
  networkDetailed: NetworkDetailedRecord[];
  consoleEntries: ConsoleEntryRecord[];
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
    const networkDetailed: NetworkDetailedRecord[] = [];
    const consoleEntries: ConsoleEntryRecord[] = [];
    const exceptions: string[] = [];
    const responses: Response[] = [];
    const pendingRequests = new Map<Request, NetworkDetailedRecord>();
    let requestSequence = 0;

    const finalizeRequestRecord = (record: NetworkDetailedRecord) => {
      networkDetailed.push(record);
      network.push({
        url: record.url,
        method: record.method,
        status: record.status,
        ok: record.ok,
        traceId: record.traceId,
        spanId: record.spanId
      });
    };

    page.on('request', async (request) => {
      const headers = await request.allHeaders().catch(() => undefined);
      pendingRequests.set(request, {
        sequence: ++requestSequence,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        startedAt: new Date().toISOString(),
        requestHeaders: headers,
        requestBodyText: request.postData() ?? undefined,
        traceId: runContext.traceHeaders.traceparent?.split('-')[1],
        spanId: runContext.traceHeaders.traceparent?.split('-')[2]
      });
    });

    page.on('response', async (response) => {
      responses.push(response);
      const request = response.request();
      const record = pendingRequests.get(request) ?? {
        sequence: ++requestSequence,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        startedAt: new Date().toISOString(),
        traceId: runContext.traceHeaders.traceparent?.split('-')[1],
        spanId: runContext.traceHeaders.traceparent?.split('-')[2]
      };
      const finishedAt = new Date().toISOString();
      const responseHeaders = await response.allHeaders().catch(() => response.headers());
      const bodyPayload = shouldCaptureResponseBody({
        resourceType: record.resourceType,
        url: record.url,
        responseHeaders
      })
        ? enrichResponseBody(await response.text().catch(() => undefined))
        : {};

      record.status = response.status();
      record.statusText = response.statusText();
      record.ok = response.ok();
      record.finishedAt = finishedAt;
      record.durationMs = Math.max(0, new Date(finishedAt).getTime() - new Date(record.startedAt).getTime());
      record.responseHeaders = responseHeaders;
      record.responseBodyText = bodyPayload.text;
      record.responseBodyJson = bodyPayload.json;
      pendingRequests.delete(request);
      finalizeRequestRecord(record);
    });
    page.on('requestfailed', async (request) => {
      const record = pendingRequests.get(request) ?? {
        sequence: ++requestSequence,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        startedAt: new Date().toISOString(),
        traceId: runContext.traceHeaders.traceparent?.split('-')[1],
        spanId: runContext.traceHeaders.traceparent?.split('-')[2]
      };
      const finishedAt = new Date().toISOString();
      record.finishedAt = finishedAt;
      record.durationMs = Math.max(0, new Date(finishedAt).getTime() - new Date(record.startedAt).getTime());
      record.failureText = request.failure()?.errorText;
      record.ok = false;
      record.requestHeaders ??= await request.allHeaders().catch(() => undefined);
      record.requestBodyText ??= request.postData() ?? undefined;
      pendingRequests.delete(request);
      finalizeRequestRecord(record);
    });
    page.on('console', (message) => {
      consoleEntries.push({
        type: message.type(),
        text: message.text(),
        timestamp: new Date().toISOString(),
        location: message.location()
      });
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
        networkDetailed,
        consoleEntries,
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
