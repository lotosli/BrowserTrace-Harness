import { Command } from 'commander';
import { addCommonOptions } from '../shared.js';
import { runCommand } from '../command-runner.js';
import { lookupTrace } from '../../trace/trace-query.js';
import { lookupLogs } from '../../trace/log-query.js';

export const buildTraceCommands = (): Command => {
  const traceCommand = new Command('trace');

  addCommonOptions(
    traceCommand
      .command('lookup')
      .requiredOption('--trace-id <id>', 'Trace ID')
  ).action(async (options) => {
    await runCommand('trace.lookup', options, 'trace_lookup_failed', async (runContext) => {
      const result = await lookupTrace(
        {
          tempoBaseUrl: runContext.config.lookup.tempo.base_url,
          lokiBaseUrl: runContext.config.lookup.loki.base_url,
          lokiQueryLabels: runContext.config.lookup.loki.query_labels
        },
        options.traceId
      );
      return {
        text: [
          `[ok] trace lookup: ${options.traceId}`
        ],
        json: {
          ok: true,
          trace_id: options.traceId,
          result
        }
      };
    });
  });

  addCommonOptions(
    traceCommand
      .command('grep-logs')
      .requiredOption('--trace-id <id>', 'Trace ID')
  ).action(async (options) => {
    await runCommand('trace.grep-logs', options, 'log_lookup_failed', async (runContext) => {
      const result = await lookupLogs(
        {
          tempoBaseUrl: runContext.config.lookup.tempo.base_url,
          lokiBaseUrl: runContext.config.lookup.loki.base_url,
          lokiQueryLabels: runContext.config.lookup.loki.query_labels
        },
        options.traceId
      );
      return {
        text: [
          `[ok] log lookup: ${options.traceId}`
        ],
        json: {
          ok: true,
          trace_id: options.traceId,
          result
        }
      };
    });
  });

  return traceCommand;
};

