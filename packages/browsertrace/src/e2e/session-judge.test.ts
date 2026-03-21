import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BrowserTraceConfig } from '../config/config-schema.js';
import type { RunContext } from '../cli/run-context.js';
import { judgePersistentRunSession } from './session-judge.js';
import type { PersistentRunSessionManifest } from './persistent-session-store.js';
import type { LoadedRunSpec } from './spec-loader.js';
import type { BrowserEngineRunResult } from './browser-engine.js';

const baseConfig = (artifactsDir: string): BrowserTraceConfig => ({
  chrome: {
    cdp_url: 'http://127.0.0.1:9222'
  },
  browser_use: {
    wait_between_actions_ms: 250
  },
  artifacts: {
    base_dir: artifactsDir
  },
  otel: {
    endpoint: 'http://127.0.0.1:4318/v1/traces',
    service_name: 'browsertrace',
    propagators: ['tracecontext', 'baggage']
  },
  trace: {
    output_default: 'otlp'
  },
  lookup: {
    tempo: {
      base_url: 'http://127.0.0.1:3200'
    },
    loki: {
      base_url: 'http://127.0.0.1:3100',
      query_labels: {}
    }
  },
  apps: {},
  java_debug: {
    default_profile_dir: '/tmp/browsertrace-java-debug',
    default_service_name_suffix: '-debug',
    log_format: 'json'
  }
});

const createSpec = (): LoadedRunSpec => ({
  schemaVersion: '1',
  scenarioId: 'demo',
  specId: 'demo',
  appName: 'demo-react',
  envName: 'local',
  startUrl: 'http://127.0.0.1:5173',
  specPath: '/tmp/spec.yaml',
  specDir: '/tmp',
  engine: {
    kind: 'browser_use_python'
  },
  setup: {
    services: []
  },
  steps: [
    { id: 'step-1', action: 'goto', url: 'http://127.0.0.1:5173' },
    { id: 'step-2', action: 'screenshot' }
  ],
  oracles: {
    ui: [],
    network: {
      failOnHttpStatusGte: 500
    },
    trace: {
      failOnMissingTrace: false,
      requireLookup: false
    },
    logs: {
      requireLookup: false
    }
  }
});

const createManifest = (history: PersistentRunSessionManifest['history']): PersistentRunSessionManifest => ({
  sessionId: 'sess-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: 'active',
  specPath: '/tmp/spec.yaml',
  specId: 'demo',
  scenarioId: 'demo',
  appName: 'demo-react',
  envName: 'local',
  browser: {
    cdpUrl: 'http://127.0.0.1:9222'
  },
  services: [],
  completedStepIds: [],
  history
});

const createStepResult = (stepId: string, currentUrl: string, elementsByTestId: Record<string, unknown> = {}) => ({
  id: stepId,
  action: 'click',
  status: 'ok' as const,
  currentUrl,
  pageTitle: 'Demo',
  pageHtmlPath: `/tmp/${stepId}.html`,
  pageStatePath: `/tmp/${stepId}.json`,
  screenshotPath: `/tmp/${stepId}.png`,
  pageState: {
    title: 'Demo',
    url: currentUrl,
    textExcerpt: '',
    headings: [],
    buttons: [],
    forms: [],
    elementsByTestId,
    statusChips: {}
  },
  consoleEntries: [],
  actionConsoleEntries: [],
  networkDetailed: [],
  actionNetworkDetailed: [],
  exceptions: [],
  actionExceptions: []
});

const writeRunArtifacts = async (input: {
  artifactsDir: string;
  runId: string;
  spec: LoadedRunSpec;
  stepResults: BrowserEngineRunResult['steps'];
  verdict: { status: string; category: string; reason: string; failedStepId?: string };
}) => {
  const runRoot = path.join(input.artifactsDir, input.runId);
  await mkdir(path.join(runRoot, 'runtime'), { recursive: true });

  const engineResult: BrowserEngineRunResult = {
    engine: 'browser_use_python',
    currentUrl: input.stepResults[input.stepResults.length - 1]?.currentUrl ?? 'http://127.0.0.1:5173',
    pageTitle: 'Demo',
    pageStatePath: input.stepResults[input.stepResults.length - 1]?.pageStatePath ?? '/tmp/page-state.json',
    pageHtmlPath: input.stepResults[input.stepResults.length - 1]?.pageHtmlPath ?? '/tmp/page.html',
    screenshotPath: input.stepResults[input.stepResults.length - 1]?.screenshotPath,
    steps: input.stepResults
  };

  await Promise.all([
    writeFile(path.join(runRoot, 'runtime', 'engine-result.json'), `${JSON.stringify(engineResult, null, 2)}\n`, 'utf8'),
    writeFile(
      path.join(runRoot, 'runtime', 'run-report.json'),
      `${JSON.stringify(
        {
          runId: input.runId,
          specId: input.spec.specId,
          scenarioId: input.spec.scenarioId,
          appName: input.spec.appName,
          envName: input.spec.envName,
          traceId: `trace-${input.runId}`,
          engine: 'browser_use_python',
          currentUrl: engineResult.currentUrl,
          pageTitle: engineResult.pageTitle,
          verdict: input.verdict,
          services: [],
          artifacts: {
            resolvedSpecPath: path.join(runRoot, 'runtime', 'run-spec.resolved.json'),
            engineResultPath: path.join(runRoot, 'runtime', 'engine-result.json')
          }
        },
        null,
        2
      )}\n`,
      'utf8'
    ),
    writeFile(path.join(runRoot, 'runtime', 'run-spec.resolved.json'), `${JSON.stringify(input.spec, null, 2)}\n`, 'utf8')
  ]);
};

describe('judgePersistentRunSession', () => {
  it('returns incomplete when there is no history', async () => {
    const artifactsDir = await mkdtemp(path.join(tmpdir(), 'browsertrace-session-judge-'));
    const runContext = { config: baseConfig(artifactsDir) } as RunContext;

    const result = await judgePersistentRunSession(runContext, createManifest([]), createSpec());
    expect(result.verdict.status).toBe('incomplete');
    expect(result.remaining_step_ids).toEqual(['step-1', 'step-2']);
  });

  it('returns incomplete when only part of the spec has successful runs', async () => {
    const artifactsDir = await mkdtemp(path.join(tmpdir(), 'browsertrace-session-judge-'));
    const spec = createSpec();
    await writeRunArtifacts({
      artifactsDir,
      runId: 'run-step-1',
      spec,
      stepResults: [createStepResult('step-1', 'http://127.0.0.1:5173')],
      verdict: {
        status: 'passed',
        category: 'success',
        reason: 'ok'
      }
    });
    const runContext = { config: baseConfig(artifactsDir) } as RunContext;

    const result = await judgePersistentRunSession(
      runContext,
      createManifest([
        {
          runId: 'run-step-1',
          stepId: 'step-1',
          ok: true,
          verdictCategory: 'success',
          artifactsDir: path.join(artifactsDir, 'run-step-1'),
          createdAt: new Date().toISOString()
        }
      ]),
      spec
    );

    expect(result.verdict.status).toBe('incomplete');
    expect(result.remaining_step_ids).toEqual(['step-2']);
  });

  it('returns historical_failure when any earlier attempt failed even if later success exists', async () => {
    const artifactsDir = await mkdtemp(path.join(tmpdir(), 'browsertrace-session-judge-'));
    const spec = createSpec();
    await Promise.all([
      writeRunArtifacts({
        artifactsDir,
        runId: 'run-failed',
        spec,
        stepResults: [createStepResult('step-1', 'http://127.0.0.1:5173')],
        verdict: {
          status: 'failed',
          category: 'http_error',
          reason: '500',
          failedStepId: 'step-1'
        }
      }),
      writeRunArtifacts({
        artifactsDir,
        runId: 'run-success',
        spec,
        stepResults: [createStepResult('step-1', 'http://127.0.0.1:5173')],
        verdict: {
          status: 'passed',
          category: 'success',
          reason: 'ok'
        }
      })
    ]);
    const runContext = { config: baseConfig(artifactsDir) } as RunContext;

    const result = await judgePersistentRunSession(
      runContext,
      createManifest([
        {
          runId: 'run-failed',
          stepId: 'step-1',
          ok: false,
          verdictCategory: 'http_error',
          artifactsDir: path.join(artifactsDir, 'run-failed'),
          createdAt: '2026-03-21T00:00:00.000Z'
        },
        {
          runId: 'run-success',
          stepId: 'step-1',
          ok: true,
          verdictCategory: 'success',
          artifactsDir: path.join(artifactsDir, 'run-success'),
          createdAt: '2026-03-21T00:01:00.000Z'
        }
      ]),
      spec
    );

    expect(result.verdict.status).toBe('failed');
    expect(result.verdict.category).toBe('historical_failure');
    expect(result.latest_successful_run_ids_by_step['step-1']).toBe('run-success');
  });

  it('returns passed when every spec step has a successful latest attempt', async () => {
    const artifactsDir = await mkdtemp(path.join(tmpdir(), 'browsertrace-session-judge-'));
    const spec = createSpec();
    await Promise.all([
      writeRunArtifacts({
        artifactsDir,
        runId: 'run-step-1',
        spec,
        stepResults: [createStepResult('step-1', 'http://127.0.0.1:5173')],
        verdict: {
          status: 'passed',
          category: 'success',
          reason: 'ok'
        }
      }),
      writeRunArtifacts({
        artifactsDir,
        runId: 'run-step-2',
        spec,
        stepResults: [createStepResult('step-2', 'http://127.0.0.1:5173')],
        verdict: {
          status: 'passed',
          category: 'success',
          reason: 'ok'
        }
      })
    ]);
    const runContext = { config: baseConfig(artifactsDir) } as RunContext;

    const result = await judgePersistentRunSession(
      runContext,
      createManifest([
        {
          runId: 'run-step-1',
          stepId: 'step-1',
          ok: true,
          verdictCategory: 'success',
          artifactsDir: path.join(artifactsDir, 'run-step-1'),
          createdAt: '2026-03-21T00:00:00.000Z'
        },
        {
          runId: 'run-step-2',
          stepId: 'step-2',
          ok: true,
          verdictCategory: 'success',
          artifactsDir: path.join(artifactsDir, 'run-step-2'),
          createdAt: '2026-03-21T00:01:00.000Z'
        }
      ]),
      spec
    );

    expect(result.verdict.status).toBe('passed');
    expect(result.verdict.category).toBe('success');
    expect(result.remaining_step_ids).toEqual([]);
  });

  it('returns scenario_oracle_failure when synthetic final scenario evaluation fails', async () => {
    const artifactsDir = await mkdtemp(path.join(tmpdir(), 'browsertrace-session-judge-'));
    const spec = {
      ...createSpec(),
      oracles: {
        ui: [
          {
            selector: 'result-status-badge',
            visible: true
          }
        ],
        network: {
          failOnHttpStatusGte: 500
        },
        trace: {
          failOnMissingTrace: false,
          requireLookup: false
        },
        logs: {
          requireLookup: false
        }
      }
    };
    await Promise.all([
      writeRunArtifacts({
        artifactsDir,
        runId: 'run-step-1',
        spec,
        stepResults: [createStepResult('step-1', 'http://127.0.0.1:5173')],
        verdict: {
          status: 'passed',
          category: 'success',
          reason: 'ok'
        }
      }),
      writeRunArtifacts({
        artifactsDir,
        runId: 'run-step-2',
        spec,
        stepResults: [createStepResult('step-2', 'http://127.0.0.1:5173')],
        verdict: {
          status: 'passed',
          category: 'success',
          reason: 'ok'
        }
      })
    ]);
    const runContext = { config: baseConfig(artifactsDir) } as RunContext;

    const result = await judgePersistentRunSession(
      runContext,
      createManifest([
        {
          runId: 'run-step-1',
          stepId: 'step-1',
          ok: true,
          verdictCategory: 'success',
          artifactsDir: path.join(artifactsDir, 'run-step-1'),
          createdAt: '2026-03-21T00:00:00.000Z'
        },
        {
          runId: 'run-step-2',
          stepId: 'step-2',
          ok: true,
          verdictCategory: 'success',
          artifactsDir: path.join(artifactsDir, 'run-step-2'),
          createdAt: '2026-03-21T00:01:00.000Z'
        }
      ]),
      spec
    );

    expect(result.verdict.status).toBe('failed');
    expect(result.verdict.category).toBe('scenario_oracle_failure');
  });
});
