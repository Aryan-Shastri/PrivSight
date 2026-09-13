# Controlled registration demo

A zero-runtime-dependency, localhost-only fixture. Every identity and value is synthetic; `.test` is a reserved top-level domain. This site illustrates the expected browser-extension contract but does not claim that the extension, OCR, CV, egress firewall, or VLM is implemented here.

```bash
node --test test/*.test.mjs
node server.mjs
# open http://127.0.0.1:4173
```

Use **Run privacy walkthrough**, click the shield in the canvas checkpoint, then request and explicitly confirm submission. Toggle **Hostile page copy** to demonstrate untrusted prompt-injection text and a local policy block.
