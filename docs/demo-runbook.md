# Four-minute demo runbook

## Preparation

```bash
pnpm exec playwright install chromium
pnpm build
pnpm smoke:extension
cd demo-sites/registration
node --test test/*.test.mjs
node server.mjs
```

The extension smoke launches a persistent Chromium profile with the production
`apps/extension/.output/chrome-mv3` sideloaded. It serves the controlled fixture
on localhost, checks the MV3 service worker and offscreen document, runs both
packaged OCR and face models through ORT-Web WASM, confirms a newly encoded
sanitized PNG, and proves an invalid capture fails closed without a planner
request. Set `PLAYWRIGHT_HEADLESS=0` and run under `xvfb-run -a` to exercise the
headed fallback.

Open `http://127.0.0.1:4173` in a clean browser window. Keep DevTools Network open with recording enabled. Do not substitute real personal data. Rehearse five consecutive clean runs before freeze.

## Script

| Time | Operator action | Point to narrate |
|---|---|---|
| 00:00–00:30 | Show empty registration, synthetic labels, password, canvas, hostile section. | A controlled corpus avoids risky real sites. |
| 00:30–01:10 | Click **Run privacy walkthrough**. | Detection and tokenization occur locally; this fixture simulates the contract. |
| 01:10–01:50 | Read the debug timeline and outbound object. | Aliases appear; actual strings do not; password has `send: false`. Network remains empty. |
| 01:50–02:20 | Click the center shield in canvas. | Canvas has no child DOM semantics; this is the integration fixture for real local visual perception, not proof a detector exists. |
| 02:20–03:00 | Reveal hostile text, simulate Delete Account. | Page text is untrusted; the local bounded policy blocks destructive action. |
| 03:00–03:40 | Click review, then approve native confirmation. | Consequential action is not silently executed. This is a mock local submission. |
| 03:40–04:00 | Show implementation status / measured dashboard if available. | Never present targets as measured results; label mock and real planner modes. |

## Expected checkpoints

- Form populates with `Asha Demo`, `asha.demo@example.test`, synthetic phone/password.
- Payload contains `[PERSON_1]`, `[EMAIL_1]`, `[PHONE_1]`, and `[SECRET_REDACTED]`, not raw values.
- Canvas reports `Visual target verified locally` only for the shield region.
- Hostile action reports `BLOCK` and no action occurs.
- Review cannot complete without explicit confirmation.

## Recovery

Refresh to reset all local state. If a future extension/backend is unavailable, present this fixture as the **CONTROLLED MOCK** and state that limitation; do not imply real Qwen, CV, OCR, masking, or network enforcement ran. Keep a recorded fallback captured from the same build hash.
