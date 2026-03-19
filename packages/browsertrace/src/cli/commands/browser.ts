import path from 'node:path';
import { Command, Option } from 'commander';
import { addCommonOptions } from '../shared.js';
import { runCommand } from '../command-runner.js';
import { SessionStore } from '../../session/session-store.js';
import { ShadowBootstrapper } from '../../session/shadow-bootstrapper.js';
import { refreshRunContextBaggage } from '../run-context.js';
import { runBrowserAction } from '../../runtime/step-runner.js';
import { writeJsonFile } from '../../utils/fs.js';
import type { BrowserAction } from '../../types/runtime.js';
import { HarnessError } from '../../types/errors.js';

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
    const action = actionFactory(options);
    const result = await runBrowserAction(runContext, shadow.page, action);

    await writeJsonFile(`${runContext.artifactWriter.paths.runtimeDir}/console.json`, shadow.consoleMessages);
    await writeJsonFile(`${runContext.artifactWriter.paths.runtimeDir}/network.json`, shadow.network);
    await writeJsonFile(`${runContext.artifactWriter.paths.runtimeDir}/exceptions.json`, shadow.exceptions);
    await writeJsonFile(`${runContext.artifactWriter.paths.runtimeDir}/result.json`, {
      action,
      current_url: result.currentUrl,
      validation: shadow.validation
    });
    await writeJsonFile(`${runContext.artifactWriter.paths.correlationDir}/request-trace-map.json`, shadow.network);
    await writeJsonFile(`${runContext.artifactWriter.paths.correlationDir}/trace-log-links.json`, {
      trace_id: runContext.traceHeaders.traceparent?.split('-')[1],
      log_search_hint: runContext.traceHeaders.traceparent?.split('-')[1],
      log_file_path: 'logs/demo-service.log',
      baggage_summary: runContext.baggageHeaders
    });
    await shadow.browser.close();

    const traceId = runContext.traceHeaders.traceparent?.split('-')[1];
    return {
      text: [
        `[ok] browser action: ${action.type}`,
        `[ok] session id: ${sessionId}`,
        `[ok] current url: ${result.currentUrl}`,
        `[ok] trace_id: ${traceId}`
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
        screenshot_path: result.screenshotPath
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
