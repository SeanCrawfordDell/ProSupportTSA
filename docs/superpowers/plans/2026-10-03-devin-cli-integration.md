# Devin CLI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Send existing AI prompts to an optional Windows Devin CLI companion,
review responses, and retain clipboard use with first-visit setup guidance.

**Architecture:** A shared browser client and dialog controller connect to an
authenticated loopback companion. The companion detects the native CLI and runs
bounded asynchronous jobs. Both existing AI action areas use the same modules.

**Tech Stack:** Browser JavaScript, native HTML dialogs, CSS, Node.js 22+ built-in
modules, PowerShell launcher, and the existing Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-03-devin-cli-integration-design.md`

## Global Constraints

- Companion endpoint: `http://127.0.0.1:43127`; bind only to `127.0.0.1`.
- Production origin: `https://seancrawforddell.github.io`; local test origins require explicit startup configuration.
- Node.js 22 or newer; no npm dependencies or automatic installation/startup registration.
- Tokens are regenerated on launch and stored only in browser session storage.
- JSON bodies: at most 256 KiB; one running job; response output: at most 2 MiB.
- CLI execution timeout: ten minutes; completed jobs expire after fifteen minutes.
- Native executable, argument arrays, shell disabled, ordinary CLI permissions, workspace trust preserved.
- No case submission before explicit prompt review and Send.
- Clipboard actions remain available; no automatic note replacement or timer stop.
- No broadening of script policy; permit only the fixed companion connection endpoint.
- Use local preview and tests before publishing; commits and pushes require user direction.

## Review Focus

- Notes can change or be deleted while a job runs: append only to the original selected, editable case (Task 4).
- POST may succeed before its response is lost: no automatic resubmission and a clear uncertain-outcome message (Task 2).
- Storage can be blocked or full: clipboard and in-memory pairing stay usable without exporting tokens (Tasks 2 and 3).
- Prompt text can contain Unicode, quotes, newlines, and shell-like content: preserve bytes in a file, never interpolate into shell commands (Task 1).
- Browser permission or CLI workspace trust can block execution: give actionable recovery guidance with clipboard fallback (Tasks 1, 2, and 5).

## File Boundaries

Create `companion/devin-runner.cjs` for executable discovery and job execution;
`companion/server.cjs` for HTTP authentication, lifecycle, and routing;
`companion/Start-DevinCompanion.ps1` for prerequisites and launch;
`companion/README.md` for user setup;
`devin-connection-core.js` for browser transport and session pairing;
`devin-integration.js` for dialogs, onboarding, and response review;
`devin-integration.css` for shared dialog styling;
`scripts/package-devin-companion.ps1` for ZIP packaging.

Modify `case-notes.html`, `case-notes.js`, `escalation-quality.html`, `app.js`,
`CASE_NOTES_GUIDE.md`, and `DEV-NOTES.md`. Keep prompt construction in
`devin-prompt-core.js`. Do not add tokens to `case-settings-core.js`.

Create `tests/devin-companion.test.cjs`, `tests/devin-connection.test.cjs`,
`tests/devin-integration.test.cjs`, and `tests/fixtures/fake-devin.cjs`.
Extend `tests/case-notes.test.cjs` and `tests/escalation.test.cjs` at the existing
AI action boundaries rather than changing unrelated tests.

## Task 1: Authenticated companion and bounded CLI jobs

**Files:** Companion server/runner, fake CLI fixture, companion tests.

**Interfaces:**

- `createRunner({workspace, executable?, spawnImpl?, timeoutMs?, retentionMs?})`
  returns `{health(), submit(prompt), get(id), cancel(id), close()}`. Test-only
  injection never becomes an HTTP option.
- Health: `{version:1, cliAvailable:boolean, compatible:boolean, code:string}`.
- Job: `{id:string, state:'running'|'completed'|'failed'|'cancelled', response:string, code:string}`.
- `createCompanion({runner, token, allowedOrigins, port})` returns
  `{listen():Promise<void>, close():Promise<void>}`. Production port is 43127;
  tests can bind an ephemeral loopback port.
- Routes return health, HTTP 202 `{id,state}` for JSON `{prompt}`, a job, or
  cancelled job. Errors return `{code,message}` without raw stderr.

- [x] Add failing tests: missing token returns 401, wrong origin/Host returns
  403, allowed preflight succeeds without token and returns exact origin,
  missing/null origin fails, unknown route returns 404, oversize body returns
  413, invalid content type returns 415, and unexpected JSON fields return 400.
- [x] Run `node --test tests/devin-companion.test.cjs`; confirm failures are due
  to the missing companion interfaces.
- [x] Implement authenticated routes using `node:http`, timing-safe token
  comparison, fixed methods, and `Cache-Control: no-store`. Reject concurrent
  work as HTTP 409 and expire missing jobs as HTTP 404.
- [x] Add execution tests: fake CLI reads UTF-8 prompt-file bytes unchanged;
  assertions include multiline Unicode and `$(...)`/quotes. Assert `shell:false`
  and only fixed argv flags. Assert a second running job is rejected; success,
  nonzero exit, output limit, timeout, cancellation, and shutdown remove prompt
  files and leave no running child. Inject short clocks for lifecycle tests.
- [x] Implement native PATH discovery, bounded `--help` compatibility check,
  dedicated app-data workspace and unique prompt folders. Run `--print` with
  `--prompt-file`; classify missing CLI, unsupported flags, auth failure,
  workspace trust, timeout, cancellation, and generic execution failure.
  Never return stderr directly. Clean only validated helper-owned job folders.
- [x] Run `node --test tests/devin-companion.test.cjs`; require all tests pass
  and no leaked listeners or child processes.

## Task 2: Shared browser connection and clipboard fallback

**Files:** `devin-connection-core.js`, connection tests.

**Interfaces:**

- Export `DevinConnection` to the browser and CommonJS tests.
- `createClient({fetchImpl, sessionStorage, clipboard})` returns
  `{connect(token), disconnect(), health(), submit(prompt), getJob(id), cancel(id), copyPrompt(prompt), isPaired()}`.
- Session key: `dell-support.devin-session.v1`. Reuse Task 1 JSON shapes.
- Transport uses the fixed endpoint, authorization header, JSON, no cookies,
  and an AbortController with a five-second HTTP request timeout.

- [x] Add failing tests: unpaired initialization performs zero fetches;
  connection sends a bearer token only in a header; disconnect clears it;
  blocked session storage permits in-memory pairing; denied fetch preserves
  clipboard use; submit network failure is not retried; invalid/oversize job
  responses and unexpected states are rejected; clipboard failure is reported.
- [x] Run `node --test tests/devin-connection.test.cjs`; confirm the new module
  or interface causes the expected failure.
- [x] Implement the client with bounded JSON validation and typed error codes.
  Distinguish rejected authentication, busy helper, unsupported CLI, network
  blockage, and uncertain submission. On 401, clear stale pairing; never put
  the token into error strings or another storage mechanism.
- [x] Run `node --test tests/devin-connection.test.cjs`; require all tests pass.

## Task 3: First-visit guide, settings, and review dialogs

**Files:** `devin-integration.js`, `devin-integration.css`, integration tests.

**Interfaces:**

- `DevinIntegration.init({client, sourceLabel, isPopout, snapshot, appendResponse?, canAppend?})`
  returns `{refresh(), openSettings()}`.
- `snapshot()` returns `{caseId:string|null, prompt:string}` or null when the
  existing AI action is unavailable. It must synchronize form values first.
- `appendResponse(caseId, response):boolean` and `canAppend(caseId):boolean`
  are supplied only by Case Notes (Task 4).
- Shared action IDs: `aiSettings`, `sendDevin`; existing `copyDevin` stays.
- Create shared dialogs through safe DOM construction: onboarding, setup,
  prompt review, and response review. No inline event handlers or HTML injection.

- [x] Add failing tests: introduction opens once in the full page; both choices
  and Escape acknowledge `dell-support.devin-onboarding.v1`; popout suppresses
  introduction; unavailable storage permits dismissal for the current page;
  settings can always reopen; initial setup performs no network probe.
- [x] Run `node --test tests/devin-integration.test.cjs`; confirm expected failures.
- [x] Implement onboarding and setup with exact introduction copy from the
  spec, prerequisites, documentation and ZIP links, token input, Connect,
  Test connection, Disconnect, and plain-language status. Restore focus after
  closing and avoid competing modal dialogs during initial page load.
- [x] Add response flow tests: prompt snapshot is fixed at review opening;
  Cancel submits nothing; explicit Send submits once; running jobs can cancel;
  busy/failure states offer Copy prompt; hostile response text stays inert;
  response copy works; append is unavailable when source case eligibility fails.
- [x] Implement prompt/response dialogs, one-page in-flight guard, one-second
  polling, cancellation, and bounded failure handling. Polling does not resubmit
  a job. A connection interruption preserves job ID and prompt for recovery;
  any explicit append rechecks `canAppend(caseId)`.
- [x] Run `node --test tests/devin-integration.test.cjs`; require all tests pass.

## Task 4: Wire both existing AI action areas

**Files:** Both page HTML files, `case-notes.js`, `app.js`, existing page tests.

**Interfaces:** Consume the Task 3 controller and existing
`DevinPrompt.build(taskId, sourceLabel, caseText)`.

- [x] Add regression tests: existing Copy to AI still builds the selected task
  with current case data and never stops the timer; controls obey editor locks;
  a response cannot append after changing/deleting its source case; append
  escapes HTML and persists through existing save behavior; tokens never enter
  settings backups; both pages permit only the explicit loopback CSP addition.
- [x] Run `node --test tests/case-notes.test.cjs tests/escalation.test.cjs` and
  confirm failures correspond to the new integration behavior.
- [x] Add module/style references and AI Settings/Send to Devin controls to
  both pages. Preserve all existing CSP sources and add the fixed endpoint to
  `connect-src`. Keep Copy to AI separate and update misleading tooltips only.
- [x] Wire Case Notes snapshots to `selected()`, `syncFormToNote`, `save`, and
  `CaseNotes.copyText`. Append only if source ID equals current selected ID and
  the editor is writable; synchronize latest user edits before appending,
  update the rich editor through the existing canonical field input path, and
  preserve existing save/version semantics. Do not keep stale note references.
- [x] Wire Escalation Quality snapshots to `reviewData()` and
  `formatEscalation()`. Supply no append callback. Call controller refresh from
  existing availability changes, without blocking the clipboard handler.
- [x] Run `node --test tests/*.test.cjs`; require zero failures.

## Task 5: Windows setup package and local review

**Files:** Launcher, companion README, packaging script,
`downloads/DevinCompanion.zip`, Case Notes guide, development notes.

**Interfaces:** PowerShell launcher runs `node companion/server.cjs` (relative
to the extracted package) and offers a dedicated workspace path for interactive
Devin trust setup. Production helper startup prints the pairing token only in
its local terminal. `--allow-origin http://127.0.0.1:4187` enables local preview
explicitly. No default wildcard or guessed origin list.

- [x] Implement launcher prerequisite checks with actionable messages for old
  or missing Node, missing CLI, and startup failures. Document official install,
  `devin auth login`, `devin auth status`, workspace trust setup, token pairing,
  browser permission, helper shutdown, and Devin's own session retention.
- [x] Create a packaging script using `Compress-Archive` with an exact file
  allowlist. Include only server, runner, launcher, and README. ZIP must contain
  no pairing token, workspace, prompt, case, or development fixture.
- [x] Build and inspect the ZIP, extract to a fresh workspace-owned temporary
  directory, and start the extracted helper. Confirm a browser request without
  pairing is rejected and shutdown releases the port. Do not print generated
  tokens in test reports or chat outputs.
- [x] Run `node --test tests/*.test.cjs` and `git diff --check`; require all tests
  pass and no whitespace errors.
- [x] Run local preview and exercise first visit, revisit, popout suppression,
  reopened settings, no-helper clipboard, fake CLI response review/cancel,
  original-case append guard, and denied local-network permission where the
  browser exposes that permission. Confirm notes, timer, and custom tasks work.
- [x] Document actual verified behavior and limitations. The inspected PC has
  no Devin executable: fake execution is not evidence of real authentication
  or CLI output compatibility. Production HTTPS-to-loopback access requires a
  separate real browser check before declaring deployed connectivity working.
- [x] Perform a final review against the design's five acceptance criteria and
  hand off the local preview, ZIP, source, and setup guide for user testing.
  Leave Git commits and publishing for explicit user direction.

## Execution Choice

Recommended: native execution in this session. The five tasks share precise
interfaces, and serial implementation makes helper/browser contract checks
straightforward. Subagent-driven execution is available if the user prefers
independent implementation and review for each task.

Status: Approved for native execution and implemented in the isolated local review checkout. See devin-progress.md for tests, review fixes, and environment limitations.
