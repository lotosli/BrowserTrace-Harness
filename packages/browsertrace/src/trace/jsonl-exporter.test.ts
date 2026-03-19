import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import * as otelCore from '@opentelemetry/core';
import { JsonlTraceExporter } from './jsonl-exporter.js';

describe('JsonlTraceExporter', () => {
  test('writes one JSON object per span', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'browsertrace-trace-jsonl-'));
    const outputPath = path.join(directory, 'trace.jsonl');
    const exporter = new JsonlTraceExporter(outputPath, {
      specId: 'SPEC-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      appName: 'observability',
      envName: 'local',
      pageUrl: 'http://127.0.0.1:8083/observability/'
    });

    const result = await new Promise<number>((resolve) => {
      exporter.export(
        [
          {
            name: 'session.ensure',
            kind: 0,
            startTime: [0, 0],
            endTime: [0, 1_000_000],
            attributes: { foo: 'bar' },
            status: { code: 0 },
            spanContext: () => ({ traceId: 'abc', spanId: 'def', traceFlags: 1 }),
            parentSpanContext: undefined,
            resource: { attributes: { 'service.name': 'browsertrace' } }
          }
        ] as never,
        (exportResult) => resolve(exportResult.code)
      );
    });

    const content = await readFile(outputPath, 'utf8');
    expect(result).toBe(otelCore.ExportResultCode.SUCCESS);
    expect(content).toContain('"traceId":"abc"');
    expect(content).toContain('"startTime":"1970-01-01T00:00:00.000Z"');
    expect(content).toContain('"endTime":"1970-01-01T00:00:00.001Z"');
  });
});
