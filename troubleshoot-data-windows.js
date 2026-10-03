// Windows Server troubleshooting decision trees. Each step either asks a question with answers that point to
// another step, or ends in an outcome. Commands are examples to run on the affected system; verify against the
// linked Microsoft Learn documentation before acting. Reviewed 2026-10-03.
(core => {
  const learn = path => `https://learn.microsoft.com/en-us/${path}`;
  const cmd = name => learn(`windows-server/administration/windows-commands/${name}`);
  const ps = (module, name) => learn(`powershell/module/${module}/${name}`);
  const reviewed = "2026-10-03";
  const windows = ["windows-server"];
  const workflows = [
    // ---------------------------------------------------------------- Windows Server
    {
      id: "ws-boot-failure", os: windows, area: "windows-server", reviewed,
      title: "Server won't boot or is stuck in a boot loop",
      summary: "Separate firmware, boot configuration, driver and disk problems when Windows Server fails to start.",
      sources: [learn("troubleshoot/windows-client/performance/windows-boot-issues-troubleshooting"), cmd("bcdedit")],
      start: "post",
      steps: {
        post: { prompt: "Does the server complete POST and reach the Windows boot loader?", detail: "Watch the console through iDRAC Virtual Console or a local monitor.", answers: [{ label: "No, it stops before Windows", next: "hardware" }, { label: "Yes, Windows starts loading", next: "stop" }] },
        hardware: { outcome: { cause: "A firmware, hardware or boot device problem stops the server before Windows loads.", fix: ["Review the iDRAC Lifecycle Log and System Event Log for hardware errors.", "Confirm the boot mode (UEFI or BIOS) and boot order match how Windows was installed.", "Confirm the boot volume's virtual disk is online in the RAID controller configuration.", "Collect a TSR (SupportAssist collection) before replacing any parts."] } },
        stop: { prompt: "Does the server show a stop error (blue screen) during boot?", answers: [{ label: "Yes, a stop code appears", next: "stopcode" }, { label: "No, it reboots, hangs or shows a boot manager error", next: "bcd" }] },
        stopcode: { prompt: "Is the stop code INACCESSIBLE_BOOT_DEVICE (0x7B)?", answers: [{ label: "Yes", next: "inaccessible" }, { label: "No, a different code", next: "driver" }] },
        inaccessible: { outcome: { cause: "Windows cannot reach the boot volume. This usually follows a storage controller, driver or mode change, or volume corruption.", fix: ["Undo any recent controller mode, firmware or driver change.", "Boot into WinRE and confirm the system volume is visible with diskpart (list volume).", "Run chkdsk /f against the system volume from WinRE.", "If the storage driver is missing, load it in WinRE and inject it with DISM /Image:C:\\ /Add-Driver /Driver:<path>."], links: [cmd("chkdsk")] } },
        driver: { prompt: "Did a driver, update or software change happen just before the failure?", answers: [{ label: "Yes", next: "rollback" }, { label: "No or unknown", next: "dump" }] },
        rollback: { outcome: { cause: "A recent driver or update change is the most likely cause.", fix: ["Try Safe Mode from Advanced Startup options > Startup Settings.", "From WinRE, list pending packages with DISM /Image:C:\\ /Get-Packages and remove or revert the recent change (DISM /Remove-Package or /RevertPendingActions).", "Roll back or remove the driver named in the stop error, then re-apply a validated version."] } },
        dump: { outcome: { cause: "The stop error needs dump analysis to identify the faulting component.", fix: ["Collect C:\\Windows\\MEMORY.DMP or the minidumps in C:\\Windows\\Minidump.", "Analyze the dump with WinDbg (!analyze -v) and note the faulting module.", "Use the unexpected restart / bugcheck guide to continue."], links: [learn("windows-hardware/drivers/debugger/analyze-crash-dump-files-by-using-windbg")] } },
        bcd: { prompt: "From WinRE, does bcdedit /enum all list a valid Windows Boot Loader entry pointing at the right partition?", commands: ["bcdedit /enum all"], answers: [{ label: "No, it is missing or wrong", next: "rebuild" }, { label: "Yes, it looks correct", next: "corrupt" }] },
        rebuild: { outcome: { cause: "The boot configuration data (BCD) is missing or damaged.", fix: ["Back up the current store: bcdedit /export C:\\bcdbackup.", "For UEFI, assign a letter to the EFI partition and run bcdboot C:\\Windows /s S: /f UEFI.", "For BIOS, run bootrec /rebuildbcd.", "Reboot and confirm the server starts."], links: [cmd("bcdboot")] } },
        corrupt: { outcome: { cause: "Corrupted system files or a damaged file system keep Windows from finishing startup.", fix: ["Run chkdsk /f against the Windows volume from WinRE.", "Run sfc /scannow /offbootdir=C:\\ /offwindir=C:\\Windows.", "Review C:\\Windows\\System32\\LogFiles\\Srt\\SrtTrail.txt from Startup Repair.", "If corruption persists, restore from backup or plan an in-place repair."], links: [cmd("sfc")] } }
      }
    },
    {
      id: "ws-unexpected-restart", os: windows, area: "windows-server", reviewed,
      title: "Unexpected restart or bugcheck (BSOD)",
      summary: "Work out why a server restarted unexpectedly and gather the evidence for root cause.",
      sources: [learn("troubleshoot/windows-client/performance/stop-error-or-blue-screen-error-troubleshooting"), learn("windows-hardware/drivers/debugger/bug-check-code-reference2")],
      start: "event",
      steps: {
        event: { prompt: "In the System log, is there an Event ID 1001 (BugCheck) near the restart time?", commands: ["Get-WinEvent -FilterHashtable @{LogName='System'; Id=41,1001,1074,6008} -MaxEvents 20 | Format-List TimeCreated,Id,Message"], answers: [{ label: "Yes, a bugcheck was recorded", next: "dumpfile" }, { label: "No bugcheck", next: "planned" }] },
        dumpfile: { prompt: "Is a memory dump available (C:\\Windows\\MEMORY.DMP or C:\\Windows\\Minidump)?", answers: [{ label: "Yes", next: "analyze" }, { label: "No", next: "nodump" }] },
        analyze: { outcome: { cause: "A bugcheck occurred and a dump is available for analysis.", fix: ["Open the dump in WinDbg and run !analyze -v.", "Note the stop code, its parameters and the faulting module or driver.", "Check whether the faulting driver has a newer validated version, and look up the stop code in the bug check reference.", "If the faulting module is a Microsoft component, attach the dump to the escalation."], links: [learn("windows-hardware/drivers/debugger/analyze-crash-dump-files-by-using-windbg")] } },
        nodump: { outcome: { cause: "A bugcheck occurred but no dump was saved, so the cause cannot yet be confirmed.", fix: ["Set Startup and Recovery to write a Kernel or Automatic memory dump.", "Make sure the page file on the system drive is large enough for the dump type and there is free disk space.", "Wait for the next occurrence, then analyze the dump."], links: [learn("troubleshoot/windows-server/performance/memory-dump-file-options")] } },
        planned: { prompt: "Is there an Event ID 1074 (a user or process initiated the restart)?", answers: [{ label: "Yes", next: "initiated" }, { label: "No, only Event 41 / 6008 (unexpected shutdown)", next: "power" }] },
        initiated: { outcome: { cause: "The restart was requested by a user, update or process rather than a crash.", fix: ["Read the Event 1074 message for the process, user and reason code.", "Check the Windows Update, cluster-aware updating or management tool schedule that triggered it.", "Adjust maintenance windows or update policies if the timing was unexpected."] } },
        power: { prompt: "Do the iDRAC Lifecycle Log or SEL show power, thermal or hardware events at that time?", answers: [{ label: "Yes", next: "hw" }, { label: "No", next: "hang" }] },
        hw: { outcome: { cause: "A hardware, power or thermal event reset the server without a Windows bugcheck.", fix: ["Collect a TSR and review the events at the restart time.", "Check PSU redundancy, power feeds and the inlet temperature.", "Update BIOS, iDRAC and firmware to validated versions and follow hardware diagnostics."] } },
        hang: { outcome: { cause: "The server stopped without a bugcheck or a hardware event; a hang or watchdog reset is likely.", fix: ["Enable a complete or kernel dump and configure NMI crash dumps (NMICrashDump) so a hang can be captured from iDRAC.", "Check whether the iDRAC Automated System Recovery (watchdog) timer is enabled.", "Monitor resource use before the next occurrence."] } }
      }
    },
    {
      id: "ws-performance", os: windows, area: "windows-server", reviewed,
      title: "High CPU or memory usage / slow server",
      summary: "Find which resource is saturated and which process or driver is consuming it.",
      sources: [learn("troubleshoot/windows-server/performance/troubleshoot-performance-problems-in-windows"), learn("sysinternals/downloads/process-explorer")],
      start: "resource",
      steps: {
        resource: { prompt: "Which resource is consistently high in Task Manager or Performance Monitor?", commands: ["Get-Counter '\\Processor(_Total)\\% Processor Time','\\Memory\\Available MBytes','\\PhysicalDisk(_Total)\\Avg. Disk sec/Transfer' -SampleInterval 5 -MaxSamples 6"], answers: [{ label: "CPU", next: "cpu" }, { label: "Memory", next: "mem" }, { label: "Disk latency", next: "disk" }] },
        cpu: { prompt: "Is the CPU time used by a user-mode process, or by system / interrupts / DPCs?", commands: ["Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name,Id,CPU"], answers: [{ label: "A specific process", next: "proc" }, { label: "System, interrupts or DPCs", next: "kernel" }] },
        proc: { outcome: { cause: "A specific process is consuming CPU.", fix: ["Identify the process and its threads with Process Explorer.", "Check that application's logs, version and known issues.", "Capture a Windows Performance Recorder (WPR) CPU trace if the cause is not obvious."] } },
        kernel: { outcome: { cause: "Kernel-mode CPU (interrupts or DPCs) points to a driver or firmware problem.", fix: ["Capture a WPR trace with the CPU profile and review DPC/ISR time by driver in Windows Performance Analyzer.", "Update NIC, storage and chipset drivers and firmware to validated versions.", "Check the BIOS power profile (Performance per Watt OS vs. Performance)."] } },
        mem: { prompt: "Is the memory used by a process (private bytes) or by kernel pools?", answers: [{ label: "A process", next: "memproc" }, { label: "Paged or nonpaged pool", next: "pool" }] },
        memproc: { outcome: { cause: "A process is using excessive memory or leaking it.", fix: ["Track the process's Private Bytes over time in Performance Monitor.", "For SQL Server or Hyper-V hosts, confirm the max memory settings leave enough for the OS.", "Collect a process dump with ProcDump when usage is high."] } },
        pool: { outcome: { cause: "A kernel pool leak, usually from a driver.", fix: ["Use PoolMon (Windows Driver Kit) to find the pool tag that is growing.", "Map the tag to its driver (findstr /m /l <tag> C:\\Windows\\System32\\drivers\\*.sys).", "Update or remove the driver that owns the growing tag."] } },
        disk: { outcome: { cause: "Storage latency is limiting performance.", fix: ["Avg. Disk sec/Transfer above about 20 ms is usually a storage bottleneck.", "Use Resource Monitor to find the files and processes driving I/O.", "Check RAID controller health, cache and battery status, and drive errors in the TSR.", "Check SAN or storage fabric latency if the storage is external."] } }
      }
    },
    // ---------------------------------------------------------------- Hyper-V
    {
      id: "hv-vm-wont-start", os: windows, area: "hyperv", reviewed,
      title: "Virtual machine won't start",
      summary: "Resolve the common causes of a Hyper-V VM failing to start: resources, files, permissions and configuration.",
      sources: [learn("troubleshoot/windows-server/virtualization/welcome-virtualization"), ps("hyper-v", "start-vm")],
      start: "error",
      steps: {
        error: { prompt: "What does the start error or the Hyper-V-Worker / Hyper-V-VMMS event log say?", commands: ["Get-WinEvent -LogName Microsoft-Windows-Hyper-V-Worker-Admin,Microsoft-Windows-Hyper-V-VMMS-Admin -MaxEvents 30 | Format-List TimeCreated,Id,Message"], answers: [{ label: "Not enough memory", next: "memory" }, { label: "Access denied / file not found", next: "files" }, { label: "Hypervisor is not running", next: "hypervisor" }, { label: "Something else", next: "config" }] },
        memory: { outcome: { cause: "The host does not have enough free memory for the VM's startup RAM.", fix: ["Check free host memory with Get-VMHostNumaNode or Task Manager.", "Lower the VM's startup memory or enable Dynamic Memory.", "Move or shut down other VMs, or start this VM on another host."] } },
        files: { prompt: "Do the VHDX and configuration files exist at the paths shown by Get-VMHardDiskDrive?", commands: ["Get-VMHardDiskDrive -VMName <vm> | Select-Object Path", "Test-Path <path>"], answers: [{ label: "A file is missing", next: "missing" }, { label: "Files exist", next: "acl" }] },
        missing: { outcome: { cause: "A virtual disk or configuration file has been moved, renamed or deleted.", fix: ["Locate the file (check for renamed .avhdx checkpoint files) and correct the path with Set-VMHardDiskDrive.", "Do not delete .avhdx files. They are part of a checkpoint chain and must be merged in order.", "Restore from backup if the file is gone."] } },
        acl: { outcome: { cause: "The VM's security ID has lost permission on its files, often after a copy or restore.", fix: ["Grant the VM's account access: icacls <path> /grant \"NT VIRTUAL MACHINE\\<VMId>\":(F).", "On SMB storage, confirm the Hyper-V hosts' computer accounts have full control on the share and NTFS.", "Re-attach the disk through Hyper-V Manager, which re-applies permissions."] } },
        hypervisor: { outcome: { cause: "The hypervisor did not start, so no VM can run.", fix: ["Confirm Virtualization Technology and execute disable (VT-x/AMD-V and NX/XD) are enabled in BIOS.", "Check that bcdedit /enum shows hypervisorlaunchtype Auto; if not, run bcdedit /set hypervisorlaunchtype auto and reboot.", "Check the Hyper-V-Hypervisor event log for startup errors."] } },
        config: { outcome: { cause: "The VM configuration conflicts with the host, for example a missing switch, incompatible version or saved state.", fix: ["Check that the VM's network adapter is connected to a switch that exists (Get-VMNetworkAdapter).", "If the VM is in a saved state from a different processor, delete the saved state (Remove-VMSavedState).", "Compare configuration version with Get-VM | Select-Object Name,Version and confirm the host supports it."] } }
      }
    },
    {
      id: "hv-live-migration", os: windows, area: "hyperv", reviewed,
      title: "Live migration fails",
      summary: "Find out why a VM cannot live migrate between Hyper-V hosts or cluster nodes.",
      sources: [learn("windows-server/virtualization/hyper-v/manage/live-migration-overview"), ps("hyper-v", "compare-vm")],
      start: "clustered",
      steps: {
        clustered: { prompt: "Are both hosts in the same failover cluster?", answers: [{ label: "Yes", next: "compat" }, { label: "No, a standalone (shared nothing) migration", next: "auth" }] },
        auth: { prompt: "Does the error mention authentication, Kerberos or 'failed to establish a connection'?", answers: [{ label: "Yes", next: "kerberos" }, { label: "No", next: "compat" }] },
        kerberos: { outcome: { cause: "Live migration authentication is failing between standalone hosts.", fix: ["For Kerberos, configure constrained delegation on each host's computer account for 'Microsoft Virtual System Migration Service' and 'cifs'.", "Or use CredSSP and start the migration while signed in on the source host.", "Confirm Set-VMHost -VirtualMachineMigrationAuthenticationType matches on both hosts."] } },
        compat: { prompt: "Does Compare-VM or the error report processor compatibility problems?", commands: ["Compare-VM -Name <vm> -DestinationHost <host> | Select-Object -ExpandProperty Incompatibilities"], answers: [{ label: "Yes, processor features differ", next: "cpu" }, { label: "Other incompatibilities", next: "incompat" }, { label: "No incompatibilities", next: "network" }] },
        cpu: { outcome: { cause: "The hosts have different processor features.", fix: ["Shut down the VM and enable processor compatibility: Set-VMProcessor <vm> -CompatibilityForMigrationEnabled $true.", "Plan to keep cluster nodes on the same CPU generation."] } },
        incompat: { outcome: { cause: "The destination lacks something the VM needs, such as a virtual switch name or storage path.", fix: ["Make the virtual switch names identical on every host.", "Make sure the VM's storage is reachable from the destination (CSV or SMB share).", "Resolve each item Compare-VM lists, then retry."] } },
        network: { prompt: "Can the hosts reach each other on TCP 6600 over the live migration network?", commands: ["Test-NetConnection <destination> -Port 6600", "Get-VMMigrationNetwork"], answers: [{ label: "No", next: "port" }, { label: "Yes", next: "slow" }] },
        port: { outcome: { cause: "Live migration traffic is blocked or routed over the wrong network.", fix: ["Allow 'Hyper-V (MIG-TCP-In)' through Windows Firewall and any network firewalls.", "Check the live migration networks in Hyper-V settings or the cluster's Live Migration Settings.", "Confirm the destination migration IP addresses are reachable."] } },
        slow: { outcome: { cause: "The migration starts but times out or fails during transfer.", fix: ["Check the Hyper-V-VMMS and cluster logs on both hosts for the exact failure stage.", "Lower the number of simultaneous migrations (Set-VMHost -MaximumVirtualMachineMigrations).", "Check MTU consistency and SMB/RDMA health if the performance option is SMB.", "Generate a cluster log (Get-ClusterLog) covering the attempt for escalation."] } }
      }
    },
    {
      id: "hv-vm-network", os: windows, area: "hyperv", reviewed,
      title: "VM lost network connectivity",
      summary: "Trace a VM's networking from the guest through the virtual switch to the physical network.",
      sources: [ps("hyper-v", "get-vmnetworkadapter"), ps("hyper-v", "get-vmswitch")],
      start: "guest",
      steps: {
        guest: { prompt: "Inside the guest, does the adapter have a valid IP address and can it ping its gateway?", commands: ["ipconfig /all", "Test-NetConnection <gateway>"], answers: [{ label: "No IP / APIPA address (169.254.x.x)", next: "dhcp" }, { label: "Valid IP but gateway unreachable", next: "vswitch" }, { label: "Gateway reachable, other hosts not", next: "routing" }] },
        dhcp: { outcome: { cause: "The guest is not receiving an address from DHCP.", fix: ["Confirm the VM is on the right virtual switch and VLAN (Get-VMNetworkAdapterVlan).", "Check that DHCP Guard is not enabled on a DHCP server VM.", "Check the DHCP server's scope and its relay for that VLAN."] } },
        vswitch: { prompt: "Is the VM adapter connected to the expected virtual switch and VLAN?", commands: ["Get-VMNetworkAdapter -VMName <vm> | Select-Object SwitchName,Status,MacAddress", "Get-VMNetworkAdapterVlan -VMName <vm>"], answers: [{ label: "No, or the switch is wrong", next: "fixswitch" }, { label: "Yes", next: "uplink" }] },
        fixswitch: { outcome: { cause: "The VM adapter is disconnected or on the wrong switch or VLAN.", fix: ["Connect it with Connect-VMNetworkAdapter -VMName <vm> -SwitchName <switch>.", "Set the VLAN with Set-VMNetworkAdapterVlan -Access -VlanId <id>.", "Confirm the physical switch port trunks that VLAN."] } },
        uplink: { prompt: "Is the virtual switch's physical uplink (or team) up and connected?", commands: ["Get-VMSwitch | Select-Object Name,SwitchType,NetAdapterInterfaceDescription", "Get-NetAdapter | Select-Object Name,Status,LinkSpeed"], answers: [{ label: "No, an uplink is down", next: "physical" }, { label: "Yes", next: "mac" }] },
        physical: { outcome: { cause: "The host's physical uplink is down.", fix: ["Check cabling, the switch port and link lights.", "Update the NIC driver and firmware to validated versions.", "Use the NIC Teaming / SET guide if the uplink is a team."] } },
        mac: { outcome: { cause: "The host path looks healthy, so a MAC, VMQ or security setting is likely blocking traffic.", fix: ["Check for duplicate MAC addresses across hosts (each host has its own dynamic MAC range).", "Check whether port security on the physical switch limits the MACs per port.", "As a test, disable VMQ on the VM adapter (Set-VMNetworkAdapter -VmqWeight 0) and see whether traffic recovers."] } },
        routing: { outcome: { cause: "Local connectivity works, so the problem is routing, firewall or name resolution.", fix: ["Run Test-NetConnection to the target and check the route (tracert).", "Check the guest's Windows Firewall profile and rules.", "If names fail but IPs work, use the DNS name resolution guide."] } }
      }
    },
    // ---------------------------------------------------------------- Failover Clustering
    {
      id: "cl-node-down", os: windows, area: "cluster", reviewed,
      title: "Cluster node is down or won't join",
      summary: "Work out why a failover cluster node was removed from membership or cannot rejoin.",
      sources: [ps("failoverclusters", "get-clusterlog"), ps("failoverclusters", "test-cluster")],
      start: "state",
      steps: {
        state: { prompt: "What does Get-ClusterNode report for the node?", commands: ["Get-ClusterNode | Select-Object Name,State,StatusInformation"], answers: [{ label: "Down", next: "service" }, { label: "Paused", next: "paused" }, { label: "Joining / quarantined", next: "quarantine" }] },
        paused: { outcome: { cause: "The node was paused, usually for maintenance or cluster-aware updating.", fix: ["Confirm maintenance is finished.", "Resume it with Resume-ClusterNode <node> -Failback Immediate."] } },
        quarantine: { outcome: { cause: "The node is quarantined after repeatedly leaving the cluster.", fix: ["Find the repeated failures with Get-ClusterLog and the System log (Event 1135, 1177).", "Fix the root cause (usually network), then clear it with Start-ClusterNode -ClearQuarantine."] } },
        service: { prompt: "Is the Cluster Service running on the node?", commands: ["Get-Service ClusSvc"], answers: [{ label: "No, it won't start", next: "svcfail" }, { label: "Yes, but the node is still down", next: "network" }] },
        svcfail: { outcome: { cause: "The cluster service fails to start on the node.", fix: ["Check the System log for FailoverClustering events and the Service Control Manager error.", "Generate the cluster log: Get-ClusterLog -Node <node> -TimeSpan 30.", "Confirm the node's computer account and DNS registration are healthy."] } },
        network: { prompt: "Are there Event ID 1135 (node removed) or 1127/1129 (network) events?", answers: [{ label: "Yes", next: "heartbeat" }, { label: "No", next: "validate" }] },
        heartbeat: { outcome: { cause: "Missed heartbeats over the cluster networks caused the node to be removed.", fix: ["Check every cluster network with Get-ClusterNetwork and Get-ClusterNetworkInterface.", "Check NIC drivers and firmware, switch logs and MTU consistency.", "Look for host-level pauses (for example, backups or high DPC) that could delay heartbeats.", "Only after fixing the cause, consider tuning SameSubnetThreshold."] } },
        validate: { outcome: { cause: "The cause is not clear from events; a full validation is needed.", fix: ["Run Test-Cluster (it is safe to run Network and Inventory tests on a production cluster).", "Generate the cluster log from all nodes for the failure time: Get-ClusterLog -UseLocalTime -TimeSpan 60.", "Run CluChk and attach both reports to the escalation."] } }
      }
    },
    {
      id: "cl-resource-failed", os: windows, area: "cluster", reviewed,
      title: "Cluster role or resource fails to come online",
      summary: "Find the failing resource in a cluster role and the reason it won't come online.",
      sources: [ps("failoverclusters", "get-clusterresource"), ps("failoverclusters", "get-clusterlog")],
      start: "which",
      steps: {
        which: { prompt: "Which resource in the role is failed?", commands: ["Get-ClusterGroup <role> | Get-ClusterResource | Select-Object Name,ResourceType,State"], answers: [{ label: "IP Address", next: "ip" }, { label: "Network Name", next: "name" }, { label: "Disk / storage", next: "disk" }, { label: "Application or VM resource", next: "app" }] },
        ip: { outcome: { cause: "The IP address resource cannot come online.", fix: ["Confirm the address is not in use elsewhere (ping it and check ARP).", "Confirm the address belongs to a cluster network with 'Cluster and Client' role.", "Check that the subnet mask matches the cluster network."] } },
        name: { prompt: "Does the error mention Active Directory, the computer object or DNS?", answers: [{ label: "Active Directory / computer object", next: "cno" }, { label: "DNS", next: "dnsreg" }] },
        cno: { outcome: { cause: "The cluster cannot use or create the computer object for the network name.", fix: ["Confirm the object exists in AD and is enabled.", "Grant the cluster name object (CNO) 'Create Computer objects' on the OU, or pre-stage the VCO and give the CNO full control.", "Repair the object from Failover Cluster Manager (More Actions > Repair)."] } },
        dnsreg: { outcome: { cause: "The network name cannot register in DNS.", fix: ["Check that the cluster can update the DNS record (secure dynamic updates, record owner).", "If the record was created by another account, delete it or grant the CNO full control on it.", "Then bring the network name online again."] } },
        disk: { outcome: { cause: "A cluster disk cannot be brought online.", fix: ["Check that the LUN is presented to all nodes and visible in Disk Management.", "Check for persistent reservation errors in the cluster log.", "Run the Storage tests in Test-Cluster on that disk during a maintenance window (they take the disk offline)."] } },
        app: { outcome: { cause: "The application or VM resource fails after its dependencies are online.", fix: ["Check the resource's dependencies and their order.", "Check the application or Hyper-V event logs on the owner node.", "Try starting it on a different node to see whether the problem is node-specific."] } }
      }
    },
    {
      id: "cl-csv-redirected", os: windows, area: "cluster", reviewed,
      title: "CSV in redirected access or paused",
      summary: "Explain why a Cluster Shared Volume is in redirected I/O, paused or unavailable.",
      sources: [learn("windows-server/failover-clustering/failover-cluster-csvs"), ps("failoverclusters", "get-clustersharedvolumestate")],
      start: "state",
      steps: {
        state: { prompt: "What state and reason does Get-ClusterSharedVolumeState show?", commands: ["Get-ClusterSharedVolumeState | Select-Object Name,Node,StateInfo,FileSystemRedirectedIOReason,BlockRedirectedIOReason"], answers: [{ label: "FileSystemRedirected", next: "fsredirect" }, { label: "BlockRedirected", next: "block" }, { label: "Paused or unavailable", next: "paused" }] },
        fsredirect: { prompt: "Is the reason 'UserRequest', or is a backup running?", answers: [{ label: "Yes", next: "user" }, { label: "No / incompatible filter", next: "filter" }] },
        user: { outcome: { cause: "Redirected mode was turned on manually or by a backup application.", fix: ["Confirm no backup or maintenance is running.", "Turn redirected access off from Failover Cluster Manager or with Resume-ClusterResource / Resume-ClusterSharedVolume."] } },
        filter: { outcome: { cause: "An incompatible file system filter driver (often antivirus or backup) forced redirection.", fix: ["List filter drivers with fltmc instances.", "Check the cluster log for the filter that caused redirection.", "Update or exclude that product, following the vendor's CSV guidance."] } },
        block: { outcome: { cause: "This node has lost direct access to the storage.", fix: ["Check the node's storage paths (MPIO, HBA or iSCSI sessions, SAS cabling).", "Run mpclaim -s -d or Get-MSDSMSupportedHW to confirm the paths.", "Check the storage array for errors on that host's paths."] } },
        paused: { outcome: { cause: "The CSV was paused because of storage or network failures across nodes.", fix: ["Look for Event IDs 5120 and 5142 in the System log.", "Generate the cluster log for the failure time.", "Check storage latency and the cluster networks used for CSV traffic.", "Run CluChk and include the output in the escalation."] } }
      }
    },
    // ---------------------------------------------------------------- Networking
    {
      id: "net-no-connectivity", os: windows, area: "networking", reviewed,
      title: "Host unreachable or no connectivity",
      summary: "Work through the network layers to find where connectivity breaks.",
      sources: [ps("nettcpip", "test-netconnection"), cmd("ipconfig")],
      start: "link",
      steps: {
        link: { prompt: "Is the network adapter up with the expected link speed?", commands: ["Get-NetAdapter | Select-Object Name,Status,LinkSpeed,DriverVersion"], answers: [{ label: "Down or disconnected", next: "physical" }, { label: "Up", next: "ip" }] },
        physical: { outcome: { cause: "There is no physical link.", fix: ["Check the cable, transceiver and switch port status.", "Check that the adapter is enabled in Windows and in the BIOS.", "Update the NIC driver and firmware to validated versions."] } },
        ip: { prompt: "Does ipconfig /all show the correct IP address, mask and gateway?", commands: ["ipconfig /all"], answers: [{ label: "No, or an APIPA (169.254.x.x) address", next: "addressing" }, { label: "Yes", next: "gateway" }] },
        addressing: { outcome: { cause: "The adapter's IP configuration is wrong or DHCP failed.", fix: ["Correct the static settings, or run ipconfig /renew and check the DHCP server.", "Check for an IP conflict (Event ID 4199 in the System log).", "Confirm the switch port's VLAN matches the subnet."] } },
        gateway: { prompt: "Can the host ping its default gateway?", commands: ["Test-NetConnection <gateway>"], answers: [{ label: "No", next: "l2" }, { label: "Yes", next: "remote" }] },
        l2: { outcome: { cause: "Traffic does not reach the local gateway: a VLAN, switch or firewall problem on the local segment.", fix: ["Check the switch port VLAN and that the gateway answers on that VLAN.", "Check arp -a for the gateway's MAC address.", "Test from another host on the same subnet."] } },
        remote: { prompt: "Does Test-NetConnection to the target port succeed?", commands: ["Test-NetConnection <target> -Port <port> -InformationLevel Detailed"], answers: [{ label: "Ping and port both fail", next: "route" }, { label: "Ping works, the port fails", next: "firewall" }, { label: "Works by IP, fails by name", next: "dns" }] },
        route: { outcome: { cause: "Routing to the destination network is broken.", fix: ["Run tracert to see where packets stop.", "Check the route table with route print or Get-NetRoute.", "Engage the network team with the trace output."] } },
        firewall: { outcome: { cause: "A firewall is blocking the port, or the service is not listening.", fix: ["Run netstat -ano on the target to confirm it is listening on the port.", "Check Windows Firewall rules (Get-NetFirewallRule) and any network firewalls in the path."] } },
        dns: { outcome: { cause: "Connectivity is fine; name resolution is failing.", fix: ["Use the DNS 'Name resolution fails' guide."] } }
      }
    },
    {
      id: "net-teaming-set", os: windows, area: "networking", reviewed,
      title: "NIC Teaming or Switch Embedded Teaming (SET) problems",
      summary: "Troubleshoot degraded teams, failover problems and SET configuration issues.",
      sources: [learn("windows-server/virtualization/hyper-v-virtual-switch/rdma-and-switch-embedded-teaming"), ps("netlbfo", "get-netlbfoteam")],
      start: "type",
      steps: {
        type: { prompt: "Which teaming technology is in use?", commands: ["Get-NetLbfoTeam", "Get-VMSwitchTeam"], answers: [{ label: "LBFO (NIC Teaming)", next: "lbfo" }, { label: "SET (Switch Embedded Teaming)", next: "set" }] },
        lbfo: { prompt: "Is the team status Degraded or Down?", commands: ["Get-NetLbfoTeamMember | Select-Object Name,Team,OperationalStatus,FailureReason"], answers: [{ label: "Yes", next: "member" }, { label: "No, but traffic is unstable", next: "mode" }] },
        member: { outcome: { cause: "One or more team members has failed.", fix: ["Read FailureReason for each member.", "Check the link, cable and switch port of the failed member.", "For LACP teams, confirm the switch port channel is configured and up."] } },
        mode: { outcome: { cause: "The teaming mode or load balancing doesn't match the switch configuration.", fix: ["Switch Independent mode needs no switch configuration; LACP and Static need a matching port channel.", "Use the Dynamic load balancing algorithm unless there's a reason not to.", "Creating a Hyper-V virtual switch on an LBFO team is blocked starting in Windows Server 2022; use SET instead."] } },
        set: { prompt: "Are all SET member adapters identical (same model, driver and speed)?", commands: ["Get-NetAdapter -Name (Get-VMSwitchTeam).NetAdapterInterfaceDescription | Select-Object Name,InterfaceDescription,DriverVersion,LinkSpeed"], answers: [{ label: "No", next: "symmetric" }, { label: "Yes", next: "rdma" }] },
        symmetric: { outcome: { cause: "SET requires identical member adapters.", fix: ["Use the same NIC model, firmware, driver and link speed for every member.", "Rebuild the SET switch with matching adapters."] } },
        rdma: { outcome: { cause: "The team members match; check load balancing and RDMA mapping.", fix: ["Check the load balancing algorithm (Hyper-V Port or Dynamic) with Get-VMSwitchTeam.", "For RDMA, map each host vNIC to a physical adapter with Set-VMNetworkAdapterTeamMapping.", "Confirm DCB/PFC settings match on the host and the switch if RoCE is used."] } }
      }
    },
    {
      id: "net-smb-slow", os: windows, area: "networking", reviewed,
      title: "Slow SMB file copy or RDMA throughput",
      summary: "Find out why SMB or storage traffic is slower than the network should allow.",
      sources: [ps("smbshare", "get-smbmultichannelconnection"), ps("netadapter", "get-netadapterrdma")],
      start: "local",
      steps: {
        local: { prompt: "Is a local copy on the source and destination disks fast?", answers: [{ label: "No, local disk is also slow", next: "storage" }, { label: "Yes, only network copies are slow", next: "multichannel" }] },
        storage: { outcome: { cause: "The disk, not the network, is the bottleneck.", fix: ["Use the high CPU / memory / disk performance guide.", "Check controller cache and drive health."] } },
        multichannel: { prompt: "Does Get-SmbMultichannelConnection show the expected interfaces?", commands: ["Get-SmbMultichannelConnection", "Get-SmbClientNetworkInterface"], answers: [{ label: "No, or only one slow path", next: "paths" }, { label: "Yes", next: "rdmacheck" }] },
        paths: { outcome: { cause: "SMB is not using the expected fast interfaces.", fix: ["Confirm both ends' fast NICs are on matching subnets.", "Check for SMB Multichannel constraints (Get-SmbMultichannelConstraint).", "Make sure the fast interfaces have the higher link speed and are not disabled for SMB."] } },
        rdmacheck: { prompt: "Is RDMA expected, and is it enabled and operational?", commands: ["Get-NetAdapterRdma", "Get-SmbClientNetworkInterface | Where-Object RdmaCapable"], answers: [{ label: "RDMA is not working", next: "rdma" }, { label: "RDMA is working or not used", next: "tuning" }] },
        rdma: { outcome: { cause: "RDMA is not operational, so SMB Direct falls back to TCP.", fix: ["Enable RDMA on the adapter (Enable-NetAdapterRdma).", "For RoCE, confirm DCB, PFC and ETS settings match on the host and every switch.", "For iWARP, confirm firewall rules allow TCP 5445.", "Check RDMA counters for errors in Performance Monitor."] } },
        tuning: { outcome: { cause: "The paths are correct; remaining limits are usually tuning, MTU or signing/encryption overhead.", fix: ["Confirm a consistent MTU end to end (ping -f -l 8972 for jumbo frames).", "Check whether SMB signing or encryption is required and its CPU cost.", "Update NIC drivers and firmware and check RSS settings (Get-NetAdapterRss)."] } }
      }
    },
    // ---------------------------------------------------------------- Active Directory
    {
      id: "ad-replication", os: windows, area: "ad", reviewed,
      title: "Active Directory replication failures",
      summary: "Identify failing replication partners and fix the most common error causes.",
      sources: [cmd("repadmin"), cmd("dcdiag")],
      start: "summary",
      steps: {
        summary: { prompt: "Does repadmin /replsummary show failures?", commands: ["repadmin /replsummary", "repadmin /showrepl * /csv > showrepl.csv"], answers: [{ label: "Yes", next: "error" }, { label: "No, but changes are slow to appear", next: "latency" }] },
        latency: { outcome: { cause: "Replication succeeds but the schedule or topology causes delays.", fix: ["Check site link schedules and replication intervals in AD Sites and Services.", "Force replication with repadmin /syncall /AdeP to test.", "Confirm each site has a working inter-site topology generator (ISTG)."] } },
        error: { prompt: "Which error is reported most often?", answers: [{ label: "1722 RPC server unavailable", next: "rpc" }, { label: "8524 DNS lookup failure", next: "dns" }, { label: "-2146893022 target principal name is incorrect", next: "spn" }, { label: "8614 tombstone lifetime exceeded", next: "tombstone" }] },
        rpc: { outcome: { cause: "The source DC cannot be reached over RPC.", fix: ["Test TCP 135 and the dynamic RPC range (49152-65535) to the partner with Test-NetConnection.", "Confirm the partner DC is running and its Netlogon and NTDS services are started.", "Check firewalls between sites."] } },
        dns: { outcome: { cause: "The DC cannot resolve its partner's CNAME (<DSA GUID>._msdcs.<forest>).", fix: ["Check that each DC points to working DNS servers (not to public resolvers).", "Run dcdiag /test:dns /v.", "Re-register records with ipconfig /registerdns and restart Netlogon on the partner."] } },
        spn: { outcome: { cause: "Kerberos authentication between DCs fails, often due to a stale computer password or time skew.", fix: ["Check time sync on both DCs with w32tm /monitor.", "Reset the DC's secure channel with netdom resetpwd /server:<pdc> /userd:<domain\\admin> /passwordd:*.", "Purge tickets with klist purge and retry replication."] } },
        tombstone: { outcome: { cause: "A DC has not replicated for longer than the tombstone lifetime and is blocked to prevent lingering objects.", fix: ["Do not enable Allow Replication With Divergent and Corrupt Partner as a quick fix.", "Remove lingering objects with repadmin /removelingeringobjects, or demote and rebuild the stale DC.", "Engage a senior engineer before forcing replication."] } }
      }
    },
    {
      id: "ad-authentication", os: windows, area: "ad", reviewed,
      title: "Trust relationship or Kerberos authentication failures",
      summary: "Fix 'trust relationship between this workstation and the primary domain failed' and Kerberos errors.",
      sources: [learn("powershell/module/microsoft.powershell.management/test-computersecurechannel?view=powershell-5.1"), learn("windows-server/networking/windows-time-service/windows-time-service-tools-and-settings")],
      start: "symptom",
      steps: {
        symptom: { prompt: "What does the user or system see?", answers: [{ label: "Trust relationship failed", next: "secure" }, { label: "Kerberos errors / access denied", next: "time" }, { label: "Account locked out", next: "lockout" }] },
        secure: { prompt: "Does Test-ComputerSecureChannel return False?", commands: ["Test-ComputerSecureChannel -Verbose"], answers: [{ label: "False", next: "repair" }, { label: "True", next: "time" }] },
        repair: { outcome: { cause: "The computer's machine account password is out of sync with the domain.", fix: ["Sign in with a local administrator account.", "Run Test-ComputerSecureChannel -Repair -Credential <domain\\admin>.", "If that fails, reset the account and rejoin the domain.", "For restored VMs, avoid reverting machines to old snapshots."] } },
        time: { prompt: "Is the clock more than 5 minutes off from a domain controller?", commands: ["w32tm /stripchart /computer:<dc> /samples:5 /dataonly", "w32tm /query /source"], answers: [{ label: "Yes", next: "skew" }, { label: "No", next: "spn" }] },
        skew: { outcome: { cause: "Time skew beyond the Kerberos tolerance (5 minutes by default) breaks authentication.", fix: ["Make the PDC emulator sync from a reliable external source.", "Make every other domain member use the domain hierarchy (w32tm /config /syncfromflags:domhier /update).", "On Hyper-V VMs that are domain controllers, disable the time sync integration service's host time provider."] } },
        spn: { outcome: { cause: "A duplicate or missing service principal name (SPN) breaks Kerberos for the service.", fix: ["Find duplicate SPNs with setspn -X.", "Check the service's SPN with setspn -L <account>.", "Run klist to inspect the client's tickets, then klist purge and retry."] } },
        lockout: { outcome: { cause: "Repeated bad passwords lock the account out, often from a stale saved credential.", fix: ["Find the source in Event ID 4740 on the PDC emulator (Caller Computer Name).", "Look for old credentials in mapped drives, services, scheduled tasks and mobile devices.", "Unlock the account after removing the stale credential."] } }
      }
    },
    {
      id: "ad-gpo", os: windows, area: "ad", reviewed,
      title: "Group Policy not applying",
      summary: "Find out why a computer or user isn't receiving an expected Group Policy setting.",
      sources: [cmd("gpresult"), cmd("gpupdate")],
      start: "result",
      steps: {
        result: { prompt: "Does gpresult show the GPO as applied?", commands: ["gpupdate /force", "gpresult /h C:\\Temp\\gp.html"], answers: [{ label: "Not listed at all", next: "scope" }, { label: "Listed as denied or filtered", next: "filter" }, { label: "Applied, but the setting has no effect", next: "conflict" }] },
        scope: { prompt: "Is the GPO linked to the OU (or site/domain) that contains the object?", answers: [{ label: "No", next: "link" }, { label: "Yes", next: "sysvol" }] },
        link: { outcome: { cause: "The GPO is not linked where the computer or user lives.", fix: ["Link the GPO to the correct OU.", "Remember computer settings follow the computer's OU, and user settings follow the user's OU (unless loopback is used)."] } },
        sysvol: { outcome: { cause: "The client cannot read the GPO, often due to SYSVOL replication or connectivity.", fix: ["Check the Group Policy operational log (Event IDs 1058 and 1030).", "Confirm the client can reach \\\\<domain>\\SYSVOL.", "Check DFSR replication health for SYSVOL on the domain controllers."] } },
        filter: { outcome: { cause: "Security filtering or WMI filtering excludes the object.", fix: ["Confirm Authenticated Users (or the target group) has Read on the GPO; Domain Computers needs Read for user policies.", "Check whether a WMI filter evaluates to false on that computer.", "Re-run gpresult after fixing."] } },
        conflict: { outcome: { cause: "A higher-precedence GPO or local setting overrides this one.", fix: ["Check the winning GPO for that setting in the gpresult report.", "Review link order, Enforced and Block Inheritance.", "Check for preferences or applications that overwrite the setting after policy applies."] } }
      }
    },
    // ---------------------------------------------------------------- DNS
    {
      id: "dns-resolution", os: windows, area: "dns", reviewed,
      title: "Name resolution fails",
      summary: "Find out whether a name lookup fails at the client, the DNS server, or because of the record itself.",
      sources: [learn("windows-server/networking/dns/troubleshoot/troubleshoot-dns-clients"), ps("dnsclient", "resolve-dnsname")],
      start: "server",
      steps: {
        server: { prompt: "Does the name resolve when you query the DNS server directly?", commands: ["Resolve-DnsName <name> -Server <dns server> -DnsOnly"], answers: [{ label: "Yes", next: "client" }, { label: "No", next: "record" }] },
        client: { prompt: "Is the client configured to use that DNS server?", commands: ["Get-DnsClientServerAddress", "ipconfig /displaydns"], answers: [{ label: "No", next: "clientcfg" }, { label: "Yes", next: "cache" }] },
        clientcfg: { outcome: { cause: "The client uses the wrong DNS servers.", fix: ["Point domain members only at internal DNS servers.", "Update the DHCP scope options or static settings.", "Do not add public resolvers as secondary DNS on domain members."] } },
        cache: { outcome: { cause: "A stale cache or hosts file entry overrides the correct answer.", fix: ["Clear the cache with ipconfig /flushdns (or Clear-DnsClientCache).", "Check C:\\Windows\\System32\\drivers\\etc\\hosts.", "Check the suffix search list if short names fail but FQDNs work."] } },
        record: { prompt: "Is the DNS server authoritative for the zone?", commands: ["Get-DnsServerZone"], answers: [{ label: "Yes", next: "missing" }, { label: "No, it forwards or uses root hints", next: "forward" }] },
        missing: { outcome: { cause: "The record is missing or wrong in the zone.", fix: ["Check the record in DNS Manager or with Get-DnsServerResourceRecord.", "If it should register dynamically, use the dynamic registration guide.", "Check whether scavenging removed it."] } },
        forward: { outcome: { cause: "The server cannot resolve names it isn't authoritative for.", fix: ["Use the forwarders / zone transfer guide."] } }
      }
    },
    {
      id: "dns-registration", os: windows, area: "dns", reviewed,
      title: "Dynamic DNS registration fails",
      summary: "Fix clients or servers that don't register or update their DNS records.",
      sources: [learn("windows-server/networking/dns/troubleshoot/troubleshoot-dns-servers"), cmd("ipconfig")],
      start: "register",
      steps: {
        register: { prompt: "Does ipconfig /registerdns log an error in the System log (DNS Client Events)?", commands: ["ipconfig /registerdns", "Get-WinEvent -LogName System -MaxEvents 50 | Where-Object ProviderName -like '*DNS*'"], answers: [{ label: "Yes, an error appears", next: "secure" }, { label: "No error, but the record is still missing or wrong", next: "adapter" }] },
        secure: { prompt: "Does the zone allow only secure dynamic updates?", commands: ["Get-DnsServerZone <zone> | Select-Object ZoneName,DynamicUpdate"], answers: [{ label: "Yes, Secure only", next: "owner" }, { label: "None (dynamic updates disabled)", next: "disabled" }] },
        owner: { outcome: { cause: "The existing record is owned by another account, so the secure update is rejected.", fix: ["Check the record's security tab for its owner.", "Delete the stale record and let the client re-register, or grant the computer account write access.", "If DHCP registers on behalf of clients, configure DHCP name protection and DNS update credentials."] } },
        disabled: { outcome: { cause: "Dynamic updates are disabled on the zone.", fix: ["Set the zone to Secure only (for AD-integrated zones): Set-DnsServerPrimaryZone -Name <zone> -DynamicUpdate Secure.", "Or create the record manually if dynamic updates must stay off."] } },
        adapter: { outcome: { cause: "The adapter is not set to register, or the wrong suffix is used.", fix: ["Check 'Register this connection's addresses in DNS' on the adapter (Get-DnsClient).", "Confirm the primary DNS suffix matches the zone.", "Check whether scavenging removed the record before refresh."] } }
      }
    },
    {
      id: "dns-forwarders", os: windows, area: "dns", reviewed,
      title: "Forwarder, external resolution or zone transfer issues",
      summary: "Fix DNS servers that can't resolve external names or replicate secondary zones.",
      sources: [ps("dnsserver", "get-dnsserverforwarder"), learn("windows-server/networking/dns/troubleshoot/troubleshoot-dns-servers")],
      start: "type",
      steps: {
        type: { prompt: "Which symptom do you see?", answers: [{ label: "External names fail", next: "forwarder" }, { label: "Secondary zone doesn't update", next: "transfer" }] },
        forwarder: { prompt: "Do the configured forwarders answer directly?", commands: ["Get-DnsServerForwarder", "Resolve-DnsName microsoft.com -Server <forwarder> -DnsOnly"], answers: [{ label: "No", next: "fwdreach" }, { label: "Yes", next: "conditional" }] },
        fwdreach: { outcome: { cause: "The forwarders are unreachable or failing.", fix: ["Check UDP/TCP 53 outbound through the firewall.", "Replace dead forwarders, or rely on root hints if allowed.", "Clear the server cache (Clear-DnsServerCache) after fixing."] } },
        conditional: { outcome: { cause: "Forwarders work, so a conditional forwarder, stub zone or cached failure is likely involved.", fix: ["Check conditional forwarders for the failing domain.", "Clear the server cache (Clear-DnsServerCache).", "Enable DNS analytic logging to trace the query path."] } },
        transfer: { prompt: "Does the primary allow transfers to the secondary server?", commands: ["Get-DnsServerZoneTransferPolicy", "Get-DnsServerZone <zone> | Select-Object ZoneName,SecureSecondaries,SecondaryServers"], answers: [{ label: "No", next: "allow" }, { label: "Yes", next: "tcp53" }] },
        allow: { outcome: { cause: "The primary does not allow transfers to that server.", fix: ["Add the secondary under Zone Transfers on the primary (Set-DnsServerPrimaryZone -SecureSecondaries TransferToSecureServers -SecondaryServers <ip>).", "Optionally configure notification so the secondary updates promptly."] } },
        tcp53: { outcome: { cause: "Transfers are allowed but the connection or serial number is the problem.", fix: ["Check that TCP 53 is open between the servers.", "Compare the SOA serial numbers on both servers.", "Trigger a transfer from the secondary with Start-DnsServerZoneTransfer -Name <zone> -FullTransfer."] } }
      }
    }
  ];
  workflows.forEach(workflow => core.register(workflow));
})(typeof module !== "undefined" ? require("./troubleshoot-core.js") : TroubleshootCore);
