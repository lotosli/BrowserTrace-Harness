import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRunSpec } from './spec-loader.js';

describe('loadRunSpec', () => {
  it('prepends a goto step when startUrl is provided', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'browsertrace-spec-'));
    const specPath = path.join(root, 'spec.yaml');
    await writeFile(
      specPath,
      `
scenarioId: checkout
appName: shop
envName: test
startUrl: http://127.0.0.1:3000
steps:
  - action: click
    selector: '[data-testid="buy-now"]'
`,
      'utf8'
    );

    const spec = await loadRunSpec(specPath);
    expect(spec.specId).toBe('checkout');
    expect(spec.steps[0]).toMatchObject({
      id: '00_open_start_url',
      action: 'goto',
      url: 'http://127.0.0.1:3000'
    });
    expect(spec.steps[1]).toMatchObject({
      id: '02_click',
      action: 'click'
    });
  });

  it('resolves relative service cwd from the spec directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'browsertrace-spec-'));
    const servicesDir = path.join(root, 'app');
    await mkdir(servicesDir, { recursive: true });
    const specPath = path.join(root, 'spec.yaml');
    await writeFile(
      specPath,
      `
scenarioId: healthcheck
setup:
  services:
    - id: api
      run: pnpm dev
      cwd: ./app
      healthcheck:
        type: none
steps:
  - action: wait
    ms: 1
`,
      'utf8'
    );

    const spec = await loadRunSpec(specPath);
    expect(spec.setup.services[0]?.cwd).toBe(servicesDir);
  });
});
