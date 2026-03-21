# BrowserTrace Onboarding for a New Java Project

BrowserTrace works best as an agent-native E2E and observability tool for a Java application. The preferred V2 usage model is:

1. Define one or more scenario specs.
2. Launch the Java service with the OpenTelemetry Java agent.
3. Let `browsertrace run` or `run-session start` start the system and drive the browser.
4. Correlate the browser request with Java traces, logs, and runtime artifacts.

## Minimum Setup

For a new project, make sure you have:

- a frontend running in Chrome or Chromium
- a Java backend packaged as a JAR
- compiled classes available, such as `target/classes`
- an OTLP endpoint
- logs that include `trace_id` when possible

## Frontend Guidance

Stable `data-testid` values are recommended, but they are not mandatory.

BrowserTrace can also work with other stable anchors, such as:

- fixed `id`
- fixed `name`
- `aria-label`
- stable button text
- stable nearby labels or headings

Use `data-testid` only for controls and result surfaces that are hard to target reliably in other ways.

For example, an order search page may expose:

- a dropdown for order type
- an input for order ID
- a search button
- a result panel
- an error banner

If the page already has stable `id` or visible text, that is often enough.

## Config Example

Create a local config file such as `config.browsertrace.yaml`:

```yaml
chrome:
  cdp_url: http://127.0.0.1:9222

artifacts:
  base_dir: ~/.browsertrace/artifacts

otel:
  endpoint: http://127.0.0.1:4318/v1/traces
  service_name: browsertrace

trace:
  output_default: both

lookup:
  tempo:
    base_url: http://127.0.0.1:3200
  loki:
    base_url: http://127.0.0.1:3100
    query_labels:
      service_name: my-java-service

apps:
  orders-ui:
    allow_api_origins:
      - http://127.0.0.1:8080
    validation:
      page_selector: "#search-button"
      api_url: http://127.0.0.1:8080/api/orders/query
      critical_api_patterns:
        - /api/orders/query

java_debug:
  java_agent: ~/.browsertrace/java-debug/agents/opentelemetry-javaagent.jar
  default_profile_dir: ~/.browsertrace/java-debug/profiles
  log_format: json
```

## Recommended Flow

### 1. Build the Java project

```bash
mvn package
```

You should now have:

- a JAR such as `target/my-service.jar`
- compiled classes such as `target/classes`

### 2. Scan Java methods first

Use BrowserTrace's Java scanning before generating any profile:

```bash
browsertrace java-debug scan-methods \
  --config config.browsertrace.yaml \
  --classes-dir target/classes \
  --base-package com.example.orders \
  --json
```

This lets BrowserTrace discover application methods worth instrumenting, instead of forcing you to hand-maintain a method list.

### 3. Generate a Java debug profile

```bash
browsertrace java-debug gen-profile \
  --config config.browsertrace.yaml \
  --classes-dir target/classes \
  --service-name orders-service \
  --base-package com.example.orders \
  --profile-dir .browsertrace/java-profile \
  --json
```

### 4. Launch the Java service through BrowserTrace

```bash
browsertrace java-debug run \
  --config config.browsertrace.yaml \
  --classes-dir target/classes \
  --app-jar target/my-service.jar \
  --service-name orders-service \
  --module orders-service-debug \
  --base-package com.example.orders \
  --cwd . \
  --json
```

This is the recommended path for method-level spans because it combines:

- Java agent wiring
- generated profile files
- method include rules from `scan-methods`

### 5. Write a V2 scenario spec

Use a spec that declares:

- service startup commands
- browser steps
- UI or trace expectations

Examples are available under `docs/examples/v2/`.

### 6. Run the scenario

One-shot run:

```bash
browsertrace run docs/examples/v2/demo-profile-ok.yaml \
  --config config.browsertrace.yaml \
  --json
```

Persistent session:

```bash
browsertrace run-session start docs/examples/v2/demo-profile-ok.yaml \
  --config config.browsertrace.yaml \
  --json
```

```bash
browsertrace run-session resume <session-id> --through-step final-shot \
  --config config.browsertrace.yaml \
  --json
```

Start with one happy path and a few representative failures such as:

- `400`
- `404`
- `500`
- timeout

## What to Inspect

After each run, inspect artifacts in this order:

1. `runtime/ai-summary.json`
2. `runtime/page-state.json`
3. `runtime/action-network-detailed.json`
4. `runtime/action-console-detailed.json`
5. `runtime/page.html`
6. `runtime/post-action.png`

Then use:

- `browsertrace judge <run-id>`
- `browsertrace diagnose <run-id>`
- `browsertrace run-session judge <session-id>`

to correlate frontend activity with Java traces and logs.

## Best Practices

- Start with one page and one critical flow.
- Prefer stable selectors, but do not force `data-testid` everywhere.
- Always use `java-debug scan-methods` before `gen-profile` or `run`.
- Launch the Java app through `browsertrace java-debug run` if you want method-level spans.
- Prefer V2 specs and `run-session` over low-level `session/browser` commands for agent loops.
