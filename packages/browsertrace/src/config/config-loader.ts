import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { configSchema, type BrowserTraceConfig } from './config-schema.js';
import { expandHome } from '../utils/fs.js';
import { HarnessError } from '../types/errors.js';

const defaultConfigPath = expandHome('~/.browsertrace/config.yaml');

export const getDefaultConfigPath = (): string => defaultConfigPath;

export const loadConfig = async (configPath?: string): Promise<{ config: BrowserTraceConfig; configPath: string }> => {
  const resolvedPath = configPath ? expandHome(configPath) : defaultConfigPath;

  try {
    const raw = await readFile(resolvedPath, 'utf8');
    const parsed = YAML.parse(raw);
    const config = configSchema.parse(parsed);
    config.artifacts.base_dir = expandHome(config.artifacts.base_dir);
    config.java_debug.default_profile_dir = expandHome(config.java_debug.default_profile_dir);
    config.trace.jsonl_default_path = config.trace.jsonl_default_path
      ? expandHome(config.trace.jsonl_default_path)
      : undefined;
    return {
      config,
      configPath: path.resolve(resolvedPath)
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new HarnessError('config_invalid', `Failed to load config from ${resolvedPath}: ${error.message}`);
    }

    throw error;
  }
};

