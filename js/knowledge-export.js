"use strict";
const KnowledgeExport=(()=>{
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const headings=/^(Issue|Environment|Investigation|Resolution \/ workaround|Validation|Prevention):$/;
  function filename(title){
    const clean=String(title).replace(/[<>:"/\\|?*\x00-\x1f]/g,'').replace(/\s+/g,' ').trim().slice(0,100).replace(/[. ]+$/,'');
    return !clean || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)?'Knowledge draft':clean;
  }
  function article(title,draft){
    if(!draft?.trim())throw Error('Build or enter a knowledge draft first.');
    title=title.trim() || 'Knowledge draft';
    const lines=draft.replace(/\r\n?/g,'\n').split('\n');
    const markdown='# '+title.replace(/[\r\n]+/g,' ')+'\n\n'+lines.map(line=>headings.test(line)?'## '+line.slice(0,-1):line).join('\n')+'\n';
    const html='<html><body><h1>'+escape(title)+'</h1>'+lines.map(line=>headings.test(line)?'<h2>'+escape(line.slice(0,-1))+'</h2>':'<p>'+ (escape(line)||'<br>')+'</p>').join('')+'</body></html>';
    return {markdown,html,text:title+'\n\n'+draft,filename:filename(title)+'.md'};
  }
  function obsidian(vault,title,stamp){
    if(!vault.trim())throw Error('Enter the name of your approved Obsidian vault first.');
    return 'obsidian://new?vault='+encodeURIComponent(vault.trim())+'&name='+encodeURIComponent(filename(title)+' - '+stamp)+'&clipboard=true';
  }
  function init(api,env=window){
    const $=id=>env.document.getElementById(id),link=$('knowledgeOpenObsidian');
    let generation=0;
    const invalidate=()=>{generation++;link.hidden=true;link.removeAttribute?.('href');};
    const current=()=>article($('knowledgeTitle').value,api.draft());
    for(const id of ['knowledgeTitle','obsidianVault'])$(id).addEventListener('input',invalidate);
    $('knowledgeOneNote').addEventListener('click',async()=>{
      invalidate();let data;
      try{data=current();}catch(e){api.notify(e.message);return;}
      try{
        if(!env.ClipboardItem || !env.navigator.clipboard?.write)throw Error('Plain text only');
        await env.navigator.clipboard.write([new env.ClipboardItem({'text/html':new env.Blob([data.html],{type:'text/html'}),'text/plain':new env.Blob([data.text],{type:'text/plain'})})]);
        api.notify('Formatted article copied. Open an approved OneNote page and paste. No page has been created automatically.');
      }catch{
        try{await env.navigator.clipboard.writeText(data.text);api.notify('Copied as plain text because formatted clipboard access is unavailable. Paste into OneNote.');}
        catch{api.notify('Could not copy. Select the draft and copy it manually, or download Markdown.');}
      }
    });
    $('knowledgeObsidian').addEventListener('click',async()=>{
      invalidate();const request=generation;
      try{
        const data=current(),stamp=new Date().toISOString().replace(/[-:.TZ]/g,'');
        const uri=obsidian($('obsidianVault').value,$('knowledgeTitle').value,stamp);
        await env.navigator.clipboard.writeText(data.markdown);
        if(request!==generation)return;
        link.href=uri;link.hidden=false;
        api.notify('Article copied. Click Open Obsidian now to create it in the specified vault. Do not copy anything else first. If the app does not open, use Download Markdown.');
      }catch(e){api.notify(e.message.includes('draft') || e.message.includes('vault')?e.message:'Could not copy the article for Obsidian. Use Download Markdown instead.');}
    });
    link.addEventListener('click',()=>{
      api.notify('Obsidian handoff requested. Confirm the new note in Obsidian; this browser cannot verify that it was created.');
    });
    $('knowledgeDownload').addEventListener('click',()=>{
      try{
        const data=current(),url=env.URL.createObjectURL(new env.Blob([data.markdown],{type:'text/markdown;charset=utf-8'}));
        const a=env.document.createElement('a');a.href=url;a.download=data.filename;env.document.body.append(a);a.click();a.remove();
        env.setTimeout(()=>env.URL.revokeObjectURL(url),60000);
        api.notify('Markdown download requested. Save or move the file into your approved Obsidian vault.');
      }catch(e){api.notify(e.message || 'Could not download the article. Copy the draft manually.');}
    });
    return {invalidate};
  }
  return {article,filename,obsidian,init};
})();
if(typeof module!=="undefined")module.exports=KnowledgeExport;
else window.KnowledgeExport=KnowledgeExport;
