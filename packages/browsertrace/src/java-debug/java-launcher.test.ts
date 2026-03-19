import { describe, expect, it } from 'vitest';
import { buildJavaLaunchArgs } from './java-launcher.js';

describe('buildJavaLaunchArgs', () => {
  it('uses the official OpenTelemetry configuration file system property', () => {
    const args = buildJavaLaunchArgs({
      javaAgentPath: '/tmp/opentelemetry-javaagent.jar',
      agentPropertiesPath: '/tmp/debug-agent.properties',
      appJar: '/tmp/demo-service.jar',
      logbackConfigPath: '/tmp/logback-spring.xml',
      cwd: '/tmp',
      artifactsDir: '/tmp/artifacts'
    });

    expect(args).toEqual([
      '-javaagent:/tmp/opentelemetry-javaagent.jar',
      '-Dotel.javaagent.configuration-file=/tmp/debug-agent.properties',
      '-Dlogging.config=/tmp/logback-spring.xml',
      '-jar',
      '/tmp/demo-service.jar'
    ]);
    expect(args.join(' ')).not.toContain('=config=');
  });
});
