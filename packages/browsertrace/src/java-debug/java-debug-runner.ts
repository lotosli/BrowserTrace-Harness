import path from 'node:path';
import type { BrowserTraceConfig } from '../config/config-schema.js';
import type { JavaMethodDescriptor } from '../types/java-debug.js';
import { DebugProfileGenerator } from './debug-profile-generator.js';
import { launchJavaProcess } from './java-launcher.js';
import { HarnessError } from '../types/errors.js';

export class JavaDebugRunner {
  private readonly generator = new DebugProfileGenerator();

  public async generateProfile(
    config: BrowserTraceConfig,
    outputDir: string,
    methods: JavaMethodDescriptor[],
    serviceName: string
  ) {
    return this.generator.generate(config, outputDir, methods, serviceName);
  }

  public async run(options: {
    config: BrowserTraceConfig;
    outputDir: string;
    methods: JavaMethodDescriptor[];
    serviceName: string;
    appJar: string;
    javaAgentPath?: string;
    cwd: string;
  }): Promise<{ pid: number; command: string; profileDir: string }> {
    const javaAgentPath = options.javaAgentPath ?? options.config.java_debug.java_agent;
    if (!javaAgentPath) {
      throw new HarnessError('java_launch_failed', 'No Java agent path was provided. Set --java-agent or java_debug.java_agent.');
    }

    const profileDir = path.resolve(options.outputDir);
    const profile = await this.generator.generate(options.config, profileDir, options.methods, options.serviceName);
    const launchResult = await launchJavaProcess({
      javaAgentPath,
      agentPropertiesPath: profile.agentPropertiesPath,
      appJar: options.appJar,
      logbackConfigPath: profile.logbackConfigPath,
      cwd: options.cwd,
      artifactsDir: profileDir
    });
    return {
      ...launchResult,
      profileDir
    };
  }
}

