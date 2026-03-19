import path from 'node:path';
import { Command, Option } from 'commander';
import { addCommonOptions } from '../shared.js';
import { runCommand } from '../command-runner.js';
import { SessionStore } from '../../session/session-store.js';
import { ShadowBootstrapper } from '../../session/shadow-bootstrapper.js';
import { refreshRunContextBaggage } from '../run-context.js';
import { runBrowserAction } from '../../runtime/step-runner.js';
import {
  buildAiDebugSummary,
  capturePageState,
  findRootRequest,
  sanitizeConsoleEntries,
  sanitizeNetworkDetails
} from '../../runtime/ai-debug-artifacts.js';
import type { BrowserAction } from '../../types/runtime.js';
import { HarnessError } from '../../types/errors.js';
import { lookupTrace } from '../../trace/trace-query.js';
import { lookupLogs } from '../../trace/log-query.js';

const sessionStore = new SessionStore();
const shadowBootstrapper = new ShadowBootstrapper();

const executeBrowserCommand = async (
  options: Record<string, string | boolean | undefined>,
  actionFactory: (effectiveOptions: typeof options) => BrowserAction
): Promise<void> => {
  await runCommand(`browser.${String(options._actionName ?? 'step')}`, options, 'runtime_step_failed', async (baseRunContext) => {
    if (!options.sessionId) {
      throw new HarnessError('config_invalid', '--session-id is required');
    }
    const sessionId = String(options.sessionId);
    const { manifest, bundle } = await sessionStore.load(sessionId);
    const runContext = refreshRunContextBaggage(baseRunContext, {
      sessionId,
      specId: manifest.specId,
      appName: manifest.appName,
      envName: manifest.envName,
      gitSha: manifest.gitSha,
      userIntent: manifest.userIntent,
      pageUrl: options.url ? String(options.url) : manifest.targetUrl
    });
    const appConfig = runContext.config.apps[manifest.appName];
    const shadow = await shadowBootstrapper.rehydrate(bundle, runContext, appConfig);
    const actionRequestOffset = shadow.networkDetailed.length;
    const actionConsoleOffset = shadow.consoleEntries.length;
    const actionExceptionOffset = shadow.exceptions.length;
    const action = actionFactory(options);
    const result = await runBrowserAction(runContext, shadow.page, action);
    const traceId = runContext.traceHeaders.traceparent?.split('-')[1];

    const pageState = await capturePageState(shadow.page).catch(() => ({
      title: shadow.page.url(),
      url: shadow.page.url(),
      textExcerpt: '',
      headings: [],
      buttons: [],
      forms: [],
      elementsByTestId: {},
      statusChips: {}
    }));
    const pageHtml = await shadow.page.content().catch(() => '<!-- page.content() unavailable -->');
    const actionRequests = shadow.networkDetailed.slice(actionRequestOffset);
    const actionConsoleEntries = shadow.consoleEntries.slice(actionConsoleOffset);
    const actionExceptions = shadow.exceptions.slice(actionExceptionOffset);
    const sanitizedConsoleEntries = sanitizeConsoleEntries(shadow.consoleEntries);
    const sanitizedNetworkDetails = sanitizeNetworkDetails(shadow.networkDetailed);
    const sanitizedActionRequests = sanitizeNetworkDetails(actionRequests);
    const sanitizedActionConsoleEntries = sanitizeConsoleEntries(actionConsoleEntries);
    const legacyConsole = sanitizedConsoleEntries.map((entry) => `${entry.type}: ${entry.text}`);

    await runContext.artifactWriter.writeJson('runtime/console.json', legacyConsole);
    await runContext.artifactWriter.writeJson('runtime/console-detailed.json', sanitizedConsoleEntries);
    await runContext.artifactWriter.writeJson('runtime/network.json', shadow.network);
    await runContext.artifactWriter.writeJson('runtime/network-detailed.json', sanitizedNetworkDetails);
    await runContext.artifactWriter.writeJson('runtime/exceptions.json', shadow.exceptions);
    await runContext.artifactWriter.writeJson('runtime/action-console-detailed.json', sanitizedActionConsoleEntries);
    await runContext.artifactWriter.writeJson('runtime/action-network-detailed.json', sanitizedActionRequests);
    await runContext.artifactWriter.writeJson('runtime/action-exceptions.json', actionExceptions);
    const pageStatePath = await runContext.artifactWriter.writeJson('runtime/page-state.json', pageState);
    const pageHtmlPath = await runContext.artifactWriter.writeText('runtime/page.html', pageHtml);

    const artifactPaths = {
      pageStatePath,
      pageHtmlPath,
      postActionScreenshotPath: result.artifacts.postActionScreenshotPath ?? path.join(runContext.artifactWriter.paths.runtimeDir, 'post-action.png'),
      consoleDetailedPath: path.join(runContext.artifactWriter.paths.runtimeDir, 'console-detailed.json'),
      actionConsoleDetailedPath: path.join(runContext.artifactWriter.paths.runtimeDir, 'action-console-detailed.json'),
      networkDetailedPath: path.join(runContext.artifactWriter.paths.runtimeDir, 'network-detailed.json'),
      actionNetworkDetailedPath: path.join(runContext.artifactWriter.paths.runtimeDir, 'action-network-detailed.json'),
      aiSummaryPath: path.join(runContext.artifactWriter.paths.runtimeDir, 'ai-summary.json')
    };

    let tempoTracePath: string | undefined;
    let lokiLogsPath: string | undefined;
    const lookupErrors: Record<string, string> = {};
    if (traceId) {
      const lookupConfig = {
        tempoBaseUrl: runContext.config.lookup.tempo.base_url,
        lokiBaseUrl: runContext.config.lookup.loki.base_url,
        lokiQueryLabels: runContext.config.lookup.loki.query_labels
      };
      try {
        const tempoTrace = await lookupTrace(lookupConfig, traceId);
        tempoTracePath = await runContext.artifactWriter.writeJson('correlation/tempo-trace.json', tempoTrace);
      } catch (error) {
        lookupErrors.tempo = error instanceof Error ? error.message : 'Tempo lookup failed';
      }
      try {
        const lokiLogs = await lookupLogs(lookupConfig, traceId);
        lokiLogsPath = await runContext.artifactWriter.writeJson('correlation/loki-trace-logs.json', lokiLogs);
      } catch (error) {
        lookupErrors.loki = error instanceof Error ? error.message : 'Loki lookup failed';
      }
    }
    if (Object.keys(lookupErrors).length > 0) {
      await runContext.artifactWriter.writeJson('correlation/lookup-errors.json', lookupErrors);
    }

    const aiSummary = buildAiDebugSummary({
      action,
      currentUrl: result.currentUrl,
      shadowValidation: shadow.validation,
      pageState,
      allRequests: sanitizedNetworkDetails,
      actionRequests: sanitizedActionRequests,
      consoleEntries: sanitizedActionConsoleEntries,
      exceptions: actionExceptions,
      traceId,
      traceparent: runContext.traceHeaders.traceparent,
      tracestate: runContext.traceHeaders.tracestate ?? '',
      baggage: runContext.baggageHeaders,
      artifactPaths: {
        ...artifactPaths,
        tempoTracePath,
        lokiLogsPath
      }
    });
    const aiSummaryPath = await runContext.artifactWriter.writeJson('runtime/ai-summary.json', aiSummary);

    await runContext.artifactWriter.writeJson('runtime/result.json', {
      action,
      current_url: result.currentUrl,
      validation: shadow.validation,
      action_request_count: sanitizedActionRequests.length,
      root_request: findRootRequest(sanitizedActionRequests),
      ai_outcome: aiSummary.outcome,
      ui_failure_title: aiSummary.page.failureTitle,
      ui_failure_detail: aiSummary.page.failureDetail,
      observed_http_status: aiSummary.page.observedHttpStatus,
      expected_status: aiSummary.page.expectedStatus,
      action_console_error_count: sanitizedActionConsoleEntries.filter((entry) => entry.type === 'error').length,
      action_exception_count: actionExceptions.length,
      artifact_paths: {
        ai_summary: aiSummaryPath,
        page_state: pageStatePath,
        page_html: pageHtmlPath,
        post_action_screenshot: artifactPaths.postActionScreenshotPath,
        network_detailed: artifactPaths.networkDetailedPath,
        action_network_detailed: artifactPaths.actionNetworkDetailedPath,
        console_detailed: artifactPaths.consoleDetailedPath,
        action_console_detailed: artifactPaths.actionConsoleDetailedPath,
        tempo_trace: tempoTracePath,
        loki_logs: lokiLogsPath
      }
    });
    await runContext.artifactWriter.writeJson('correlation/request-trace-map.json', shadow.network);
    await runContext.artifactWriter.writeJson('correlation/request-trace-map-detailed.json', sanitizedNetworkDetails);
    await runContext.artifactWriter.writeJson('correlation/trace-log-links.json', {
      trace_id: traceId,
      log_search_hint: traceId,
      log_file_path: 'logs/demo-service.log',
      baggage_summary: runContext.baggageHeaders,
      tempo_trace_path: tempoTracePath,
      loki_logs_path: lokiLogsPath
    });
    await shadow.browser.close();

    return {
      text: [
        `[ok] browser action: ${action.type}`,
        `[ok] session id: ${sessionId}`,
        `[ok] current url: ${result.currentUrl}`,
        `[ok] trace_id: ${traceId}`,
        `[ok] ai summary: ${aiSummaryPath}`
      ],
      json: {
        ok: true,
        action,
        session_id: sessionId,
        current_url: result.currentUrl,
        trace_id: traceId,
        traceparent: runContext.traceHeaders.traceparent,
        tracestate: runContext.traceHeaders.tracestate ?? '',
        baggage: runContext.baggageHeaders,
        artifacts_dir: runContext.artifactRoot,
        screenshot_path: result.screenshotPath,
        post_action_screenshot_path: artifactPaths.postActionScreenshotPath,
        ai_summary_path: aiSummaryPath,
        root_request: aiSummary.rootRequest,
        outcome: aiSummary.outcome
      }
    };
  });
};

export const buildBrowserCommands = (): Command => {
  const browser = new Command('browser');

  addCommonOptions(
    browser
      .command('goto')
  ).action(async (options) => {
    if (!options.url) {
      throw new HarnessError('config_invalid', '--url is required for browser goto');
    }
    await executeBrowserCommand({ ...options, _actionName: 'goto' }, (currentOptions) => ({
      type: 'goto',
      url: String(currentOptions.url)
    }));
  });

  addCommonOptions(
    browser
      .command('click')
      .requiredOption('--selector <selector>', 'CSS selector')
  ).action(async (options) => {
    await executeBrowserCommand({ ...options, _actionName: 'click' }, (currentOptions) => ({
      type: 'click',
      selector: String(currentOptions.selector)
    }));
  });

  addCommonOptions(
    browser
      .command('fill')
      .requiredOption('--selector <selector>', 'CSS selector')
      .requiredOption('--value <value>', 'Value to enter')
  ).action(async (options) => {
    await executeBrowserCommand({ ...options, _actionName: 'fill' }, (currentOptions) => ({
      type: 'fill',
      selector: String(currentOptions.selector),
      value: String(currentOptions.value)
    }));
  });

  addCommonOptions(
    browser
      .command('wait')
      .addOption(new Option('--duration-ms <ms>', 'Wait duration in milliseconds').default('1000'))
      .addOption(new Option('--selector <selector>', 'Wait for selector'))
  ).action(async (options) => {
    await executeBrowserCommand({ ...options, _actionName: 'wait' }, (currentOptions) => ({
      type: 'wait',
      durationMs: Number.parseInt(String(currentOptions.durationMs), 10),
      selector: currentOptions.selector ? String(currentOptions.selector) : undefined
    }));
  });

  addCommonOptions(
    browser
      .command('screenshot')
      .addOption(new Option('--path <path>', 'Screenshot path'))
      .addOption(new Option('--full-page', 'Capture full page'))
  ).action(async (options) => {
    await executeBrowserCommand({ ...options, _actionName: 'screenshot' }, (currentOptions) => ({
      type: 'screenshot',
      path: currentOptions.path ? path.resolve(String(currentOptions.path)) : undefined,
      fullPage: Boolean(currentOptions.fullPage)
    }));
  });

  return browser;
};
