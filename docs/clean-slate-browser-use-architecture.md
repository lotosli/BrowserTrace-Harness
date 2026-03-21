# Clean-Slate Browser-Use Architecture

## Positioning

This project should be rebuilt as an agent-native full-stack E2E diagnosis CLI, not as a
human-first browser action CLI.

Primary job:

- run real user flows end to end
- propagate trace context from browser actions into backend services
- collect frontend and backend evidence for every step
- decide whether the run passed or failed
- explain why it failed

The browser executor is an implementation detail.
The primary consumer is an LLM agent, coding agent, or automation runtime.

## Core Thesis

Use `browser-use` as the execution engine.
Build the product around:

- trace propagation
- evidence collection
- oracle evaluation
- regression comparison
- diagnosis reports

This means the system should not be modeled around legacy commands like:

- `session ensure`
- `browser click`
- `trace lookup`

Those are implementation details, not the main product surface.

The main product surface should become:

- `run spec.yaml`
- `run spec.ts`
- `step execute ...`
- `observe step ...`
- `correlate run ...`
- `judge run ...`
- `diagnose run ...`

## Recommended Top-Level Shape

### 1. Spec Compiler

Input forms:

- YAML or JSON scenario specs
- programmatic specs
- optional natural-language scenario input

All inputs compile into one internal `RunSpec`.

`RunSpec` should contain:

- app metadata
- environment metadata
- browser mode
- authentication mode
- setup steps
- test steps
- cleanup steps
- assertions
- trace expectations
- log expectations
- baseline comparison settings

### 2. Browser Engine

Treat browser execution as a pluggable subsystem.

Preferred design:

- a thin `browser-use` sidecar with a structured RPC contract
- optionally backed by `browser-use` CLI or Python SDK internally

Important design point:

Do not let the rest of the system depend on shelling human-readable CLI output.
If the internal implementation uses the CLI, wrap it behind a typed local interface first.

Suggested responsibilities:

- connect to existing Chrome
- create ephemeral browser sessions
- execute steps
- expose current URL, DOM snapshot hooks, screenshots, and JS evaluation

### 3. Trace Bridge

This is the real product core.

Responsibilities:

- create a root run span
- create per-step spans
- inject `traceparent` and `baggage` into browser-originated requests
- stamp `run_id`, `step_id`, `scenario_id`, and `app_name`
- preserve correlation metadata for backend lookup

This bridge should work no matter whether execution comes from:

- `browser-use`
- Playwright
- raw CDP
- cloud browser providers

### 4. Step Observer

For every executed step, capture:

- DOM snapshot
- page state summary
- screenshot
- console output
- page exceptions
- action-scoped network activity
- root request candidate
- resulting trace identifiers

The observer should be action-scoped and not only run-scoped.

### 5. Correlator

After each step or after the whole run:

- query Tempo for spans
- query Loki or log storage for related logs
- reconstruct service hop chain
- identify failed or suspicious backend spans

The correlator should produce a normalized `TraceBundle`, not raw vendor-shaped JSON only.

### 6. Oracle Engine

A run should be judged by multiple oracle families:

- UI oracle
- API oracle
- trace oracle
- log oracle
- contract oracle
- regression oracle

This is where recent research matters most.
The system should infer or accept explicit postconditions instead of using only brittle selectors.

### 7. Diagnosis Reporter

Output should not be a pile of artifacts.
It should be a structured report with:

- pass/fail status
- failed step
- failing request
- likely failing backend span
- frontend evidence summary
- backend evidence summary
- probable root cause
- regression delta from baseline

The default output mode should be machine-readable JSON.
Human-readable summaries are secondary.

## Agent-Friendly CLI Contract

The CLI should be designed for tool use by agents.

### Principles

- every command supports `--json`
- stable schemas with versioning
- deterministic exit codes
- structured error objects
- resumable `run_id`
- artifact paths returned explicitly
- no scraping terminal text
- low-level commands stay available for agent recovery and replanning

### Command Layers

#### High-Level Commands

These are for an agent that wants one-shot orchestration.

- `browsertrace run <spec>`
- `browsertrace diagnose --run-id <id>`
- `browsertrace judge --run-id <id>`
- `browsertrace correlate --run-id <id>`

#### Mid-Level Commands

These are for an agent that wants to control the loop itself.

- `browsertrace step execute --run-id <id> --step-id <id>`
- `browsertrace observe step --run-id <id> --step-id <id>`
- `browsertrace trace fetch --run-id <id> --step-id <id>`
- `browsertrace logs fetch --run-id <id> --step-id <id>`

#### Debug Commands

These are for recovery when the agent needs more control.

- `browsertrace browser snapshot --run-id <id>`
- `browsertrace browser eval --run-id <id> --js <code>`
- `browsertrace browser screenshot --run-id <id>`
- `browsertrace engine health`

### Example Agent Usage

An agent loop should be able to do:

1. compile a spec
2. execute a step
3. inspect machine-readable evidence
4. decide whether to continue, retry, or branch
5. fetch trace and log correlation
6. emit or consume a verdict

This requires the CLI to be not only high-level, but also interruptible and inspectable.

### Example JSON Response

```json
{
  "schema_version": "1",
  "ok": true,
  "run_id": "run_20260321_001",
  "step_id": "submit_order",
  "status": "failed",
  "current_url": "http://localhost:5173/orders",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "artifacts": {
    "page_state": "/abs/path/page-state.json",
    "screenshot": "/abs/path/post-action.png",
    "network": "/abs/path/action-network-detailed.json",
    "trace": "/abs/path/tempo-trace.json",
    "logs": "/abs/path/loki-trace-logs.json"
  },
  "verdict": {
    "status": "failed",
    "category": "backend_error",
    "reason": "inventory-service span returned ERROR"
  }
}
```

## Where Browser Use Fits

`browser-use` should be embedded as an internal execution backend.

For the agent using `browsertrace`:

- `browser-use` is not the primary tool surface
- `browsertrace` owns the stable JSON contract
- `browsertrace` owns trace correlation and diagnosis

This means `browser-use` is wrapped, not exposed as the main interface.
It may still be exposed through internal debug commands for development, but not as the core API.

## Recommended Runtime Modes

### Live Profile Mode

For local exploratory testing and debugging:

- connect `browser-use` to a real logged-in Chrome profile
- keep session continuity
- use CDP observation and trace injection

This is the fastest way to get value.

### Ephemeral Seeded Mode

For repeatable CI-like runs:

- start a disposable browser
- seed auth or storage state
- run spec deterministically

This should be the long-term CI mode.

### Remote Browser Mode

For cloud or isolated environments:

- use `browser-use` cloud or remote browser infrastructure
- keep the trace bridge and artifact pipeline unchanged

## Data Model

The clean-slate design should define stable domain objects.

### RunSpec

- scenario id
- app name
- environment name
- browser mode
- auth mode
- steps
- assertions
- trace expectations

### StepExecution

- step id
- step kind
- input payload
- start time
- end time
- current URL
- browser-side evidence references

### TraceBundle

- trace id
- root request
- related spans
- related logs
- service graph summary
- detected backend failures

### EvidenceBundle

- screenshot path
- DOM path
- page-state path
- console path
- network path
- action-network path
- diagnosis summary path

### TestVerdict

- overall status
- failed step id
- failure class
- confidence
- human-readable summary
- linked artifacts

## What Should Be Deleted From the Old Mental Model

### Session-First Design

The old idea of extracting a shadow session first and then executing actions on top of it
should not be the default product model.

Session handling becomes one implementation choice of the browser engine.

### Browser Command as the Main API

Agents should not have to orchestrate from unrelated low-level tools:

- `session ensure`
- `browser goto`
- `browser click`
- `trace lookup`

The system should either do that internally from one run command, or expose them through one
consistent machine-readable CLI surface.

### Trace Lookup as a Separate User Activity

Trace correlation should be automatic and embedded in the run lifecycle.

## Suggested Package Layout

If the repository is fully restructured, a cleaner layout would be:

- `packages/spec-core`
- `packages/run-orchestrator`
- `packages/browser-engine`
- `packages/trace-bridge`
- `packages/step-observer`
- `packages/oracle-engine`
- `packages/reporting`
- `packages/connectors-tempo-loki`
- `apps/demo-service`
- `apps/demo-frontend`

If a polyglot layout is acceptable, a strong option is:

- TypeScript for orchestrator, correlation, artifacts, and reporting
- Python sidecar for native `browser-use` integration

That avoids binding the main system to raw CLI parsing while still preserving a local CLI UX.

## Suggested First Command Surface

Instead of several unrelated low-level commands, define one coherent agent-facing surface:

```bash
browsertrace run specs/demo-login.yaml
browsertrace diagnose runs/<run-id>
browsertrace step execute --run-id <run-id> --step-id submit-order
browsertrace baseline update specs/demo-login.yaml
```

Human-entered natural-language scenarios can still exist, but they are secondary.
Low-level debug commands can still exist as engineering utilities and agent recovery tools.

## First Milestone for a Rewrite

The first useful rewrite milestone should be:

1. define `RunSpec`, `StepExecution`, `TraceBundle`, `TestVerdict`
2. add a single `browsertrace run` entrypoint
3. use `browser-use` as the executor
4. keep trace injection and backend correlation automatic
5. emit one run report with linked artifacts

That is enough to prove the product shape without rebuilding everything at once.

## Research Alignment

This architecture matches the strongest signals from recent work:

- `WebTestPilot`: condition-aware browser testing
- `SpecOps`: split planning, setup, execution, validation
- `Automated structural testing of LLM-based agents`: trace-native testing
- `AgentAssay`: trace-first regression testing
- `AgentTrace` and `TraceSIR`: structured diagnosis over execution traces

## Recommendation

If a full rewrite is acceptable, prefer a clean-slate architecture over migration.

Reuse concepts and utilities from the current codebase, but do not preserve the current command
structure as the governing design.

The correct center of gravity is:

- scenario run
- trace-linked evidence
- multi-oracle verdict
- diagnosis report

not browser command execution by itself.

## References

- WebTestPilot: https://arxiv.org/abs/2602.11724
- SpecOps: https://arxiv.org/abs/2603.10268
- Automated structural testing of LLM-based agents: https://arxiv.org/abs/2601.18827
- AgentAssay: https://arxiv.org/abs/2603.02601
- AgentTrace: https://arxiv.org/abs/2602.10133
- TraceSIR: https://arxiv.org/abs/2603.00623
- Browser Use real browser: https://docs.browser-use.com/open-source/customize/browser/real-browser
- Browser Use authentication: https://docs.browser-use.com/open-source/customize/browser/authentication
- Browser Use browser infrastructure: https://docs.browser-use.com/cloud/guides/browser-api
- Browser Use OpenLIT: https://docs.browser-use.com/open-source/development/monitoring/openlit
- Browser Use observability: https://docs.browser-use.com/open-source/development/monitoring/observability
