import { forkRunContext, refreshRunContextBaggage, type RunContext } from '../cli/run-context.js';
import { loadRunSpec, type LoadedRunSpec, type LoadedRunStep } from './spec-loader.js';
import { PersistentRunSessionStore, type PersistentRunSessionManifest } from './persistent-session-store.js';
import {
  launchPersistentServices,
  stopPersistentServices,
  isServiceRunning,
  type PersistentServiceHandle
} from './persistent-service-orchestrator.js';
import { startPersistentBrowserSession } from './persistent-browser-session.js';
import { runLoadedE2eSpec } from './run-orchestrator.js';
import { loadRunArtifacts } from './run-artifacts.js';
import { buildRunDiagnosis } from './diagnostics.js';
import { HarnessError } from '../types/errors.js';
import type { OraclesSpec } from './spec-schema.js';
import { judgePersistentRunSession, type SessionJudgeResult } from './session-judge.js';

const randomId = (prefix: string, length = 10): string => `${prefix}_${Math.random().toString(16).slice(2, 2 + length)}`;

const nextStepId = (manifest: PersistentRunSessionManifest, allStepIds: string[]): string | undefined =>
  allStepIds.find((stepId) => !manifest.completedStepIds.includes(stepId));

type StepExecutionSummary = {
  step_id: string;
  run_id: string;
  ok: boolean;
  verdict_category: string;
  trace_id?: string;
  artifacts_dir: string;
};

export type ResolvedStepRange = {
  mode: 'single' | 'through';
  targetStepId: string;
  steps: LoadedRunStep[];
};

const buildStepLocalOracles = (oracles: OraclesSpec): OraclesSpec => ({
  ui: [],
  network: oracles.network,
  trace: {
    failOnMissingTrace: false,
    requireLookup: false
  },
  logs: {
    requireLookup: false
  }
});

const isBrowserReachable = async (cdpUrl?: string): Promise<boolean> => {
  if (!cdpUrl) {
    return false;
  }

  try {
    const endpoint = cdpUrl.startsWith('ws://') || cdpUrl.startsWith('wss://')
      ? cdpUrl.replace(/^ws/, 'http').replace(/\/devtools\/browser\/.*$/, '/json/version')
      : new URL('/json/version', cdpUrl).toString();
    const response = await fetch(endpoint);
    return response.ok;
  } catch {
    return false;
  }
};

const appendHistoryEntry = (
  manifest: PersistentRunSessionManifest,
  entry: PersistentRunSessionManifest['history'][number]
): PersistentRunSessionManifest => ({
  ...manifest,
  updatedAt: new Date().toISOString(),
  history: [...manifest.history, entry]
});

const buildRunSpecForPersistentStep = (
  spec: LoadedRunSpec,
  manifest: PersistentRunSessionManifest
): LoadedRunSpec => ({
  ...spec,
  engine: {
    ...spec.engine,
    cdpUrl: manifest.browser.cdpUrl,
    executablePath: manifest.browser.executablePath ?? spec.engine.executablePath,
    userDataDir: manifest.browser.userDataDir ?? spec.engine.userDataDir,
    headless: manifest.browser.headless ?? spec.engine.headless
  },
  setup: {
    services: []
  },
  oracles: buildStepLocalOracles(spec.oracles)
});

const persistStepResult = async (input: {
  store: PersistentRunSessionStore;
  manifest: PersistentRunSessionManifest;
  stepId: string;
  runResult: Awaited<ReturnType<typeof runLoadedE2eSpec>>;
  currentUrl?: string;
}): Promise<PersistentRunSessionManifest> => {
  const nextManifest = appendHistoryEntry(input.manifest, {
    runId: input.runResult.json.run_id,
    stepId: input.stepId,
    ok: input.runResult.json.ok,
    verdictCategory: input.runResult.json.verdict.category,
    traceId: input.runResult.json.trace_id,
    artifactsDir: input.runResult.json.artifacts.run_report_path.replace(/\/runtime\/run-report\.json$/, ''),
    createdAt: new Date().toISOString()
  });

  const completedStepIds = input.runResult.json.ok && !nextManifest.completedStepIds.includes(input.stepId)
    ? [...nextManifest.completedStepIds, input.stepId]
    : nextManifest.completedStepIds;

  const persisted: PersistentRunSessionManifest = {
    ...nextManifest,
    currentUrl: input.currentUrl ?? nextManifest.currentUrl,
    completedStepIds
  };
  await input.store.save(persisted);
  return persisted;
};

const executePersistentStep = async (input: {
  baseRunContext: RunContext;
  manifest: PersistentRunSessionManifest;
  spec: LoadedRunSpec;
  stepId: string;
  store: PersistentRunSessionStore;
}): Promise<{
  manifest: PersistentRunSessionManifest;
  run: Awaited<ReturnType<typeof runLoadedE2eSpec>>['json'];
  diagnosis: ReturnType<typeof buildRunDiagnosis>;
  exitCode?: number;
}> => {
  const runContext = await forkRunContext(input.baseRunContext, {
    runId: undefined,
    sessionId: input.manifest.sessionId,
    specId: input.manifest.specId,
    appName: input.manifest.appName,
    envName: input.manifest.envName,
    stepId: input.stepId,
    pageUrl: input.spec.startUrl ?? input.baseRunContext.baggageContext.pageUrl
  });

  const runSpec = buildRunSpecForPersistentStep(input.spec, input.manifest);
  const runResult = await runLoadedE2eSpec(runContext, runSpec, {
    stepId: input.stepId,
    stepMode: 'only'
  });
  const artifacts = await loadRunArtifacts(runContext, runResult.json.run_id);
  const diagnosis = buildRunDiagnosis(artifacts);
  const manifest = await persistStepResult({
    store: input.store,
    manifest: input.manifest,
    stepId: input.stepId,
    runResult,
    currentUrl: artifacts.report.currentUrl
  });

  return {
    manifest,
    run: runResult.json,
    diagnosis,
    exitCode: runResult.exitCode
  };
};

export const resolveStepRange = (input: {
  spec: LoadedRunSpec;
  manifest: PersistentRunSessionManifest;
  stepId?: string;
  throughStepId?: string;
}): ResolvedStepRange => {
  if (input.stepId && input.throughStepId) {
    throw new HarnessError('run_failed', '--step-id and --through-step are mutually exclusive');
  }

  const stepIds = input.spec.steps.map((step) => step.id);
  const frontierStepId = nextStepId(input.manifest, stepIds);

  if (input.throughStepId) {
    const frontierIndex = frontierStepId ? stepIds.indexOf(frontierStepId) : -1;
    const targetIndex = stepIds.indexOf(input.throughStepId);

    if (targetIndex < 0) {
      throw new HarnessError('run_failed', `Step ${input.throughStepId} was not found in spec ${input.spec.specPath}`);
    }
    if (frontierIndex < 0) {
      throw new HarnessError('run_failed', `Run session ${input.manifest.sessionId} has no remaining steps to resume.`);
    }
    if (targetIndex < frontierIndex) {
      throw new HarnessError('run_failed', `--through-step ${input.throughStepId} is before the current frontier ${frontierStepId}`);
    }

    return {
      mode: 'through',
      targetStepId: input.throughStepId,
      steps: input.spec.steps.slice(frontierIndex, targetIndex + 1)
    };
  }

  const singleStepId = input.stepId ?? frontierStepId;
  if (!singleStepId) {
    throw new HarnessError('run_failed', `Run session ${input.manifest.sessionId} has no remaining steps to resume.`);
  }

  const step = input.spec.steps.find((candidate) => candidate.id === singleStepId);
  if (!step) {
    throw new HarnessError('run_failed', `Step ${singleStepId} was not found in spec ${input.spec.specPath}`);
  }

  return {
    mode: 'single',
    targetStepId: singleStepId,
    steps: [step]
  };
};

export const startPersistentRunSession = async (
  baseRunContext: RunContext,
  specPath: string,
  requestedSessionId?: string
): Promise<{
  text: string[];
  json: {
    ok: true;
    session_id: string;
    manifest_path: string;
    next_step_id?: string;
    cdp_url?: string;
    browser_pid?: number;
    services: PersistentServiceHandle[];
  };
}> => {
  const spec = await loadRunSpec(specPath);
  const sessionId = requestedSessionId ?? randomId('runsess');
  const runContext = refreshRunContextBaggage(baseRunContext, {
    sessionId,
    specId: spec.specId,
    appName: spec.appName,
    envName: spec.envName,
    pageUrl: spec.startUrl ?? baseRunContext.baggageContext.pageUrl
  });
  const store = new PersistentRunSessionStore(runContext.config);
  await store.ensure();
  const sessionRoot = store.sessionRoot(sessionId);

  const services = await launchPersistentServices(spec.setup.services, sessionRoot);

  try {
    const browser = await startPersistentBrowserSession(runContext, spec);
    const manifest: PersistentRunSessionManifest = {
      sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      specPath: spec.specPath,
      specId: spec.specId,
      scenarioId: spec.scenarioId,
      appName: spec.appName,
      envName: spec.envName,
      browser: {
        cdpUrl: browser.cdpUrl,
        browserPid: browser.browserPid,
        executablePath: browser.executablePath,
        userDataDir: browser.userDataDir,
        headless: browser.headless
      },
      services: services.map((service) => ({
        id: service.id,
        pid: service.pid,
        stdoutPath: service.stdoutPath,
        stderrPath: service.stderrPath,
        command: service.command,
        cwd: service.cwd
      })),
      completedStepIds: [],
      history: []
    };

    const manifestPath = await store.save(manifest);
    const firstStepId = spec.steps[0]?.id;

    return {
      text: [
        `[ok] run session id: ${sessionId}`,
        `[ok] scenario id: ${spec.scenarioId}`,
        `[ok] next step id: ${firstStepId ?? 'none'}`,
        `[ok] manifest: ${manifestPath}`
      ],
      json: {
        ok: true,
        session_id: sessionId,
        manifest_path: manifestPath,
        next_step_id: firstStepId,
        cdp_url: browser.cdpUrl,
        browser_pid: browser.browserPid,
        services
      }
    };
  } catch (error) {
    await stopPersistentServices(services);
    throw error;
  }
};

export const getPersistentRunSessionStatus = async (
  baseRunContext: RunContext,
  sessionId: string
): Promise<{
  text: string[];
  json: {
    ok: boolean;
    session_id: string;
    status: string;
    next_step_id?: string;
    current_url?: string;
    browser_running: boolean;
    services: Array<{ id: string; running: boolean; pid: number }>;
    completed_step_ids: string[];
    history: PersistentRunSessionManifest['history'];
  };
}> => {
  const store = new PersistentRunSessionStore(baseRunContext.config);
  const manifest = await store.load(sessionId);
  const spec = await loadRunSpec(manifest.specPath);

  const browserRunning = manifest.browser.browserPid
    ? isServiceRunning(manifest.browser.browserPid) || await isBrowserReachable(manifest.browser.cdpUrl)
    : await isBrowserReachable(manifest.browser.cdpUrl);
  const services = manifest.services.map((service) => ({
    id: service.id,
    pid: service.pid,
    running: isServiceRunning(service.pid)
  }));

  return {
    text: [
      `[ok] session id: ${sessionId}`,
      `[ok] status: ${manifest.status}`,
      `[ok] next step id: ${nextStepId(manifest, spec.steps.map((step) => step.id)) ?? 'none'}`
    ],
    json: {
      ok: manifest.status === 'active',
      session_id: sessionId,
      status: manifest.status,
      next_step_id: nextStepId(manifest, spec.steps.map((step) => step.id)),
      current_url: manifest.currentUrl,
      browser_running: browserRunning,
      services,
      completed_step_ids: manifest.completedStepIds,
      history: manifest.history
    }
  };
};

export const resumePersistentRunSessionStep = async (
  baseRunContext: RunContext,
  sessionId: string,
  explicitStepId?: string,
  throughStepId?: string
): Promise<{
  text: string[];
  json:
    | {
        ok: boolean;
        session_id: string;
        resumed_step_id: string;
        next_step_id?: string;
        run: Awaited<ReturnType<typeof runLoadedE2eSpec>>['json'];
        diagnosis: ReturnType<typeof buildRunDiagnosis>;
      }
    | {
        ok: boolean;
        session_id: string;
        mode: 'through';
        through_step_id: string;
        next_step_id?: string;
        executed_steps: StepExecutionSummary[];
        batch: {
          ok: boolean;
          executed_count: number;
          failed_step_id?: string;
        };
        session_judge: SessionJudgeResult;
      };
  exitCode?: number;
}> => {
  const store = new PersistentRunSessionStore(baseRunContext.config);
  let manifest = await store.load(sessionId);
  if (manifest.status !== 'active') {
    throw new HarnessError('run_failed', `Run session ${sessionId} is not active.`);
  }
  if (!manifest.browser.cdpUrl) {
    throw new HarnessError('run_failed', `Run session ${sessionId} is missing a browser cdp url.`);
  }
  if (!(await isBrowserReachable(manifest.browser.cdpUrl))) {
    throw new HarnessError('run_failed', `Run session ${sessionId} browser is not reachable at ${manifest.browser.cdpUrl}`);
  }

  const spec = await loadRunSpec(manifest.specPath);
  const resolved = resolveStepRange({
    spec,
    manifest,
    stepId: explicitStepId,
    throughStepId
  });

  if (resolved.mode === 'single') {
    const execution = await executePersistentStep({
      baseRunContext,
      manifest,
      spec,
      stepId: resolved.targetStepId,
      store
    });
    manifest = execution.manifest;
    const nextId = nextStepId(manifest, spec.steps.map((step) => step.id));

    return {
      text: [
        `[ok] session id: ${sessionId}`,
        `[ok] resumed step id: ${resolved.targetStepId}`,
        `[ok] verdict: ${execution.run.verdict.status} (${execution.run.verdict.category})`,
        `[ok] next step id: ${nextId ?? 'none'}`
      ],
      exitCode: execution.exitCode,
      json: {
        ok: execution.run.ok,
        session_id: sessionId,
        resumed_step_id: resolved.targetStepId,
        next_step_id: nextId,
        run: execution.run,
        diagnosis: execution.diagnosis
      }
    };
  }

  const executedSteps: StepExecutionSummary[] = [];
  let batchFailedStepId: string | undefined;
  let batchExitCode = 0;

  for (const step of resolved.steps) {
    const execution = await executePersistentStep({
      baseRunContext,
      manifest,
      spec,
      stepId: step.id,
      store
    });
    manifest = execution.manifest;
    executedSteps.push({
      step_id: step.id,
      run_id: execution.run.run_id,
      ok: execution.run.ok,
      verdict_category: execution.run.verdict.category,
      trace_id: execution.run.trace_id,
      artifacts_dir: execution.run.artifacts.run_report_path.replace(/\/runtime\/run-report\.json$/, '')
    });

    if (!execution.run.ok) {
      batchFailedStepId = step.id;
      batchExitCode = execution.exitCode ?? 1;
      break;
    }
  }

  const sessionJudge = await judgePersistentRunSession(baseRunContext, manifest, spec);
  const nextId = nextStepId(manifest, spec.steps.map((step) => step.id));
  const finalStepId = spec.steps[spec.steps.length - 1]?.id;
  const reachedFinalStep = resolved.targetStepId === finalStepId && !batchFailedStepId;
  const batchOk = !batchFailedStepId;
  const ok = reachedFinalStep ? batchOk && sessionJudge.verdict.status === 'passed' : batchOk;

  return {
    text: [
      `[ok] session id: ${sessionId}`,
      `[ok] mode: through`,
      `[ok] through step id: ${resolved.targetStepId}`,
      `[ok] executed steps: ${executedSteps.length}`,
      `[ok] session judge: ${sessionJudge.verdict.status} (${sessionJudge.verdict.category})`
    ],
    exitCode: ok ? 0 : batchExitCode || 1,
    json: {
      ok,
      session_id: sessionId,
      mode: 'through',
      through_step_id: resolved.targetStepId,
      next_step_id: nextId,
      executed_steps: executedSteps,
      batch: {
        ok: batchOk,
        executed_count: executedSteps.length,
        failed_step_id: batchFailedStepId
      },
      session_judge: sessionJudge
    }
  };
};

export const judgePersistentRunSessionById = async (
  baseRunContext: RunContext,
  sessionId: string
): Promise<{
  text: string[];
  json: {
    ok: boolean;
    session_id: string;
    verdict: SessionJudgeResult['verdict'];
    step_summaries: SessionJudgeResult['step_summaries'];
    remaining_step_ids: string[];
    latest_successful_run_ids_by_step: Record<string, string>;
    tainting_failures: SessionJudgeResult['tainting_failures'];
  };
  exitCode?: number;
}> => {
  const store = new PersistentRunSessionStore(baseRunContext.config);
  const manifest = await store.load(sessionId);
  const spec = await loadRunSpec(manifest.specPath);
  const sessionJudge = await judgePersistentRunSession(baseRunContext, manifest, spec);

  return {
    text: [
      `[ok] session id: ${sessionId}`,
      `[ok] session verdict: ${sessionJudge.verdict.status} (${sessionJudge.verdict.category})`
    ],
    exitCode: sessionJudge.verdict.status === 'passed' ? 0 : 1,
    json: {
      ok: sessionJudge.verdict.status === 'passed',
      session_id: sessionId,
      verdict: sessionJudge.verdict,
      step_summaries: sessionJudge.step_summaries,
      remaining_step_ids: sessionJudge.remaining_step_ids,
      latest_successful_run_ids_by_step: sessionJudge.latest_successful_run_ids_by_step,
      tainting_failures: sessionJudge.tainting_failures
    }
  };
};

export const stopPersistentRunSession = async (
  baseRunContext: RunContext,
  sessionId: string
): Promise<{
  text: string[];
  json: {
    ok: true;
    session_id: string;
    stopped_services: string[];
    browser_pid?: number;
  };
}> => {
  const store = new PersistentRunSessionStore(baseRunContext.config);
  const manifest = await store.load(sessionId);

  await stopPersistentServices(manifest.services);

  if (manifest.browser.browserPid) {
    try {
      process.kill(-manifest.browser.browserPid, 'SIGTERM');
    } catch {
      try {
        process.kill(manifest.browser.browserPid, 'SIGTERM');
      } catch {
        // Ignore already-dead browser.
      }
    }
  }

  const updatedManifest: PersistentRunSessionManifest = {
    ...manifest,
    status: 'stopped',
    updatedAt: new Date().toISOString()
  };
  await store.save(updatedManifest);

  return {
    text: [
      `[ok] session id: ${sessionId}`,
      `[ok] status: stopped`
    ],
    json: {
      ok: true,
      session_id: sessionId,
      stopped_services: manifest.services.map((service) => service.id),
      browser_pid: manifest.browser.browserPid
    }
  };
};
