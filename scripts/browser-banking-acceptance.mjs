import assert from "node:assert/strict";

import {cpSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {spawn} from "node:child_process";
import {resolve} from "node:path";
import {chromium} from "playwright";

const root=resolve(import.meta.dirname,"..");
const builtExtensionPath=resolve(root,"apps/extension/.output/chrome-mv3");
const temporaryExtensionRoot=mkdtempSync(resolve(tmpdir(),"privsight-acceptance-"));
const extensionPath=resolve(temporaryExtensionRoot,"chrome-mv3");cpSync(builtExtensionPath,extensionPath,{recursive:true});
const controlledManifest=JSON.parse(readFileSync(resolve(extensionPath,"manifest.json"),"utf8"));controlledManifest.host_permissions=["<all_urls>"];writeFileSync(resolve(extensionPath,"manifest.json"),JSON.stringify(controlledManifest));
const backgroundPath=resolve(extensionPath,"background.js");writeFileSync(backgroundPath,readFileSync(backgroundPath,"utf8").replaceAll("http://127.0.0.1:8080/api/v1/agent/step","http://127.0.0.1:8081/api/v1/agent/step"));
const fixtureUrl="http://127.0.0.1:4174/";
const foreignUrl="http://127.0.0.1:4175/";

const servers=[4174,4175].map(port=>spawn("node",["server.mjs"],{cwd:resolve(root,"demo-sites/banking"),env:{...process.env,PORT:String(port)},stdio:"ignore"}));servers.push(spawn("node",["scripts/banking-acceptance-planner.mjs"],{cwd:root,stdio:"ignore"}));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(url){for(let i=0;i<50;i++){try{if((await fetch(url)).ok)return}catch{}await wait(100)}throw Error(`fixture unavailable: ${url}`)}
async function plannerEvidence(){return(await fetch("http://127.0.0.1:8081/__control")).json()}
async function waitStatus(page,state){try{await page.waitForFunction(s=>globalThis.__statuses?.some(x=>x.state===s),state,{timeout:60000})}catch(error){throw Error(`${error.message}; statuses=${JSON.stringify(await page.evaluate(()=>globalThis.__statuses))}`)}return page.evaluate(s=>globalThis.__statuses.findLast(x=>x.state===s),state)}
async function installHarness(page){await page.evaluate(()=>{globalThis.__statuses=[];chrome.runtime.onMessage.addListener(m=>{if(m?.type==="AGENT_STATUS")globalThis.__statuses.push(m.payload)});globalThis.__start=goal=>chrome.runtime.sendMessage({type:"START_AGENT",goal})})}

let context;const network=[];const tasks=[];
try{
 await Promise.all([ready(fixtureUrl),ready(foreignUrl),ready("http://127.0.0.1:8081/__control")]);
 const manifest=JSON.parse(readFileSync(resolve(extensionPath,"manifest.json"),"utf8"));assert.equal(manifest.manifest_version,3);
 context=await chromium.launchPersistentContext("",{channel:"chromium",headless:true,args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`,"--disable-features=WebGPU"]});
 const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker");const extensionId=new URL(worker.url()).host;
 await fetch("http://127.0.0.1:8081/__control/reset?mode=success");
 const control=await context.newPage();await control.goto(`chrome-extension://${extensionId}/manifest.json`);await installHarness(control);
 const fixture=await context.newPage();await fixture.goto(fixtureUrl);await fixture.bringToFront();
 await control.evaluate(()=>{void globalThis.__start("Transfer 25 synthetic dollars from checking and stop after confirmation")});
 await waitStatus(control,"AWAITING_APPROVAL");assert.equal(await fixture.locator("#result").textContent(),"");
 await control.evaluate(()=>chrome.runtime.sendMessage({type:"APPROVE_ACTION"}));await waitStatus(control,"COMPLETE");
 assert.equal(await fixture.locator("#result").textContent(),"Transfer complete");
 network.push(...(await plannerEvidence()).network);tasks.push({id:"banking-multistep-confirmation",status:"PASS",planner:"DETERMINISTIC SYNTHETIC ACCEPTANCE PLANNER",confirmed:true,steps:network.filter(x=>x.task==="success").length});

 await fetch("http://127.0.0.1:8081/__control/reset?mode=cross-origin");await fixture.goto(`${fixtureUrl}?review=1`);await fixture.bringToFront();await control.evaluate(()=>{globalThis.__statuses=[];void globalThis.__start("Confirm synthetic transfer")});await waitStatus(control,"AWAITING_APPROVAL");const before=(await plannerEvidence()).network.length;
 await fixture.goto(foreignUrl);await control.evaluate(()=>chrome.runtime.sendMessage({type:"APPROVE_ACTION"}));const error=await waitStatus(control,"ERROR");assert.match(error.message,/ORIGIN_MISMATCH|Cannot access contents|Receiving end does not exist/);await wait(300);const crossNetwork=(await plannerEvidence()).network;assert.equal(crossNetwork.length,before);network.push(...crossNetwork);assert.equal(await fixture.locator("#result").textContent(),"");
 tasks.push({id:"cross-origin-fail-closed",status:"PASS",planner:"DETERMINISTIC SYNTHETIC ACCEPTANCE PLANNER",error:error.message,plannerRequestsAfterOriginChange:0});
 const report={schemaVersion:"1.0",scope:"CONTROLLED_REAL_CHROMIUM_MV3_BANKING_ACCEPTANCE",generatedAt:new Date().toISOString(),chromium:context.browser()?.version(),extensionId,controlledOverrides:{hostPermissions:["<all_urls>"],plannerEndpoint:"http://127.0.0.1:8081/api/v1/agent/step",reason:"Headless Chromium cannot grant activeTab through a browser-toolbar gesture; isolated port avoids any developer server on the production port",productionBuildSourcesUnchanged:true},summary:{passed:tasks.filter(x=>x.status==="PASS").length,total:tasks.length,status:tasks.every(x=>x.status==="PASS")?"PASS":"FAIL",successRate:tasks.filter(x=>x.status==="PASS").length/tasks.length},tasks,network};
 mkdirSync(resolve(root,"artifacts"),{recursive:true});writeFileSync(resolve(root,"artifacts/browser-banking-acceptance.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({report:"artifacts/browser-banking-acceptance.json",summary:report.summary,networkRequests:network.length}));
}finally{await context?.close();for(const server of servers)server.kill("SIGTERM");rmSync(temporaryExtensionRoot,{recursive:true,force:true})}
