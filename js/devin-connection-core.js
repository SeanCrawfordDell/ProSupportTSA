"use strict";
const DevinConnection = (() => {
  const endpoint='http://127.0.0.1:43127', key='dell-support.devin-session.v1';
  const messages={
    unpaired:'Connect Devin in AI Settings first. Copy to AI is available without setup.',
    unauthorized:'The pairing token has expired. Paste the current token from the helper and reconnect.',
    network:'Cannot reach the helper. Start it, check browser local-network permission, and retry. Copy to AI is available.',
    uncertain:'The request may have reached Devin, but its acknowledgment was lost. Check the helper before sending again. You can copy this prompt instead.',
    busy:'Devin is already working on a request. Wait or cancel that request, or copy this prompt.',
    cli_missing:'Devin CLI was not found. Install it, open a new terminal, and restart the helper.',
    cli_incompatible:'This Devin version does not support prompt files and print mode. Update Devin CLI.',
    cli_unavailable:'Devin could not start. Check the CLI in a terminal and restart the helper.',
    auth_required:'Sign in from a terminal with devin auth login, then retry.',
    workspace_trust:'Open Devin interactively in the helper workspace and approve workspace trust, then retry.',
    timeout:'Devin exceeded the ten-minute limit. Its process was stopped. You can copy the prompt.',
    output_limit:'Devin returned too much output. Try a narrower prompt or use Copy to AI.',
    cancelled:'Request cancelled.', not_found:'This response has expired or the helper restarted. Copy the prompt if needed.',
    cleanup_failed:'The helper could not remove its temporary prompt. Check its workspace and restart it.',
    clipboard:'Could not copy. Allow clipboard access or select the text and copy manually.',
    invalid_response:'The helper returned an unsupported response. Restart or update the helper.',
    invalid_job:'Invalid response identifier.', invalid_token:'Paste the 64-character pairing token shown by the helper.',
    invalid_prompt:'Add case details before sending. The prompt must fit within 256 KiB.',
    execution_failed:'Devin could not complete this request. Check its login and workspace setup, or copy the prompt.'
  };
  const error=code=>Object.assign(new Error(messages[code]||messages.execution_failed),{code});
  const validId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
  function createClient({fetchImpl=globalThis.fetch?.bind(globalThis),sessionStorage,clipboard=globalThis.navigator?.clipboard}={}) {
    let token='';
    try {const saved=sessionStorage?.getItem(key);if(/^[a-f0-9]{64}$/.test(saved||''))token=saved;}catch{}
    function disconnect(){token='';try{sessionStorage?.removeItem(key);}catch{}}
    async function request(route,method='GET',body) {
      if(!token)throw error('unpaired');
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
      try {
        let result;
        try{result=await fetchImpl(endpoint+route,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',signal:controller.signal});}
        catch{throw error(method==='POST'?'uncertain':'network');}
        if(result.status===401){disconnect();throw error('unauthorized');}
        // Bound the stream, not just its declared length.
        let raw='';
        if(result.body?.getReader){
          const reader=result.body.getReader(),decoder=new TextDecoder();let size=0;
          try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12*1024*1024){await reader.cancel();throw error('invalid_response');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
          catch(e){if(e.code)throw e;throw error(method==='POST'?'uncertain':'network');}
        }else{raw=await result.text();if(raw.length>12*1024*1024)throw error('invalid_response');}
        let data;try{data=JSON.parse(raw);}catch{throw error('invalid_response');}
        if(!result.ok)throw error(Object.hasOwn(messages,data?.code)?data.code:'execution_failed');
        return data;
      }finally{clearTimeout(timer);}
    }
    async function health(){
      const value=await request('/v1/health');
      if(!value||value.version!==1||typeof value.cliAvailable!=='boolean'||typeof value.compatible!=='boolean'||typeof value.code!=='string')throw error('invalid_response');
      if(!value.cliAvailable||!value.compatible)throw error(Object.hasOwn(messages,value.code)?value.code:'cli_incompatible');
      return value;
    }
    async function connect(value){
      value=String(value||'').trim();if(!/^[a-f0-9]{64}$/.test(value))throw error('invalid_token');
      token=value;
      try{const result=await health();try{sessionStorage?.setItem(key,token);}catch{}return result;}
      catch(e){disconnect();throw e;}
    }
    function job(value) {
      if(!value||!validId(value.id)||!['running','completed','failed','cancelled'].includes(value.state)||
        typeof value.response!=='string'||new TextEncoder().encode(value.response).length>2*1024*1024||typeof value.code!=='string')throw error('invalid_response');
      return value;
    }
    async function submit(prompt){
      if(typeof prompt!=='string'||!prompt.trim()||new TextEncoder().encode(JSON.stringify({prompt})).length>256*1024)throw error('invalid_prompt');
      const value=await request('/v1/jobs','POST',{prompt});if(!value||!validId(value.id)||value.state!=='running')throw error('invalid_response');return value;
    }
    async function getJob(id){if(!validId(id))throw error('invalid_job');const value=job(await request('/v1/jobs/'+id));if(value.id!==id)throw error('invalid_response');return value;}
    async function cancel(id){if(!validId(id))throw error('invalid_job');const value=job(await request('/v1/jobs/'+id,'DELETE'));if(value.id!==id)throw error('invalid_response');return value;}
    async function copyPrompt(prompt){try{await clipboard.writeText(prompt);}catch{throw error('clipboard');}}
    return {connect,disconnect,health,submit,getJob,cancel,copyPrompt,isPaired:()=>!!token};
  }
  return {createClient,message:code=>messages[code]||messages.execution_failed};
})();
if(typeof module!=="undefined")module.exports=DevinConnection;
else window.DevinConnection=DevinConnection;
