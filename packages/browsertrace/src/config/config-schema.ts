import { z } from 'zod';

export const appValidationSchema = z.object({
  page_selector: z.string().optional(),
  api_url: z.string().url().optional(),
  login_url_contains: z.string().optional(),
  critical_api_patterns: z.array(z.string()).default([])
});

export const appConfigSchema = z.object({
  allow_api_origins: z.array(z.string().url()).default([]),
  validation: appValidationSchema.default({})
});

export const configSchema = z.object({
  chrome: z.object({
    cdp_url: z.string().url(),
    executable_path: z.string().optional()
  }),
  artifacts: z.object({
    base_dir: z.string()
  }),
  otel: z.object({
    endpoint: z.string().url().optional(),
    service_name: z.string().default('browsertrace'),
    propagators: z.array(z.string()).default(['tracecontext', 'baggage'])
  }),
  trace: z.object({
    output_default: z.enum(['otlp', 'jsonl', 'both']).default('otlp'),
    jsonl_default_path: z.string().optional()
  }).default({}),
  lookup: z.object({
    tempo: z.object({
      base_url: z.string().url()
    }),
    loki: z.object({
      base_url: z.string().url(),
      query_labels: z.record(z.string(), z.string()).default({})
    })
  }),
  apps: z.record(z.string(), appConfigSchema).default({}),
  java_debug: z.object({
    java_agent: z.string().optional(),
    default_profile_dir: z.string(),
    default_service_name_suffix: z.string().default('-debug'),
    log_format: z.enum(['json']).default('json')
  })
});

export type BrowserTraceConfig = z.infer<typeof configSchema>;
export type AppRuntimeConfig = z.infer<typeof appConfigSchema>;

