"use strict";
const CaseToolkitCore = (() => {
  const Workflow = typeof module!=="undefined" ? require("./case-workflow-core.js") : (typeof CaseWorkflowCore!=="undefined" ? CaseWorkflowCore : null);
  // Workflow additions share this case's persistence and export path.
  const templates = {
    general: { name:"General investigation", prompts:["Observed behavior", "Business impact and affected users", "Expected behavior", "First occurrence and frequency", "Recent changes", "Troubleshooting actions and results", "Evidence collected"] },
    boot: { name:"Boot / startup failure", prompts:["Last successful boot", "Failure stage and exact on-screen message", "Recent firmware, OS, or hardware changes", "Boot device and storage visibility", "Recovery actions attempted and results", "Available console screenshots and logs"] },
    crash: { name:"Crash / unexpected restart", prompts:["Crash time and time zone", "Stop code, panic, or error text", "Workload active at failure", "Frequency and affected systems", "Recent changes", "Crash dump and event log location", "Actions attempted and results"] },
    network: { name:"Network / DNS connectivity", prompts:["Source and destination", "Affected interface, VLAN, and route", "Scope: one host or multiple systems", "Expected versus observed connectivity", "DNS and name resolution observations", "Recent network changes", "Tests performed and results"] },
    performance: { name:"Performance / system hangs", prompts:["Affected workload and business impact", "Normal baseline versus current behavior", "Start time and duration", "CPU, memory, storage, and network observations", "Recent changes", "Measurements and comparison results"] },
    storage: { name:"Storage / disk / filesystem", prompts:["Affected disks, volumes, and paths", "Exact error and incident time", "Capacity and latency observations", "Controller and firmware versions", "Recent storage changes", "Storage events and diagnostic location"] },
    directory: { name:"Active Directory / authentication / Group Policy", prompts:["Affected users, computers, and domain controllers", "Authentication error or policy symptom", "Incident time and scope", "DNS and replication observations", "Recent domain or policy changes", "Diagnostics and event log location"] },
    hyperv: { name:"Hyper-V / virtual machines", prompts:["Affected VM and Hyper-V host", "VM state and exact error", "Host versus guest symptoms", "Incident time and workload", "Recent VM, host, or switch changes", "Hyper-V events and configuration evidence"] },
    cluster: { name:"Failover clustering", prompts:["Cluster and affected nodes", "Failed role or resource", "Failover time and time zone", "Quorum and node-state observations", "Recent cluster or storage changes", "Cluster logs and System event location"] },
    updates: { name:"Windows Update / installation failures", prompts:["Failed KB, role, or installation", "OS build and exact error code", "Failure time and installation stage", "Update source and reboot state", "Recent servicing changes", "Windows Update, CBS, DISM, or setup log location"] },
    smb: { name:"File shares / SMB / permissions", prompts:["Affected client, server, and share", "Exact access error and incident time", "User scope and expected permissions", "Read versus write behavior", "Recent share or security changes", "SMB logs and permission evidence"] },
    "fix ME OMSA": { name:"fix ME OMSA", prompts:["OMSA version and build", "Affected system or component", "Exact error message and incident time", "Recent OMSA or system changes", "OMSA logs and diagnostic location", "Troubleshooting actions and results"] }
  };
  const statuses = ["Open", "In progress", "Waiting on customer", "Completed"];
  const templateStorageKey = "dell-support.case-templates.v1";
  const validTemplateId = id => typeof id === "string" && (Object.hasOwn(templates,id) || id === "fix ME OMSA" || /^custom-[a-zA-Z0-9-]{1,80}$/.test(id));
  const defaultNext = "Action: [Add next action]\nOwner: [Assign owner]\nFollow-up: [Agree date and time]";
  function validateTemplates(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 100) throw Error("Invalid template settings");
    const result = {};
    for (const [id,item] of Object.entries(value)) {
      if (!validTemplateId(id) || !item || typeof item !== "object" || Array.isArray(item) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 100 || typeof item.notes !== "string" || !item.notes.trim() || item.notes.length > 20000 || typeof item.next !== "string" || item.next.length > 20000) throw Error("Invalid template. Enter a name and note text within the size limits.");
      result[id] = {name:item.name.trim(),notes:item.notes,next:item.next};
    }
    return result;
  }
  function templateCatalog(overrides = {}) {
    const result = Object.fromEntries(Object.entries(templates).map(([id,item])=>[id,{name:item.name,notes:item.prompts.map(p=>p+": [Add details]").join("\n"),next:defaultNext}]));
    return Object.assign(result,validateTemplates(overrides));
  }
  function loadTemplates(storage) { return validateTemplates(JSON.parse(storage.getItem(templateStorageKey) || "{}")); }
  function saveTemplates(storage,overrides) { const validated=validateTemplates(overrides);storage.setItem(templateStorageKey,JSON.stringify(validated));return validated; }
  function defaults() { return { issueType:"general", impact:"", questions:"", owner:"", due:"", status:"Open", checks:{}, timeline:[], timelineAction:"", timelineResult:"", customerDraft:"", summaryDraft:"", productApp:"" }; }
  function ensure(note) {
    if (!note.toolkit) note.toolkit = defaults();
    return note.toolkit;
  }
  function validate(note) {
    const data = ensure(note);
    if (!data || typeof data !== "object" || !validTemplateId(data.issueType) || !statuses.includes(data.status) || !["impact","questions","owner","due","customerDraft","summaryDraft","timelineAction","timelineResult","productApp"].every(k=>typeof data[k]==="string") || (data.due && !Number.isFinite(Date.parse(data.due))) || !data.checks || typeof data.checks!=="object" || Array.isArray(data.checks) || !Object.values(data.checks).every(v=>typeof v==="boolean") || !Array.isArray(data.timeline) || !data.timeline.every(e=>e && typeof e.id==="string" && Number.isFinite(e.at) && e.at>=0 && typeof e.action==="string" && typeof e.result==="string")) throw Error("Invalid case toolkit data");
    Workflow?.validate(note);
    return data;
  }
  const overdue = (note, now) => !!note.toolkit?.due && note.toolkit.status !== "Completed" && Date.parse(note.toolkit.due) < now;
  const escape = text => text.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function templateHtml(key, overrides = {}) {
    if (Object.hasOwn(overrides,key) || !Object.hasOwn(templates,key)) {
      const item=templateCatalog(overrides)[key];if(!item)throw Error("Template unavailable. Choose another template or restore your settings.");
      return `<h3>${escape(item.name)}</h3>`+textHtml(item.notes);
    }
    const preset=templates[key];
    return `<h3>${escape(preset.name)}</h3>`+preset.prompts.map(prompt=>`<p><strong>${escape(prompt)}:</strong> [Add details]</p>`).join("");
  }
  function textHtml(text) { return text.split(/\r?\n/).map(line=>`<p>${escape(line) || '<br>'}</p>`).join(''); }
  function templateNextHtml(key,overrides = {}) {
    const item=templateCatalog(overrides)[key];if(!item)throw Error("Template unavailable. Choose another template or restore your settings.");
    return item.next.trim() ? '<h3>Next steps</h3>'+textHtml(item.next) : '';
  }
  const guides = {
    "Windows Server": ["windows", "Export System, Application, and relevant role event logs for the incident window", "Microsoft support tools", "https://github.com/DellProSupportGse/Tools"],
    "Redhat": ["rhel", "Collect an sos report using the Red Hat procedure", "Red Hat sos report guide", "https://access.redhat.com/solutions/3592"],
    "Ubuntu": ["ubuntu", "Collect an sos report using the Ubuntu procedure", "Ubuntu sos report reference", "https://manpages.ubuntu.com/manpages/focal/man1/sosreport.1.html"],
    "Debian": ["debian", "Export relevant journal and service logs around the incident", "Debian troubleshooting guide", "https://wiki.debian.org/TroubleShooting"],
    "Nutanix": ["nutanix", "Collect Prism log bundles and relevant cluster health results", "Nutanix Prism log collection", "https://next.nutanix.com/how-it-works-22/running-nutanix-cluster-check-log-collector-using-prism-web-console-37399"],
    "ESX": ["esx", "Collect the affected ESXi host support bundle and vCenter bundle if relevant", "Broadcom diagnostic collection", "https://knowledge.broadcom.com/external/article/326299"],
    "VCF": ["vcf", "Identify the affected VCF component; collect ESXi/vCenter bundles when those components are involved", "Broadcom ESXi / vCenter collection", "https://knowledge.broadcom.com/external/article/326299"],
    "Azure Stack Hub": ["ash", "Collect the requested Azure Stack Hub diagnostic logs with support guidance", "Microsoft Azure Stack Hub collection", "https://learn.microsoft.com/en-us/azure-stack/operator/azure-stack-get-azurestacklog"],
    "No OS": ["noos", "No OS in scope: export the iDRAC SupportAssist collection (TSR) and Lifecycle Controller log", "Export a SupportAssist collection via iDRAC", "https://www.dell.com/support/kbdoc/en-us/000126308/export-a-supportassist-collection-via-idrac9"],
    "Azure Local": ["azlocal", "Collect Azure Local diagnostic logs for the affected nodes and incident window", "Microsoft Azure Local collection", "https://learn.microsoft.com/en-us/azure/azure-local/manage/collect-logs"],
    "Systems Management": ["sysmgmt", "Collect OMSA logs and iDRAC SupportAssist collection for the affected system", "OMSA log collection guide", "https://www.dell.com/support/kbdoc/en-us/000126308/export-a-supportassist-collection-via-idrac9"]
  };
  function checklist(note) {
    const data=ensure(note);
    const list=[{id:"incident",text:"Record the incident timestamp, time zone, affected systems, and exact errors"},{id:"versions",text:"Record OS/build, firmware, and relevant component versions"}];
    const guide=guides[note.os];
    if(guide) list.push({id:guide[0],text:guide[1],label:guide[2],url:guide[3]});
    const specifics={boot:"Capture the boot console or failure screen and boot-device observations",crash:"Locate the crash dump / panic record and logs preceding the restart",network:"Record source/destination, interface configuration, and connectivity test results",performance:"Capture time-aligned resource metrics and a normal-performance comparison",general:"Capture reproduction steps and observed results"};
    list.push({id:"issue-"+data.issueType,text:specifics[data.issueType] || specifics.general},{id:"location",text:"Attach collected evidence to the case and record its Log Location"});
    return list;
  }
  function extraText(note) {
    const data=ensure(note), sections=[];
    if(data.impact)sections.push("Business impact:\n"+data.impact);
    if(data.questions)sections.push("Remaining questions:\n"+data.questions);
    if(data.owner || data.due || data.status!=="Open")sections.push(`Follow-up:\nStatus: ${data.status}\nOwner: ${data.owner || "Not assigned"}\nDue: ${data.due || "Not scheduled"}`);
    const checked=checklist(note).filter(item=>data.checks[item.id]);
    if(checked.length)sections.push("Evidence checklist completed:\n"+checked.map(item=>"- "+item.text).join("\n"));
    const workflow=Workflow?.text(note);if(workflow)sections.push("Case workflow:\n"+workflow);
    return sections.join("\n\n");
  }
  function customerUpdate(note, plain, tone="clear") {
    const data=ensure(note);
    const customerText = value => plain(value).replace(/\[Screenshot:[^\]]*\]/g, "").trim();
    const actions=customerText(note.notes) || "[Add a customer-facing description of the work completed]";
    const opening=tone==="reassuring" ? "We understand the impact this is having and are continuing to investigate." : tone==="concise" ? "Here is the current status." : "Here is an update on your support request.";
    const closing=tone==="reassuring" ? "Please let us know if the symptoms or business impact change. We will keep you informed." : "Please let us know if the symptoms or business impact change.";
    return `Hello,\n\n${opening}\n\nService Request: ${note.request || "[number]"}\n\nIssue we are investigating:\n${note.issue || "[Describe the issue]"}\n\nProgress so far:\n${actions}\n\nNext steps:\n${customerText(note.next) || "[Add the next action]"}\n\n${data.due ? "Next follow-up: "+new Date(data.due).toLocaleString() : "Next follow-up: [Confirm date and time]"}\n\n${closing}\n\nThank you.`;
  }
  function concise(text, limit = 900) {
    const lines=text.split("\n").filter(line=>line.trim());
    const compact=lines.slice(0,6).join("\n");
    return compact.length>limit || lines.length>6 ? compact.slice(0,limit)+"\n[See full case notes for remaining details]" : compact;
  }
  function summary(note, plain, elapsed) {
    const data=ensure(note);
    return `HANDOFF SUMMARY\nService Request: ${note.request || "Not provided"}\nService Tag: ${note.tag || "Not provided"}\nSystem/Platform: ${note.platform || "Not provided"}\nOS/Solution: ${note.os || "Not provided"}\n\nIssue:\n${note.issue || "Not recorded"}\n\nBusiness impact:\n${data.impact || "Not recorded"}\n\nInvestigation:\n${concise(plain(note.notes)) || "Not recorded"}\n\nNext steps:\n${plain(note.next) || "Not recorded"}\n\nRemaining questions:\n${data.questions || "Not recorded"}\n\nEvidence location: ${note.logLocation || "Not recorded"}\nOwner: ${data.owner || "Not assigned"}\nStatus: ${data.status}\nFollow-up due: ${data.due ? new Date(data.due).toLocaleString() : "Not scheduled"}\nTime spent: ${elapsed}`;
  }
  return {templates,templateStorageKey,validateTemplates,templateCatalog,loadTemplates,saveTemplates,templateNextHtml,statuses,defaults,ensure,validate,overdue,templateHtml,checklist,extraText,customerUpdate,summary};
})();
if(typeof module!=="undefined")module.exports=CaseToolkitCore;
