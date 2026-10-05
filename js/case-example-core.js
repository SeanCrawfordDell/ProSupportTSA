"use strict";
// Sample case for Load Example and the Tutorial Demo. Pure, shared with the Node regression tests.
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
  return { ID, IMAGE_ID, build, entryTimes };
})();
if (typeof module !== "undefined") module.exports = CaseExample;
