import { Command } from 'commander';
import { addCommonOptions } from '../shared.js';
import { runCommand } from '../command-runner.js';
import { buildRunDiagnosis } from '../../e2e/diagnostics.js';
import { loadRunArtifacts } from '../../e2e/run-artifacts.js';
import { HarnessError } from '../../types/errors.js';

export const buildDiagnoseCommand = (): Command =>
  addCommonOptions(
    new Command('diagnose')
      .description('Summarize the likely failure cause for an existing run')
      .argument('<run>', 'Run id or artifacts directory')
  ).action(async (runRef: string, options) => {
    if (!runRef) {
      throw new HarnessError('run_failed', 'A run id or artifacts directory is required.');
    }

    await runCommand('diagnose', options, 'run_failed', async (runContext) => {
      const artifacts = await loadRunArtifacts(runContext, runRef);
      const diagnosis = buildRunDiagnosis(artifacts);
      const diagnosisPath = await runContext.artifactWriter.writeJson('runtime/diagnosis.json', {
        sourceRunRoot: artifacts.runRoot,
        diagnosis
      });

      return {
        text: [
          `[ok] source run: ${artifacts.report.runId}`,
          `[ok] diagnosis: ${diagnosis.probableCause.category}`,
          `[ok] reason: ${diagnosis.probableCause.reason}`,
          `[ok] diagnosis path: ${diagnosisPath}`
        ],
        exitCode: diagnosis.status === 'passed' ? 0 : 1,
        json: {
          ok: diagnosis.status === 'passed',
          source_run_id: artifacts.report.runId,
          diagnosis,
          diagnosis_path: diagnosisPath,
          source_run_root: artifacts.runRoot
        }
      };
    });
  });
