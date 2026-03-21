import path from 'node:path';
import type { RunContext } from '../cli/run-context.js';
import { exists, readJsonFile } from '../utils/fs.js';
import { HarnessError } from '../types/errors.js';
import type { LoadedRunSpec } from './spec-loader.js';
import type { BrowserEngineRunResult } from './browser-engine.js';

export type StoredRunReport = {
  runId: string;
  specId: string;
  scenarioId: string;
  appName: string;
  envName: string;
  traceId?: string;
  engine: string;
  currentUrl: string;
  pageTitle: string;
  verdict: unknown;
  services: Array<{
    id: string;
    stdoutPath: string;
    stderrPath: string;
    command: string;
  }>;
  artifacts: {
    resolvedSpecPath: string;
    engineResultPath: string;
    tempoTracePath?: string;
    lokiLogsPath?: string;
    finalPageStatePath?: string;
    finalPageHtmlPath?: string;
    finalScreenshotPath?: string;
  };
};

export type LoadedRunArtifacts = {
  runRoot: string;
  reportPath: string;
  engineResultPath: string;
  resolvedSpecPath: string;
  report: StoredRunReport;
  engineResult: BrowserEngineRunResult;
  spec: LoadedRunSpec;
  lookupErrors?: {
    tempo?: string;
    loki?: string;
  };
};

export const resolveRunRoot = async (runContext: RunContext, runRef: string): Promise<string> => {
  const asPath = path.resolve(runRef);
  if (await exists(asPath)) {
    return asPath;
  }

  const byId = path.join(runContext.config.artifacts.base_dir, runRef);
  if (await exists(byId)) {
    return byId;
  }

  throw new HarnessError('run_failed', `Run artifacts were not found for ${runRef}`, {
    run_ref: runRef
  });
};

export const loadRunArtifacts = async (runContext: RunContext, runRef: string): Promise<LoadedRunArtifacts> => {
  const runRoot = await resolveRunRoot(runContext, runRef);
  const reportPath = path.join(runRoot, 'runtime', 'run-report.json');
  const engineResultPath = path.join(runRoot, 'runtime', 'engine-result.json');
  const resolvedSpecPath = path.join(runRoot, 'runtime', 'run-spec.resolved.json');
  const lookupErrorsPath = path.join(runRoot, 'correlation', 'lookup-errors.json');

  if (!(await exists(reportPath))) {
    throw new HarnessError('run_failed', `Run report not found at ${reportPath}`);
  }
  if (!(await exists(engineResultPath))) {
    throw new HarnessError('run_failed', `Engine result not found at ${engineResultPath}`);
  }
  if (!(await exists(resolvedSpecPath))) {
    throw new HarnessError('run_failed', `Resolved run spec not found at ${resolvedSpecPath}`);
  }

  const hasLookupErrors = await exists(lookupErrorsPath);

  const [report, engineResult, spec, lookupErrors] = await Promise.all([
    readJsonFile<StoredRunReport>(reportPath),
    readJsonFile<BrowserEngineRunResult>(engineResultPath),
    readJsonFile<LoadedRunSpec>(resolvedSpecPath),
    hasLookupErrors ? readJsonFile<{ tempo?: string; loki?: string }>(lookupErrorsPath) : Promise.resolve(undefined)
  ]);

  return {
    runRoot,
    reportPath,
    engineResultPath,
    resolvedSpecPath,
    report,
    engineResult,
    spec,
    lookupErrors
  };
};
