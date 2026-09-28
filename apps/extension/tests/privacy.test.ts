import{describe,it,expect}from"vitest";import{detectStructuredPii,detectSensitiveField}from"../src/privacy/detectors";
describe("privacy detectors",()=>{
 it("finds email, Indian phone and Luhn-valid card",()=>{const d=detectStructuredPii("a@b.co +919876543210 4111 1111 1111 1111");expect(d.map(x=>x.kind)).toEqual(["EMAIL","PHONE","CARD"])});
 it("rejects invalid card candidates",()=>expect(detectStructuredPii("4111 1111 1111 1112")).toEqual([]));
 it("uses field semantics for critical data",()=>expect(detectSensitiveField({autocomplete:"one-time-code",value:"123456"})[0]?.kind).toBe("OTP"));
 it("detects PAN only with PAN/tax context",()=>{expect(detectSensitiveField({label:"PAN number",value:"ABCDE1234F"})[0]?.kind).toBe("GOV_ID");expect(detectSensitiveField({label:"Reference",value:"ABCDE1234F"})).toEqual([])});
 it("detects checksum-valid Aadhaar only with Aadhaar context",()=>{expect(detectSensitiveField({label:"Aadhaar number",value:"1234 5678 9010"})[0]?.kind).toBe("GOV_ID");expect(detectSensitiveField({label:"Aadhaar number",value:"1234 5678 9011"})).toEqual([])});
 it("detects high-entropy values only in secret-labelled fields",()=>{const value="q7Zp4Kx9Vm2Nc8Rt5Wy3";expect(detectSensitiveField({label:"API key",value})[0]?.kind).toBe("PASSWORD");expect(detectSensitiveField({label:"Notes",value})).toEqual([])});
});