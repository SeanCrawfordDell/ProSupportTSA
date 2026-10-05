# Backup & Restore guide

Case Notes saves your work in this browser as you type. **Backups** add a second copy in a folder you choose, so a cleared browser, a new computer, or a mistake does not cost you your notes.

Open it from the gear-icon **Settings** menu in the top bar → **Backup & Restore**.

## Quick start (about 30 seconds)

1. Open **Backup & Restore** and select **Choose Backup Folder**. Pick a folder in your work OneDrive (Documents is a good choice) so OneDrive also keeps a cloud copy.
2. Approve the browser's permission prompt. Case Notes creates a **ProSupportToolsBackup** folder inside it and makes the first backup immediately.
3. That's it. The status card turns green and shows **Backed up just now**.

You need Chrome or Edge for folder backups. In other browsers use **Download a copy instead** (below).

Until a folder is set up, a banner at the top of the page reminds you that your notes live only in this browser. **Remind me in a week** hides it for seven days.

## How automatic backup works

- A few seconds after you change a note (and at most every 30 seconds), the **latest copy** is refreshed. The page must be open: backup is not a background service.
- Once an hour, while you are working, a dated **automatic snapshot** is saved, so you can go back to how things looked earlier in the day or last week.
- **Back Up Now** saves immediately and adds a **manual backup**. Manual backups are never deleted automatically. Use it before risky edits or at the end of a case.
- Before anything is replaced or removed (a restore, removing a custom field, resetting fields) a **safety copy** is saved first. Safety copies are never deleted automatically, so those actions can be undone.
- Settings (fields, toolbox, preferences) are backed up with the case history: a dated settings copy is saved with every hourly history snapshot and every manual backup, and also whenever a setting changes (within about a minute), even if you have not edited a note.

If the browser closes and reopens, it may need permission again. The card says **Backups are paused**; select **Reconnect Backup Folder** and approve.

## Restoring

1. **Backup & Restore → Restore…**
2. Choose **Case history** or **Settings** at the top. On the Settings tab, a copy marked *same as your current settings* is already active, so its Restore button is disabled.
3. Pick a backup from the list. It is grouped as *Most recent*, *Manual backups*, *Safety copies* and *Automatic snapshots*, newest first, with a friendly time ("Today, 2:22 PM") and size.
4. Select **Restore**, read the confirmation (it states how many cases will be replaced), and confirm.

Nothing changes until you confirm, and your current data is saved as a safety copy first, so if you picked the wrong one, restore the safety copy.

**Restoring on a new computer or browser:** choose the same OneDrive folder in **Choose Backup Folder**. Case Notes sees the existing backups and asks whether to **Restore from these backups** or **Keep my current notes and back up here**. It will never overwrite the folder silently; if you close the question, backups stay paused until you decide.

**Restore from a file…** (bottom of the Restore window) accepts a file you downloaded or copied from another computer. Case-history and settings files are told apart automatically.

## What settings backups include

Everything you can customize, so a restore brings your whole setup back:

- **Toolbox:** your shortcut links (up to four), the order of its buttons and their colors, the launcher icon, its size, icon size, and the circle and animation options.
- **Custom case fields** and their order, and your own **AI prompts**.
- **Preferences:** light/dark theme, floating action panel, collapsed sections and Recent Cases panel, pinned site resources, and the backup retention choice.

Not included: the temporary dragged position of the toolbox, and the browser's folder permission. After a settings restore the page reloads once so every restored setting takes effect. Settings changes (for example a new toolbox color) are picked up and backed up within about a minute, even if you have not edited a note.

## Deleting backups and starting fresh

In **Backup & Restore**, open **Delete backups or start fresh**:

| Action | What it removes | Your notes |
| --- | --- | --- |
| **Delete** button next to one backup (in Restore…) | That one backup file, and screenshots only it used | Kept |
| **Delete All Backups…** | Every backup the app made in the folder, including manual backups, safety copies and screenshots. Files that are not the app's are never touched. | Kept. Automatic backups start again when your notes next change. |
| **Start Fresh…** | Everything above, **and** all case notes, settings and preferences in this browser | Erased. No safety copy. Cannot be undone. |
| **Stop Using This Folder** | Nothing. Backups stop; the folder and its files stay. | Kept |

Both **Delete All Backups** and **Start Fresh** require typing **DELETE**. OneDrive keeps removed files in its recycle bin for a while, which can help if you change your mind about a delete.

Tip: choose **Download a copy instead** before **Start Fresh** if you might want the notes later.

## Retention: automatic cleanup

Under **Automatic cleanup** choose how long to keep automatic snapshots: **7 days, 30 days (default), 90 days, or Forever**.

- Cleanup runs by itself after each hourly snapshot. **Clean Up Now** runs it on demand and tells you how many files and how much space it freed.
- Automatic snapshots from the last 24 hours are all kept; older ones are thinned to one per day for up to 30 days, then one per week up to your limit.
- The newest automatic snapshot, the latest copy, **manual backups, safety copies**, and any file the app did not create are never removed.
- **Settings copies follow their own fixed rule, whatever you choose above:** the newest **5 automatic copies from today** and the newest **1 from yesterday** are kept; older automatic settings copies are deleted. Manual settings backups and safety copies are never removed.
- Screenshots are stored once in the `images` folder and removed only when no remaining backup uses them.
- Your choice is saved in this browser and included in settings backups.

## What is in the folder

```
ProSupportToolsBackup/
  case-history.json                         latest copy of your cases
  customer-config.json                      latest copy of your settings
  case-history-2026-10-05_141500.json       automatic hourly snapshot
  case-history-manual-2026-10-05_160000.json   manual backup (kept)
  case-history-before-restore-…json         safety copy (kept)
  customer-config-…json                     dated settings copies (newest 5 today + 1 from yesterday)
  images/                                   screenshots, stored once each
```

Because snapshots refer to `images/`, copy the whole `ProSupportToolsBackup` folder together when moving it by hand. Files you **download** are self-contained.

## Download a copy instead

**Download Case History** and **Download Settings** save files through the browser, in any browser, with screenshots included. Restore them with **Restore from a file…**.

## Troubleshooting

| You see | Do this |
| --- | --- |
| *Backups are paused* | Select **Reconnect Backup Folder** and approve. |
| *Folder backup isn't available in this browser* | Use Chrome or Edge, or use the download buttons. |
| *The backup folder is full* | Select **Clean Up Now**, lower the retention, or free disk or OneDrive space. |
| *Another Case Notes window is editing* | Only one window can edit and back up at a time. Close the other one. |
| *That backup can't be restored* | The file is damaged or incomplete (for example a missing screenshot). Nothing was changed; try another backup. |
| Restore list is empty | No backups of that type yet. Select **Back Up Now**. |

## Privacy

Backups contain customer information and are **not encrypted** by this app. Use an approved, protected location and follow your organization's retention policy. The browser cannot show the full path, so the folder is shown by name. The app cannot confirm that OneDrive finished uploading.
