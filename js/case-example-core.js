"use strict";
// Sample cases for Load Example and the Tutorial Demo: one fully worked case (ID) that the tour opens, and nine
// shorter cases whose follow-ups are overdue, due within 4 hours, or later. Pure, shared with the Node regression tests.
const CaseExample = (() => {
  const Notes = typeof module !== "undefined" ? require("./case-notes-core.js") : CaseNotes;
  const Toolkit = typeof module !== "undefined" ? require("./case-toolkit-core.js") : CaseToolkitCore;
  const Workflow = typeof module !== "undefined" ? require("./case-workflow-core.js") : CaseWorkflowCore;
  const ID = "example-case";
  const IMAGE_ID = "example-flep-events";
  const MINUTE = 60000, HOUR = 60 * MINUTE;

  // Three entries on three calendar days: two days ago, yesterday, and earlier today.
  function entryTimes(now) {
    const day = offset => { const date = new Date(now); date.setDate(date.getDate() - offset); date.setHours(0, 0, 0, 0); return date.getTime(); };
    return [day(2) + 9 * HOUR + 10 * MINUTE, day(1) + 13 * HOUR + 45 * MINUTE, Math.max(day(0), now - 20 * MINUTE)];
  }
  // Follow-up call tomorrow at 10:00 local time.
  function followupDue(now) {
    const date = new Date(now); date.setDate(date.getDate() + 1); date.setHours(10, 0, 0, 0);
    return date.toISOString();
  }

  const fields = {
    tag: "ABC1234",
    platform: "PowerEdge R750",
    request: "123456789",
    os: "Windows Server",
    osVersion: "Windows Server 2022 Datacenter 21H2 (build 20348.2655); Broadcom NetXtreme-E firmware 22.31.6",
    country: "US",
    supportType: "OEM OS",
    logLocation: "https://files.example.com/sr-123456789/",
    issue: "Since a Broadcom NIC driver update, the 14 virtual machines on Hyper-V host HV-NODE-02 (PowerEdge R750, Windows Server 2022) lose network connectivity for 30–90 seconds, 3–5 times per day. Event ID 27 (network link disconnected) is logged on NIC port 2 at each drop. The other two cluster nodes are not affected."
  };

  const entries = [
    {
      id: "example-day-1",
      notes: "<p><strong>Initial contact</strong> with the customer's Hyper-V administrator.</p>" +
        "<ol><li>Confirmed scope: 14 VMs on HV-NODE-02 drop off the network for 30–90 seconds, 3–5 times per day. Result: VMs on HV-NODE-01 and HV-NODE-03 are not affected and host management traffic stays up.</li>" +
        "<li>Reviewed the System event log for the 09:42 drop with the customer. Observed Event ID 27 (link disconnected) on NIC port 2 and Event ID 16949 on the vSwitch team at the same second.</li>" +
        "<li>Ran Test-NetConnection from a VM to the gateway during a drop. Result: requests timed out for 47 seconds, then recovered without any action.</li>" +
        "<li>Checked top-of-rack switch port counters with the customer's network team. Result: no errors or link flaps logged on the switch side.</li></ol>",
      next: "<ol><li>Customer to collect a TSR from iDRAC and a LogCollector bundle from HV-NODE-02 and upload both to the SR file share. Owner: customer Hyper-V administrator. Due: tomorrow 12:00.</li>" +
        "<li>Review the logs and compare NIC driver and firmware versions with HV-NODE-01 and HV-NODE-03. Owner: Dell ProSupport engineer. Follow-up call tomorrow 14:00.</li></ol>"
    },
    {
      id: "example-day-2",
      notes: "<p><strong>Log review</strong> of the TSR and LogCollector bundle.</p>" +
        "<ol><li>TSR shows NIC firmware 22.31.6 on all three nodes. Result: firmware is consistent and the Lifecycle Controller log shows no hardware faults.</li>" +
        "<li>LogCollector shows Windows Update installed Broadcom NetXtreme-E driver 226.0.145.0 on HV-NODE-02 two days before the first drop. Result: HV-NODE-01 and HV-NODE-03 still run 225.0.4.0.</li>" +
        "<li>Filtered events to each drop window with FLEP. Observed Event ID 27 on NIC port 2 within 2 seconds of every reported drop, and no matching events on the other nodes.</li>" +
        "<li>Checked the Dell support matrix for the R750 with firmware 22.31.6. Result: 225.0.4.0 is the validated driver; 226.0.145.0 is not validated with this firmware.</li></ol>" +
        `<p>FLEP view of the Event ID 27 entries:</p><p><img src="attachment:${IMAGE_ID}" alt="FLEP filtered Event ID 27 entries on HV-NODE-02"></p>`,
      next: "<ol><li>Customer approved a maintenance window tonight at 22:00 to roll back the NIC driver to 225.0.4.0 and defer driver updates from Windows Update. Owner: customer Hyper-V administrator.</li>" +
        "<li>Join a call tomorrow at 09:00 to verify the result and agree a monitoring period. Owner: Dell ProSupport engineer.</li></ol>"
    },
    {
      id: "example-day-3",
      notes: "<p><strong>Verification</strong> after last night's maintenance window.</p>" +
        "<ol><li>Customer drained HV-NODE-02, rolled the driver back to 225.0.4.0, and deferred driver updates by policy. Result: Device Manager shows 225.0.4.0 on both NIC ports.</li>" +
        "<li>Repeated the failing scenario: continuous ping from three VMs to the gateway for 60 minutes while live-migrating 4 VMs back to the host. Result: 0 packets lost and no Event ID 27 logged.</li>" +
        "<li>Customer confirmed no user-reported drops in the 11 hours since the change.</li></ol>",
      next: "<ol><li>Customer to monitor Event ID 27 on all three nodes for 24 hours and report any VM network drop. Owner: customer Hyper-V administrator.</li>" +
        "<li>Follow-up call tomorrow at 10:00 to confirm stability and close the case if no drops are seen. Owner: Dell ProSupport engineer.</li></ol>"
    }
  ];

  const workflow = {
    recentChange: "Windows Update installed Broadcom NetXtreme-E driver 226.0.145.0 (previously 225.0.4.0) on HV-NODE-02 two days before the first drop. No firmware, switch, or VM configuration changes.",
    severity: "Service degraded",
    results: {},
    fix: "Rolled the Broadcom NetXtreme-E driver on HV-NODE-02 back from 226.0.145.0 to 225.0.4.0, the version validated with firmware 22.31.6, and deferred driver updates from Windows Update.",
    verification: "Continuous ping from three VMs to the gateway for 60 minutes during live migration of 4 VMs: 0 packets lost and no Event ID 27. No user-reported drops in the 11 hours since the change.",
    confirmed: true,
    prevention: "Customer monitors Event ID 27 on all three nodes for 24 hours. Keep driver updates deferred until a newer driver is validated with the installed firmware, then update NIC firmware and driver together from the Dell update catalog.",
    repeatOf: "",
    knowledge: ""
  };

  const toolkit = {
    issueType: "network",
    impact: "14 production VMs (file services and two line-of-business application servers) used by about 400 people lose connectivity during each drop, and users see application disconnects several times a day.",
    questions: "Is driver 226.0.145.0 queued for the other hosts through Windows Update? Should the driver deferral policy be applied cluster-wide until Dell validates a newer driver?",
    owner: "Dell ProSupport engineer",
    status: "Waiting on customer"
  };

  // image: optional {name, data} screenshot. Without one, the screenshot reference is left out of the Day 2 note.
  function build({ now = Date.now(), customFields = {}, image = null } = {}) {
    const times = entryTimes(now);
    const noteEntries = entries.map((entry, index) => {
      const notes = image ? entry.notes : entry.notes.replace(/<p>FLEP view[\s\S]*$/, "");
      // Earlier days were last edited 35 minutes after they were started; today's entry was just edited.
      return { id: entry.id, created: times[index], updated: index < entries.length - 1 ? times[index] + 35 * MINUTE : now, notes, next: entry.next };
    });
    const active = noteEntries[noteEntries.length - 1];
    const note = {
      id: ID, created: times[0], updated: now,
      elapsed: 2 * HOUR + 47 * MINUTE + 30000, started: null, lastSession: 35 * MINUTE,
      ...Object.fromEntries(Object.keys(customFields).map(key => [key, ""])),
      ...fields,
      entries: noteEntries, activeEntryId: active.id, notes: active.notes, next: active.next,
      images: image ? { [IMAGE_ID]: { name: image.name, data: image.data } } : {},
      toolkit: { ...Toolkit.defaults(), ...toolkit, due: followupDue(now), checks: {}, workflow: { ...workflow, results: { ...workflow.results } } }
    };
    for (const item of Toolkit.checklist(note)) note.toolkit.checks[item.id] = true;
    const exported = { ...note, notes: Notes.exportField(note, "notes"), next: Notes.exportField(note, "next") };
    note.toolkit.customerDraft = Toolkit.customerUpdate(note, Notes.plainText, "clear");
    note.toolkit.summaryDraft = Toolkit.summary(exported, Notes.plainText, Notes.duration(note.elapsed));
    note.toolkit.workflow.knowledge = Workflow.knowledge(exported, Notes.plainText);
    return note;
  }

  // The other nine sample cases, each with one dated note and a follow-up. due(now) gives the follow-up time:
  // two are overdue, three are due within 4 hours, and four are due on a later day (as is the main sample).
  const at = (now, days, hours, minutes = 0) => { const date = new Date(now); date.setDate(date.getDate() + days); date.setHours(hours, minutes, 0, 0); return date.getTime(); };
  const others = [
    {
      due: now => now - 26 * HOUR, daysAgo: 4, elapsed: 95 * MINUTE,
      fields: { tag: "7HQ2KD3", platform: "PowerEdge R650", request: "187654321", os: "ESX", osVersion: "VMware ESXi 8.0 Update 2 (build 22380479)", country: "GB", supportType: "Solution Support includes OS", logLocation: "https://files.example.com/sr-187654321/",
        issue: "ESXi host ESX-LDN-04 stopped with a purple diagnostic screen (PSOD) twice this week during the nightly backup window. The 22 VMs on the host restarted on other cluster hosts through vSphere HA each time." },
      notes: "<ol><li>Reviewed the customer's photo of the PSOD. Observed a #PF exception 14 in the lsi_mr3 storage driver module. Result: the crash points to the storage controller driver, not to a VM.</li><li>Checked the installed driver with esxcli. Result: lsi_mr3 7.722 is installed; the validated version for this PERC H755 firmware is 7.726.</li></ol>",
      next: "<ol><li>Customer to upload the vmkernel core dump and a vm-support bundle from ESX-LDN-04. Owner: customer VMware administrator.</li><li>Follow-up: confirm the upload, then plan the driver update with the customer. Owner: Dell ProSupport engineer.</li></ol>",
      toolkit: { issueType: "crash", status: "Waiting on customer", owner: "Dell ProSupport engineer", impact: "22 production VMs restart on other hosts during each crash; the nightly backup job fails.", severity: "Service degraded", change: "No changes known since the host was updated to ESXi 8.0 Update 2 three months ago." }
    },
    {
      due: now => now - 90 * MINUTE, daysAgo: 2, elapsed: 70 * MINUTE,
      fields: { tag: "3FZ8LM2", platform: "PowerEdge R740xd", request: "187655410", os: "Windows Server", osVersion: "Windows Server 2019 Standard (build 17763.6293)", country: "DE", supportType: "OEM OS", logLocation: "https://files.example.com/sr-187655410/",
        issue: "Virtual disk 1 (RAID 6, 12 drives) on the PERC H740P of file server FS-MUC-01 is degraded after drive 7 failed. Users report slow file access while the array is degraded." },
      notes: "<ol><li>Reviewed the TSR with the customer. Observed drive 7 Failed with predictive failure alerts for 3 days before. Result: the other 11 drives are healthy.</li><li>Dispatched a replacement drive for next business day. Result: the customer's site contact confirmed delivery for this morning.</li></ol>",
      next: "<ol><li>Customer to install the replacement drive in bay 7. Owner: customer site contact.</li><li>Follow-up: call the customer to confirm the rebuild has started and the virtual disk is Rebuilding. Owner: Dell ProSupport engineer.</li></ol>",
      toolkit: { issueType: "storage", status: "In progress", owner: "Dell ProSupport engineer", impact: "About 250 users see slow file access on the department shares until the rebuild completes.", severity: "Service degraded", change: "None known; drive 7 failed on its own." }
    },
    {
      due: now => now + 45 * MINUTE, daysAgo: 1, elapsed: 55 * MINUTE,
      fields: { tag: "9TR4WX1", platform: "PowerEdge R760", request: "187656233", os: "Windows Server", osVersion: "Windows Server 2022 Datacenter (build 20348.2700)", country: "US", supportType: "OEM OS", logLocation: "https://files.example.com/sr-187656233/",
        issue: "Cluster Shared Volume CSV02 on the four-node Hyper-V cluster HVC-CHI goes into redirected access mode during the nightly backup, and VM disk latency rises above 200 ms until the backup finishes." },
      notes: "<ol><li>Reviewed the cluster log for last night's backup window. Observed Event ID 5120 for CSV02 when the backup snapshot started. Result: the volume returned to direct access 40 minutes later.</li><li>Compared the backup software's hardware VSS provider version across nodes. Result: node 3 runs an older provider than the other three nodes.</li></ol>",
      next: "<ol><li>Customer to update the VSS provider on node 3 before tonight's backup. Owner: customer backup administrator.</li><li>Follow-up: call to confirm the update and agree what to check after tonight's backup. Owner: Dell ProSupport engineer.</li></ol>",
      toolkit: { issueType: "cluster", status: "Open", owner: "Dell ProSupport engineer", impact: "Production VMs on CSV02 are slow for about 40 minutes every night.", severity: "Service degraded", change: "The backup software was upgraded on nodes 1, 2 and 4 last week; node 3 was skipped." }
    },
    {
      due: now => now + 2 * HOUR, daysAgo: 3, elapsed: 80 * MINUTE,
      fields: { tag: "5KD7PN8", platform: "PowerEdge R660", request: "187657102", os: "Windows Server", osVersion: "Windows Server 2022 Standard (build 20348.2655)", country: "CA", supportType: "ProSupport Plus Bring Your own License", logLocation: "https://files.example.com/sr-187657102/",
        issue: "Since a domain controller was restored from backup, some users at the Toronto site get intermittent logon failures with \"The trust relationship between this workstation and the primary domain failed\". About 30 workstations are affected." },
      notes: "<ol><li>Ran repadmin /showrepl on all three domain controllers with the customer. Observed replication failing from DC-TOR-02 with error 8606. Result: DC-TOR-02 was restored from a backup older than the tombstone lifetime.</li><li>Confirmed the affected workstations authenticate against DC-TOR-02. Result: workstations using the other two domain controllers are not affected.</li></ol>",
      next: "<ol><li>Customer to approve demoting DC-TOR-02 and cleaning up its metadata. Owner: customer Active Directory administrator.</li><li>Follow-up: call to get the approval and schedule the change. Owner: Dell ProSupport engineer.</li></ol>",
      toolkit: { issueType: "directory", status: "Waiting on customer", owner: "Dell ProSupport engineer", impact: "About 30 users at the Toronto site cannot log on reliably.", severity: "Service degraded", change: "DC-TOR-02 was restored from backup after a disk failure four days ago." }
    },
    {
      due: now => now + 3.5 * HOUR, daysAgo: 1, elapsed: 40 * MINUTE,
      fields: { tag: "2BW6CJ4", platform: "PowerEdge T550", request: "187658019", os: "Windows Server", osVersion: "Windows Server 2022 Standard (build 20348.2582)", country: "US", supportType: "OEM OS", logLocation: "https://files.example.com/sr-187658019/",
        issue: "The latest cumulative update fails to install on application server APP-DAL-01 with error 0x800f0922 and rolls back after the restart. The server is two cumulative updates behind." },
      notes: "<ol><li>Reviewed CBS.log with the customer. Observed the failure while updating the System Reserved partition. Result: the partition has 12 MB free, and the update needs more.</li><li>Ran DISM /Online /Cleanup-Image /RestoreHealth. Result: the component store is healthy, so the free space is the only blocker found.</li></ol>",
      next: "<ol><li>Customer to extend the System Reserved partition in this evening's maintenance window, using the steps sent by email. Owner: customer server administrator.</li><li>Follow-up: call before the window to go through the steps together. Owner: Dell ProSupport engineer.</li></ol>",
      toolkit: { issueType: "updates", status: "In progress", owner: "Dell ProSupport engineer", impact: "The server is missing two months of security updates.", severity: "Unspecified", change: "None known; earlier cumulative updates installed normally." }
    },
    {
      due: now => at(now, 2, 9), daysAgo: 5, elapsed: 65 * MINUTE,
      fields: { tag: "8MN3QR5", platform: "PowerEdge R750xs", request: "187659334", os: "Redhat", osVersion: "Red Hat Enterprise Linux 9.2 (kernel 5.14.0-284.30.1)", country: "NL", supportType: "Solution Support includes OS", logLocation: "https://files.example.com/sr-187659334/",
        issue: "Database server DB-AMS-03 shows I/O wait above 40% and query times three times higher than normal during business hours since the server was moved to a new rack." },
      notes: "<ol><li>Collected sosreport and iostat output with the customer during a slow period. Observed average write latency of 35 ms on the data volume. Result: the data volume normally shows under 5 ms.</li><li>Checked the PERC cache policy in the TSR. Result: the controller battery is not detected, so the virtual disk fell back to write-through caching.</li></ol>",
      next: "<ol><li>Dispatch a replacement controller battery and reseat it with the customer. Owner: Dell ProSupport engineer.</li><li>Follow-up: confirm the cache policy is back to write-back and compare latency. Owner: Dell ProSupport engineer.</li></ol>",
      toolkit: { issueType: "performance", status: "In progress", owner: "Dell ProSupport engineer", impact: "Order processing is about three times slower during business hours.", severity: "Service degraded", change: "The server was moved to a new rack last weekend." }
    },
    {
      due: now => at(now, 3, 15), daysAgo: 6, elapsed: 50 * MINUTE,
      fields: { tag: "6PL9VT2", platform: "PowerEdge R450", request: "187660487", os: "Windows Server", osVersion: "Windows Server 2019 Standard (build 17763.6189)", country: "FR", supportType: "OEM OS", logLocation: "https://files.example.com/sr-187660487/",
        issue: "After the file shares were migrated to file server FS-PAR-02, members of the Finance group get \"Access is denied\" when saving to \\\\FS-PAR-02\\Finance, but they can still open files." },
      notes: "<ol><li>Compared share and NTFS permissions with the customer using Get-SmbShareAccess and icacls. Observed that the Finance group has Read on the share, while Change was granted on the old server. Result: NTFS permissions migrated correctly.</li><li>Saved a test file as a Finance user at 10:20. Observed \"Access is denied\" (0x80070005), while opening files worked. Result: the share permission, not NTFS, blocks writing.</li></ol>",
      next: "<ol><li>Customer to grant the Finance group Change on the share and test saving a file. Owner: customer file server administrator.</li><li>Follow-up: confirm the change worked and check the other migrated shares for the same issue. Owner: Dell ProSupport engineer.</li></ol>",
      toolkit: { issueType: "smb", status: "Waiting on customer", owner: "Dell ProSupport engineer", impact: "The Finance team of about 40 users cannot save files to their department share.", severity: "Service degraded", change: "The shares were migrated from FS-PAR-01 to FS-PAR-02 last Friday." }
    },
    {
      due: now => at(now, 5, 11), daysAgo: 7, elapsed: 85 * MINUTE,
      fields: { tag: "4JC5HB9", platform: "PowerEdge R640", request: "187661520", os: "Ubuntu", osVersion: "Ubuntu 22.04.4 LTS (kernel 5.15.0-112)", country: "AU", supportType: "No Software Support", logLocation: "https://files.example.com/sr-187661520/",
        issue: "Build server BLD-SYD-01 stops at the \"grub rescue>\" prompt after a BIOS update from 2.19.1 to 2.21.2. The server was running normally before the update." },
      notes: "<ol><li>Checked the boot settings in iDRAC with the customer. Observed the boot mode changed from UEFI to BIOS during the update. Result: the disk uses a GPT layout with a UEFI boot partition.</li><li>Set the boot mode back to UEFI and restarted. Result: Ubuntu started normally.</li></ol>",
      next: "<ol><li>Customer to watch the next two scheduled restarts and report any boot problem. Owner: customer Linux administrator.</li><li>Follow-up: confirm both restarts were normal, then close the case. Owner: Dell ProSupport engineer.</li></ol>",
      toolkit: { issueType: "boot", status: "Waiting on customer", owner: "Dell ProSupport engineer", impact: "Software builds were blocked for one day; the server is working again.", severity: "Unspecified", change: "BIOS updated from 2.19.1 to 2.21.2 the day the problem started." }
    },
    {
      due: now => at(now, 7, 13), daysAgo: 9, elapsed: 120 * MINUTE,
      fields: { tag: "1XG8ZF6", platform: "Dell AX-760", request: "187662698", os: "Azure Local", osVersion: "Azure Local 23H2 (OS build 25398.1189)", country: "SE", supportType: "Solution Support includes OS", logLocation: "https://files.example.com/sr-187662698/",
        issue: "Live migration of VMs between the two nodes of Azure Local cluster AZL-STO fails with Event ID 21502 \"Virtual machine migration operation failed at migration source\". VMs can still be moved with quick migration." },
      notes: "<ol><li>Ran Test-Cluster with the customer. Observed a warning that the processor compatibility setting differs on 3 VMs. Result: those 3 VMs fail live migration; the other VMs migrate normally.</li><li>Live-migrated a new test VM between the nodes. Result: it moved in 18 seconds, so the cluster network and live migration settings work.</li></ol>",
      next: "<ol><li>Customer to turn on processor compatibility for the 3 VMs in the next maintenance window and retry live migration. Owner: customer virtualization administrator.</li><li>Follow-up: confirm live migration works for all VMs. Owner: Dell ProSupport engineer.</li></ol>",
      toolkit: { issueType: "hyperv", status: "Waiting on customer", owner: "Dell ProSupport engineer", impact: "Node maintenance needs downtime for 3 VMs until live migration works.", severity: "Unspecified", change: "The 3 VMs were imported from an older Hyper-V host last month." }
    }
  ];
  const IDS = [ID, ...others.map((_, index) => `${ID}-${index + 2}`)];
  const isSample = id => IDS.includes(id);
  function buildOther(spec, id, now, customFields) {
    const created = at(now, -spec.daysAgo, 10, 15), updated = created + 50 * MINUTE;
    const entry = { id: `${id}-day-1`, created, updated, notes: spec.notes, next: spec.next };
    const { severity, change, ...toolkitFields } = spec.toolkit;
    const note = {
      id, created, updated, elapsed: spec.elapsed, started: null, lastSession: spec.elapsed,
      ...Object.fromEntries(Object.keys(customFields).map(key => [key, ""])),
      ...spec.fields,
      entries: [entry], activeEntryId: entry.id, notes: entry.notes, next: entry.next, images: {},
      toolkit: { ...Toolkit.defaults(), ...toolkitFields, due: new Date(spec.due(now)).toISOString(), checks: {}, workflow: { ...Workflow.defaults(), severity, recentChange: change } }
    };
    // These cases are still being worked: about half of the suggested evidence has been reviewed.
    const checklist = Toolkit.checklist(note);
    for (const item of checklist.slice(0, Math.ceil(checklist.length / 2))) note.toolkit.checks[item.id] = true;
    return note;
  }
  // Every sample case, the main one first.
  function buildAll({ now = Date.now(), customFields = {}, image = null } = {}) {
    return [build({ now, customFields, image }), ...others.map((spec, index) => buildOther(spec, IDS[index + 1], now, customFields))];
  }
  return { ID, IDS, IMAGE_ID, isSample, build, buildAll, entryTimes };
})();
if (typeof module !== "undefined") module.exports = CaseExample;
