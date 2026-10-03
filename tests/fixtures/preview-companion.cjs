// Synthetic local QA only. Never included in the companion download.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createRunner}=require('../../companion/devin-runner.cjs');
const {createCompanion}=require('../../companion/server.cjs');
const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'devin-preview-'));
const runner=createRunner({workspace,executable:process.execPath,prefixArgs:[path.join(__dirname,'fake-devin.cjs')]});
const server=createCompanion({runner,token:'c'.repeat(64),allowedOrigins:['http://127.0.0.1:4187']});
server.listen().then(()=>console.log('Synthetic QA companion ready. No real AI requests are made.'));
async function stop(){await server.close();fs.rmSync(workspace,{recursive:true,force:true});process.exit();}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
