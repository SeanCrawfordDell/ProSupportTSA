# Case Notes: saving, recovery, and exports

## Saving and backups

Notes autosave in this browser every ten seconds. Open **Backup & Restore** beside **Customize Fields** for history backups, settings backups, and restore options. Choose **Set Backup Folder** to select an approved location, preferably a work OneDrive-synced Documents folder. The app creates `ProSupportToolsBackup` there (or uses that folder if selected directly). The same folder button becomes **Reconnect Backup Folder** when permission is needed, or **Change Backup Folder** when connected.

Once access is approved, changed notes and settings are backed up approximately every minute while Case Notes is open. Browser background throttling can delay this; it is not a background service. **Backup History** saves immediately. The status shows the last successful folder backup; **Reconnect Backup Folder** requests access again when permission expires. Browsers without folder access can download history and settings instead.

Each successful folder backup writes dated history and settings files plus the latest `customer-config.json`. Backup files are not automatically pruned. Folder backups contain customer information and are not encrypted by this app: use an approved protected location and follow your organization's retention policy. OneDrive synchronizes the folder independently; the app cannot confirm cloud upload completion.

## Recovery and retention

- **Recent cases** holds up to 100 cases. Older unpinned cases move to **Archive** instead of being discarded. If every case is pinned, the oldest case must still move to Archive to retain the 100-case working limit.
- **Archive** preserves case contents and screenshots; **Restore** brings a case back into the workspace.
- Deleting a case moves it to **Trash**. It remains recoverable until explicitly permanently deleted.
- **Version History** keeps up to ten previous saved content versions per case. Preview before restoring; restoring also retains the current content as a version. These are saved snapshots, not a record of every keystroke.
- Archive, Trash, and versions share browser storage. They do not provide unlimited capacity. Export backups regularly, especially when using screenshots. Clearing site data removes all browser-local collections.

## Finding and organizing cases

Search includes case fields, note content, next steps, custom fields, and support-toolkit text. Matching excerpts appear in results. Search applies to the selected collection and follow-up filter. Pin important recent cases; pinned cases appear first. Sort the rest by creation time, last edit, or follow-up due date.

## Restoring settings and notes

**Backup Site Configuration** saves `customer-config.json` and a dated settings copy directly to your configured `ProSupportToolsBackup` folder. Without a connected folder, it downloads the settings file instead. If folder access is denied or a write fails, the status explains the failure so you can reconnect and retry; it does not silently download elsewhere. Settings backups do not change your case-note backup files or the last successful full-backup time.

Settings include field configuration, toolbox URLs/order/colors/launcher icon/size/icon size/circle/animation, custom AI prompts, personal and edited built-in troubleshooting templates, theme, floating-panel preference, collapsed sections/history, and pinned site resources. They do not include browser folder permissions or the temporary dragged position of the toolbox.

**Restore Settings** offers two sources: **From backup folder** reads `customer-config.json` from the connected folder, and **Choose a file** accepts a downloaded or dated settings file. Imports are validated before applying; a confirmation explains that existing preferences will change. Older field/toolbox-only settings backups are supported.

**Restore History** replaces the complete current history with a history backup after confirmation, including Archive, Trash, and versions. Export current history first if you need to retain it. Settings are restored separately. Previously created individual-case JSON exports remain importable, replacing only a matching case ID after confirmation.

## Custom fields

New field labels support up to 120 characters. Older backups with longer labels remain restorable. Removing a field or resetting custom fields removes its values from recent cases, Archive, Trash, and saved versions after confirmation. Previously exported backup files are not changed. Both plain-text and HTML email exports include custom fields.

## Personal troubleshooting templates

Use **Manage templates** beside the issue dropdown to create a template or edit an existing one. Set a name, note text/prompts, and optional next steps. These fields accept plain text and line breaks, not HTML. **Save template** makes it available in the dropdown immediately and after reopening the browser.

Built-in templates can be renamed and edited; **Reset to default** restores their original name and content. Personal templates can be deleted after confirmation. Neither editing nor deleting a template changes existing case notes. If a case references a template that is no longer available, choose another template or restore settings before applying it.

Selecting a template does not insert text. **Apply template** appends its notes and next steps, preserving existing notes and screenshots. Template customizations are personal to this browser and included in **Backup Settings**, full folder backups, and **Restore Settings**. Older settings files without template data leave current customizations unchanged.

## Sharing and printing

**Print / PDF** opens the browser print dialog. Choose Save as PDF if available.

Review customer information before sharing exports or copying notes into AI tools.

## Keyboard access

Use Tab and Shift+Tab to move among controls and Enter/Space to activate buttons. **Alt+Shift+F** opens the history panel and focuses search. Focus the toolbox launcher and use **Alt+Arrow keys** to move it. **Edit toolbox** lets you choose the launcher icon (toolbox, dancing paperclips, wizards, T-rex), resize the button from 40 to 120 px, size the icon from 40% to 140% of the button, hide the background circle, and turn the icon animation off; animation also stops when your system asks for reduced motion. Escape closes its menu. Field ordering has Move up/Move down buttons as an alternative to dragging. Screenshot resize handles support arrow keys.
