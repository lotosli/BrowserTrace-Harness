import { describe, expect, test } from 'vitest';
import { SessionStore } from './session-store.js';

describe('SessionStore', () => {
  test('persists and loads manifests and bundles', async () => {
    const store = new SessionStore();
    const sessionId = `test-session-${Date.now()}`;
    await store.save(
      sessionId,
      {
        sessionId,
        bundlePath: 'bundle.json',
        targetUrl: 'http://127.0.0.1:8083/observability/',
        targetOrigin: 'http://127.0.0.1:8083',
        appName: 'observability',
        envName: 'local',
        specId: 'SPEC-1',
        runId: 'run-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        validationStatus: 'validated'
      },
      {
        bundleId: 'bundle-1',
        source: {
          browserKind: 'chromium',
          pageUrl: 'http://127.0.0.1:8083/observability/',
          pageTitle: 'Demo',
          origin: 'http://127.0.0.1:8083'
        },
        auth: {
          cookies: [],
          localStorage: {},
          sessionStorage: {}
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          ttlSeconds: 3600,
          authSource: ['cookies'],
          targetUrl: 'http://127.0.0.1:8083/observability/'
        }
      }
    );

    const loaded = await store.load(sessionId);
    expect(loaded.manifest.sessionId).toBe(sessionId);
    expect(loaded.bundle.bundleId).toBe('bundle-1');
  });
});

