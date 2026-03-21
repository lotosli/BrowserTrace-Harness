import * as otelApi from '@opentelemetry/api';
import { loadConfig } from '../config/config-loader.js';
import { renderJson } from './output/json-output.js';
import { renderText } from './output/text-output.js';
import { resolveRunContext, type GlobalCommandOptions, type RunContext } from './run-context.js';
import { createTracing } from '../trace/otel.js';
import { classifyError } from '../runtime/error-classifier.js';
import type { HarnessErrorCode } from '../types/errors.js';

export const runCommand = async <T>(
  commandName: string,
  options: GlobalCommandOptions,
  fallbackCode: HarnessErrorCode,
  handler: (runContext: RunContext) => Promise<{ text: string[]; json: T; exitCode?: number }>
): Promise<void> => {
  const { config } = await loadConfig(options.config);
  const tracing = await createTracing(commandName, config, options);
  const rootSpan = tracing.tracer.startSpan(commandName);
  let runContext: RunContext | undefined;
  try {
    runContext = await resolveRunContext(options, config, rootSpan);
    const result = await otelApi.context.with(runContext.otelContext, async () => handler(runContext as RunContext));
    rootSpan.setStatus({ code: otelApi.SpanStatusCode.OK });
    if (options.json) {
      process.stdout.write(`${renderJson(result.json)}\n`);
    } else {
      process.stdout.write(renderText(result.text));
    }
    if (typeof result.exitCode === 'number') {
      process.exitCode = result.exitCode;
    }
  } catch (error) {
    const classified = classifyError(error, fallbackCode);
    rootSpan.recordException(classified);
    rootSpan.setStatus({ code: otelApi.SpanStatusCode.ERROR, message: classified.message });
    const payload = {
      ok: false,
      code: classified.code,
      message: classified.message,
      details: classified.details,
      artifacts_dir: runContext?.artifactRoot
    };
    if (options.json) {
      process.stderr.write(`${renderJson(payload)}\n`);
    } else {
      process.stderr.write(renderText([`[error] ${classified.code}: ${classified.message}`]));
    }
    process.exitCode = 1;
  } finally {
    rootSpan.end();
    await tracing.shutdown();
  }
};
