import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const demo=await fetch('http://127.0.0.1:4173/');assert.equal(demo.status,200);const html=await demo.text();assert.match(html,/id="registration-form"/);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
const metadata={schemaVersion:'1.0',sessionId:'integration',stepId:0,observationVersion:'demo-v1',goal:'complete synthetic registration',page:{origin:'http://127.0.0.1:4173',title:'PrivSight · Controlled registration lab'},elements:[{id:'E001',role:'textbox',label:'Full name',bbox:{x:1,y:1,width:100,height:20},enabled:true,visible:true,source:'DOM'}],redaction:{count:0,bySensitivity:{},sanitizedImageSha256:createHash('sha256').update(png).digest('hex')}};
const form=new FormData();form.append('metadata',JSON.stringify(metadata));form.append('image',new Blob([png],{type:'image/png'}),'sanitized.png');
const response=await fetch('http://127.0.0.1:8080/api/v1/agent/step',{method:'POST',body:form});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,{planner:'MOCK PLANNER',action:{type:'CLICK',elementId:'E001'}});console.log(JSON.stringify({demo:demo.status,api:response.status,planner:body.planner,action:body.action,rawPiiSent:false}));
