import path from 'node:path';
import * as otelApi from '@opentelemetry/api';
import type { BrowserAction, RuntimeArtifacts } from '../types/runtime.js';
import type { RunContext } from '../cli/run-context.js';
import type { Page } from 'playwright-core';

const waitForStability = async (page: Page): Promise<void> => {
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
};

export const runBrowserAction = async (
  runContext: RunContext,
  page: Page,
  action: BrowserAction
): Promise<{ currentUrl: string; artifacts: RuntimeArtifacts; screenshotPath?: string }> => {
  const tracer = otelApi.trace.getTracer('browsertrace-runtime');
  const stepSpan = tracer.startSpan(`browser.${action.type}`);
  const artifacts: RuntimeArtifacts = {
    consolePath: path.join(runContext.artifactWriter.paths.runtimeDir, 'console.json'),
    networkPath: path.join(runContext.artifactWriter.paths.runtimeDir, 'network.json'),
    exceptionsPath: path.join(runContext.artifactWriter.paths.runtimeDir, 'exceptions.json'),
    resultPath: path.join(runContext.artifactWriter.paths.runtimeDir, 'result.json'),
    postActionScreenshotPath: path.join(runContext.artifactWriter.paths.runtimeDir, 'post-action.png'),
    pageHtmlPath: path.join(runContext.artifactWriter.paths.runtimeDir, 'page.html'),
    pageStatePath: path.join(runContext.artifactWriter.paths.runtimeDir, 'page-state.json'),
    consoleDetailedPath: path.join(runContext.artifactWriter.paths.runtimeDir, 'console-detailed.json'),
    networkDetailedPath: path.join(runContext.artifactWriter.paths.runtimeDir, 'network-detailed.json'),
    aiSummaryPath: path.join(runContext.artifactWriter.paths.runtimeDir, 'ai-summary.json')
  };

  try {
    await otelApi.context.with(otelApi.trace.setSpan(runContext.otelContext, stepSpan), async () => {
      switch (action.type) {
        case 'goto':
          await page.goto(action.url, { waitUntil: 'domcontentloaded' });
          await waitForStability(page);
          break;
        case 'click':
          await page.locator(action.selector).click();
          await waitForStability(page);
          break;
        case 'fill':
          await page.locator(action.selector).fill(action.value);
          await waitForStability(page);
          break;
        case 'wait':
          if (action.selector) {
            await page.locator(action.selector).waitFor({ state: 'visible', timeout: action.durationMs ?? 5_000 });
          } else {
            await page.waitForTimeout(action.durationMs ?? 1_000);
          }
          break;
        case 'screenshot': {
          const screenshotPath = action.path ?? path.join(runContext.artifactWriter.paths.runtimeDir, 'final.png');
          await page.screenshot({ path: screenshotPath, fullPage: action.fullPage ?? true });
          artifacts.screenshotPath = screenshotPath;
          break;
        }
      }
    });

    stepSpan.setAttribute('browser.current_url', page.url());
    if (action.type !== 'screenshot') {
      await page.screenshot({ path: artifacts.postActionScreenshotPath, fullPage: true }).catch(() => undefined);
    } else {
      artifacts.postActionScreenshotPath = artifacts.screenshotPath;
    }
    stepSpan.end();
    return {
      currentUrl: page.url(),
      artifacts,
      screenshotPath: artifacts.screenshotPath
    };
  } catch (error) {
    await page.screenshot({ path: path.join(runContext.artifactWriter.paths.runtimeDir, 'error.png'), fullPage: true }).catch(() => undefined);
    stepSpan.recordException(error instanceof Error ? error : new Error('Unknown browser step failure'));
    stepSpan.setStatus({ code: otelApi.SpanStatusCode.ERROR, message: error instanceof Error ? error.message : 'Unknown error' });
    stepSpan.end();
    throw error;
  }
};
