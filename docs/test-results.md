# Latest Local Test Results

Last updated: 2026-03-21

These results were validated locally against the demo apps plus the local Tempo/Loki/Collector stack, using the V2 `run` and `run-session` commands.

## One-shot scenario results

| Scenario | Status | AI outcome | Notes |
| --- | --- | --- | --- |
| `demo-profile-ok` | `passed` | `success` | Full `run` validated with trace and log correlation |
| `demo-server-error` | `failed` | `http_error` | Root request captured with `500` backend failure |

## Persistent session results

### Successful through-step session

- Session id: `sess_through_ok2`
- Midpoint command: `run-session resume --through-step select-scenario`
- Midpoint verdict: `incomplete`
- Final command: `run-session resume --through-step final-shot`
- Final session verdict: `passed`
- Final source run: `run_ecea1762e0`

### Failed through-step session

- Session id: `sess_through_fail2`
- Command: `run-session resume --through-step final-shot`
- Batch stopped at: `click-run`
- Final session verdict: `failed/historical_failure`
- Tainting run: `run_4a3dee9937`

## Example validated runs

### `demo-profile-ok`

- Run id: `run_0ca9a6e2c6`
- Trace id: `b4e4053d8438ef74430348e73c9aadf7`
- Root request: `POST http://127.0.0.1:8083/api/demo/run`
- Root status: `200`
- Correlation:
  - Tempo batches: `2`
  - Loki result groups: `1`

### `demo-server-error`

- Run id: `run_86d2a94b14`
- Trace id: `75596862a8074c1ccbca282d707d6427`
- Root request: `POST http://127.0.0.1:8083/api/demo/run`
- Root status: `500`
- Session judge category: `historical_failure`

## Java method span validation

Method-level spans were observed for the demo service, including:

- `DemoScenarioService.buildServiceGraphPayload`
- `ServiceGraphService.describe`
- `ServiceGraphService.normalizeServiceName`
- `ServiceGraphService.resolveDependencies`
- `ServiceGraphService.resolveHealth`
- `ServiceGraphService.composeGraph`

The agent-backed service was started with the OpenTelemetry Java agent and an explicit configuration file:

- Agent artifact: `~/.browsertrace/java-debug/agents/opentelemetry-javaagent.jar`
- Java config style: `-Dotel.exporter.otlp.endpoint=http://127.0.0.1:4318`

## Notes

- Tempo and Loki root paths (`/`) return `404` by design in this setup.
- Demo backend health checks in V2 specs use `GET /api/demo/page`.
- The useful endpoints are:
  - OTLP ingest: `http://127.0.0.1:4318`
  - Tempo trace query: `/api/traces/<trace-id>`
  - Loki log query: `/loki/api/v1/query`
