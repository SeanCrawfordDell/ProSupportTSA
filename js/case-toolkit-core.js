"use strict";
const CaseToolkitCore = (() => {
  const Workflow = typeof module!=="undefined" ? require("./case-workflow-core.js") : (typeof CaseWorkflowCore!=="undefined" ? CaseWorkflowCore : null);
  // Workflow additions share this case's persistence and export path.
  // Issue types for the Triage picker. Prompts are kept so the rubric can ignore scaffolding in notes written with the former templates.
  const issueTypes = {
    directory: { name:"Active Directory / Authentication / Group Policy", prompts:["Affected users, computers, and domain controllers", "Authentication error or policy symptom", "Incident time and scope", "DNS and replication observations", "Recent domain or policy changes", "Diagnostics and event log location"] },
    azurehub: { name:"Azure Hub", prompts:["Affected Azure Stack Hub instance and stamp", "Exact error and incident time", "Affected workloads and services", "Azure Hub registration and connectivity", "Recent Azure Hub or infrastructure changes", "Azure Stack Hub logs and diagnostic location"] },
    azurelocalhw: { name:"Azure Local Hardware related ", prompts:["Affected Azure Local node and hardware component", "Exact error and incident time", "Affected workloads and services", "Hardware driver or firmware version", "Recent hardware or infrastructure changes", "Azure Local logs and diagnostic location"] },
    bitlocker: { name:"Bitlocker", prompts:["Affected drive and BitLocker status", "Exact error or incident time", "Recovery key or TPM status", "BitLocker protection mode and encryption method", "Recent BitLocker or infrastructure changes", "BitLocker logs and diagnostic location"] },
    boot: { name:"Boot / Startup Failure", prompts:["Last successful boot", "Failure stage and exact on-screen message", "Recent firmware, OS, or hardware changes", "Boot device and storage visibility", "Recovery actions attempted and results", "Available console screenshots and logs"] },
    crash: { name:"Crash / Unexpected Restart", prompts:["Crash time and time zone", "Stop code, panic, or error text", "Workload active at failure", "Frequency and affected systems", "Recent changes", "Crash dump and event log location", "Actions attempted and results"] },
    cluster: { name:"Failover Clustering", prompts:["Cluster and affected nodes", "Failed role or resource", "Failover time and time zone", "Quorum and node-state observations", "Recent cluster or storage changes", "Cluster logs and System event location"] },
    smb: { name:"File shares / SMB / Permissions", prompts:["Affected client, server, and share", "Exact access error and incident time", "User scope and expected permissions", "Read versus write behavior", "Recent share or security changes", "SMB logs and permission evidence"] },
    "fix ME OMSA": { name:"fix ME OMSA", prompts:["OMSA version and build", "Affected system or component", "Exact error message and incident time", "Recent OMSA or system changes", "OMSA logs and diagnostic location", "Troubleshooting actions and results"] },
    general: { name:"General Investigation", prompts:["Observed behavior", "Business impact and affected users", "Expected behavior", "First occurrence and frequency", "Recent changes", "Troubleshooting actions and results", "Evidence collected"] },
    hyperv: { name:"Hyper-V / Virtual machines", prompts:["Affected VM and Hyper-V host", "VM state and exact error", "Host versus guest symptoms", "Incident time and workload", "Recent VM, host, or switch changes", "Hyper-V events and configuration evidence"] },
    licensing: { name:"Licensing / Activation", prompts:["Affected product and licensing type", "Exact error or incident time", "License activation status and KMS configuration", "Volume licensing and compliance status", "Recent licensing or infrastructure changes", "Licensing logs and diagnostic location"] },
    network: { name:"Network / DNS / TCPIP / RDMA", prompts:["Source and destination", "Affected interface, VLAN, and route", "Scope: one host or multiple systems", "Expected versus observed connectivity", "DNS and name resolution observations", "Recent network changes", "Tests performed and results"] },
    noderecovery: { name:"Node recovery", prompts:["Affected node and cluster member", "Exact error and incident time", "Node state and quorum observations", "Recovery actions attempted and results", "Recent cluster or infrastructure changes", "Cluster logs and diagnostic location"] },
    performance: { name:"Performance / System Hangs", prompts:["Affected workload and business impact", "Normal baseline versus current behavior", "Start time and duration", "CPU, memory, storage, and network observations", "Recent changes", "Measurements and comparison results"] },
    pki: { name:"PKI / Certificates", prompts:["Affected certificate or PKI component", "Exact error or incident time", "Affected services and authentication scope", "Certificate validity and chain status", "Recent PKI or infrastructure changes", "Certificate Authority logs and diagnostic location"] },
    rds: { name:"Remote Desktop Services", prompts:["Affected RDS server and session host", "Exact error and incident time", "Affected users and connection scope", "RDS licensing and gateway configuration", "Recent RDS or infrastructure changes", "RDS logs and diagnostic location"] },
    security: { name:"Security / Vulnerability", prompts:["Security or vulnerability type and affected systems", "Exact error or incident time", "Affected users and data scope", "Security patch level and compliance status", "Recent security or infrastructure changes", "Security logs and diagnostic location"] },
    storage: { name:"Storage / Disk / Filesystem", prompts:["Affected disks, volumes, and paths", "Exact error and incident time", "Capacity and latency observations", "Controller and firmware versions", "Recent storage changes", "Storage events and diagnostic location"] },
    updates: { name:"Update / Patch Failures", prompts:["Failed KB, role, or installation", "OS build and exact error code", "Failure time and installation stage", "Update source and reboot state", "Recent servicing changes", "Windows Update, CBS, DISM, or setup log location"] },
    wac: { name:"Windows Admin Center / OMIWAC", prompts:["Affected WAC server and managed nodes", "Exact error and incident time", "Management scope and affected systems", "WAC gateway and connectivity", "Recent WAC or infrastructure changes", "WAC logs and diagnostic location"] },
    defender: { name:"Windows Defender", prompts:["Defender component and detection type", "Exact error or incident time", "Affected files and systems", "Threat details and quarantine status", "Recent Defender or infrastructure changes", "Windows Defender logs and diagnostic location"] },
    backup: { name:"Windows Server Backup", prompts:["Affected backup job and storage", "Exact error and incident time", "Backup type and affected data scope", "Backup schedule and retention policy", "Recent backup or infrastructure changes", "Windows Server Backup logs and diagnostic location"] }
  };
  // Hardware issue types (ids start with "hw-") replace the normal list while the case's Hardware Issue box is checked.
  const hwPrompts = (component, ...extra) => ["Affected system and " + component, "Business impact and current system state", "Exact error, LED/amber code, or message and incident time", ...extra, "Recent hardware, firmware, or physical changes", "iDRAC / Lifecycle Controller log and TSR location", "Troubleshooting actions and results"];
  Object.assign(issueTypes, {
    "hw-psu": { name:"PSU", prompts:hwPrompts("PSU slot", "Redundancy status and AC input/PDU state") },
    "hw-temperature": { name:"Temperature", prompts:hwPrompts("sensor", "Inlet/exhaust temperatures and ambient conditions") },
    "hw-fan": { name:"Fan / Cooling", prompts:hwPrompts("fan slot", "Fan RPM and airflow obstructions") },
    "hw-cpu": { name:"CPU Error", prompts:hwPrompts("CPU socket", "MCE or machine-check details") },
    "hw-memory": { name:"Memory Error", prompts:hwPrompts("DIMM slot", "Correctable versus uncorrectable error counts") },
    "hw-drive": { name:"Drive Error", prompts:hwPrompts("drive bay", "Drive model, firmware, and predictive-failure status") },
    "hw-controller": { name:"RAID / Storage Controller", prompts:hwPrompts("controller", "Virtual disk state and controller firmware") },
    "hw-pci": { name:"PCI Card Error", prompts:hwPrompts("PCIe slot and card", "Card model, firmware, and riser") },
    "hw-nic": { name:"Network Adapter (NIC)", prompts:hwPrompts("NIC port", "Link state, cable/optic, and switch port") },
    "hw-motherboard": { name:"Motherboard Error", prompts:hwPrompts("board component") },
    "hw-idrac": { name:"iDRAC Error", prompts:hwPrompts("iDRAC", "iDRAC firmware and network reachability") },
    "hw-nopost-novideo": { name:"No POST / No Video", prompts:hwPrompts("display output", "POST codes and video cable/monitor tested") },
    "hw-nopost": { name:"No POST", prompts:hwPrompts("boot stage", "POST codes and minimum-configuration test results") },
    "hw-bios": { name:"BIOS / Firmware", prompts:hwPrompts("component", "BIOS and firmware versions") },
    "hw-other": { name:"Other Hardware", prompts:hwPrompts("component") }
  });
  const statuses = ["Open", "In progress", "Waiting on customer", "Completed"];
  // Systems Management cases use only the OMSA issue type, and that issue type belongs to Systems Management only.
  const sysmanOs = "Systems Management", sysmanIssue = "fix ME OMSA";
  const isHardware = id => typeof id === "string" && id.startsWith("hw-");
  function issueTypesFor(os, hardware) {
    return Object.keys(issueTypes).filter(id => hardware ? isHardware(id) : !isHardware(id) && (os === sysmanOs) === (id === sysmanIssue));
  }
  const defaultIssueType = (os, hardware) => (hardware ? "hw-psu" : os === sysmanOs ? sysmanIssue : "general");
  // Cases saved while personal templates existed may still carry a custom-* issue type.
  const validIssueType = id => typeof id === "string" && (Object.hasOwn(issueTypes,id) || /^custom-[a-zA-Z0-9-]{1,80}$/.test(id));
  function defaults() { return { issueType:"general", hardware:false, impact:"", questions:"", owner:"", due:"", status:"Open", checks:{}, timeline:[], timelineAction:"", timelineResult:"", customerDraft:"", summaryDraft:"", productApp:"" }; }
  function ensure(note) {
    if (!note.toolkit) note.toolkit = defaults();
    // Cases saved before a field was added get its default, so older history still loads.
    else if (typeof note.toolkit === "object" && !Array.isArray(note.toolkit)) {
      for (const [key, value] of Object.entries(defaults())) if (!Object.hasOwn(note.toolkit, key)) note.toolkit[key] = value;
    }
    return note.toolkit;
  }
  function validate(note) {
    const data = ensure(note);
    if (!data || typeof data !== "object" || !validIssueType(data.issueType) || typeof data.hardware!=="boolean" || !statuses.includes(data.status) || !["impact","questions","owner","due","customerDraft","summaryDraft","timelineAction","timelineResult","productApp"].every(k=>typeof data[k]==="string") || (data.due && !Number.isFinite(Date.parse(data.due))) || !data.checks || typeof data.checks!=="object" || Array.isArray(data.checks) || !Object.values(data.checks).every(v=>typeof v==="boolean") || !Array.isArray(data.timeline) || !data.timeline.every(e=>e && typeof e.id==="string" && Number.isFinite(e.at) && e.at>=0 && typeof e.action==="string" && typeof e.result==="string")) throw Error("Invalid case toolkit data");
    Workflow?.validate(note);
    return data;
  }
  const overdue = (note, now) => !!note.toolkit?.due && note.toolkit.status !== "Completed" && Date.parse(note.toolkit.due) < now;
  // Due within the next four hours (and not yet overdue).
  const soonWindow = 4 * 60 * 60 * 1000;
  const dueSoon = (note, now) => !!note.toolkit?.due && note.toolkit.status !== "Completed" && Date.parse(note.toolkit.due) >= now && Date.parse(note.toolkit.due) - now <= soonWindow;
  const followupState = (note, now) => overdue(note, now) ? "overdue" : dueSoon(note, now) ? "soon" : "";
  // Records a finished follow-up in the case timeline and clears the due date. `next` is "new" (another follow-up
  // will be scheduled), "none" (no further follow-up; the case stays as it is) or "complete" (the case is done).
  function completeFollowup(note, now, next) {
    const data = ensure(note);
    if (!data.due || !["new", "none", "complete"].includes(next)) return false;
    data.timeline.push({ id: "followup-" + now, at: now, action: "Follow-up done (was due " + new Date(data.due).toLocaleString() + ")", result: { complete: "Case marked Completed", none: "No further follow-up", new: "New follow-up needed" }[next] });
    data.due = "";
    if (next === "complete") data.status = "Completed";
    else if (next === "new" && data.status === "Completed") data.status = "In progress";
    return true;
  }
  const lastFollowup = note => [...(note.toolkit?.timeline || [])].reverse().find(entry => entry.id.startsWith("followup-")) || null;
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
    list.push({id:"issue-"+data.issueType,text:specifics[data.issueType] || (data.hardware ? "Capture the iDRAC/Lifecycle log, TSR, and hardware indicators (LEDs, POST codes) for the affected component" : specifics.general)},{id:"location",text:"Attach collected evidence to the case and record its Log Location"});
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
  return {issueTypes,issueTypesFor,isHardware,defaultIssueType,sysmanOs,statuses,defaults,ensure,validate,overdue,dueSoon,followupState,completeFollowup,lastFollowup,soonWindow,checklist,extraText,customerUpdate,summary};
})();
if(typeof module!=="undefined")module.exports=CaseToolkitCore;
