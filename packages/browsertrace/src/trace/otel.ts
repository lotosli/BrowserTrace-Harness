import path from 'node:path';
import * as otelAsyncHooks from '@opentelemetry/context-async-hooks';
import * as otelCore from '@opentelemetry/core';
import * as otelHttpExporter from '@opentelemetry/exporter-trace-otlp-http';
import * as otelResources from '@opentelemetry/resources';
import * as otelSdkNode from '@opentelemetry/sdk-trace-node';
import type { Tracer } from '@opentelemetry/api';
import type { BrowserTraceConfig } from '../config/config-schema.js';
import { JsonlTraceExporter } from './jsonl-exporter.js';
import { applyRunValueDefaults, type GlobalCommandOptions } from '../cli/run-context.js';
import { HarnessError } from '../types/errors.js';

export const createTracing = async (
  commandName: string,
  config: BrowserTraceConfig,
  options: GlobalCommandOptions
): Promise<{ tracer: Tracer; shutdown: () => Promise<void> }> => {
  const resolvedValues = applyRunValueDefaults(options);
  const spanProcessors: otelSdkNode.SimpleSpanProcessor[] = [];
  const traceOutput = options.traceOutput ?? config.trace.output_default;
  const traceOutputPath =
    options.traceOutputPath ??
    config.trace.jsonl_default_path ??
    path.join(config.artifacts.base_dir, resolvedValues.runId, 'trace-events.jsonl');

  if (traceOutput === 'otlp' || traceOutput === 'both') {
    const endpoint = options.traceEndpoint ?? config.otel.endpoint;
    if (!endpoint) {
      throw new HarnessError('config_invalid', 'trace-endpoint is required when trace output includes OTLP');
    }
    spanProcessors.push(new otelSdkNode.SimpleSpanProcessor(new otelHttpExporter.OTLPTraceExporter({ url: endpoint })));
  }

  if (traceOutput === 'jsonl' || traceOutput === 'both') {
    spanProcessors.push(
      new otelSdkNode.SimpleSpanProcessor(
        new JsonlTraceExporter(traceOutputPath, {
          specId: resolvedValues.specId,
          runId: resolvedValues.runId,
          sessionId: resolvedValues.sessionId,
          appName: resolvedValues.appName,
          envName: resolvedValues.envName,
          gitSha: options.gitSha,
          userIntent: options.userIntent,
          pageUrl: resolvedValues.pageUrl
        })
      )
    );
  }

  const provider = new otelSdkNode.NodeTracerProvider({
    resource: otelResources.resourceFromAttributes({
      'service.name': config.otel.service_name,
      'browsertrace.command': commandName
    }),
    spanProcessors
  });

  provider.register({
    contextManager: new otelAsyncHooks.AsyncLocalStorageContextManager(),
    propagator: new otelCore.CompositePropagator({
      propagators: [new otelCore.W3CTraceContextPropagator(), new otelCore.W3CBaggagePropagator()]
    })
  });

  return {
    tracer: provider.getTracer(config.otel.service_name),
    shutdown: async () => {
      await provider.forceFlush();
      await provider.shutdown();
    }
  };
};
