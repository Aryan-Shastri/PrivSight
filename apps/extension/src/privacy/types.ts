export type Sensitivity="CRITICAL"|"HIGH"|"MEDIUM"|"LOW";
export type TokenKind="PASSWORD"|"OTP"|"PIN"|"CVV"|"EMAIL"|"PHONE"|"PERSON"|"ADDRESS"|"CARD"|"ACCOUNT"|"GOV_ID"|"TEXT";
export interface Detection {kind:TokenKind|"FACE";sensitivity:Sensitivity;value?:string;start?:number;end?:number;source:"DOM"|"RULE"|"OCR"|"FACE"}
export interface RedactionRegion{x:number;y:number;width:number;height:number;reason:TokenKind|"FACE";sensitivity:Sensitivity;confidence:number;source:"DOM"|"OCR"|"FACE"|"RULE"}