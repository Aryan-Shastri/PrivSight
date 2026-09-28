import{describe,it,expect,vi}from"vitest";import{withDeadline,CaptureController}from"../src/protocol/reliability";
describe("bounded runtime operations",()=>{
 it("fails a stalled operation at its deadline",async()=>{vi.useFakeTimers();const result=withDeadline(new Promise(()=>{}),100,"RPC_TIMEOUT");const assertion=expect(result).rejects.toThrow("RPC_TIMEOUT");await vi.advanceTimersByTimeAsync(100);await assertion;vi.useRealTimers()});
 it("rate limits capture starts to at most two per second",async()=>{let now=1_000;const waits:number[]=[];const c=new CaptureController(()=>now,async ms=>{waits.push(ms);now+=ms});await c.run(async()=>1);await c.run(async()=>2);expect(waits).toEqual([500])});
});
