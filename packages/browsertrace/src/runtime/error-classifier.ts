import { HarnessError } from '../types/errors.js';

export const classifyError = (error: unknown, fallbackCode: HarnessError['code']): HarnessError => {
  if (error instanceof HarnessError) {
    return error;
  }

  if (error instanceof Error) {
    return new HarnessError(fallbackCode, error.message);
  }

  return new HarnessError(fallbackCode, 'Unknown error');
};

