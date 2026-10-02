"use strict";
const CaseWorkflowCore = (() => {
  const defaults = () => ({recentChange:"", severity:"Unspecified", results:{}, fix:"", verification:"", confirmed:false, prevention:"", repeatOf:"", knowledge:""});
  function ensure(note) { return note.toolkit.workflow ||= defaults(); }
  function validate(note) {
    if (!Object.hasOwn(note.toolkit,"workflow")) return;
    const w=note.toolkit.workflow;
    if (!w || typeof w!=="object" || Array.isArray(w) || !["recentChange","fix","verification","prevention","repeatOf","knowledge"].every(k=>typeof w[k]==="string" && w[k].length<=50000) || !["Unspecified","Service unavailable","Service degraded","Deployment","How-to / planning"].includes(w.severity) || typeof w.confirmed!=="boolean" || !w.results || typeof w.results!=="object" || Array.isArray(w.results) || Object.keys(w.results).length>30 || !Object.entries(w.results).every(([k,v])=>Object.hasOwn(tools,k) && typeof v==="string" && v.length<=50000)) throw Error("Invalid case workflow data");
  }
  const catalog="https://seancrawforddell.github.io/DellSupportoolRepository/#/tools/";
  const tools={
    tsr:["tool-013","TSR Collector","Capture hardware evidence from affected PowerEdge nodes through iDRAC."],
    sddc:["tool-011","SDDC Dell Enhanced","Collect Azure Local diagnostics for the incident window. Use the offline variant from the catalog when connectivity is unavailable."],
    events:["tool-005","FLEP","Narrow Windows events to the failure timestamp and affected components."],
    perf:["tool-006","GetHyperVBottlenecks","Compare CPU, memory, disk, and network pressure on an affected Hyper-V host."],
    urls:["tool-002","AzHCIUrlChecker","Check required Azure endpoints when registration, deployment, or updates cannot connect."],
    cluster:["tool-017","CluChk","Review S2D / Azure Local cluster configuration for relevant deviations."],
    logs:["tool-009","LogCollector","Collect a standardized Windows diagnostic bundle before changing the system."]
  };
  function recommendations(note) {
    const ids=[], os=note.os, issue=note.toolkit?.issueType, text=(note.issue+" "+note.platform).toLowerCase();
    if(os==="Azure Local") {
      if(issue==="network" && /endpoint|registration|deploy|update|proxy/.test(text))ids.push("urls");
      ids.push("sddc","cluster");
    } else if(os==="No OS") {
      ids.push("tsr");
    } else if(os==="Windows Server") {
      if(issue==="performance" && /hyper-v|hyperv|virtual machine/.test(text))ids.push("perf");
      ids.push("events","logs");
    }
    if(/poweredge|idrac/.test(text))ids.push("tsr");
    return [...new Set(ids)].slice(0,3).map(id=>({id,name:tools[id][1],why:tools[id][2],url:catalog+tools[id][0]}));
  }
  function gaps(note) {
    const w=note.toolkit?.workflow || defaults(), missing=[];
    if(!w.fix.trim())missing.push("Resolution / workaround");
    if(!w.verification.trim())missing.push("Verification test and observed result");
    if(!w.confirmed)missing.push("Customer confirmation");
    if(!w.prevention.trim())missing.push("Prevention or monitoring plan");
    return missing;
  }
  function text(note) {
    const w=note.toolkit?.workflow;if(!w)return "";
    const rows=[];
    if(w.severity!=="Unspecified")rows.push("Service impact: "+w.severity);
    if(w.recentChange)rows.push("Recent changes: "+w.recentChange);
    if(w.repeatOf)rows.push("Related / repeat case: "+w.repeatOf);
    for(const [id,result] of Object.entries(w.results))if(result.trim())rows.push((Object.hasOwn(tools,id)?tools[id][1]:id)+" — recorded result:\n"+result);
    for(const [key,label] of [["fix","Resolution / workaround"],["verification","Verification"],["prevention","Prevention / monitoring"]])if(w[key])rows.push(label+":\n"+w[key]);
    if(w.fix || w.verification || w.confirmed)rows.push("Customer confirmed resolution: "+(w.confirmed?"Yes":"Not yet"));
    return rows.join("\n\n");
  }
  function knowledge(note,plain) {
    const w=note.toolkit?.workflow || defaults();
    const findings=Object.entries(w.results).filter(([,value])=>value.trim()).map(([id,value])=>(tools[id]?.[1]||id)+": "+value).join("\n");
    return `KNOWLEDGE CANDIDATE — REVIEW REQUIRED\n\nIssue:\n${note.issue || "[Add symptom]"}\n\nEnvironment:\n${note.platform || "[Add platform]"} · ${note.os || "[Add OS]"} · ${note.osVersion || "[Add version]"}\n\nInvestigation:\n${[plain(note.notes),findings].filter(Boolean).join("\n\n") || "[Add investigation]"}\n\nResolution / workaround:\n${w.fix || "[Add resolution]"}\n\nValidation:\n${w.verification || "[Add test and result]"}\nCustomer confirmed: ${w.confirmed?"Yes":"Not yet"}\n\nPrevention:\n${w.prevention || "[Add prevention guidance]"}\n\nReview applicability and remove customer-specific details before submitting through your approved knowledge process.`;
  }
  function prevention(cases) {
    const groups=new Map();
    for(const note of cases) {
      const key=[note.platform.trim().toLowerCase(),note.os,note.osVersion.trim().toLowerCase(),note.toolkit.issueType].join(" | ");
      if(!note.platform.trim() || !note.os)continue;
      const group=groups.get(key)||[];group.push(note);groups.set(key,group);
    }
    return {repeats:cases.filter(n=>n.toolkit?.workflow?.repeatOf.trim()), unverified:cases.filter(n=>n.toolkit.status==="Completed" && gaps(n).length), groups:[...groups.values()].filter(g=>g.length>1)};
  }
  return {defaults,ensure,validate,recommendations,gaps,text,knowledge,prevention,tools};
})();
if(typeof module!=="undefined")module.exports=CaseWorkflowCore;
