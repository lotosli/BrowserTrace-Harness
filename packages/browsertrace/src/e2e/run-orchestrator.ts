import { refreshRunContextBaggage, type RunContext } from '../cli/run-context.js';
import { loadRunSpec, type LoadedRunSpec } from './spec-loader.js';
import { launchServices, stopServices, type RunningService } from './service-orchestrator.js';
import { BrowserUsePythonEngine } from './browser-use-engine.js';
import { judgeRun, type RunVerdict } from './oracle-engine.js';
import { lookupTrace } from '../trace/trace-query.js';
import { lookupLogs } from '../trace/log-query.js';

export type RunCommandJsonResult = {
  ok: boolean;
  run_id: string;
  spec_id: string;
  scenario_id: string;
  target_step_id?: string;
  step_mode?: 'prefix' | 'only';
  engine: string;
  trace_id?: string;
  verdict: RunVerdict;
  artifacts: {
    spec_path: string;
    resolved_spec_path: string;
    run_report_path: string;
    engine_result_path: string;
    tempo_trace_path?: string;
    loki_logs_path?: string;
  };
  services: Array<{
    id: string;
    stdout_path: string;
    stderr_path: string;
    command: string;
  }>;
};

export type RunExecutionOptions = {
  stepId?: string;
  stepMode?: 'prefix' | 'only';
};

const selectSteps = (spec: LoadedRunSpec, options?: RunExecutionOptions): LoadedRunSpec => {
  if (!options?.stepId) {
    return spec;
  }

  const stepIndex = spec.steps.findIndex((step) => step.id === options.stepId);
  if (stepIndex < 0) {
    throw new Error(`Step ${options.stepId} was not found in spec ${spec.specPath}`);
  }

  const steps = options.stepMode === 'only'
    ? [spec.steps[stepIndex]]
    : spec.steps.slice(0, stepIndex + 1);

  return {
    ...spec,
    steps
  };
};

export const runLoadedE2eSpec = async (
  baseRunContext: RunContext,
  loadedSpec: LoadedRunSpec,
  options?: RunExecutionOptions
): Promise<{ text: string[]; json: RunCommandJsonResult; exitCode?: number }> => {
  const spec = selectSteps(loadedSpec, options);
  const runContext = refreshRunContextBaggage(baseRunContext, {
    specId: spec.specId,
    appName: spec.appName,
    envName: spec.envName,
    pageUrl: spec.startUrl ?? baseRunContext.baggageContext.pageUrl
  });

  const appConfig = runContext.config.apps[spec.appName];
  const resolvedSpecPath = await runContext.artifactWriter.writeJson('runtime/run-spec.resolved.json', spec);

  let services: RunningService[] = [];
  let tempoTracePath: string | undefined;
  let lokiLogsPath: string | undefined;
  let traceLookupError: string | undefined;
  let logLookupError: string | undefined;

  try {
    services = await launchServices(spec.setup.services, runContext.artifactWriter);

    const engine = new BrowserUsePythonEngine();
    const engineResult = await engine.run({
      spec,
      runContext,
      appConfig
    });

    const engineResultPath = await runContext.artifactWriter.writeJson('runtime/engine-result.json', engineResult);

    const traceId = runContext.traceHeaders.traceparent?.split('-')[1];
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
        traceLookupError = error instanceof Error ? error.message : 'Tempo lookup failed';
      }

      try {
        const lokiLogs = await lookupLogs(lookupConfig, traceId);
        lokiLogsPath = await runContext.artifactWriter.writeJson('correlation/loki-trace-logs.json', lokiLogs);
      } catch (error) {
        logLookupError = error instanceof Error ? error.message : 'Loki lookup failed';
      }
    }

    if (traceLookupError || logLookupError) {
      await runContext.artifactWriter.writeJson('correlation/lookup-errors.json', {
        tempo: traceLookupError,
        loki: logLookupError
      });
    }

    const verdict = judgeRun({
      engineResult,
      oracles: spec.oracles,
      traceId,
      traceLookupError,
      logLookupError
    });

    const runReportPath = await runContext.artifactWriter.writeJson('runtime/run-report.json', {
      runId: runContext.baggageContext.runId,
      specId: spec.specId,
      scenarioId: spec.scenarioId,
      appName: spec.appName,
      envName: spec.envName,
      traceId,
      engine: engineResult.engine,
      currentUrl: engineResult.currentUrl,
      pageTitle: engineResult.pageTitle,
      verdict,
      services: services.map((service) => ({
        id: service.id,
        stdoutPath: service.stdoutPath,
        stderrPath: service.stderrPath,
        command: service.command
      })),
      artifacts: {
        resolvedSpecPath,
        engineResultPath,
        tempoTracePath,
        lokiLogsPath,
        finalPageStatePath: engineResult.pageStatePath,
        finalPageHtmlPath: engineResult.pageHtmlPath,
        finalScreenshotPath: engineResult.screenshotPath
      }
    });

    return {
      text: [
        `[ok] run id: ${runContext.baggageContext.runId}`,
        `[ok] scenario id: ${spec.scenarioId}`,
        ...(options?.stepId ? [`[ok] target step id: ${options.stepId}`] : []),
        `[ok] engine: ${engineResult.engine}`,
        `[ok] verdict: ${verdict.status} (${verdict.category})`,
        `[ok] run report: ${runReportPath}`
      ],
      exitCode: verdict.status === 'passed' ? 0 : 1,
      json: {
        ok: verdict.status === 'passed',
        run_id: runContext.baggageContext.runId,
        spec_id: spec.specId,
        scenario_id: spec.scenarioId,
        target_step_id: options?.stepId,
        step_mode: options?.stepMode,
        engine: engineResult.engine,
        trace_id: traceId,
        verdict,
        artifacts: {
          spec_path: spec.specPath,
          resolved_spec_path: resolvedSpecPath,
          run_report_path: runReportPath,
          engine_result_path: engineResultPath,
          tempo_trace_path: tempoTracePath,
          loki_logs_path: lokiLogsPath
        },
        services: services.map((service) => ({
          id: service.id,
          stdout_path: service.stdoutPath,
          stderr_path: service.stderrPath,
          command: service.command
        }))
      }
    };
  } finally {
    await stopServices(services);
  }
};

export const runE2eSpec = async (
  baseRunContext: RunContext,
  specPath: string,
  options?: RunExecutionOptions
): Promise<{ text: string[]; json: RunCommandJsonResult; exitCode?: number }> => {
  const spec = await loadRunSpec(specPath);
  return runLoadedE2eSpec(baseRunContext, spec, options);
};
