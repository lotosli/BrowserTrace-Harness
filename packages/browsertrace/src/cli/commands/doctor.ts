import { Command } from 'commander';
import { addCommonOptions } from '../shared.js';
import { runCommand } from '../command-runner.js';
import { detectChromeExecutable } from '../../utils/os.js';
import { access } from 'node:fs/promises';

export const buildDoctorCommand = (): Command => {
  const doctor = new Command('doctor');
  addCommonOptions(doctor).action(async (options) => {
    await runCommand('doctor', options, 'doctor_failed', async (runContext) => {
      const chromeExecutable = await detectChromeExecutable(runContext.config.chrome.executable_path);
      const checks = {
        chromeExecutable,
        cdpUrl: runContext.config.chrome.cdp_url,
        otlpEndpoint: runContext.options.traceEndpoint ?? runContext.config.otel.endpoint,
        javaAgentConfigured: Boolean(runContext.config.java_debug.java_agent)
      };
      if (chromeExecutable) {
        await access(chromeExecutable);
      }
      return {
        text: [
          `[ok] chrome executable: ${chromeExecutable ?? 'not found'}`,
          `[ok] cdp url: ${checks.cdpUrl}`,
          `[ok] otlp endpoint: ${checks.otlpEndpoint ?? 'not configured'}`
        ],
        json: {
          ok: true,
          checks,
          artifacts_dir: runContext.artifactRoot
        }
      };
    });
  });
  return doctor;
};

