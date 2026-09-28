import {createReadStream,statSync} from "node:fs";
import {createServer} from "node:http";
import {extname,join,normalize} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL(".",import.meta.url));const port=Number(process.env.PORT||4174);const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8"};
createServer((req,res)=>{const pathname=req.url?.split("?",1)[0]==="/"?"/index.html":decodeURIComponent(req.url?.split("?",1)[0]||"");const file=normalize(join(root,pathname));if(!file.startsWith(root)){res.writeHead(403).end("Forbidden");return}try{if(!statSync(file).isFile())throw Error();res.writeHead(200,{"content-type":types[extname(file)]||"application/octet-stream","cache-control":"no-store"});createReadStream(file).pipe(res)}catch{res.writeHead(404).end("Not found")}}).listen(port,"127.0.0.1");
