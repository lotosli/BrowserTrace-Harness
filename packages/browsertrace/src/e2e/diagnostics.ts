import { findRootRequest } from '../runtime/ai-debug-artifacts.js';
import type { BrowserEngineStepResult } from './browser-engine.js';
import type { LoadedRunArtifacts } from './run-artifacts.js';

export type RunDiagnosis = {
  status: 'passed' | 'failed';
  scenarioId: string;
  runId: string;
  traceId?: string;
  failedStepId?: string;
  failedStepAction?: string;
  rootRequest?: {
    method: string;
    url: string;
    status?: number;
  };
  probableCause: {
    category:
      | 'success'
      | 'browser_action_failed'
      | 'ui_error'
      | 'http_error'
      | 'backend_error'
      | 'trace_lookup_failed'
      | 'log_lookup_failed'
      | 'unknown';
    reason: string;
  };
  evidence: {
    screenshotPath?: string;
    pageStatePath?: string;
    pageHtmlPath?: string;
    tempoTracePath?: string;
    lokiLogsPath?: string;
  };
  counts: {
    actionRequestCount: number;
    actionConsoleErrorCount: number;
    actionExceptionCount: number;
  };
};

const pickFailedStep = (steps: BrowserEngineStepResult[]): BrowserEngineStepResult => {
  return steps.find((step) => step.status === 'error')
    ?? steps.find((step) => step.actionNetworkDetailed.some((request) => (request.status ?? 0) >= 500))
    ?? steps[steps.length - 1];
};

export const buildRunDiagnosis = (artifacts: LoadedRunArtifacts): RunDiagnosis => {
  const verdict = artifacts.report.verdict as { status?: string; reason?: string } | undefined;
  const failedStep = pickFailedStep(artifacts.engineResult.steps);
  const rootRequest = findRootRequest(failedStep.actionNetworkDetailed);
  const consoleErrorCount = failedStep.actionConsoleEntries.filter((entry) => entry.type === 'error').length;

  let category: RunDiagnosis['probableCause']['category'] = 'unknown';
  let reason = verdict?.reason ?? 'No diagnosis is available.';

  if ((verdict?.status ?? 'unknown') === 'passed') {
    category = 'success';
    reason = verdict?.reason ?? 'Run passed.';
  } else if (failedStep.status === 'error') {
    category = 'browser_action_failed';
    reason = failedStep.errorMessage ?? reason;
  } else if (rootRequest && (rootRequest.status ?? 0) >= 500) {
    category = 'backend_error';
    reason = `${rootRequest.method} ${rootRequest.url} returned ${rootRequest.status}`;
  } else if (rootRequest && (rootRequest.status ?? 0) >= 400) {
    category = 'http_error';
    reason = `${rootRequest.method} ${rootRequest.url} returned ${rootRequest.status}`;
  } else if (artifacts.lookupErrors?.tempo) {
    category = 'trace_lookup_failed';
    reason = artifacts.lookupErrors.tempo;
  } else if (artifacts.lookupErrors?.loki) {
    category = 'log_lookup_failed';
    reason = artifacts.lookupErrors.loki;
  } else if (failedStep.pageState.failureTitle) {
    category = 'ui_error';
    reason = failedStep.pageState.failureDetail || failedStep.pageState.failureTitle;
  }

  return {
    status: (verdict?.status === 'passed' ? 'passed' : 'failed'),
    scenarioId: artifacts.report.scenarioId,
    runId: artifacts.report.runId,
    traceId: artifacts.report.traceId,
    failedStepId: failedStep?.id,
    failedStepAction: failedStep?.action,
    rootRequest: rootRequest
      ? {
          method: rootRequest.method,
          url: rootRequest.url,
          status: rootRequest.status
        }
      : undefined,
    probableCause: {
      category,
      reason
    },
    evidence: {
      screenshotPath: failedStep?.screenshotPath,
      pageStatePath: failedStep?.pageStatePath,
      pageHtmlPath: failedStep?.pageHtmlPath,
      tempoTracePath: artifacts.report.artifacts.tempoTracePath,
      lokiLogsPath: artifacts.report.artifacts.lokiLogsPath
    },
    counts: {
      actionRequestCount: failedStep?.actionNetworkDetailed.length ?? 0,
      actionConsoleErrorCount: consoleErrorCount,
      actionExceptionCount: failedStep?.actionExceptions.length ?? 0
    }
  };
};
