import{describe,it,expect}from"vitest";import{revalidateVisualClick,visualClickPoint}from"../src/actions/visual-target";
describe("visual-only action targeting",()=>{
 const target={id:"V001",source:"VISUAL",role:"button",bbox:[10,20,40,20] as const,visible:true,enabled:true};
 it("derives bounded coordinates only from current local visual evidence",()=>expect(visualClickPoint(target,{width:100,height:100},"CLICK")).toEqual({x:30,y:30}));
 it("rejects planner coordinates, stale IDs and out-of-bounds targets",()=>{expect(()=>visualClickPoint({...target,id:"E001"},{width:100,height:100},"CLICK")).toThrow("INVALID_VISUAL_TARGET");expect(()=>visualClickPoint({...target,bbox:[200,20,40,20]},{width:100,height:100},"CLICK")).toThrow("VISUAL_TARGET_OUT_OF_BOUNDS");expect(()=>visualClickPoint(target,{width:100,height:100},"TYPE_TEXT")).toThrow("UNSUPPORTED_VISUAL_ACTION")});
 it("fails closed unless a fresh capture preserves viewport, scroll, DPR, target bounds, and the hit element",()=>{
  const planned={version:"v1",capturedAt:1,scrollX:0,scrollY:0,viewportWidthCss:100,viewportHeightCss:100,devicePixelRatio:2,target:{...target,observationVersion:"v1"}};
  const fresh={...planned,version:"v2",capturedAt:2,target:{...target,observationVersion:"v2"}};
  expect(revalidateVisualClick(planned,fresh,{hit:true,tagName:"BUTTON",role:"button"},"CLICK")).toEqual({x:30,y:30});
  for(const changed of [{...fresh,scrollY:1},{...fresh,devicePixelRatio:1},{...fresh,target:{...fresh.target,bbox:[11,20,40,20] as const}}])expect(()=>revalidateVisualClick(planned,changed,{hit:true,tagName:"BUTTON",role:"button"},"CLICK")).toThrow("STALE_VISUAL_COORDINATES");
  expect(()=>revalidateVisualClick(planned,fresh,{hit:false},"CLICK")).toThrow("VISUAL_TARGET_NOT_HIT");
 });
});
