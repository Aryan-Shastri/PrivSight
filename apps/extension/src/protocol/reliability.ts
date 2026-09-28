export async function withDeadline<T>(operation:Promise<T>,milliseconds:number,code="OPERATION_TIMEOUT"):Promise<T>{
 if(!Number.isFinite(milliseconds)||milliseconds<=0)throw new Error("INVALID_TIMEOUT");
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([operation,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error(code)),milliseconds)})])}finally{if(timer)clearTimeout(timer)}
}

export class CaptureController{
 private lastStarted=0;
 constructor(private now=()=>Date.now(),private wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)),private minIntervalMs=500){}
 async run<T>(capture:()=>Promise<T>):Promise<T>{
  const delay=Math.max(0,this.minIntervalMs-(this.now()-this.lastStarted));if(delay)await this.wait(delay);
  this.lastStarted=this.now();
  return withDeadline(capture(),2_000,"CAPTURE_TIMEOUT");
 }
}
