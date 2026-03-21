import type { RunContext } from '../cli/run-context.js';
import type { LoadedRunSpec } from './spec-loader.js';
import type { LoadedRunArtifacts } from './run-artifacts.js';
import { loadRunArtifacts } from './run-artifacts.js';
import type { PersistentRunSessionManifest } from './persistent-session-store.js';
import { HarnessError } from '../types/errors.js';
import { judgeRun, type RunVerdict } from './oracle-engine.js';
import type { BrowserEngineRunResult, BrowserEngineStepResult } from './browser-engine.js';

export type SessionJudgeVerdict = {
  status: 'passed' | 'failed' | 'incomplete';
  category:
    | 'success'
    | 'incomplete'
    | 'historical_failure'
    | 'scenario_oracle_failure'
    | 'missing_artifacts'
    | 'trace_lookup_failed'
    | 'log_lookup_failed';
  reason: string;
  failedStepId?: string;
  sourceRunId?: string;
};

export type SessionJudgeStepSummary = {
  step_id: string;
  status: 'pending' | 'passed' | 'failed';
  attempt_count: number;
  latest_attempt?: {
    run_id: string;
    ok: boolean;
    verdict_category: string;
    created_at: string;
  };
  latest_successful_run_id?: string;
  has_historical_failure: boolean;
};

export type SessionJudgeResult = {
  verdict: SessionJudgeVerdict;
  step_summaries: SessionJudgeStepSummary[];
  remaining_step_ids: string[];
  latest_successful_run_ids_by_step: Record<string, string>;
  tainting_failures: Array<{
    step_id: string;
    run_id: string;
    verdict_category: string;
    created_at: string;
  }>;
};

type HistoryEntry = PersistentRunSessionManifest['history'][number];

const byCreatedAtDesc = (left: HistoryEntry, right: HistoryEntry): number =>
  new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();

const buildSyntheticEngineResult = (
  spec: LoadedRunSpec,
  artifactsByRunId: Map<string, LoadedRunArtifacts>,
  latestSuccessfulByStep: Map<string, HistoryEntry>
): {
  engineResult: BrowserEngineRunResult;
  finalArtifacts: LoadedRunArtifacts;
} => {
  const syntheticSteps: BrowserEngineStepResult[] = [];

  for (const specStep of spec.steps) {
    const successEntry = latestSuccessfulByStep.get(specStep.id);
    if (!successEntry) {
      throw new HarnessError('run_failed', `No successful run exists for step ${specStep.id}`);
    }

    const artifacts = artifactsByRunId.get(successEntry.runId);
    if (!artifacts) {
      throw new HarnessError('run_failed', `Artifacts are missing for run ${successEntry.runId}`);
    }

    const stepResult = artifacts.engineResult.steps.find((step) => step.id === specStep.id);
    if (!stepResult) {
      throw new HarnessError('run_failed', `Step ${specStep.id} is missing from run ${successEntry.runId}`);
    }

    syntheticSteps.push(stepResult);
  }

  const finalStep = spec.steps[spec.steps.length - 1];
  if (!finalStep) {
    throw new HarnessError('run_failed', 'Spec has no steps to judge.');
  }

  const finalSuccessEntry = latestSuccessfulByStep.get(finalStep.id);
  if (!finalSuccessEntry) {
    throw new HarnessError('run_failed', `No successful run exists for final step ${finalStep.id}`);
  }

  const finalArtifacts = artifactsByRunId.get(finalSuccessEntry.runId);
  if (!finalArtifacts) {
    throw new HarnessError('run_failed', `Artifacts are missing for final run ${finalSuccessEntry.runId}`);
  }

  return {
    engineResult: {
      engine: finalArtifacts.engineResult.engine,
      currentUrl: finalArtifacts.engineResult.currentUrl,
      pageTitle: finalArtifacts.engineResult.pageTitle,
      pageStatePath: finalArtifacts.engineResult.pageStatePath,
      pageHtmlPath: finalArtifacts.engineResult.pageHtmlPath,
      screenshotPath: finalArtifacts.engineResult.screenshotPath,
      steps: syntheticSteps
    },
    finalArtifacts
  };
};

const buildStepSummaries = (
  spec: LoadedRunSpec,
  attemptsByStep: Map<string, HistoryEntry[]>,
  latestAttemptByStep: Map<string, HistoryEntry>,
  latestSuccessfulByStep: Map<string, HistoryEntry>
): SessionJudgeStepSummary[] =>
  spec.steps.map((step) => {
    const attempts = attemptsByStep.get(step.id) ?? [];
    const latestAttempt = latestAttemptByStep.get(step.id);
    const latestSuccessful = latestSuccessfulByStep.get(step.id);
    const hasHistoricalFailure = attempts.some((attempt) => !attempt.ok);

    return {
      step_id: step.id,
      status: hasHistoricalFailure
        ? 'failed'
        : latestSuccessful
          ? 'passed'
          : 'pending',
      attempt_count: attempts.length,
      latest_attempt: latestAttempt
        ? {
            run_id: latestAttempt.runId,
            ok: latestAttempt.ok,
            verdict_category: latestAttempt.verdictCategory,
            created_at: latestAttempt.createdAt
          }
        : undefined,
      latest_successful_run_id: latestSuccessful?.runId,
      has_historical_failure: hasHistoricalFailure
    };
  });

export const judgePersistentRunSession = async (
  runContext: RunContext,
  manifest: PersistentRunSessionManifest,
  spec: LoadedRunSpec
): Promise<SessionJudgeResult> => {
  const attemptsByStep = new Map<string, HistoryEntry[]>();
  const latestAttemptByStep = new Map<string, HistoryEntry>();
  const latestSuccessfulByStep = new Map<string, HistoryEntry>();
  const artifactsByRunId = new Map<string, LoadedRunArtifacts>();

  for (const historyEntry of manifest.history) {
    const attempts = attemptsByStep.get(historyEntry.stepId) ?? [];
    attempts.push(historyEntry);
    attemptsByStep.set(historyEntry.stepId, attempts);
  }

  for (const [stepId, attempts] of attemptsByStep.entries()) {
    const ordered = [...attempts].sort(byCreatedAtDesc);
    latestAttemptByStep.set(stepId, ordered[0]);
    const latestSuccessful = ordered.find((attempt) => attempt.ok);
    if (latestSuccessful) {
      latestSuccessfulByStep.set(stepId, latestSuccessful);
    }
  }

  for (const historyEntry of manifest.history) {
    if (artifactsByRunId.has(historyEntry.runId)) {
      continue;
    }
    try {
      artifactsByRunId.set(historyEntry.runId, await loadRunArtifacts(runContext, historyEntry.runId));
    } catch (error) {
      const stepSummaries = buildStepSummaries(spec, attemptsByStep, latestAttemptByStep, latestSuccessfulByStep);
      const remainingStepIds = spec.steps.filter((step) => !latestSuccessfulByStep.has(step.id)).map((step) => step.id);
      return {
        verdict: {
          status: 'failed',
          category: 'missing_artifacts',
          reason: error instanceof Error ? error.message : `Artifacts are missing for run ${historyEntry.runId}`,
          sourceRunId: historyEntry.runId
        },
        step_summaries: stepSummaries,
        remaining_step_ids: remainingStepIds,
        latest_successful_run_ids_by_step: Object.fromEntries(
          [...latestSuccessfulByStep.entries()].map(([stepId, entry]) => [stepId, entry.runId])
        ),
        tainting_failures: []
      };
    }
  }

  const stepSummaries = buildStepSummaries(spec, attemptsByStep, latestAttemptByStep, latestSuccessfulByStep);
  const latestSuccessfulRunIdsByStep = Object.fromEntries(
    [...latestSuccessfulByStep.entries()].map(([stepId, entry]) => [stepId, entry.runId])
  );
  const taintingFailures = [...manifest.history]
    .filter((attempt) => !attempt.ok)
    .sort(byCreatedAtDesc)
    .map((attempt) => ({
      step_id: attempt.stepId,
      run_id: attempt.runId,
      verdict_category: attempt.verdictCategory,
      created_at: attempt.createdAt
    }));

  if (taintingFailures.length > 0) {
    const latestFailure = taintingFailures[0];
    return {
      verdict: {
        status: 'failed',
        category: 'historical_failure',
        reason: `Historical failure on step ${latestFailure.step_id} in run ${latestFailure.run_id}`,
        failedStepId: latestFailure.step_id,
        sourceRunId: latestFailure.run_id
      },
      step_summaries: stepSummaries,
      remaining_step_ids: spec.steps.filter((step) => !latestSuccessfulByStep.has(step.id)).map((step) => step.id),
      latest_successful_run_ids_by_step: latestSuccessfulRunIdsByStep,
      tainting_failures: taintingFailures
    };
  }

  const remainingStepIds = spec.steps.filter((step) => !latestSuccessfulByStep.has(step.id)).map((step) => step.id);
  if (remainingStepIds.length > 0) {
    return {
      verdict: {
        status: 'incomplete',
        category: 'incomplete',
        reason: `Session is incomplete. Remaining steps: ${remainingStepIds.join(', ')}`
      },
      step_summaries: stepSummaries,
      remaining_step_ids: remainingStepIds,
      latest_successful_run_ids_by_step: latestSuccessfulRunIdsByStep,
      tainting_failures: []
    };
  }

  const { engineResult, finalArtifacts } = buildSyntheticEngineResult(spec, artifactsByRunId, latestSuccessfulByStep);
  const scenarioVerdict: RunVerdict = judgeRun({
    engineResult,
    oracles: spec.oracles,
    traceId: finalArtifacts.report.traceId,
    traceLookupError: finalArtifacts.lookupErrors?.tempo,
    logLookupError: finalArtifacts.lookupErrors?.loki
  });

  if (scenarioVerdict.status === 'passed') {
    return {
      verdict: {
        status: 'passed',
        category: 'success',
        reason: scenarioVerdict.reason,
        sourceRunId: finalArtifacts.report.runId
      },
      step_summaries: stepSummaries,
      remaining_step_ids: [],
      latest_successful_run_ids_by_step: latestSuccessfulRunIdsByStep,
      tainting_failures: []
    };
  }

  const category = scenarioVerdict.category === 'trace_lookup_failed'
    ? 'trace_lookup_failed'
    : scenarioVerdict.category === 'log_lookup_failed'
      ? 'log_lookup_failed'
      : 'scenario_oracle_failure';

  return {
    verdict: {
      status: 'failed',
      category,
      reason: scenarioVerdict.reason,
      failedStepId: scenarioVerdict.failedStepId,
      sourceRunId: finalArtifacts.report.runId
    },
    step_summaries: stepSummaries,
    remaining_step_ids: [],
    latest_successful_run_ids_by_step: latestSuccessfulRunIdsByStep,
    tainting_failures: []
  };
};
