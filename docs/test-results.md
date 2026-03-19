# Latest Local Test Results

Last updated: 2026-03-20

These results were validated locally against the demo apps plus the local Tempo/Loki/Collector stack.

## Browser scenario results

| Scenario | Status | AI outcome | Notes |
| --- | --- | --- | --- |
| `bad_request` | `400` | `http_error` | Root request captured with response JSON |
| `not_found` | `404` | `http_error` | Root request captured with response JSON |
| `server_error` | `500` | `http_error` | Root request captured with backend error body |
| `bad_payload` | `200` | `invalid_response_shape` | UI and summary flag shape mismatch |
| `servicegraph_ok` | `200` | `success` | Java method spans confirmed in Tempo |

## Example validated runs

### `bad_request`

- Run id: `run_246b3b457d`
- Trace id: `36a241470d0dfb089602175b8425fc3e`
- Root request: `POST http://127.0.0.1:8084/api/demo/run`
- Root status: `400`
- Summary artifact:
  - `~/.browsertrace/artifacts/run_246b3b457d/runtime/ai-summary.json`

### `server_error`

- Run id: `run_58fd56e80b`
- Trace id: `6e832064628cde13e30c57def8cea4f2`
- Root request: `POST http://127.0.0.1:8084/api/demo/run`
- Root status: `500`
- Summary artifact:
  - `~/.browsertrace/artifacts/run_58fd56e80b/runtime/ai-summary.json`

### `bad_payload`

- Run id: `run_27d03706d9`
- Trace id: `7296440bdbed441ed2d168f782b8a917`
- Root request: `POST http://127.0.0.1:8084/api/demo/run`
- Root status: `200`
- Outcome: `invalid_response_shape`
- Summary artifact:
  - `~/.browsertrace/artifacts/run_27d03706d9/runtime/ai-summary.json`

## Java method span validation

Method-level spans were observed for the demo service, including:

- `DemoScenarioService.buildServiceGraphPayload`
- `ServiceGraphService.describe`
- `ServiceGraphService.normalizeServiceName`
- `ServiceGraphService.resolveDependencies`
- `ServiceGraphService.resolveHealth`
- `ServiceGraphService.composeGraph`

The agent-backed service was started with the OpenTelemetry Java agent and an explicit configuration file:

- Agent version: `v2.26.0`
- Java config style: `-Dotel.javaagent.configuration-file=...`

## Notes

- Tempo and Loki root paths (`/`) return `404` by design in this setup.
- Health checks are available under `/ready`.
- The useful endpoints are the APIs:
  - Tempo: `/api/traces/<trace-id>`
  - Loki: `/loki/api/v1/query`
