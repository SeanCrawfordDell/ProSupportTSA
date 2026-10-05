# Connect Case Notes to Devin CLI on Windows

This optional companion connects the Case Notes and Escalation Quality AI
actions to Devin CLI on your PC. Without it, use **Copy to AI** and paste into
your approved AI tool.

## Setup

1. Register and then Install Devin Desktop and Devin CLI (DEVIN CLI IS REQUIRED DO NOT SKIP THIS STEP)
   Guides found [HERE](https://dell.sharepoint.com/sites/Windsurf/SitePages/Onboarding%20Windsurf.aspx) 
2. Install Node.js, version 22 or newer from the company Portal.
3. Open **AI Settings** and select **Copy connection command**. Paste it into
   PowerShell on this PC. The command fetches `Connect-Devin.ps1` from this
   repository, then automatically downloads the two runtime files into a unique
   temporary folder and starts the connection. No ZIP download or extraction is
   required. Review the linked source and follow your organization's policy for
   running downloaded code. No administrator privileges or startup registration
   are requested, and Node/Devin are not installed automatically.

   Keep the PowerShell window open while using direct Devin actions. Run the
   command again when starting a new connection session. It fetches a fixed,
   reviewed commit of this repository (never the moving `main` branch) and refuses
   to run runtime files whose SHA-256 checksum does not match, so network access
   is required each time.
   An ordinary exit or Ctrl+C removes the downloaded runtime files; abruptly
   closing or terminating PowerShell may leave that temporary folder behind.
4. The helper displays its workspace path. If your CLI requires workspace
   trust, open a second PowerShell window, create/open that workspace, and start
   Devin interactively there:

   ```powershell
   $devinWorkspace = Join-Path $env:LOCALAPPDATA 'EscalationQuality\DevinCompanion'
   New-Item -ItemType Directory -Path $devinWorkspace -Force | Out-Null
   Set-Location -LiteralPath $devinWorkspace
   devin
   ```

   Review the trust prompt and approve it if appropriate. Exit that interactive
   session before sending a request from Case Notes. The companion preserves
   ordinary Devin permissions and does not bypass workspace trust.
5. In Case Notes, open **AI Settings**, paste the helper's pairing token, and
   select **Connect Devin**. Allow the site's local-network access permission
   if prompted. **Test connection** verifies CLI presence and supported flags;
   account authentication can still fail when you send a prompt.
6. Select an AI task, choose **Send to Devin**, review the exact prompt, and
   select **Send**. Review the returned suggestion. **Copy response** works on
   both pages; **Append to Notes** is available in Case Notes for the original,
   currently selected, editable case.

Pairing is per tab session. Restarting the helper creates a new token. After
a restart or in another tab, paste the current token again. To stop the helper,
press Ctrl+C in its window. Use **Disconnect** to clear browser pairing.

## Troubleshooting

- **CLI not found:** install the native Windows executable, check `Get-Command
  devin.exe`, open a new terminal, and restart the helper. A WSL-only install
  does not provide the native executable this companion needs.
- **Unsupported CLI:** update Devin; this helper needs `--print` and
  `--prompt-file` in `devin --help`.
- **Sign-in expired:** run `devin auth login` in a terminal and retry.
- **Workspace trust required:** perform step 5. Do not disable trust checks.
- **Token expired:** reconnect using the token in the current helper window.
- **Port 43127 occupied:** stop the previous companion. Do not end unrelated
  programs; ask IT if another application owns the port.
- **Cannot reach helper:** check that its window is open and local-network
  permission is allowed for this site. Managed browser policy can block it.
  Copy to AI continues to work; no browser security settings need disabling.
- **Uncertain submission:** an acknowledgment was lost. The request may already
  be running. Do not send another copy immediately. If a job identifier is
  known, **Check request** reconnects to it without submitting again.
- **Ten-minute timeout or excessive output:** the helper stops the process.
  Narrow the task or copy the prompt into an interactive AI session.
- **Clipboard blocked:** select the prompt or response text and copy manually.
- **Note save failure:** appended text stays in the open note, but storage may
  not have saved it. Resolve the visible save warning or copy your work before
  leaving. Repeated append clicks cannot insert the same response twice.

## Data and access

The helper listens only on `127.0.0.1:43127`, requires a random pairing token,
and accepts only the configured site origin. It submits no prompt until you
review it and select Send. Your configured Devin account processes the prompt;
review case data for your organization's sharing requirements.

Pairing tokens are excluded from case/settings backups. Prompt files are
removed when each job ends; responses expire from helper memory after fifteen
minutes. Devin may retain its own session history under its settings; companion
cleanup does not erase it. The helper's dedicated workspace avoids running
inside your notes or repository, but is not an operating-system sandbox.

## Security notes

- Case text can contain customer-written content (pasted logs, emails, error
  messages). Such text could try to instruct Devin. The helper always starts Devin
  with `--permission-mode normal` when the CLI supports it, so a permissive
  personal default (for example `DEVIN_PERMISSION_MODE=dangerous`) is never used
  for these unattended runs. Do not run the helper from an administrator window,
  and review every response before using it.

## Local development

AI Settings on a localhost preview generates a command pointing to that preview
server and explicitly allows its origin. Keep the preview server running while
starting the connection. Checksums are only enforced for the published source.

## Releasing companion changes

The production command is pinned to a commit, so companion changes reach users
only when the pin moves:

1. Change `server.cjs` / `devin-runner.cjs`, then update `$expectedHashes` in
   `Connect-Devin.ps1` (`shasum -a 256 companion/*.cjs`). `node --test` fails
   until they match.
2. Commit and push that change on its own, and review it.
3. Set `COMPANION_COMMIT` in `js/devin-integration.js` to that commit's full SHA
   in a follow-up commit. Merge with a merge commit (not squash) so the pinned
   commit stays reachable.

Explicitly allow the local preview origin when starting the helper:

```powershell
.\Start-DevinCompanion.ps1 -AllowOrigin http://127.0.0.1:4187
```

Production allows `https://seancrawforddell.github.io` by default. Origins cannot
distinguish GitHub Pages project paths, so keep the pairing token private.
