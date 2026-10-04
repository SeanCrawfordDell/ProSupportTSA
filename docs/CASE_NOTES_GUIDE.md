# Case Notes: saving, recovery, and exports

## Sample case and guided tour

**Training → Load Example** adds a sample case to Recent cases: a PowerEdge R750 Hyper-V host whose virtual machines lose network connectivity after a NIC driver update. It has three dated notes on three different days (initial contact, log review, and verification), every case detail, a completed evidence checklist and verification, a screenshot, a follow-up, customer update and handoff drafts, and a knowledge draft. It scores 100 on the note quality check. Your other cases are not changed. Loading it again asks before resetting the sample; archive or delete it like any other case.

**Training → Tutorial Demo** walks through every area of Case Notes using the sample case, adding it first if needed. When the tour ends, the case you had open is selected again.

## Dated notes within a case

Use **+ New Case** for a different service request. For another day of work on the same request, use **+ New note** in the Notes heading beside **Pop out**. Each entry has its own notes and action plan, while case details, screenshots, workflow context, and total time remain shared.

Date tabs use the entry's creation date in your local timezone. Multiple entries on the same day include a time and entry number. Editing an old entry does not change its creation date. Switching entries saves current work first. A failed save leaves the current entry and its edits in place.

**Case Summary** shows the shared case details once, followed by all dated notes and action plans from oldest to newest. Each dated section can be collapsed. This is a formatted review of the recorded content, not an AI-generated summary. Select a date tab to resume editing.

Copy to Lightning, HTML email, print/PDF, escalation handoff, and AI review include the complete dated history. The Pop out window retains the date tabs and Case Summary. An in-progress screenshot paste or AI reply remains tied to its source entry.

Existing notes migrate intact into one entry using the original case creation date. Previously combined notes are not automatically split into inferred days. History backups now use version 3 and preserve all entries, screenshots, and the selected entry. Versions 1 and 2 remain importable. Older copies of the app cannot open version 3 backups, so use the current app for restore.

## Saving and backups

Notes autosave in this browser every ten seconds. Open the gear-icon **Settings** menu in the top bar and choose **Backup & Restore** for history backups, settings backups, restore options, and cleanup. The dialog header shows how many snapshots the folder holds, their total size, and the retention setting. Choose **Set Backup Folder** to select an approved location, preferably a work OneDrive-synced Documents folder. The app creates `ProSupportToolsBackup` there (or uses that folder if selected directly). The same folder button becomes **Reconnect Backup Folder** when permission is needed, or **Change Backup Folder** when connected.

Once access is approved, changed notes and settings are backed up approximately every minute while Case Notes is open. Browser background throttling can delay this; it is not a background service. **Backup Case History** saves immediately. The status shows the last successful folder backup. When a saved folder only needs re-approval after the browser restarts, your next click anywhere on the page asks the browser for access; **Reconnect Backup Folder** does the same. Browsers without folder access can download history and settings instead.

When backups are not configured, an inline banner at the top of the page offers **Configure Backups** and warns that resetting your browser or deleting browser data will erase all of the app's settings and notes history. **Remind me in a week** repeats that warning and asks you to confirm before hiding the banner for seven days.

### What the backup folder contains

- `case-history.json` is the latest complete history. It is refreshed on every automatic backup and is what **Restore History → From backup folder** lists first.
- `case-history-YYYY-MM-DD_HHMMSS.json` are hourly snapshots in your local time. During active work, at most one is written per hour.
- `case-history-manual-…json` are created by **Backup Case History**. They are never removed by cleanup.
- `case-history-before-restore-…`, `…before-field-removal-…`, `…before-field-reset-…`, and `…before-delete-…` are safety copies written automatically just before an action that cannot be undone. They are never removed by cleanup.
- `customer-config.json` is the latest settings file; `customer-config-…json` dated copies are written only when settings actually change, or by **Backup Site Configuration**.
- `images/` holds every screenshot once, named by its content hash. Snapshots reference these files instead of embedding the image, which keeps hourly snapshots small. Screenshots are removed from `images/` only when no remaining snapshot references them.

Because snapshots in the folder reference `images/`, restore them with **From backup folder** or keep the whole `ProSupportToolsBackup` folder together when copying to another computer. Downloaded backups (no folder connected) still embed screenshots and are self-contained.

### Cleanup and retention

**Keep snapshots** in the Backup folder section chooses 7, 30, or 90 days, or **Forever**. Automatic snapshots are thinned to every snapshot from the last 24 hours, one per day for up to 30 days, then one per week to the retention limit. Manual backups, safety copies, the latest files, and anything the app did not create are always kept, and the newest automatic snapshot is never removed. Snapshots written by earlier versions of the app (UTC file names) are included in cleanup.

Automatic cleanup is off until you run **Clean Up Old Snapshots** once or change the retention setting. Until then, the status reports how much could be removed after each hourly snapshot. **Clean Up Old Snapshots** shows how many files and how much space would be removed before anything happens. After that, cleanup runs on its own after each hourly snapshot. OneDrive keeps removed files in its recycle bin, which gives an extra safety net.

Folder backups contain customer information and are not encrypted by this app: use an approved protected location and follow your organization's retention policy. OneDrive synchronizes the folder independently; the app cannot confirm cloud upload completion.

## Recovery and retention

- **Recent cases** holds up to 100 cases. Older unpinned cases move to **Archive** instead of being discarded. If every case is pinned, the oldest case must still move to Archive to retain the 100-case working limit.
- **Archive** preserves case contents and screenshots; **Restore** brings a case back into the workspace.
- Deleting a case moves it to **Trash**. It remains recoverable until explicitly permanently deleted.
- **Version History** keeps up to ten previous saved content versions per case. Preview before restoring; restoring also retains the current content as a version. These are saved snapshots, not a record of every keystroke.
- Archive, Trash, and versions share browser storage. They do not provide unlimited capacity. Export backups regularly, especially when using screenshots. Clearing site data removes all browser-local collections.

## Finding and organizing cases

Use **+ New Note** beneath **Case Workspace** to start another case. When no case
is open, use **Start New Note** in the empty workspace.

Search includes case fields, note content, next steps, custom fields, and support-toolkit text. Matching excerpts appear in results. Search applies to the selected collection and follow-up filter. Pin important recent cases; pinned cases appear first. Sort the rest by creation time, last edit, or follow-up due date.

## Restoring settings and notes

**Backup Site Configuration** saves `customer-config.json` and a dated `customer-config-manual-…json` copy directly to your configured `ProSupportToolsBackup` folder. Without a connected folder, it downloads the settings file instead. If folder access is denied or a write fails, the status explains the failure so you can reconnect and retry; it does not silently download elsewhere. Settings backups do not change your case-note backup files or the last successful full-backup time.

Settings include field configuration, toolbox URLs/order/colors/launcher icon/size/icon size/circle/animation, custom AI prompts, personal and edited built-in troubleshooting templates, theme, floating-panel preference, collapsed sections/history, pinned site resources, and the backup retention choice. They do not include browser folder permissions or the temporary dragged position of the toolbox.

**Restore Settings** offers two sources: **From backup folder** reads `customer-config.json` from the connected folder, and **Choose a file** accepts a downloaded or dated settings file. Imports are validated before applying; a confirmation explains that existing preferences will change. Older field/toolbox-only settings backups are supported.

**Restore History** offers two sources. **From backup folder** lists every snapshot in `ProSupportToolsBackup`, newest first, with its time, type (latest, hourly, manual, or safety copy), and size; select one to restore it. **Choose a file** accepts a downloaded backup or a file from another computer. Either way you confirm before the complete current history is replaced, including Archive, Trash, and versions. When a backup folder is connected, a `case-history-before-restore-…` safety copy of your current history is written first. Settings are restored separately. Previously created individual-case JSON exports remain importable, replacing only a matching case ID after confirmation.

## Custom fields

Open the gear-icon **Settings** menu to the right of the sun/moon theme toggle
in the top bar and choose **Customize Fields**. The theme icon switches between
light and dark mode; its tooltip and accessible label identify the next mode.

New field labels support up to 120 characters. Older backups with longer labels remain restorable. Removing a field or resetting custom fields removes its values from recent cases, Archive, Trash, and saved versions after confirmation. When a backup folder is connected, a safety copy of the history is saved first. Previously exported backup files are not changed. Both plain-text and HTML email exports include custom fields.

## Personal troubleshooting templates

Use **Manage templates** beside the issue dropdown to create a template or edit an existing one. Set a name, note text/prompts, and optional next steps. These fields accept plain text and line breaks, not HTML. **Save template** makes it available in the dropdown immediately and after reopening the browser.

Built-in templates can be renamed and edited; **Reset to default** restores their original name and content. Personal templates can be deleted after confirmation. Neither editing nor deleting a template changes existing case notes. If a case references a template that is no longer available, choose another template or restore settings before applying it.

Selecting a template does not insert text. **Apply template** appends its notes and next steps, preserving existing notes and screenshots. Template customizations are personal to this browser and included in **Backup Settings**, full folder backups, and **Restore Settings**. Older settings files without template data leave current customizations unchanged.

## Troubleshooting guides

Choose **Tools → Troubleshooting Guides** in the top bar for step-by-step guides for Windows Server, Hyper-V, Failover Clustering, Networking, Active Directory and DNS. It opens on the area that matches the case's issue type. Answer one question at a time; each guide ends with a likely cause, recommended actions and Microsoft Learn references. Tools also contains Tools Hub, ISG Tools Catalog, and Microsoft Support Tools.

**Copy summary** copies the questions, your answers and the outcome. **Send to Case Notes** returns to Case Notes, where a banner offers **Add to case** (appended to the Troubleshooting notes of the open case) or **Dismiss**. Unused results expire after 24 hours. Guides are a starting point; check each step against the linked documentation and case evidence.

## Sharing and printing

**Print / PDF** opens the browser print dialog. Choose Save as PDF if available.

Review customer information before sharing exports or copying notes into AI tools.

## Keyboard access

Use Tab and Shift+Tab to move among controls and Enter/Space to activate buttons. **Alt+Shift+F** opens the history panel and focuses search. Focus the toolbox launcher and use **Alt+Arrow keys** to move it. **Edit toolbox** lets you choose the launcher icon (toolbox, dancing paperclips, wizards, T-rex), resize the button from 40 to 120 px, size the icon from 40% to 140% of the button, hide the background circle, and turn the icon animation off; animation also stops when your system asks for reduced motion. Escape closes its menu. Field ordering has Move up/Move down buttons as an alternative to dragging. Screenshot resize handles support arrow keys.
# Optional Devin CLI connection

On your first full Case Notes visit, an introduction explains optional Devin
connectivity. Choose **Continue with Copy to AI** to skip setup, or **Set up
Devin** to connect it. You can reopen the instructions through **AI Settings**.

Direct connection needs native Windows Devin CLI, a signed-in account, Node.js
22+, and the small Windows connection. In AI Settings select **Copy connection
command** and paste it into PowerShell. It automatically fetches and starts the
connection; no ZIP or manual script download is required. Keep the window open.
Review the linked source and follow your organization's policy for downloaded
code. Paste its pairing token in AI
Settings and choose Connect Devin. See [the companion guide](companion/README.md)
for setup and troubleshooting, including browser local-network permission.

**Copy to AI** continues to copy the selected prompt and current case details
without the companion. **Send to Devin** shows that same prompt for review
before submission. Suggestions appear for review; **Append to Notes** requires
an explicit click and affects only the original, selected, editable case.
Neither AI action automatically stops your timer or replaces your notes.
