# Architecture

## Defensible system claim

Raw browser context is local sensitive data. Browser semantics and on-device visual evidence are merged locally; sensitive text is tokenized, sensitive pixels are masked, and a fail-closed egress check constructs the only network-authorized observation. A planner may propose one constrained action, but the local extension retains execution authority.

## Trust zones

```text
CONTROLLED WEB PAGE (untrusted)
    │ DOM + event-driven capture
    ▼
LOCAL EXTENSION (trusted boundary)
    ├─ semantic scanner ─┐
    ├─ local vision ─────┼─> detection merge
    ├─ OCR candidates ───┤       │
    └─ face detector ────┘       ▼
                           token vault + pixel masker
                                   │
                            fail-closed egress firewall
                                   │ sanitized metadata/image only
                                   ▼
                         FASTAPI GATEWAY → VLM PLANNER
                                   │ one schema-bound action
                                   ▼
                         LOCAL VALIDATOR → confirmation policy
                                   │
                              LOCAL EXECUTOR
```

The token map, raw password, raw screenshot, and executable authority do not belong in the planner zone. The server must never return arbitrary JavaScript, CSS selectors, or XPath; it identifies locally indexed elements and token aliases only.

## Demo boundary

`demo-sites/registration` is a standalone controlled fixture, not the extension. It simulates sanitized metadata and policy decisions in-browser without making a network request. Its canvas provides genuinely non-DOM pixels for future local-vision integration. Its hostile copy is page data, never an instruction.

## Proposed action envelope

One action per planner response: `CLICK(elementId)`, `TYPE_TOKEN(elementId, token)`, `SCROLL(direction, amount)`, `WAIT(ms)`, `REQUEST_CONFIRMATION(reason)`, or `DONE(summary)`. The client validates schema, element-index version, task relevance, risk, and confirmation before execution, then verifies the observed result.
