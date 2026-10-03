# Connect Case Notes to Devin CLI on Windows

This optional companion connects the Case Notes and Escalation Quality AI
actions to Devin CLI on your PC. Without it, use **Copy to AI** and paste into
your approved AI tool.

## Setup

1. Install Devin CLI using its [official Windows instructions](https://docs.devin.ai/cli).
   Open a new terminal so the updated PATH is available.
2. Run `devin auth login` and complete the browser sign-in, then run
   `devin auth status`. Your account must have access to Devin CLI.
3. Install [Node.js](https://nodejs.org/en/download), version 22 or newer, if
   needed. Verify `node --version` in a new PowerShell window.
4. Open **AI Settings** and select **Copy connection command**. Paste it into
   PowerShell on this PC. The command fetches `Connect-Devin.ps1` from this
   repository, then automatically downloads the two runtime files into a unique
   temporary folder and starts the connection. No ZIP download or extraction is
   required. Review the linked source and follow your organization's policy for
   running downloaded code. No administrator privileges or startup registration
   are requested, and Node/Devin are not installed automatically.

   Keep the PowerShell window open while using direct Devin actions. Run the
   command again when starting a new connection session. It fetches current code
   from this repository's main branch, so network access is required each time.
   An ordinary exit or Ctrl+C removes the downloaded runtime files; abruptly
   closing or terminating PowerShell may leave that temporary folder behind.
5. The helper displays its workspace path. If your CLI requires workspace
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
6. In Case Notes, open **AI Settings**, paste the helper's pairing token, and
   select **Connect Devin**. Allow the site's local-network access permission
   if prompted. **Test connection** verifies CLI presence and supported flags;
   account authentication can still fail when you send a prompt.
7. Select an AI task, choose **Send to Devin**, review the exact prompt, and
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

## Local development

AI Settings on a localhost preview generates a command pointing to that preview
server and explicitly allows its origin. Keep the preview server running while
starting the connection. The production command works after `Connect-Devin.ps1`
and both runtime files have been published to the repository's main branch.

Explicitly allow the local preview origin when starting the helper:

```powershell
.\Start-DevinCompanion.ps1 -AllowOrigin http://127.0.0.1:4187
```

Production allows `https://seancrawforddell.github.io` by default. Origins cannot
distinguish GitHub Pages project paths, so keep the pairing token private.
