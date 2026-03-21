import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { ZodError } from 'zod';
import { runSpecSchema, type RunSpec, type RunStep, type ServiceSpec } from './spec-schema.js';
import { HarnessError } from '../types/errors.js';

export type LoadedRunStep = RunStep & { id: string };
export type LoadedServiceSpec = ServiceSpec & { cwd: string };

export type LoadedRunSpec = Omit<RunSpec, 'steps' | 'setup'> & {
  specPath: string;
  specDir: string;
  steps: LoadedRunStep[];
  setup: {
    services: LoadedServiceSpec[];
  };
};

const parseSpecSource = (raw: string, specPath: string): unknown => {
  const extension = path.extname(specPath).toLowerCase();
  if (extension === '.json') {
    return JSON.parse(raw);
  }

  return YAML.parse(raw);
};

const defaultStepId = (step: RunStep, index: number): string => {
  const prefix = step.action.replace(/[^a-z0-9]+/gi, '_');
  return `${String(index + 1).padStart(2, '0')}_${prefix}`;
};

export const loadRunSpec = async (specPath: string): Promise<LoadedRunSpec> => {
  const resolvedSpecPath = path.resolve(specPath);
  const specDir = path.dirname(resolvedSpecPath);

  try {
    const raw = await readFile(resolvedSpecPath, 'utf8');
    const parsed = parseSpecSource(raw, resolvedSpecPath);
    const validated = runSpecSchema.parse(parsed);

    const steps: LoadedRunStep[] = [
      ...(validated.startUrl && validated.steps[0]?.action !== 'goto'
        ? [{ id: '00_open_start_url', action: 'goto', url: validated.startUrl } satisfies LoadedRunStep]
        : []),
      ...validated.steps.map((step, index) => ({
        ...step,
        id: step.id ?? defaultStepId(step, index + (validated.startUrl && validated.steps[0]?.action !== 'goto' ? 1 : 0))
      }))
    ];

    const services: LoadedServiceSpec[] = validated.setup.services.map((service) => ({
      ...service,
      cwd: service.cwd ? path.resolve(specDir, service.cwd) : specDir
    }));

    return {
      ...validated,
      specPath: resolvedSpecPath,
      specDir,
      specId: validated.specId ?? validated.scenarioId,
      steps,
      setup: {
        services
      }
    };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HarnessError('spec_invalid', `Invalid run spec at ${resolvedSpecPath}: ${error.issues.map((issue) => issue.message).join('; ')}`);
    }
    if (error instanceof Error) {
      throw new HarnessError('spec_invalid', `Failed to load run spec at ${resolvedSpecPath}: ${error.message}`);
    }
    throw error;
  }
};
