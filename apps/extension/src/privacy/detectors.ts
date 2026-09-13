import {isLuhnValid} from "./card-luhn"; import type {Detection} from "./types";
const patterns=[
 {kind:"EMAIL", sensitivity:"HIGH", re:/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi},
 {kind:"PHONE", sensitivity:"HIGH", re:/(?<!\d)(?:\+91[- ]?)?[6-9]\d{9}(?!\d)/g},
 {kind:"CARD", sensitivity:"HIGH", re:/(?<!\d)(?:(?:\d{4}[ -]){3}\d{4}|\d{13,19})(?!\d)/g},
 {kind:"PASSWORD", sensitivity:"CRITICAL", re:/\b(?:sk|pk|api|access|auth)[_-][A-Za-z0-9_-]{12,}\b/gi}
] as const;
export function detectStructuredPii(text:string):Detection[]{const out:Detection[]=[]; for(const p of patterns){p.re.lastIndex=0; let m; while((m=p.re.exec(text))){if(p.kind==="CARD"&&!isLuhnValid(m[0]))continue;out.push({kind:p.kind,sensitivity:p.sensitivity,value:m[0],start:m.index,end:m.index+m[0].length,source:"RULE"});}}return out;}
export function detectSensitiveField(input:{type?:string;autocomplete?:string;label?:string;value?:string}):Detection[]{const semantic=`${input.type} ${input.autocomplete} ${input.label}`.toLowerCase(); const value=input.value??""; let kind:Detection["kind"]|undefined;if(/password/.test(semantic))kind="PASSWORD";else if(/one-time-code|\botp\b/.test(semantic))kind="OTP";else if(/\bcvv|cvc/.test(semantic))kind="CVV";else if(/\bpin\b/.test(semantic))kind="PIN";else if(/email/.test(semantic))kind="EMAIL";else if(/tel|phone/.test(semantic))kind="PHONE";return kind?[{kind,sensitivity:["PASSWORD","OTP","CVV","PIN"].includes(kind)?"CRITICAL":"HIGH",value,source:"DOM"}]:detectStructuredPii(value)}