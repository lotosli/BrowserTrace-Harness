# AI Debug Run Samples

These folders contain real BrowserTrace runtime outputs copied from local demo runs.

## Included samples

- `http-400-bad-request`: backend returns `400`
- `http-500-server-error`: backend returns `500`
- `invalid-response-shape`: backend returns `200`, but the payload shape is wrong for the React page

Each sample keeps the AI-first runtime bundle:

- `runtime/ai-summary.json`
- `runtime/page-state.json`
- `runtime/action-network-detailed.json`
- `runtime/action-console-detailed.json`
- `runtime/page.html`
- `runtime/post-action.png`

## Recommended reading order

1. Open `runtime/ai-summary.json`
2. Check `runtime/page-state.json`
3. Inspect `runtime/action-network-detailed.json`
4. Inspect `runtime/action-console-detailed.json`
5. Use `runtime/page.html` and `runtime/post-action.png` for final UI verification

The `ai-summary.json` files were lightly repackaged so their artifact paths point to the sample bundle inside this repository instead of the original local machine path.
