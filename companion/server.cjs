'use strict';
const http=require('node:http');
const crypto=require('node:crypto');
const path=require('node:path');
const os=require('node:os');
const {createRunner}=require('./devin-runner.cjs');
function createCompanion({runner,token,allowedOrigins,port=43127}) {
  let boundPort=port,closing;
  const origins=new Set(allowedOrigins);
  const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(value===undefined?'':JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    if(req.headers.host!==`127.0.0.1:${boundPort}` || !origins.has(origin))return send(res,403,{code:'forbidden',message:'Origin or host rejected.'});
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
    if(req.method==='OPTIONS') {
      const requested=(req.headers['access-control-request-headers']||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
      if(requested.some(h=>!['authorization','content-type'].includes(h)) ||
        (req.headers['access-control-request-method'] && !['GET','POST','DELETE'].includes(req.headers['access-control-request-method'])))
        return send(res,403,{code:'forbidden'});
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE');
      if(req.headers['access-control-request-private-network']==='true')res.setHeader('Access-Control-Allow-Private-Network','true');
      return send(res,204);
    }
    const actual=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
    if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return send(res,401,{code:'unauthorized',message:'Reconnect using the current pairing token.'});
    try {
      if(req.url==='/v1/health'&&req.method==='GET')return send(res,200,await runner.health());
      if(req.url==='/v1/jobs'&&req.method==='POST') {
        if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))return send(res,415,{code:'content_type'});
        let bytes=0,parts=[];
        for await(const chunk of req) {bytes+=chunk.length;if(bytes>256*1024){send(res,413,{code:'body_limit'});req.resume();return;}parts.push(chunk);}
        let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{return send(res,400,{code:'invalid_prompt'});}
        if(!body||Array.isArray(body)||Object.keys(body).length!==1||typeof body.prompt!=='string'||!body.prompt.trim())return send(res,400,{code:'invalid_prompt'});
        const job=await runner.submit(body.prompt);return send(res,202,{id:job.id,state:job.state});
      }
      const match=/^\/v1\/jobs\/([a-f0-9-]{36})$/.exec(req.url);
      if(match&&req.method==='GET')return send(res,200,runner.get(match[1]));
      if(match&&req.method==='DELETE')return send(res,200,await runner.cancel(match[1]));
      return send(res,404,{code:'not_found'});
    }catch(error){const code=['busy','not_found','cli_missing','cli_incompatible','cli_unavailable','unavailable','invalid_prompt'].includes(error.code)?error.code:'execution_failed';
      send(res,code==='busy'?409:code==='not_found'?404:code==='invalid_prompt'?400:503,{code,message:'Request could not be completed. Copy to AI remains available.'});}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  const api={
    get url(){return `http://127.0.0.1:${boundPort}`;},
    listen(){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{boundPort=server.address().port;resolve();});});},
    close(){return closing ||= (async()=>{await runner.close();if(server.listening)await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();});})();}
  };return api;
}
if(require.main===module) {
  if(Number(process.versions.node.split('.')[0])<22){console.error('Node.js 22 or newer is required.');process.exit(1);}
  const args=process.argv.slice(2),origins=['https://seancrawforddell.github.io'];
  for(let i=0;i<args.length;i++) {
    if(args[i]!=='--allow-origin'){console.error('Unknown startup option.');process.exit(1);}
    const value=args[++i];let url;try{url=new URL(value);}catch{console.error('Invalid development origin.');process.exit(1);}
    if(!['127.0.0.1','localhost'].includes(url.hostname)||url.protocol!=='http:'||url.origin!==value){console.error('Development origin must be an explicit localhost HTTP origin.');process.exit(1);}origins.push(value);
  }
  const workspace=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'EscalationQuality','DevinCompanion');
  const token=crypto.randomBytes(32).toString('hex');
  const app=createCompanion({runner:createRunner({workspace}),token,allowedOrigins:origins});
  app.listen().then(()=>{console.log('Devin companion ready at '+app.url+'\nWorkspace: '+workspace+'\nPairing token (keep private): '+token+'\nClose this window or press Ctrl+C to stop.');}).catch(error=>{console.error(error.code==='EADDRINUSE'?'Port 43127 is occupied. Close the other companion and retry.':'Could not start the companion.');process.exitCode=1;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void app.close().then(()=>process.exit()));
}
module.exports={createCompanion};
