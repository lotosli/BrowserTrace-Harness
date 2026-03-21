---
name: browsertrace-v2-fullstack
description: Use when working in this BrowserTrace Harness repo, or a repo embedding BrowserTrace V2, to run full-stack browser scenarios, persistent run-session flows, and trace-linked diagnosis during agent-driven development. Covers `browsertrace run`, `run-session start/resume --through-step/judge/stop`, required Python `browser-use` sidecar setup, and how to use `verdict`, `diagnosis`, and `artifacts` to drive frontend/backend fixes.
---

# BrowserTrace V2 Full-Stack Workflow

Use this skill when the task is not just "click the page", but "make a full-stack change and validate it with BrowserTrace".

## Preconditions

Before using BrowserTrace V2 commands, ensure:

- the repo has `browsertrace` built
- the Python sidecar can import `browser_use`
- the backend is instrumented with OpenTelemetry
- the observability backend can ingest OTLP and answer trace/log queries

In this repo, the simplest setup is:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install browser-use
pnpm install
pnpm --filter @browsertrace/browsertrace build
mvn -f apps/demo-service/pom.xml package
docker compose -f ops/docker-compose.yaml up -d
```

## Choose the right command surface

### One-shot validation

Use when you want one end-to-end answer:

```bash
browsertrace run <spec> --config config.example.yaml --json
```

Use this for:

- final acceptance of a feature
- confirming a bug fix
- CI-like validation

### Persistent iterative validation

Use when you want to keep browser and services alive across multiple commands:

```bash
browsertrace run-session start <spec> --config config.example.yaml --json
browsertrace run-session resume <session-id> --through-step <step-id> --config config.example.yaml --json
browsertrace run-session judge <session-id> --config config.example.yaml --json
browsertrace run-session stop <session-id> --config config.example.yaml --json
```

Use this for:

- stepwise debugging
- narrowing whether the failure happens before or after submit
- preserving full-stack state while editing code

## Recommended agent loop

1. Read frontend and backend code.
2. Update or create a scenario spec.
3. Start a persistent session.
4. Advance through one step range with `--through-step`.
5. Read `verdict` first.
6. If failed, read `diagnosis`.
7. If still ambiguous, inspect `artifacts`.
8. Edit frontend or backend code.
9. Start a fresh session after a tainting failure.
10. Use `browsertrace run` for the final end-to-end confirmation.

## How to interpret outputs

### `verdict`

Use as the control signal.

- `passed`: continue or finish
- `failed`: inspect `diagnosis`
- `incomplete`: continue with more steps or use `run-session judge`

### `diagnosis`

Use as the repair hint.

Typical categories:

- `backend_error`
- `http_error`
- `browser_action_failed`
- `historical_failure`

### `artifacts`

Use for deeper debugging only when `diagnosis` is not enough.

Prioritize:

1. `runtime/page-state.json`
2. `runtime/action-network-detailed.json`
3. `correlation/tempo-trace.json`
4. `correlation/loki-trace-logs.json`
5. screenshot / HTML

## Session judgment rule

Persistent sessions are stricter than one-shot runs.

- any failed attempt in session history taints the session
- later successful retries do not erase that taint
- use `run-session judge` for scenario truth
- after a tainting failure, prefer starting a fresh session before claiming final success

## Repo-specific examples

In this repo, use:

- `docs/examples/v2/demo-profile-ok.yaml`
- `docs/examples/v2/demo-server-error.yaml`

Typical flow:

```bash
node packages/browsertrace/dist/cli/main.js run-session start docs/examples/v2/demo-profile-ok.yaml --config config.example.yaml --json
node packages/browsertrace/dist/cli/main.js run-session resume <session-id> --through-step select-scenario --config config.example.yaml --json
node packages/browsertrace/dist/cli/main.js run-session resume <session-id> --through-step final-shot --config config.example.yaml --json
node packages/browsertrace/dist/cli/main.js run-session judge <session-id> --config config.example.yaml --json
node packages/browsertrace/dist/cli/main.js run-session stop <session-id> --config config.example.yaml --json
```

## Use this skill instead of

Do not default to:

- `session ensure`
- `browser click`
- hand-written curl + grep loops

Prefer V2 commands unless the task is explicitly about legacy compatibility.
