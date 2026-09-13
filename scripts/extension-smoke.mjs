import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const extensionPath = `${root}apps/extension/.output/chrome-mv3`;
const fixtureUrl = "http://127.0.0.1:8080/";
const evidence = { requests: [], consoleErrors: [] };
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: `${root}demo-sites/registration`, env: { ...process.env, PORT: "8080" }, stdio: ["ignore", "pipe", "pipe"],
});

async function waitForFixture() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(fixtureUrl)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("registration fixture did not start");
}

let context;
try {
  await waitForFixture();
  const manifest = JSON.parse(await readFile(`${extensionPath}/manifest.json`, "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.includes("offscreen"), true);
  assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'");

  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: process.env.PLAYWRIGHT_HEADLESS !== "0",
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--disable-features=WebGPU"],
  });
  context.on("request", request => evidence.requests.push({ url: request.url(), method: request.method(), postData: request.postData() }));
  context.on("page", page => page.on("console", message => { if (message.type() === "error") evidence.consoleErrors.push(message.text()); }));

  let worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  worker.on("console", message => { if (message.type() === "error") evidence.consoleErrors.push(message.text()); });
  const extensionId = new URL(worker.url()).host;
  assert.match(extensionId, /^[a-p]{32}$/);

  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await extensionPage.evaluate(() => chrome.runtime.getManifest().manifest_version);
  assert.equal((await worker.evaluate(() => chrome.runtime.getManifest())).manifest_version, 3);
  await new Promise(resolve => setTimeout(resolve, 500));

  const fixture = await context.newPage();
  await fixture.goto(fixtureUrl);
  await fixture.bringToFront();
  assert.equal(await fixture.title(), "PrivSight · Controlled registration lab");

  const messagePage = await context.newPage();
  await messagePage.goto(`chrome-extension://${extensionId}/manifest.json`);
  await fixture.bringToFront();
  const raw = await fixture.screenshot({ type: "png" });
  const viewport = fixture.viewportSize();
  assert.ok(viewport);
  const vision = await messagePage.evaluate(async ({ bytes, width, height }) => {
    await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["WORKERS"], justification: "Local OCR and face inference smoke" });
    const started = performance.now();
    const response = await chrome.runtime.sendMessage({ type: "PROCESS_LOCAL_PRIVACY", requestId: "browser-smoke", capture: { kind: "RAW_CAPTURE", bytes, trigger: "EXPLICIT_REFRESH", capturedAt: Date.now(), scrollX: 0, scrollY: 0, viewportWidthCss: width, viewportHeightCss: height, devicePixelRatio: 1, width, height } });
    return { response, localPrivacyMs: performance.now()-started, contexts: await chrome.runtime.getContexts({}) };
  }, { bytes: [...raw], width: viewport.width, height: viewport.height });
  assert.equal(vision.response.type, "LOCAL_PRIVACY_RESULT", `local vision failed: ${JSON.stringify({ vision, consoleErrors: evidence.consoleErrors })}`);
  assert.equal(vision.response.providers.ocr, "wasm");
  assert.equal(vision.response.providers.face, "wasm");
  assert.equal(vision.response.providers.ui, "wasm");
  assert.equal(vision.response.image.kind, "SANITIZED_CAPTURE");
  assert.match(vision.response.image.sha256, /^[0-9a-f]{64}$/);
  assert.ok(vision.response.vision.ocrRegions.length + vision.response.vision.faceRegions.length > 0);
  assert.notDeepEqual(vision.response.image.bytes, [...raw]);
  assert.ok(vision.contexts.some(item => item.contextType === "OFFSCREEN_DOCUMENT"));
  const failClosed = await messagePage.evaluate(() => chrome.runtime.sendMessage({ type: "PROCESS_LOCAL_PRIVACY", requestId: "invalid-smoke", capture: { kind: "RAW_CAPTURE", bytes: [], width: 0, height: 0 } }));
  assert.equal(failClosed.type, "LOCAL_PRIVACY_ERROR");
  assert.equal(evidence.requests.filter(item => item.url.includes("/api/v1/agent/step")).length, 0);

  console.log(JSON.stringify({
    status: "PASS", chromium: await context.browser()?.version(), extensionId,
    manifest: { version: manifest.manifest_version, csp: manifest.content_security_policy.extension_pages },
    serviceWorkerResponsive: true, offscreenCreated: true, captureTrigger: "EXPLICIT_REFRESH",
    providers: vision.response.providers, webgpuAvailable: false,
    modelDependentEvidence: { localPrivacyMs: vision.localPrivacyMs, uiDetections: vision.response.vision.detections.length, ocrRegions: vision.response.vision.ocrRegions.length, faceRegions: vision.response.vision.faceRegions.length },
    failClosed: { code: failClosed.code, plannerRequests: 0 }, fixture: fixtureUrl,
  }, null, 2));
} finally {
  await context?.close();
  server.kill("SIGTERM");
}