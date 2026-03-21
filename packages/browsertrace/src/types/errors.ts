export type HarnessErrorCode =
  | 'attach_failed'
  | 'no_page_matched'
  | 'auth_extract_failed'
  | 'shadow_launch_failed'
  | 'propagation_install_failed'
  | 'shadow_validation_failed'
  | 'real_url_open_failed'
  | 'local_api_call_failed'
  | 'java_methods_scan_failed'
  | 'java_profile_generate_failed'
  | 'java_launch_failed'
  | 'log_correlation_not_ready'
  | 'runtime_step_failed'
  | 'config_invalid'
  | 'session_not_found'
  | 'trace_lookup_failed'
  | 'log_lookup_failed'
  | 'spec_invalid'
  | 'service_launch_failed'
  | 'engine_not_available'
  | 'engine_execution_failed'
  | 'run_session_not_found'
  | 'run_failed'
  | 'doctor_failed';

export class HarnessError extends Error {
  public readonly code: HarnessErrorCode;
  public readonly details?: Record<string, unknown>;

  public constructor(code: HarnessErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'HarnessError';
    this.code = code;
    this.details = details;
  }
}
