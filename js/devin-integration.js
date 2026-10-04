"use strict";
const DevinIntegration = (() => {
  const connection=typeof module!=="undefined"?require('./devin-connection-core.js'):DevinConnection;
  function init(api, env=window) {
    const doc=env.document, $=id=>doc.getElementById(id);
    const client=api.client;
    let connected=false,request=null,pollTimer=null,pairing=false,introSeen=false;
    function el(tag,text,id){const node=doc.createElement(tag);if(text)node.textContent=text;if(id)node.id=id;return node;}
    function button(text,id,handler){const node=el('button',text,id);node.type='button';node.className='button secondary';node.addEventListener('click',handler);return node;}
    function dialog(title,id){const node=el('dialog',null,id);node.className='devin-dialog';const heading=el('h2',title,id+'Title');node.setAttribute('aria-labelledby',heading.id);node.append(heading);doc.body.append(node);return node;}
    function textArea(title,id){const label=el('label',title),node=el('textarea',null,id);label.className='field';node.readOnly=true;node.rows=12;label.append(node);return {label,node};}
    const intro=dialog('Optional: connect Devin CLI','devinIntro');
    intro.append(el('p','You can connect Case Notes to Devin CLI on your Windows PC to send AI prompts and review responses here. Setup is optional. Copy to AI works without it.'));
    function acknowledge(){introSeen=true;try{env.localStorage.setItem('dell-support.devin-onboarding.v1','1');}catch{}intro.close();}
    intro.append(button('Set up Devin','devinIntroSetup',()=>{acknowledge();openSettings();}),button('Continue with Copy to AI','devinIntroSkip',acknowledge));
    intro.addEventListener('cancel',event=>{event.preventDefault();acknowledge();});
    intro.addEventListener('close',()=>{if(!introSeen)acknowledge();});

    const setup=dialog('Connect Devin on this Windows PC','devinSetup');
    setup.append(el('p','Optional setup. Your helper stays on this PC; Devin uses the account you sign in with. Copy to AI is always available.'));
    const steps=el('ol');
    for(const line of [
      'Install Devin CLI for Windows using the official instructions below. Open a new terminal afterward.',
      'Sign in with devin auth login and check devin auth status.',
      'Install Node.js 22 or newer if needed.',
      'Copy the connection command below and paste it into PowerShell. It fetches and runs the connection automatically; no ZIP or manual script download is needed. Keep that window open. Follow your organization’s policy for running downloaded code.',
      'If Devin requires workspace trust, follow the companion guide to open Devin interactively in its workspace first.',
      'Paste the helper’s pairing token here and select Connect Devin. Allow this site’s local-network access request if your browser asks.'
    ])steps.append(el('li',line));
    setup.append(steps);
    let sourceBase='https://raw.githubusercontent.com/SeanCrawfordDell/EscalationQuality/main/companion',previewOrigin='';
    try{const url=new URL(env.location?.href);if(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)){previewOrigin=url.origin;sourceBase=previewOrigin+'/companion';}}catch{}
    const command="[Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; $devinLoader=New-Object Net.WebClient; $devinLoader.Encoding=[Text.Encoding]::UTF8; & ([scriptblock]::Create($devinLoader.DownloadString('"+sourceBase+"/Connect-Devin.ps1')))"+(previewOrigin?" -SourceBase '"+sourceBase+"' -AllowOrigin '"+previewOrigin+"'":'');
    const commandField=textArea('PowerShell connection command','devinConnectionCommand');commandField.node.rows=4;commandField.node.value=command;
    const commandStatus=el('p','', 'devinConnectionCommandStatus');commandStatus.setAttribute('role','status');
    setup.append(commandField.label,button('Copy connection command','devinCopyConnectionCommand',async()=>{
      try{await client.copyPrompt(command);commandStatus.textContent='Copied. Paste into PowerShell on this PC, then pair using the token it displays.';}
      catch(e){commandStatus.textContent=e.message;commandField.node.focus();commandField.node.select();}
    }),commandStatus,el('p',previewOrigin?'Local preview command: fetches from this development server. Keep the preview server running.':'This command runs code from the EscalationQuality GitHub repository. Review the source or obtain IT approval before running it.'));
    const links=el('p');
    for(const [label,url] of [['Devin Windows setup','https://docs.devin.ai/cli'],['Devin sign-in help','https://docs.devin.ai/cli/enterprise/devin-auth'],['Node.js downloads','https://nodejs.org/en/download'],['Review connection source',sourceBase+'/Connect-Devin.ps1'],['Connection setup guide','companion/README.md']]){
      const a=el('a',label);a.href=url;if(url.startsWith('https:')){a.target='_blank';a.rel='noopener noreferrer';}links.append(a,el('span',' · '));
    }setup.append(links);
    const tokenLabel=el('label','Pairing token'),token=el('input',null,'devinPairingToken');tokenLabel.className='field';token.type='password';token.autocomplete='off';token.maxLength=64;token.spellcheck=false;tokenLabel.append(token);setup.append(tokenLabel);
    const connectionStatus=el('p','Not connected. Copy to AI needs no setup.','devinConnectionStatus');connectionStatus.setAttribute('role','status');setup.append(connectionStatus);
    const connect=button('Connect Devin','devinConnect',()=>check(true));
    const test=button('Test connection','devinTest',()=>check(false));
    const disconnect=button('Disconnect','devinDisconnect',()=>{client.disconnect();connected=false;token.value='';connectionStatus.textContent='Disconnected. Copy to AI is available.';refresh();});
    setup.append(connect,test,disconnect,button('Done','devinSetupDone',()=>setup.close()));
    setup.append(el('p','Pairing lasts for this tab session. Restarting the helper changes its token. Tokens are excluded from case and settings backups. Devin may retain session history according to its own settings.'));

    const review=dialog('Review prompt before sending','devinRequest');
    const disclosure=el('p','Review the included case data. Send submits this text to Devin CLI using your configured account.');
    const prompt=textArea('Prompt to send','devinPromptText'),response=textArea('Devin response — review before using','devinResponseText');response.label.hidden=true;
    const requestStatus=el('p','', 'devinRequestStatus');requestStatus.setAttribute('role','status');
    const submit=button('Send','devinSubmit',send);
    const copyPrompt=button('Copy prompt','devinCopyPrompt',async()=>{try{await client.copyPrompt(prompt.node.value);requestStatus.textContent='Prompt copied. Paste it into your AI tool.';}catch(e){requestStatus.textContent=e.message;prompt.node.focus();prompt.node.select();}});
    const cancel=button('Cancel running request','devinCancelJob',async()=>{
      if(!request?.jobId)return;
      const owner=request;owner.generation=(owner.generation||0)+1;
      if(pollTimer)env.clearTimeout(pollTimer);pollTimer=null;
      owner.state='cancelling';cancel.disabled=true;refresh();
      try{const value=await client.cancel(owner.jobId);if(request===owner)finish(value,owner);}
      catch(e){if(request===owner){if(e.code==='not_found')finish({state:'failed',code:'not_found',response:''},owner);else{owner.state='interrupted';requestStatus.textContent=e.message+' The request may still be running. Use Check request to reconnect.';}}}
      finally{cancel.disabled=false;refresh();}
    });
    const resume=button('Check request','devinResume',()=>{if(request?.jobId){request.generation=(request.generation||0)+1;request.state='running';refresh();void poll();}});
    const copyResponse=button('Copy response','devinCopyResponse',async()=>{try{await client.copyPrompt(response.node.value);requestStatus.textContent='Response copied.';}catch(e){requestStatus.textContent=e.message;response.node.focus();response.node.select();}});
    const append=button('Append to Notes','devinAppendResponse',()=>{
      if(!request||request.appended||request.state!=='completed')return;
      if(!api.canAppend?.(request.caseId,request.entryId)||!api.appendResponse?.(request.caseId,response.node.value,request.entryId)){
        requestStatus.textContent='The original case or dated note is no longer selected or editable, or saving failed. Copy the response or return to that note and retry.';refresh();return;
      }
      request.appended=true;requestStatus.textContent='Response appended to the original case notes. Check the note’s save status before leaving.';refresh();
    });
    const newRequest=button('Start a new request','devinNewRequest',()=>{
      if(request&&['running','submitting','interrupted','cancelling'].includes(request.state))return;
      request=null;review.close();refresh();
    });
    review.append(disclosure,prompt.label,response.label,requestStatus,submit,copyPrompt,cancel,resume,copyResponse,append,newRequest,button('Close','devinRequestClose',()=>review.close()));
    review.addEventListener('close',()=>{if(request?.state==='preview')request=null;refresh();});
    function refresh(){
      const busy=request&&['running','submitting','interrupted','cancelling'].includes(request.state);
      if($('sendDevin')){$('sendDevin').disabled=!request&&(!connected||$('copyDevin')?.disabled||api.canSend?.()===false);$('sendDevin').textContent=request?.state==='completed'?'Review Devin response':request?'View Devin request':'Send to Devin';}
      submit.hidden=request?.state!=='preview';submit.disabled=!connected||request?.state!=='preview';
      cancel.hidden=!request?.jobId||!busy;resume.hidden=request?.state!=='interrupted';newRequest.hidden=!request||!!busy||request.state==='preview';
      copyResponse.hidden=request?.state!=='completed';append.hidden=!api.appendResponse||request?.state!=='completed';
      append.disabled=!!request?.appended||!api.canAppend?.(request?.caseId,request?.entryId);
      test.disabled=pairing||!client.isPaired();connect.disabled=pairing;disconnect.disabled=pairing||!client.isPaired();
    }
    async function check(newPair){
      if(pairing)return;pairing=true;connectionStatus.textContent='Checking local Devin connection…';refresh();
      try{await (newPair?client.connect(token.value):client.health());connected=true;token.value='';connectionStatus.textContent='Connected. Devin CLI is available. You can now use Send to Devin.';}
      catch(e){connected=false;connectionStatus.textContent=e.message;}
      finally{pairing=false;refresh();}
    }
    function openSettings(){if(!setup.open)setup.showModal();refresh();}
    function finish(value,owner=request){
      if(!owner||request!==owner)return;owner.state=value.state;
      if(pollTimer)env.clearTimeout(pollTimer);pollTimer=null;
      if(value.state==='completed'){$('devinRequestTitle').textContent='Review Devin response';response.node.value=value.response;response.label.hidden=false;prompt.label.hidden=true;disclosure.textContent='Review this suggestion before copying or appending it. Case notes have not been changed.';requestStatus.textContent='Devin finished. Review the response below.';}
      else requestStatus.textContent=connection.message(value.code)+ ' Copy prompt remains available.';
      refresh();
    }
    async function poll(){
      if(!request?.jobId)return;
      const owner=request,generation=owner.generation||0;
      try{const value=await client.getJob(owner.jobId);if(request!==owner||(owner.generation||0)!==generation)return;
        if(value.state==='running'){owner.state='running';pollTimer=env.setTimeout(poll,1000);refresh();}else finish(value,owner);}
      catch(e){if(request!==owner||(owner.generation||0)!==generation)return;
        if(e.code==='not_found')finish({state:'failed',code:'not_found',response:''},owner);
        else{owner.state='interrupted';connected=false;requestStatus.textContent=e.message+' Use Check request after restoring the connection; do not resubmit this request automatically.';refresh();}}
    }
    async function send(){
      if(!request||request.state!=='preview'||!connected)return;
      const owner=request;owner.state='submitting';requestStatus.textContent='Sending prompt to Devin…';refresh();
      try{const job=await client.submit(owner.prompt);if(request!==owner)return;owner.jobId=job.id;owner.state='running';requestStatus.textContent='Devin is working. You can keep editing your notes.';pollTimer=env.setTimeout(poll,1000);}
      catch(e){if(request!==owner)return;owner.state=e.code==='uncertain'?'uncertain':'failed';requestStatus.textContent=e.message;if(e.code==='unauthorized'||e.code==='network')connected=false;}
      refresh();
    }
    $('aiSettings')?.addEventListener('click',openSettings);
    $('sendDevin')?.addEventListener('click',()=>{
      if(request){if(!review.open)review.showModal();refresh();return;}
      if(!connected)return;
      let value;try{value=api.snapshot();}catch(e){$('devinStatus').textContent=e.message;return;}
      if(!value)return;request={...value,state:'preview',appended:false};
      prompt.node.value=value.prompt;response.node.value='';prompt.label.hidden=false;response.label.hidden=true;
      $('devinRequestTitle').textContent='Review prompt before sending';disclosure.textContent='Review the included case data. Send submits this text to Devin CLI using your configured account.';
      requestStatus.textContent='';refresh();review.showModal();
    });
    env.addEventListener?.('pagehide',()=>{if(pollTimer)env.clearTimeout(pollTimer);});
    setup.addEventListener('close',()=>{$('aiSettings')?.focus();});
    review.addEventListener('close',()=>{$('sendDevin')?.focus();});
    refresh();
    if(client.isPaired())void check(false);
    try{introSeen=env.localStorage.getItem('dell-support.devin-onboarding.v1')==='1';}catch{}
    if(api.sourceLabel==='Case Notes'&&!api.isPopout&&!introSeen){
      const showIntro=()=>{if(!introSeen&&!intro.open&&!doc.querySelector('dialog[open]'))intro.showModal();};
      env.setTimeout(showIntro,0);
      doc.addEventListener?.('close',()=>{if(!introSeen)env.setTimeout(showIntro,0);},true);
    }
    return {refresh,openSettings};
  }
  return {init};
})();
if(typeof module!=="undefined")module.exports=DevinIntegration;
else window.DevinIntegration=DevinIntegration;
