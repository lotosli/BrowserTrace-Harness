import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadConfig } from './config-loader.js';

describe('loadConfig', () => {
  test('loads and normalizes config values', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'browsertrace-config-'));
    const configPath = path.join(directory, 'config.yaml');
    await writeFile(
      configPath,
      `
chrome:
  cdp_url: http://127.0.0.1:9222
artifacts:
  base_dir: ~/browsertrace-artifacts
otel:
  endpoint: http://127.0.0.1:4318/v1/traces
lookup:
  tempo:
    base_url: http://127.0.0.1:3200
  loki:
    base_url: http://127.0.0.1:3100
    query_labels:
      service_name: demo-service
apps:
  observability:
    allow_api_origins:
      - http://127.0.0.1:8083
java_debug:
  default_profile_dir: ~/browsertrace-java
`,
      'utf8'
    );

    const { config } = await loadConfig(configPath);
    expect(config.artifacts.base_dir).toContain('browsertrace-artifacts');
    expect(config.lookup.loki.query_labels.service_name).toBe('demo-service');
    expect(config.apps.observability.allow_api_origins).toContain('http://127.0.0.1:8083');
    expect(config.java_debug.default_profile_dir).toContain('browsertrace-java');
  });
});

