# Agent Full-Stack Workflow

This document describes the typical development and testing workflow when BrowserTrace is used by an agent such as Codex or Claude Code during full-stack development.

The key idea is:

- the coding agent reads and edits code
- BrowserTrace executes real browser scenarios
- BrowserTrace returns `verdict`, `diagnosis`, and `artifacts`
- the agent uses those outputs to decide what to fix next

## Roles

### Coding agent

The coding agent is responsible for:

- reading frontend and backend code
- making code changes
- creating or updating scenario specs
- deciding whether to rerun, diagnose, or continue implementation

### BrowserTrace

BrowserTrace is responsible for:

- starting the required services
- driving the browser through the internal `browser-use` backend
- injecting `traceparent` and `baggage`
- collecting browser-side evidence
- querying Tempo and Loki
- returning machine-readable outputs

### Observability backend

The observability backend is responsible for:

- accepting OTLP trace data
- exposing trace query APIs
- exposing log query APIs

In the demo setup this is:

- OTLP Collector
- Tempo
- Loki

## Typical development loop

### 1. Agent receives a feature or bug task

Example:

- implement a new order creation flow
- fix a frontend timeout
- investigate why the browser shows success but the backend fails

### 2. Agent reads the codebase

The agent should inspect:

- frontend routes and controls
- backend endpoints
- Java service methods
- stable selectors such as `data-testid`
- the expected success and failure states

### 3. Agent creates or updates a scenario spec

A spec should define:

- service startup commands
- the browser step list
- the target success or failure signal
- the trace and log expectations

Examples:

- `docs/examples/v2/demo-profile-ok.yaml`
- `docs/examples/v2/demo-server-error.yaml`

### 4. Agent runs the scenario

For a full end-to-end verification:

```bash
browsertrace run docs/examples/v2/demo-profile-ok.yaml --config config.example.yaml --json
```

For iterative stepwise debugging:

```bash
browsertrace run-session start docs/examples/v2/demo-profile-ok.yaml --config config.example.yaml --json
```

Then:

```bash
browsertrace run-session resume <session-id> --through-step select-scenario --config config.example.yaml --json
```

or:

```bash
browsertrace run-session resume <session-id> --through-step final-shot --config config.example.yaml --json
```

## How the agent should use outputs

### `verdict`

This is the control signal.

Use it to decide:

- stop and continue coding
- rerun another step
- escalate to diagnosis

### `diagnosis`

This is the repair hint.

Use it to decide whether the likely problem is:

- frontend behavior
- backend response
- trace lookup or logging infrastructure
- a previously failed step that tainted the session

### `artifacts`

These are the raw materials for deeper debugging.

Use them when the diagnosis is not enough:

- screenshots
- DOM snapshots
- page state
- action-scoped network data
- Tempo traces
- Loki logs

## Recommended command patterns

### One-shot validation

Use when the agent wants a final answer:

```bash
browsertrace run <spec> --json
```

This is best for:

- feature completion checks
- final bug-fix validation
- CI-style acceptance checks

### Persistent step-by-step validation

Use when the agent wants to move incrementally:

```bash
browsertrace run-session start <spec> --json
browsertrace run-session resume <session-id> --through-step <step-id> --json
browsertrace run-session judge <session-id> --json
browsertrace run-session stop <session-id> --json
```

This is best for:

- debugging multi-step flows
- isolating whether a failure happens before submit or after submit
- preserving browser and service state between commands

### Single-step recovery

Use when the agent wants one step only:

```bash
browsertrace step execute <spec> --step-id <id> --mode prefix --json
```

This is useful when:

- no persistent session exists
- the agent wants a clean replay for one target step

## Example workflow: successful full-stack feature

1. Agent updates frontend and backend code.
2. Agent updates the scenario spec.
3. Agent runs:

```bash
browsertrace run-session start docs/examples/v2/demo-profile-ok.yaml --json
```

4. Agent advances to a midpoint:

```bash
browsertrace run-session resume <session-id> --through-step select-scenario --json
```

5. Agent checks the session:

```bash
browsertrace run-session judge <session-id> --json
```

At this point the expected result is usually `incomplete`.

6. Agent advances to the final step:

```bash
browsertrace run-session resume <session-id> --through-step final-shot --json
```

7. Agent checks the session again:

```bash
browsertrace run-session judge <session-id> --json
```

Expected result:

- session verdict `passed`

8. Agent stops the session:

```bash
browsertrace run-session stop <session-id> --json
```

## Example workflow: backend failure

1. Agent starts a persistent session:

```bash
browsertrace run-session start docs/examples/v2/demo-server-error.yaml --json
```

2. Agent runs through the failure point:

```bash
browsertrace run-session resume <session-id> --through-step final-shot --json
```

Expected result:

- batch stops at `click-run`
- session judge shows `historical_failure`

3. Agent recomputes the session-level scenario result:

```bash
browsertrace run-session judge <session-id> --json
```

4. Agent diagnoses the exact failing run from the history:

```bash
browsertrace diagnose <run-id> --json
```

5. Agent uses the trace and log evidence to modify backend code.

6. Agent starts a fresh session and reruns the flow.

## Practical guidance for agents

- Prefer `run-session` during active development.
- Prefer `run` for final acceptance checks.
- Use `run-session judge` for session-level scenario truth.
- Use `diagnose` for run-level failure explanation.
- Start a fresh session after a tainting failure if you want a clean success history.
- Treat `historical_failure` as a signal that a retry may have succeeded locally but the accumulated session should still be considered failed.
