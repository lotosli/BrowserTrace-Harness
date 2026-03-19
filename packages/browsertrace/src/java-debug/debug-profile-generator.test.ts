import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { DebugProfileGenerator } from './debug-profile-generator.js';

describe('DebugProfileGenerator', () => {
  test('writes methods include and templates', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'browsertrace-java-profile-'));
    const generator = new DebugProfileGenerator();
    const profile = await generator.generate(
      {
        chrome: { cdp_url: 'http://127.0.0.1:9222' },
        artifacts: { base_dir: outputDir },
        otel: { endpoint: 'http://127.0.0.1:4318/v1/traces', service_name: 'browsertrace', propagators: ['tracecontext', 'baggage'] },
        trace: { output_default: 'otlp' },
        lookup: {
          tempo: { base_url: 'http://127.0.0.1:3200' },
          loki: { base_url: 'http://127.0.0.1:3100', query_labels: {} }
        },
        apps: {},
        java_debug: {
          default_profile_dir: outputDir,
          default_service_name_suffix: '-debug',
          log_format: 'json'
        }
      },
      outputDir,
      [
        { className: 'com.example.order.service.OrderService', packageName: 'com.example.order.service', methodName: 'create' },
        { className: 'com.example.order.service.OrderService', packageName: 'com.example.order.service', methodName: 'cancel' }
      ],
      'order-service-debug'
    );

    expect(profile.methodsInclude).toContain('OrderService[create,cancel]');
    expect(await readFile(profile.logbackConfigPath, 'utf8')).toContain('LoggingEventCompositeJsonEncoder');
    expect(await readFile(profile.agentPropertiesPath, 'utf8')).toContain('otel.exporter.otlp.traces.endpoint=http://127.0.0.1:4318/v1/traces');
    expect(await readFile(profile.agentPropertiesPath, 'utf8')).toContain('otel.exporter.otlp.protocol=http/protobuf');
  });
});
