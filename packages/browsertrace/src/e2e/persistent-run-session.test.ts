import { describe, expect, it } from 'vitest';
import { resolveStepRange } from './persistent-run-session.js';
import type { LoadedRunSpec } from './spec-loader.js';
import type { PersistentRunSessionManifest } from './persistent-session-store.js';
import { HarnessError } from '../types/errors.js';

const baseSpec: LoadedRunSpec = {
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
  oracles: {
    ui: [],
    network: { failOnHttpStatusGte: 500 },
    trace: { failOnMissingTrace: false, requireLookup: false },
    logs: { requireLookup: false }
  },
  steps: [
    { id: 'step-1', action: 'goto', url: 'http://127.0.0.1:5173' },
    { id: 'step-2', action: 'wait', ms: 100 },
    { id: 'step-3', action: 'screenshot' }
  ]
};

const baseManifest: PersistentRunSessionManifest = {
  sessionId: 'sess-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: 'active',
  specPath: '/tmp/spec.yaml',
  specId: 'demo',
  scenarioId: 'demo',
  appName: 'demo-react',
  envName: 'local',
  browser: {},
  services: [],
  completedStepIds: [],
  history: []
};

describe('resolveStepRange', () => {
  it('resolves a valid frontier-to-target through range', () => {
    const resolved = resolveStepRange({
      spec: baseSpec,
      manifest: {
        ...baseManifest,
        completedStepIds: ['step-1']
      },
      throughStepId: 'step-3'
    });

    expect(resolved.mode).toBe('through');
    expect(resolved.targetStepId).toBe('step-3');
    expect(resolved.steps.map((step) => step.id)).toEqual(['step-2', 'step-3']);
  });

  it('throws when through-step target is before the current frontier', () => {
    expect(() =>
      resolveStepRange({
        spec: baseSpec,
        manifest: {
          ...baseManifest,
          completedStepIds: ['step-1', 'step-2']
        },
        throughStepId: 'step-1'
      })
    ).toThrow(HarnessError);
  });

  it('throws when through-step target does not exist', () => {
    expect(() =>
      resolveStepRange({
        spec: baseSpec,
        manifest: baseManifest,
        throughStepId: 'missing-step'
      })
    ).toThrow(HarnessError);
  });
});
