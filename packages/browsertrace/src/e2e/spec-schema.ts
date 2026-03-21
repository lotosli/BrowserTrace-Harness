import { z } from 'zod';

const httpHealthcheckSchema = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  expectStatus: z.number().int().min(100).max(599).default(200),
  timeoutMs: z.number().int().positive().default(30_000),
  intervalMs: z.number().int().positive().default(500)
});

const noneHealthcheckSchema = z.object({
  type: z.literal('none')
});

export const serviceHealthcheckSchema = z.discriminatedUnion('type', [
  httpHealthcheckSchema,
  noneHealthcheckSchema
]).default({ type: 'none' });

export const serviceSpecSchema = z.object({
  id: z.string().min(1),
  run: z.string().min(1),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).default({}),
  healthcheck: serviceHealthcheckSchema
});

export const setupSpecSchema = z.object({
  services: z.array(serviceSpecSchema).default([])
}).default({
  services: []
});

const gotoStepSchema = z.object({
  id: z.string().optional(),
  action: z.literal('goto'),
  url: z.string().url()
});

const clickStepSchema = z.object({
  id: z.string().optional(),
  action: z.literal('click'),
  selector: z.string().min(1)
});

const fillStepSchema = z.object({
  id: z.string().optional(),
  action: z.literal('fill'),
  selector: z.string().min(1),
  value: z.string()
});

const selectStepSchema = z.object({
  id: z.string().optional(),
  action: z.literal('select'),
  selector: z.string().min(1),
  value: z.string()
});

const waitStepSchema = z.object({
  id: z.string().optional(),
  action: z.literal('wait'),
  ms: z.number().int().nonnegative().optional(),
  selector: z.string().optional(),
  state: z.enum(['visible', 'present']).default('visible')
});

const screenshotStepSchema = z.object({
  id: z.string().optional(),
  action: z.literal('screenshot'),
  path: z.string().optional()
});

const evalStepSchema = z.object({
  id: z.string().optional(),
  action: z.literal('eval'),
  script: z.string().min(1)
});

export const runStepSchema = z.discriminatedUnion('action', [
  gotoStepSchema,
  clickStepSchema,
  fillStepSchema,
  selectStepSchema,
  waitStepSchema,
  screenshotStepSchema,
  evalStepSchema
]);

export const engineSpecSchema = z.object({
  kind: z.enum(['browser_use_python']).default('browser_use_python'),
  pythonExecutable: z.string().optional(),
  cdpUrl: z.string().url().optional(),
  headless: z.boolean().optional(),
  executablePath: z.string().optional(),
  userDataDir: z.string().optional(),
  waitBetweenActionsMs: z.number().int().nonnegative().optional()
}).default({
  kind: 'browser_use_python'
});

export const uiOracleSchema = z.object({
  selector: z.string().min(1),
  visible: z.boolean().default(true),
  textIncludes: z.string().optional()
});

export const oraclesSchema = z.object({
  ui: z.array(uiOracleSchema).default([]),
  network: z.object({
    failOnHttpStatusGte: z.number().int().min(100).max(599).default(500)
  }).default({}),
  trace: z.object({
    failOnMissingTrace: z.boolean().default(false),
    requireLookup: z.boolean().default(false)
  }).default({}),
  logs: z.object({
    requireLookup: z.boolean().default(false)
  }).default({})
}).default({
  ui: [],
  network: {
    failOnHttpStatusGte: 500
  },
  trace: {
    failOnMissingTrace: false,
    requireLookup: false
  },
  logs: {
    requireLookup: false
  }
});

export const runSpecSchema = z.object({
  schemaVersion: z.string().default('1'),
  scenarioId: z.string().min(1),
  specId: z.string().optional(),
  appName: z.string().default('browsertrace'),
  envName: z.string().default('local'),
  startUrl: z.string().url().optional(),
  setup: setupSpecSchema,
  engine: engineSpecSchema,
  steps: z.array(runStepSchema).min(1),
  oracles: oraclesSchema
});

export type ServiceSpec = z.infer<typeof serviceSpecSchema>;
export type RunStep = z.infer<typeof runStepSchema>;
export type EngineSpec = z.infer<typeof engineSpecSchema>;
export type RunSpec = z.infer<typeof runSpecSchema>;
export type OraclesSpec = z.infer<typeof oraclesSchema>;
