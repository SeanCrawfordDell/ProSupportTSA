# Optional Devin CLI integration

Date: 2026-10-03
Status: Approved and implemented in the isolated local review checkout. Real authenticated Devin and production HTTPS-to-loopback validation remain outstanding.

## Outcome

Engineers can send existing Case Notes and Escalation Quality AI prompts to
Devin CLI on their Windows PC. Users without a configured connection can keep
using Copy to AI. The first Case Notes visit explains this optional connection
and provides setup instructions.

The user approved the local-helper approach in conversation. This document
defines that approach for implementation planning and review.

## Existing application

- The application is a static GitHub Pages site, with browser-local case data.
- There is no account login. First use means the first Case Notes visit in a
  browser profile for this site, including existing users after this release.
- `devin-prompt-core.js` builds prompts for built-in and custom AI tasks.
- `case-notes.js` and `app.js` currently copy those prompts to the clipboard.
- `case-settings-core.js` exports a defined set of preferences. Connection
  credentials must stay outside these exports and case backups.
- Case Notes protects concurrent editing through Web Locks. AI response review
  must respect the same editing rules.

## Selected architecture

Keep GitHub Pages hosting and add an optional Windows companion. Browser code
talks to a fixed loopback endpoint, `http://127.0.0.1:43127`, after the user
chooses Connect Devin. The companion detects and invokes the local CLI.

The companion uses Node.js 22 or newer and built-in modules. Following the
user-approved revision, AI Settings offers one copy-and-run PowerShell command
that fetches the bootstrap and runtime files automatically. There is no manual
ZIP download/extraction; the legacy ZIP is retained only for developer tests.
Users need Node.js as well as Devin CLI; the setup guide must make both
prerequisites explicit. No npm dependencies, administrator privileges,
automatic startup registration, or automatic software installation are needed.
The launcher remains visible so users can stop the helper by closing it.

Alternatives considered: a custom URL handler can launch a terminal but cannot
reliably report availability or return a response; a hosted backend cannot use
the user's installed CLI. A local companion supports both required behaviors.

## First-use guide and settings

On the first full Case Notes visit, show a keyboard-accessible dialog explaining:

> You can connect Case Notes to Devin CLI on your Windows PC to send AI prompts
> and review responses here. Setup is optional. Copy to AI works without it.

Offer Set up Devin and Continue with Copy to AI. Record acknowledgment in
`dell-support.devin-onboarding.v1` when the user chooses either option or
dismisses the dialog. Do not open this introduction in the notes popout.
If storage is unavailable, acknowledgment lasts for the current page only.

An AI Settings button on both AI action areas reopens the guide and shows
connection status, pairing, Test connection, and Disconnect controls.

Setup steps:

1. Install Devin CLI using the official Windows instructions.
2. Open a new terminal and run `devin auth login`, then `devin auth status`.
3. Install Node.js 22 or newer if it is missing.
4. Copy the connection command from AI Settings and paste it into PowerShell.
   Review the linked source and follow organizational policy for downloaded code.
   The bootstrap fetches two runtime files into a unique temporary directory,
   starts the connection, and removes them on an ordinary exit or Ctrl+C.
5. Copy the pairing token displayed by the helper into AI Settings.
6. Choose Connect Devin and allow the browser's local-network access request
   if one appears. Managed-browser policy can prevent this connection.
7. Test the connection. If it fails, the clipboard workflow remains available.

Include actionable guidance for a stopped helper, missing CLI, expired login,
occupied port, incorrect token, incompatible CLI flags, and blocked browser
permission. Link to official installation and sign-in documentation rather than
silently downloading or executing installers.

## AI actions and response review

- Keep Copy to AI available as a separate action whenever the existing page
  permits copying. It requires neither the helper nor Devin.
- Add Send to Devin. It is enabled after a successful authenticated helper
  health check reports compatible CLI availability.
- Build prompts through the existing shared prompt builder. Sending uses the
  current selected task and a snapshot of current case or escalation data.
- Before submission, show the exact prompt in a review dialog with Send and
  Cancel. Explain that Devin processes the supplied case data using the user's
  configured account. Nothing is submitted automatically.
- Capture the source case ID when sending. Prevent duplicate submissions in
  that page while its request is running, but do not block ordinary note work.
- Poll an asynchronous job endpoint and display working, completed, failed,
  and cancelled states. Provide Cancel while a job runs.
- Render responses as plain text in a review dialog. Include Copy response;
  in Case Notes also offer Append to Notes after explicit user action.
- Appending targets the original case only. Require that it is still selected,
  exists, and is editable; otherwise preserve the response for copying.
  Escape response text before passing it to existing rich-text storage.
- Never automatically replace fields, apply an action plan, or stop the timer.
- On connection or execution failure, show the reason and a Copy prompt action.
  Do not automatically resubmit an uncertain request or silently copy after a
  long wait: a fresh click keeps clipboard permissions reliable.

The helper identifies installation and execution availability, not account
entitlement. Authentication failures can occur during execution even after a
successful availability check and must receive distinct guidance.

## Companion API and protection

- Bind exclusively to `127.0.0.1:43127`. Reject unexpected Host headers.
- Allow the exact production origin `https://seancrawforddell.github.io`.
  Local development origins require an explicit startup option. Origin checks
  cannot distinguish GitHub Pages paths, so pairing is also required.
- Generate a cryptographically random token on every launch. Require it in an
  authorization header for health, submissions, job reads, and cancellations.
- Persist the browser's token in session storage only. Exclude it from backups,
  URLs, analytics, logs, and exported settings. Disconnect clears it.
- Handle allowed CORS preflights, including applicable private-network headers;
  never allow wildcard origins. Refuse missing/null or disallowed origins.
- Accept JSON only, cap request bodies at 256 KiB, and accept only documented
  fields. Enforce one running job and reject excess submissions as busy.
- Return only bounded, sanitized statuses. Do not expose raw process output or
  credentials in health checks. Response output is limited to 2 MiB per job.
- Use fixed routes: `GET /v1/health`, `POST /v1/jobs`,
  `GET /v1/jobs/<id>`, and `DELETE /v1/jobs/<id>`.
- Job IDs are generated by the helper. Caller-supplied executable paths,
  filesystem paths, shell commands, CLI flags, or environment variables are
  not accepted.
- Run jobs in a dedicated helper workspace under the current user's local
  application-data directory. Write a UTF-8 prompt file in a unique job folder.
- Resolve an installed native Devin executable through PATH. Invoke it through
  an argument array with shell execution disabled, using the documented
  `--print` and `--prompt-file` flags. Verify flags through `--help`; incompatible
  installs receive setup guidance.
- Use ordinary Devin permissions; do not enable dangerous mode or bypass
  workspace trust. The user establishes workspace trust interactively during
  setup if their CLI requires it. Prompts request analysis of supplied facts,
  not execution of remediation commands.
- Apply a ten-minute execution timeout. Stop the process on cancellation,
  timeout, or helper shutdown. Remove helper-created prompt files on every
  terminal outcome and clean stale helper job folders on startup.
- Keep job responses in memory for at most fifteen minutes, then discard them.
  Do not persist prompt or response logs. Explain that Devin itself may retain
  session history under its own settings; helper cleanup does not erase that.

## Browser implementation boundaries

Add a shared browser integration module and UI stylesheet, used by both AI
surfaces. Keep prompt construction in `devin-prompt-core.js`, with small changes
to the existing click handlers and HTML action areas.

Add the specific loopback endpoint to each page's `connect-src` policy, retaining
existing sources. Do not broaden script policy. Connection attempts originate
from explicit user actions, or from checking an existing session pairing; no
automatic localhost probing on an unconfigured user's visit.

Other browsers remain supported through clipboard fallback. Verify direct
connection in Windows Chrome or Edge with browser permissions enabled. Never
tell users to disable browser security to make the feature work.

## Verification and delivery

Use the existing `node --test tests/*.test.cjs` suite and add focused checks for
fallback, connection state, introduction acknowledgment, prompt snapshots,
response rendering, and original-case targeting.

Exercise the helper with a fake CLI process to test origin/token checks,
argument safety, bounds, lifecycle cleanup, busy state, cancellation, timeouts,
missing executable, incompatible flags, and CLI failures without sending real
case data or requiring a Devin account.

Run a local browser preview for first visit, subsequent visit, reopening setup,
no-helper clipboard use, successful fake response review, connection loss, and
permissions denial. Preserve existing timer, custom tasks, and backup behavior.

Real Devin CLI is not installed on the inspected PC. Actual authenticated CLI
execution must be reported as unverified until tested with an installed copy.
Production HTTPS-to-loopback permissions also need a real browser check; a
local preview alone is insufficient to claim deployed connectivity works.

Deliver source, one-command bootstrap, setup documentation, and a local
review version. Git publishing remains a separate user-directed step.

## References

- https://docs.devin.ai/cli
- https://docs.devin.ai/cli/reference/commands
- https://docs.devin.ai/cli/enterprise/devin-auth
- https://developer.chrome.com/blog/local-network-access

## Acceptance criteria

1. An unconfigured user sees optional setup guidance once per browser profile
   and can immediately continue using Copy to AI.
2. A configured user can review and send the same existing prompt to the local
   CLI, then review its returned response.
3. Unavailable or failed integration leaves clipboard use and note editing
   usable, with clear setup or recovery instructions.
4. No case content leaves the page before an explicit submission; tokens stay
   out of backups, and prompts cannot become executable shell input.
5. AI suggestions alter notes only through an explicit, case-specific action.
