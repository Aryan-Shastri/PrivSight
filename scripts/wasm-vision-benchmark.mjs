import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import process from "node:process";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const extensionPath = `${root}apps/extension/.output/chrome-mv3`;
const fixturePort = "4174", fixtureUrl = `http://127.0.0.1:${fixturePort}/`;
const repeats = Number(process.env.WASM_BENCH_REPEATS ?? 8);
const threadCounts = (process.env.WASM_BENCH_THREADS ?? "1,2,4").split(",").map(Number);
const outputPath = process.env.WASM_BENCH_OUTPUT ?? `${root}artifacts/wasm-vision-benchmark.json`;
assert.ok(Number.isInteger(repeats) && repeats >= 3);
assert.ok(threadCounts.every(value => [1, 2, 4].includes(value)));
const server = spawn(process.execPath, ["server.mjs"], { cwd: `${root}demo-sites/registration`, env: { ...process.env, PORT: fixturePort }, stdio: "ignore" });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForFixture() { for (let i=0;i<50;i++) { try { if ((await fetch(fixtureUrl)).ok) return; } catch {} await wait(100); } throw Error("fixture failed"); }
const percentile = (values, p) => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
function stats(values) { return { samples: values.length, p50Ms: percentile(values,.5), p95Ms: percentile(values,.95), minMs: Math.min(...values), maxMs: Math.max(...values) }; }
function summarize(runs) {
  const fields = ["totalMs","decodeMs","workerRoundTripMs","maskingMs","sessionLoadMs"];
  const summary = Object.fromEntries(fields.map(field => [field, stats(runs.map(run => run[field]))]));
  summary.models = Object.fromEntries(["ui","ocr","face"].map(model => [model,Object.fromEntries(["preprocessMs","inferenceMs","postprocessMs"].map(field => [field,stats(runs.map(run=>run.models[model][field]))]))]));
  return summary;
}
let context;
try {
  await waitForFixture();
  context = await chromium.launchPersistentContext("", { channel:"chromium", headless:process.env.PLAYWRIGHT_HEADLESS!=="0", args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`,"--disable-features=WebGPU"] });
  const consoleErrors=[]; context.on("page",page=>page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text())})); context.on("response",response=>{if(response.status()>=400)consoleErrors.push(`${response.status()} ${response.url()}`)});
  const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const extensionId = new URL(serviceWorker.url()).host;
  const fixture = await context.newPage(); await fixture.setViewportSize({width:1280,height:720}); await fixture.goto(fixtureUrl);
  const png = await fixture.screenshot({type:"png"}); const bytes=[...png];
  const messagePage=await context.newPage(); await messagePage.goto(`chrome-extension://${extensionId}/manifest.json`);
  const configurations=[];
  for (const numThreads of threadCounts) {
    await messagePage.evaluate(async()=>{ try { await chrome.offscreen.closeDocument(); } catch {} });
    await messagePage.evaluate(async threads=>chrome.offscreen.createDocument({url:`offscreen.html?wasmThreads=${threads}`,reasons:["WORKERS"],justification:"Repeatable local WASM vision benchmark"}),numThreads);
    const runs=[];
    let unsupported;
    for(let index=0;index<repeats;index++) {
      const result=await messagePage.evaluate(async ({bytes,index,width,height})=>{const started=performance.now();const response=await chrome.runtime.sendMessage({type:"PROCESS_LOCAL_PRIVACY",requestId:`wasm-bench-${index}`,capture:{kind:"RAW_CAPTURE",bytes,width,height,trigger:"EXPLICIT_REFRESH",capturedAt:Date.now(),scrollX:0,scrollY:0,viewportWidthCss:width,viewportHeightCss:height,devicePixelRatio:1}});return {response,totalMs:performance.now()-started}}, {bytes,index,width:1280,height:720});
      if(result.response.type!=="LOCAL_PRIVACY_RESULT"){unsupported={code:result.response.code,detail:"ORT WASM threaded runtime unavailable in this extension context"};break}
      assert.deepEqual(result.response.providers,{ui:"wasm",ocr:"wasm",face:"wasm"});
      const t=result.response.timings; runs.push({totalMs:result.totalMs,...t});
    }
    if(unsupported){configurations.push({numThreads,status:"unsupported",unsupported});continue}
    assert.equal(runs[0].sessionReused,false); assert.equal(runs[0].workerRun,1);
    assert.ok(runs.slice(1).every((run,index)=>run.sessionReused&&run.workerRun===index+2),"session/worker was not reused");
    configurations.push({numThreads,status:"supported",simd:"enabled-by-ort-artifact",sourceInput:{width:1280,height:720},modelInputs:{ui:[1,3,416,416],ocr:[1,3,736,736],face:[1,3,240,320]},cold:runs[0],warmRuns:runs.slice(1),warmSummary:summarize(runs.slice(1)),sessionReuseConfirmed:true,workerReuseConfirmed:true});
  }
  const supported=configurations.filter(item=>item.status==="supported"); assert.ok(supported.length,"no supported WASM configuration");
  const best=supported.reduce((a,b)=>a.warmSummary.totalMs.p95Ms<=b.warmSummary.totalMs.p95Ms?a:b);
  const report={schemaVersion:1,createdAt:new Date().toISOString(),environment:{platform:process.platform,release:os.release(),arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem(),chromium:await context.browser()?.version(),playwright:(JSON.parse(await readFile(`${root}package.json`,"utf8"))).devDependencies.playwright,onnxRuntimeWeb:(JSON.parse(await readFile(`${root}apps/extension/package.json`,"utf8"))).dependencies["onnxruntime-web"],webgpu:false,wasmArtifact:"ort-wasm-simd-threaded.wasm"},methodology:{repeats,coldRunsPerConfiguration:1,warmRunsPerConfiguration:repeats-1,percentile:"nearest-rank",variables:"numThreads only; fixed source and model inputs",fixture:fixtureUrl},configurations,best:{numThreads:best.numThreads,warmTotalP95Ms:best.warmSummary.totalMs.p95Ms,targetP95Ms:500,targetMet:best.warmSummary.totalMs.p95Ms<=500}};
  await mkdir(new URL("../artifacts/",import.meta.url),{recursive:true}); await writeFile(outputPath,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({outputPath,best:report.best,configurations:configurations.map(c=>c.status==="supported"?{numThreads:c.numThreads,status:c.status,p50Ms:c.warmSummary.totalMs.p50Ms,p95Ms:c.warmSummary.totalMs.p95Ms}:{numThreads:c.numThreads,status:c.status})},null,2));
} finally { await context?.close(); server.kill("SIGTERM"); }
