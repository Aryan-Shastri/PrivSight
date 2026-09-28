export interface VisualTarget{id:string;source:string;role:string;bbox:readonly[number,number,number,number];visible:boolean;enabled:boolean}
export function visualClickPoint(target:VisualTarget,viewport:{width:number;height:number},actionType:string){
 if(!/^V\d{3,4}$/.test(target.id)||target.source!=="VISUAL"||!target.visible||!target.enabled)throw new Error("INVALID_VISUAL_TARGET");
 if(!["CLICK","CHECK","UNCHECK"].includes(actionType))throw new Error("UNSUPPORTED_VISUAL_ACTION");
 const[x,y,w,h]=target.bbox;if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)throw new Error("INVALID_VISUAL_BOUNDS");
 const point={x:x+w/2,y:y+h/2};if(point.x<0||point.y<0||point.x>=viewport.width||point.y>=viewport.height)throw new Error("VISUAL_TARGET_OUT_OF_BOUNDS");return point;
}
export interface VisualCaptureBinding{version:string;capturedAt:number;scrollX:number;scrollY:number;viewportWidthCss:number;viewportHeightCss:number;devicePixelRatio:number;target:VisualTarget&{observationVersion:string}}
export interface VisualHit{hit:boolean;tagName?:string;role?:string}
export function revalidateVisualClick(planned:VisualCaptureBinding,fresh:VisualCaptureBinding,hit:VisualHit,actionType:string){
 if(fresh.version===planned.version||fresh.capturedAt<=planned.capturedAt||planned.target.observationVersion!==planned.version||fresh.target.observationVersion!==fresh.version)throw new Error("STALE_VISUAL_COORDINATES");
 const geometry=["scrollX","scrollY","viewportWidthCss","viewportHeightCss","devicePixelRatio"] as const;
 if(geometry.some(key=>fresh[key]!==planned[key])||fresh.target.id!==planned.target.id||fresh.target.role!==planned.target.role||fresh.target.source!==planned.target.source||fresh.target.bbox.some((value,index)=>value!==planned.target.bbox[index]))throw new Error("STALE_VISUAL_COORDINATES");
 const point=visualClickPoint(fresh.target,{width:fresh.viewportWidthCss,height:fresh.viewportHeightCss},actionType);
 if(!hit.hit||!hit.tagName)throw new Error("VISUAL_TARGET_NOT_HIT");
 if(hit.role&&hit.role!==fresh.target.role)throw new Error("VISUAL_TARGET_HIT_MISMATCH");
 return point;
}
