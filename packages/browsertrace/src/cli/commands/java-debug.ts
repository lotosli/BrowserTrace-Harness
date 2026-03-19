import path from 'node:path';
import { Command } from 'commander';
import { addCommonOptions } from '../shared.js';
import { runCommand } from '../command-runner.js';
import { MethodsScanner } from '../../java-debug/methods-scanner.js';
import { JavaDebugRunner } from '../../java-debug/java-debug-runner.js';

const scanner = new MethodsScanner();
const javaDebugRunner = new JavaDebugRunner();

export const buildJavaDebugCommands = (): Command => {
  const javaDebug = new Command('java-debug');

  addCommonOptions(
    javaDebug
      .command('scan-methods')
      .requiredOption('--classes-dir <path>', 'Compiled classes directory')
      .option('--base-package <name>', 'Base package to include')
  ).action(async (options) => {
    await runCommand('java-debug.scan-methods', options, 'java_methods_scan_failed', async (_runContext) => {
      const methods = await scanner.scan(path.resolve(options.classesDir), options.basePackage);
      return {
        text: [
          `[ok] scanned methods: ${methods.length}`
        ],
        json: {
          ok: true,
          methods
        }
      };
    });
  });

  addCommonOptions(
    javaDebug
      .command('gen-profile')
      .requiredOption('--classes-dir <path>', 'Compiled classes directory')
      .requiredOption('--service-name <name>', 'Service name for OTel')
      .option('--profile-dir <path>', 'Output directory')
      .option('--base-package <name>', 'Base package to include')
  ).action(async (options) => {
    await runCommand('java-debug.gen-profile', options, 'java_profile_generate_failed', async (runContext) => {
      const methods = await scanner.scan(path.resolve(options.classesDir), options.basePackage);
      const outputDir = options.profileDir
        ? path.resolve(options.profileDir)
        : path.join(runContext.config.java_debug.default_profile_dir, runContext.baggageContext.runId);
      const profile = await javaDebugRunner.generateProfile(runContext.config, outputDir, methods, options.serviceName);
      return {
        text: [
          `[ok] generated profile: ${outputDir}`,
          `[ok] methods: ${methods.length}`
        ],
        json: {
          ok: true,
          methods_count: methods.length,
          profile,
          artifacts_dir: runContext.artifactRoot
        }
      };
    });
  });

  addCommonOptions(
    javaDebug
      .command('run')
      .requiredOption('--classes-dir <path>', 'Compiled classes directory')
      .requiredOption('--app-jar <path>', 'Application jar path')
      .requiredOption('--service-name <name>', 'Service name for OTel')
      .requiredOption('--module <name>', 'Module name')
      .option('--base-package <name>', 'Base package to include')
      .option('--java-agent <path>', 'Path to OpenTelemetry Java agent')
      .option('--profile-dir <path>', 'Output directory')
      .option('--cwd <path>', 'Working directory')
  ).action(async (options) => {
    await runCommand('java-debug.run', options, 'java_launch_failed', async (runContext) => {
      const methods = await scanner.scan(path.resolve(options.classesDir), options.basePackage);
      const profileDir = options.profileDir
        ? path.resolve(options.profileDir)
        : path.join(runContext.artifactWriter.paths.javaDebugDir, options.module);
      const launch = await javaDebugRunner.run({
        config: runContext.config,
        outputDir: profileDir,
        methods,
        serviceName: options.serviceName,
        appJar: path.resolve(options.appJar),
        javaAgentPath: options.javaAgent ? path.resolve(options.javaAgent) : undefined,
        cwd: options.cwd ? path.resolve(options.cwd) : process.cwd()
      });
      return {
        text: [
          `[ok] java debug launched: ${launch.pid}`,
          `[ok] profile dir: ${launch.profileDir}`
        ],
        json: {
          ok: true,
          pid: launch.pid,
          command: launch.command,
          profile_dir: launch.profileDir,
          methods_count: methods.length,
          artifacts_dir: runContext.artifactRoot
        }
      };
    });
  });

  return javaDebug;
};
