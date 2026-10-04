"use strict";
(() => {
  const key="dell-support.case-notes.v1", $=id=>document.getElementById(id);
  const labels={general:"General investigation",boot:"Boot failure",crash:"Crash / restart",network:"Network connectivity",performance:"Performance degradation"};
  const text=value=>String(value||"");
  function renderRanks(target, entries, empty) {
    const root=$(target);root.replaceChildren();
    if(!entries.length){root.textContent=empty;return;}
    const max=Math.max(...entries.map(([,count])=>count),1);
    entries.sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).forEach(([label,count])=>{
      const item=document.createElement("div"),top=document.createElement("div"),name=document.createElement("span"),value=document.createElement("strong"),bar=document.createElement("div"),fill=document.createElement("span");
      item.className="rank-item";name.textContent=label;value.textContent=count;top.append(name,value);bar.className="bar";fill.style.width=`${Math.round(count/max*100)}%`;bar.append(fill);item.append(top,bar);root.append(item);
    });
  }
  function load() { try{return CaseNotes.parse(localStorage.getItem(key)).cases;} catch{return null;} }
  function run() {
    $("dashboard").hidden=true;$("emptyState").hidden=true;
    const cases=load();if(cases===null){$("emptyState").hidden=false;$("emptyState").querySelector("p").textContent="Case history could not be read in this browser. Open Case Notes to protect and restore it.";return;}
    if(!cases.length){$("emptyState").hidden=false;return;}
    $("dashboard").hidden=false;const now=Date.now(), active=cases.filter(note=>note.toolkit.status!=="Completed"), overdue=active.filter(note=>CaseToolkitCore.overdue(note,now));
    $("totalCases").textContent=cases.length;$("activeCases").textContent=active.length;$("overdueCases").textContent=overdue.length;
    const prevention=CaseWorkflowCore.prevention(cases);
    $("preventionSummary").textContent=`${prevention.repeats.length} cases marked as repeat contacts · ${prevention.unverified.length} completed cases with verification details missing (including older records).`;
    $("preventionGroups").replaceChildren(...prevention.groups.map(group=>{const p=document.createElement("p");p.textContent=`${group.length} similar cases: ${group[0].platform} · ${group[0].os} · ${group[0].osVersion || "Version not recorded"} · ${labels[group[0].toolkit.issueType] || "Custom issue"}. Review SRs: ${group.map(n=>n.request || "Unnumbered").join(", ")}`;return p;}));
    const statuses={};cases.forEach(note=>{const value=text(note.toolkit.status)||"Open";statuses[value]=(statuses[value]||0)+1;});renderRanks("statusBreakdown",Object.entries(statuses),"No cases to show.");
    const issues={};cases.forEach(note=>{const value=labels[note.toolkit.issueType]||"General investigation";issues[value]=(issues[value]||0)+1;});renderRanks("issueBreakdown",Object.entries(issues),"No cases to show.");
    const attention=[...overdue,...active.filter(note=>!note.toolkit.owner && !CaseToolkitCore.overdue(note,now))];const list=$("attentionList");list.replaceChildren();
    if(!attention.length){list.textContent="Nothing needs immediate attention.";return;}
    attention.slice(0,8).forEach(note=>{const row=document.createElement("div"),name=document.createElement("strong"),meta=document.createElement("span"),due=note.toolkit.due?new Date(note.toolkit.due).toLocaleString():"No follow-up scheduled";name.textContent=note.tag||note.request||"Untitled case";meta.textContent=`${CaseToolkitCore.overdue(note,now)?"Overdue":"Unassigned"} · ${due}`;row.append(name,meta);list.append(row);});
  }
  window.addEventListener("storage",event=>{if(event.key===key)run();});run();
})();
