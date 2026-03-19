import { Command } from 'commander';
import { addCommonOptions } from '../shared.js';
import { runCommand } from '../command-runner.js';
import { callLocalApi } from '../../runtime/local-api-debug.js';
import { HarnessError } from '../../types/errors.js';

export const buildDebugCommands = (): Command => {
  const debug = new Command('debug');

  addCommonOptions(
    debug
      .command('call-api')
  ).action(async (options) => {
    await runCommand('debug.call-api', options, 'local_api_call_failed', async (runContext) => {
      if (!options.url) {
        throw new HarnessError('config_invalid', '--url is required for debug call-api');
      }
      const result = await callLocalApi(runContext, options.url);
      const traceId = runContext.traceHeaders.traceparent?.split('-')[1];
      return {
        text: [
          '[ok] local api called',
          `[ok] status: ${result.status}`,
          `[ok] trace_id: ${traceId}`
        ],
        json: {
          ok: true,
          status: result.status,
          body: result.body,
          trace_id: traceId,
          traceparent: runContext.traceHeaders.traceparent,
          tracestate: runContext.traceHeaders.tracestate ?? '',
          baggage: runContext.baggageHeaders,
          artifacts_dir: runContext.artifactRoot
        }
      };
    });
  });

  return debug;
};
