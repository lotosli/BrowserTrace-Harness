import { Command, Option } from 'commander';
import { runCommand } from '../command-runner.js';
import { addCommonOptions } from '../shared.js';
import { SessionBroker } from '../../session/session-broker.js';
import { ShadowBootstrapper } from '../../session/shadow-bootstrapper.js';
import { SessionStore } from '../../session/session-store.js';
import { refreshRunContextBaggage } from '../run-context.js';
import { writeJsonFile } from '../../utils/fs.js';
import type { SessionManifest } from '../../types/session.js';
import { HarnessError } from '../../types/errors.js';

const sessionBroker = new SessionBroker();
const shadowBootstrapper = new ShadowBootstrapper();
const sessionStore = new SessionStore();

export const buildSessionCommands = (): Command => {
  const session = new Command('session');

  addCommonOptions(
    session
      .command('ensure')
      .addOption(new Option('--ttl-seconds <seconds>', 'Bundle TTL in seconds').default('3600'))
  ).action(async (options) => {
    await runCommand('session.ensure', options, 'attach_failed', async (baseRunContext) => {
      if (!options.url) {
        throw new HarnessError('config_invalid', '--url is required for session ensure');
      }
      const shadowSessionId = `shadow_${Date.now()}`;
      const runContext = refreshRunContextBaggage(baseRunContext, {
        shadowSessionId
      });
      const appConfig = runContext.config.apps[runContext.baggageContext.appName];
      const { bundle } = await sessionBroker.createShadowBundle(
        {
          cdpUrl: runContext.config.chrome.cdp_url,
          targetUrl: options.url,
          headless: true,
          ttlSeconds: Number.parseInt(options.ttlSeconds, 10),
          specId: runContext.baggageContext.specId,
          runId: runContext.baggageContext.runId,
          sessionId: runContext.baggageContext.sessionId,
          appName: runContext.baggageContext.appName,
          envName: runContext.baggageContext.envName,
          gitSha: runContext.baggageContext.gitSha,
          userIntent: runContext.baggageContext.userIntent
        },
        appConfig,
        runContext
      );
      const shadow = await shadowBootstrapper.rehydrate(bundle, runContext, appConfig);
      await writeJsonFile(`${runContext.artifactWriter.paths.runtimeDir}/console.json`, shadow.consoleMessages);
      await writeJsonFile(`${runContext.artifactWriter.paths.runtimeDir}/network.json`, shadow.network);
      await writeJsonFile(`${runContext.artifactWriter.paths.runtimeDir}/exceptions.json`, shadow.exceptions);
      await writeJsonFile(`${runContext.artifactWriter.paths.correlationDir}/request-trace-map.json`, shadow.network);
      await writeJsonFile(`${runContext.artifactWriter.paths.correlationDir}/trace-log-links.json`, {
        trace_id: runContext.traceHeaders.traceparent?.split('-')[1],
        log_search_hint: runContext.traceHeaders.traceparent?.split('-')[1],
        log_file_path: 'logs/demo-service.log',
        baggage_summary: runContext.baggageHeaders
      });

      const manifest: SessionManifest = {
        sessionId: runContext.baggageContext.sessionId,
        bundlePath: `${runContext.baggageContext.sessionId}/bundle.json`,
        targetUrl: bundle.metadata.targetUrl,
        targetOrigin: bundle.source.origin,
        appName: runContext.baggageContext.appName,
        envName: runContext.baggageContext.envName,
        specId: runContext.baggageContext.specId,
        runId: runContext.baggageContext.runId,
        gitSha: runContext.baggageContext.gitSha,
        userIntent: runContext.baggageContext.userIntent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        validationStatus: shadow.validation.status,
        lastShadowSessionId: shadowSessionId
      };
      await sessionStore.save(runContext.baggageContext.sessionId, manifest, bundle);
      await shadow.browser.close();

      const traceId = runContext.traceHeaders.traceparent?.split('-')[1];
      return {
        text: [
          '[ok] shadow session ensured',
          `[ok] target url: ${bundle.metadata.targetUrl}`,
          `[ok] validation status: ${shadow.validation.status}`,
          `[ok] trace_id: ${traceId}`,
          `[ok] baggage: ${Object.entries(runContext.baggageHeaders)
            .map(([key, value]) => `${key}=${value}`)
            .join(' ')}`
        ],
        json: {
          ok: true,
          shadow_session_id: shadowSessionId,
          trace_id: traceId,
          traceparent: runContext.traceHeaders.traceparent,
          tracestate: runContext.traceHeaders.tracestate ?? '',
          baggage: runContext.baggageHeaders,
          artifacts_dir: runContext.artifactRoot,
          validation_status: shadow.validation.status
        }
      };
    });
  });

  return session;
};
