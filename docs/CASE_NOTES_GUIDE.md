# Case Notes: saving, recovery, and exports

## Sample case and guided tour

**Training → Load Example** adds a sample case to Recent cases: a PowerEdge R750 Hyper-V host whose virtual machines lose network connectivity after a NIC driver update. It has three dated notes on three different days (initial contact, log review, and verification), every case detail, a completed evidence checklist and verification, a screenshot, a follow-up, customer update and handoff drafts, and a knowledge draft. It scores 100 on the note quality check. Your other cases are not changed. Loading it again asks before resetting the sample; archive or delete it like any other case.

**Training → Tutorial Demo** walks through every area of Case Notes using the sample case, adding it first if needed, including the Grid/List case view, follow-up colors and Mark follow-up done, Unlock layout, and Customize Site Options. When the tour ends, the case you had open is selected again.

## Dated notes within a case

Use **+ New Case** for a different service request. For another day of work on the same request, use **+ New note** in the Notes heading beside **Pop out**. Each entry has its own notes and action plan, while case details, screenshots, workflow context, and total time remain shared.

Date tabs use the entry's creation date in your local timezone. Multiple entries on the same day include a time and entry number. Editing an old entry does not change its creation date. Switching entries saves current work first. A failed save leaves the current entry and its edits in place.

**Case Summary** shows the shared case details once, followed by all dated notes and action plans from oldest to newest. Each dated section can be collapsed. This is a formatted review of the recorded content, not an AI-generated summary. Select a date tab to resume editing.

Copy to Lightning, HTML email, print/PDF, escalation handoff, and AI review include the complete dated history. The Pop out window retains the date tabs and Case Summary. An in-progress screenshot paste or AI reply remains tied to its source entry.

Existing notes migrate intact into one entry using the original case creation date. Previously combined notes are not automatically split into inferred days. History backups now use version 3 and preserve all entries, screenshots, and the selected entry. Versions 1 and 2 remain importable. Older copies of the app cannot open version 3 backups, so use the current app for restore.

## Saving and backups

Notes autosave in this browser every ten seconds. For a second copy, open the gear-icon **Settings** menu and choose **Backup & Restore**, then **Choose Backup Folder** (a work OneDrive folder is ideal). Case Notes then backs up automatically a few seconds after each change, keeps an hourly snapshot, and cleans up old snapshots on a schedule you choose (7, 30, 90 days, or never). **Restore…** lists every backup in plain language, each with **Restore** and **Delete**; **Delete All Backups** and **Start Fresh** are under *Delete backups or start fresh*. Manual backups and safety copies made before risky actions are never removed automatically.

Full instructions, the folder layout, retention rules and troubleshooting are in **[BACKUP_GUIDE.md](BACKUP_GUIDE.md)**.

Folder backups contain customer information and are not encrypted by this app: use an approved protected location and follow your organization's retention policy.

## Recovery and retention

- **Recent cases** holds up to 100 cases. Older unpinned cases move to **Archive** instead of being discarded. If every case is pinned, the oldest case must still move to Archive to retain the 100-case working limit.
- **Archive** preserves case contents and screenshots; **Restore** brings a case back into the workspace.
- Deleting a case moves it to **Trash**. It remains recoverable until explicitly permanently deleted.
- **Version History** keeps up to ten previous saved content versions per case. Preview before restoring; restoring also retains the current content as a version. These are saved snapshots, not a record of every keystroke.
- Archive, Trash, and versions share browser storage. They do not provide unlimited capacity. Export backups regularly, especially when using screenshots. Clearing site data removes all browser-local collections.

## Finding and organizing cases

Use **+ New Note** beneath **Case Workspace** to start another case. When no case
is open, use **Start New Note** in the empty workspace.

Search includes case fields, note content, next steps, custom fields, and support-toolkit text. Matching excerpts appear in results. Search applies to the selected collection and follow-up filter. Pin important recent cases; pinned cases appear first. Sort the rest by creation time, last edit, or follow-up due date. Use **Grid** and **List** under the Recent cases heading to switch between the full case cards (the default) and a compact list that shows only case titles; pin, archive and delete are on the cards in Grid view. The choice is remembered and included in settings backups.

## Restoring settings and notes

Use **Backup & Restore → Restore…** and choose the **Case history** or **Settings** tab. Pick a backup, confirm, and the current data is saved as a safety copy first. **Restore from a file…** accepts a downloaded backup or a file from another computer; imports are validated before anything changes. Settings include field configuration, toolbox URLs/order/colors/launcher icon, custom AI prompts, theme, floating-panel preference, collapsed sections/history, pinned site resources, and the backup retention choice. They do not include browser folder permissions. Case-history restores replace the complete history, including Archive, Trash, and versions. Previously created individual-case JSON exports remain importable, replacing only a matching case ID after confirmation. See [BACKUP_GUIDE.md](BACKUP_GUIDE.md).

## Custom fields

Open the gear-icon **Settings** menu to the right of the sun/moon theme toggle
in the top bar and choose **Customize Site Options**. The theme icon switches between
light and dark mode; its tooltip and accessible label identify the next mode.

New field labels support up to 120 characters. Older backups with longer labels remain restorable. Removing a field or resetting custom fields removes its values from recent cases, Archive, Trash, and saved versions after confirmation. When a backup folder is connected, a safety copy of the history is saved first. Previously exported backup files are not changed. Both plain-text and HTML email exports include custom fields.

### Hiding fields

In **Customize Site Options**, choose **Hide** beside a Case Details field, then **Save Configuration**. You can also choose **Unlock layout**: every field gets a **Show** checkbox, hidden fields reappear dimmed so they can be brought back, and **Done** saves the order and the hidden fields together (**Cancel** reverts both). The first time you hide a field, a one-time notice explains that the fields follow case-notes best practices and asks you to acknowledge that the information is still needed and will be recorded another way. Hidden fields keep their values and are only taken off the page: Copy to Lightning, email and escalation output still list them as before, and they still count in the notes score. OS/Solution, Notes and Action Plan / Next Steps cannot be hidden. Case Details lists the hidden fields with a **Show or hide fields** button; **Show** brings a field back, and **Reset to Default** shows every field. The hidden list is a browser preference included in settings backups.

### Rearranging Case Details on the page

Choose **Unlock layout** in the Case Details heading to reorder fields without opening Customize Site Options. While the layout is unlocked, fields cannot be edited. Drag a field by any part of its outlined box, or focus its ⋮⋮ grip and use the arrow keys. **Done** saves the order for every case; **Cancel** or Escape puts it back. Switching case, opening Customize Site Options, or losing edit access locks the layout and discards unsaved moves. The saved order is the same one Customize Site Options edits, so it is included in case-history backups.

### Copy to Lightning shake and sound

When **Copy to Lightning** copies successfully, the page shakes for about a second and a soft, quiet camera-shutter click plays so you know the copy worked (phones that support it also give a short buzz). To turn it off, open **Customize Site Options** and clear **Shake the screen and play a sound when Copy to Lightning succeeds** under *Site Effects*; the change applies right away and is included in settings backups. If your system asks for reduced motion, the screen does not shake.

## Follow-ups

Use **Set follow-up** to give a case an owner, a due date and time, and a status. In Recent cases, a case whose follow-up is **overdue is red** and one **due within the next 4 hours is yellow**; both clear once the follow-up is marked done or the case is Completed. **Show cases → Follow-ups due within 4 hours** lists the yellow ones, alongside the existing overdue filter. Colors refresh every minute.

When you have done the follow-up, choose **Mark follow-up done** in the follow-up tracker, or **Follow-up done** on a red or yellow card. You are asked what comes next:

- **Schedule a new follow-up** clears the due date and opens the tracker so you can set the next one. The case stays open.
- **No follow-up** records the follow-up as done and clears the due date without scheduling another; the case status is unchanged.
- **Case is complete** clears the due date and sets the status to Completed.

Each follow-up marked done is recorded with the case (the tracker shows the last one), and the record is kept in history backups.

## Sharing and printing

**Print / PDF** opens the browser print dialog. Choose Save as PDF if available.

Review customer information before sharing exports or copying notes into AI tools.

## Keyboard access

Use Tab and Shift+Tab to move among controls and Enter/Space to activate buttons. **Alt+Shift+F** opens the history panel and focuses search. Focus the toolbox launcher and use **Alt+Arrow keys** to move it. The toolbox includes **Log Collection Helper** by default, alongside Email to Case, Escalate to DE and Copy Notes; the same helper is also in the right-hand action bar and under Evidence. Closing the helper returns focus to the button that opened it (the toolbox launcher when opened from the toolbox). The helper is still in development: each time it opens, a warning asks you to double-check all suggestions and verify their validity before using them, and **I understand, continue** shows the plan (**Cancel** or Escape closes it). **Edit toolbox** lets you choose the launcher icon (toolbox, dancing paperclips, wizards, T-rex), resize the button from 40 to 120 px, size the icon from 40% to 140% of the button, hide the background circle, and turn the icon animation off; animation also stops when your system asks for reduced motion. Escape closes its menu. Field ordering has Move up/Move down buttons as an alternative to dragging. Screenshot resize handles support arrow keys.
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
Settings and choose Connect Devin. See [the companion guide](../companion/README.md)
for setup and troubleshooting, including browser local-network permission.

**Copy to AI** continues to copy the selected prompt and current case details
without the companion. **Send to Devin** shows that same prompt for review
before submission. Suggestions appear for review; **Append to Notes** requires
an explicit click and affects only the original, selected, editable case.
Neither AI action automatically stops your timer or replaces your notes.
