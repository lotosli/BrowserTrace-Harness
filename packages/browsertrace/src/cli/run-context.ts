import path from 'node:path';
import * as otelApi from '@opentelemetry/api';
import type { Context, Span } from '@opentelemetry/api';
import { ArtifactWriter } from '../artifacts/artifact-writer.js';
import { buildBaggage, baggageContextToHeaders } from '../trace/baggage-builder.js';
import { injectHeadersFromContext } from '../trace/trace-context.js';
import type { BrowserTraceConfig } from '../config/config-schema.js';
import type { BaggageContext, TraceOutputMode } from '../types/baggage.js';
import { ensureDirectory } from '../utils/fs.js';

export type GlobalCommandOptions = {
  url?: string;
  appName?: string;
  envName?: string;
  specId?: string;
  runId?: string;
  sessionId?: string;
  gitSha?: string;
  userIntent?: string;
  traceEndpoint?: string;
  artifactsDir?: string;
  traceOutput?: TraceOutputMode;
  traceOutputPath?: string;
  json?: boolean;
  config?: string;
};

export type RunContext = {
  options: GlobalCommandOptions;
  config: BrowserTraceConfig;
  baggageContext: BaggageContext;
  rootSpan: Span;
  otelContext: Context;
  traceHeaders: Record<string, string>;
  baggageHeaders: Record<string, string>;
  artifactWriter: ArtifactWriter;
  artifactRoot: string;
  traceOutput: TraceOutputMode;
  traceOutputPath?: string;
};

const randomId = (prefix: string, length = 10): string => `${prefix}_${Math.random().toString(16).slice(2, 2 + length)}`;

export const generateRandomRunId = (): string => randomId('run');

export type ResolvedRunValues = {
  runId: string;
  sessionId: string;
  pageUrl: string;
  specId: string;
  appName: string;
  envName: string;
};

export const applyRunValueDefaults = (options: GlobalCommandOptions): ResolvedRunValues => {
  options.runId ??= randomId('run');
  options.sessionId ??= randomId('sess');
  options.specId ??= 'UNSPECIFIED';
  options.appName ??= 'browsertrace';
  options.envName ??= 'local';
  return {
    runId: options.runId,
    sessionId: options.sessionId,
    pageUrl: options.url ?? 'about:blank',
    specId: options.specId,
    appName: options.appName,
    envName: options.envName
  };
};

const attachBaggageToSpan = (rootSpan: Span, baggageContext: BaggageContext) => {
  const contextWithSpan = otelApi.trace.setSpan(otelApi.context.active(), rootSpan);
  const contextWithBaggage = otelApi.propagation.setBaggage(contextWithSpan, buildBaggage(baggageContext));
  return {
    contextWithBaggage,
    traceHeaders: injectHeadersFromContext(contextWithBaggage)
  };
};

export const resolveRunContext = async (
  options: GlobalCommandOptions,
  config: BrowserTraceConfig,
  rootSpan: Span
): Promise<RunContext> => {
  const resolvedValues = applyRunValueDefaults(options);
  const baggageContext: BaggageContext = {
    specId: resolvedValues.specId,
    runId: resolvedValues.runId,
    sessionId: resolvedValues.sessionId,
    appName: resolvedValues.appName,
    envName: resolvedValues.envName,
    gitSha: options.gitSha,
    userIntent: options.userIntent,
    pageUrl: resolvedValues.pageUrl
  };

  const { contextWithBaggage, traceHeaders } = attachBaggageToSpan(rootSpan, baggageContext);
  const artifactsDir = options.artifactsDir
    ? path.resolve(options.artifactsDir)
    : path.join(config.artifacts.base_dir, resolvedValues.runId);
  await ensureDirectory(artifactsDir);
  const artifactWriter = new ArtifactWriter(artifactsDir);
  await artifactWriter.ensure();

  return {
    options,
    config,
    baggageContext,
    rootSpan,
    otelContext: contextWithBaggage,
    traceHeaders,
    baggageHeaders: baggageContextToHeaders(baggageContext),
    artifactWriter,
    artifactRoot: artifactsDir,
    traceOutput: options.traceOutput ?? config.trace.output_default,
    traceOutputPath: options.traceOutputPath ?? config.trace.jsonl_default_path
  };
};

export const refreshRunContextBaggage = (runContext: RunContext, overrides: Partial<BaggageContext>): RunContext => {
  const baggageContext = {
    ...runContext.baggageContext,
    ...overrides
  };
  const { contextWithBaggage, traceHeaders } = attachBaggageToSpan(runContext.rootSpan, baggageContext);

  return {
    ...runContext,
    baggageContext,
    otelContext: contextWithBaggage,
    traceHeaders,
    baggageHeaders: baggageContextToHeaders(baggageContext)
  };
};

export const forkRunContext = async (
  runContext: RunContext,
  overrides: Partial<BaggageContext> & {
    artifactRoot?: string;
    traceOutputPath?: string;
  }
): Promise<RunContext> => {
  const baggageContext = {
    ...runContext.baggageContext,
    ...overrides,
    runId: overrides.runId ?? generateRandomRunId()
  };
  const { contextWithBaggage, traceHeaders } = attachBaggageToSpan(runContext.rootSpan, baggageContext);
  const artifactRoot = overrides.artifactRoot
    ? path.resolve(overrides.artifactRoot)
    : path.join(runContext.config.artifacts.base_dir, baggageContext.runId);
  await ensureDirectory(artifactRoot);
  const artifactWriter = new ArtifactWriter(artifactRoot);
  await artifactWriter.ensure();

  return {
    ...runContext,
    baggageContext,
    otelContext: contextWithBaggage,
    traceHeaders,
    baggageHeaders: baggageContextToHeaders(baggageContext),
    artifactWriter,
    artifactRoot,
    traceOutputPath: overrides.traceOutputPath ?? runContext.traceOutputPath
  };
};
