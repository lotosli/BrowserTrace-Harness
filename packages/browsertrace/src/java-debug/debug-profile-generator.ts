import path from 'node:path';
import { ensureDirectory, writeJsonFile } from '../utils/fs.js';
import type { BrowserTraceConfig } from '../config/config-schema.js';
import type { JavaDebugProfile, JavaMethodDescriptor } from '../types/java-debug.js';
import { buildLogbackTemplate } from './logback-generator.js';
import { writeFile } from 'node:fs/promises';
import { HarnessError } from '../types/errors.js';

const groupMethods = (methods: JavaMethodDescriptor[]): string =>
  Array.from(
    methods.reduce((accumulator, method) => {
      const list = accumulator.get(method.className) ?? [];
      list.push(method.methodName);
      accumulator.set(method.className, list);
      return accumulator;
    }, new Map<string, string[]>())
  )
    .map(([className, methodNames]) => `${className}[${Array.from(new Set(methodNames)).join(',')}]`)
    .join(';');

export class DebugProfileGenerator {
  public async generate(
    config: BrowserTraceConfig,
    outputDir: string,
    methods: JavaMethodDescriptor[],
    serviceName: string
  ): Promise<JavaDebugProfile> {
    try {
      await ensureDirectory(outputDir);
      const methodsInclude = groupMethods(methods);
      const methodsFilePath = path.join(outputDir, 'methods.include.txt');
      const agentPropertiesPath = path.join(outputDir, 'debug-agent.properties');
      const logbackConfigPath = path.join(outputDir, 'logback-spring.xml');
      await writeFile(methodsFilePath, `${methodsInclude}\n`, 'utf8');
      await writeFile(
        agentPropertiesPath,
        [
          'otel.instrumentation.common.default-enabled=false',
          'otel.instrumentation.servlet.enabled=true',
          'otel.instrumentation.spring-webmvc.enabled=true',
          'otel.instrumentation.logback-mdc.enabled=true',
          'otel.instrumentation.common.experimental.controller-telemetry.enabled=false',
          'otel.instrumentation.common.experimental.view-telemetry.enabled=false',
          'otel.instrumentation.experimental.span-suppression-strategy=none',
          'otel.propagators=tracecontext,baggage',
          'otel.javaagent.logging=application',
          `otel.service.name=${serviceName}`,
          `otel.exporter.otlp.endpoint=${config.otel.endpoint ?? 'http://127.0.0.1:4318'}`,
          `otel.instrumentation.methods.include=${methodsInclude}`
        ].join('\n') + '\n',
        'utf8'
      );
      await writeFile(logbackConfigPath, buildLogbackTemplate(), 'utf8');
      await writeJsonFile(path.join(outputDir, 'profile-summary.json'), {
        methodsCount: methods.length,
        serviceName
      });
      return {
        methodsInclude,
        methodsFilePath,
        agentPropertiesPath,
        logbackConfigPath
      };
    } catch (error) {
      throw new HarnessError('java_profile_generate_failed', error instanceof Error ? error.message : 'Failed to generate Java debug profile');
    }
  }
}
