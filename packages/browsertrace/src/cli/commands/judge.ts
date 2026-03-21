import { Command } from 'commander';
import { addCommonOptions } from '../shared.js';
import { runCommand } from '../command-runner.js';
import { loadRunArtifacts } from '../../e2e/run-artifacts.js';
import { judgeRun } from '../../e2e/oracle-engine.js';
import { HarnessError } from '../../types/errors.js';

export const buildJudgeCommand = (): Command =>
  addCommonOptions(
    new Command('judge')
      .description('Recompute the verdict for an existing run from stored artifacts')
      .argument('<run>', 'Run id or artifacts directory')
  ).action(async (runRef: string, options) => {
    if (!runRef) {
      throw new HarnessError('run_failed', 'A run id or artifacts directory is required.');
    }

    await runCommand('judge', options, 'run_failed', async (runContext) => {
      const artifacts = await loadRunArtifacts(runContext, runRef);
      const verdict = judgeRun({
        engineResult: artifacts.engineResult,
        oracles: artifacts.spec.oracles,
        traceId: artifacts.report.traceId,
        traceLookupError: artifacts.lookupErrors?.tempo,
        logLookupError: artifacts.lookupErrors?.loki
      });
      const verdictPath = await runContext.artifactWriter.writeJson('runtime/judge-result.json', {
        sourceRunRoot: artifacts.runRoot,
        verdict
      });

      return {
        text: [
          `[ok] source run: ${artifacts.report.runId}`,
          `[ok] verdict: ${verdict.status} (${verdict.category})`,
          `[ok] judge result: ${verdictPath}`
        ],
        exitCode: verdict.status === 'passed' ? 0 : 1,
        json: {
          ok: verdict.status === 'passed',
          source_run_id: artifacts.report.runId,
          verdict,
          judge_result_path: verdictPath,
          source_run_root: artifacts.runRoot
        }
      };
    });
  });
