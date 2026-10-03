# SDD ledger — plan: docs/superpowers/plans/2026-10-03-devin-cli-integration.md

Release preparation: user explicitly requested pushing the reviewed changes
live. Fresh verification: 187/187 tests pass; diff checks pass. October 2 baseline
remains 981a516 and origin/main has no newer commits. GitHub Pages publishes
from main at repository root. Final UI moves Settings right of the icon-only
theme toggle, enlarges the gear 25%, and places New Note beneath Case Workspace.
Publishing does not certify real Devin authentication or managed-browser policy.

October 3 revision: refreshed baseline to origin/main 981a516 (October 2 updates)
while preserving the uncommitted Devin work and recoverable stash snapshots.
Combined baseline validation passed 176/176 tests before setup revision.
User approved bounded one-command setup in chat, then requested implementation.
Replaced user-facing ZIP links with Copy connection command and a visible,
read-only manual-copy field. Bootstrap auto-fetches exactly two runtime files,
requires Node22+, accepts only the official source or explicit localhost preview,
and cleans its unique temporary staging files after exit. No dependency install,
startup registration, security-policy bypass, or automatic case submission.
Legacy packaging remains developer-only. Production bootstrap URL requires
publishing to main; real authenticated Devin remains unverified on this PC.
Revision validation: 185/185 tests pass and staged/unstaged diff checks pass.
Actual downloaded-scriptblock launch tested in Windows PowerShell 5.1 and
PowerShell 7. Browser shows one-command setup, successful-copy status, no ZIP
link, and retains the October 2 menus/rubric. Screenshot saved as
docs/devin-one-command-preview.jpg. Clipboard API readback was unavailable in
the browser tooling; transport/controller tests verify copied command bytes.
Focused review found cleanup prompting and inline exit terminating the host;
both regressions were reproduced RED and fixed GREEN. Reviewer confirmed no
remaining Important findings. Unexpected staging files are preserved with a
warning. Package smoke test now uses an ephemeral port so it never interrupts
the user's already-running PowerShell connection, which was left untouched.
No changes committed or published.

Execution: native; isolated branch codex/devin-cli-integration at baseline 2fb0ef8.
Baseline: 123 tests pass.
Pre-flight: Tasks 1/2 share health/job JSON; consistent. Tasks 2/3 share client methods; consistent. Tasks 3/4 share snapshot and case-ID callbacks; consistent.
Ruling: Use repository-local ledger and direct test commands instead of POSIX skill helper scripts on Windows; commits are deferred as agreed in the plan. Cost: progress is preserved in files rather than commit ranges.
Ruling: Native worktree tool cannot resolve the nested repository; use git worktree with command-scoped safe.directory, not a global trust change. Cost: checkout is managed by Git, not the app.
Task 1: complete — 11 companion tests pass, including cancellation, cleanup, body/output bounds, and authentication failures.
Task 1: Ruling: Resolve taskkill through SystemRoot rather than PATH; this environment omits the Windows tools directory. Cost: fallback child.kill cannot guarantee descendant termination if Windows denies taskkill.
Task 2: complete — 6 browser transport tests pass; no automatic localhost probe, header-only pairing, denied-network fallback, no submit retries, stale token clearing, bounded responses.
Task 3: complete — 7 dialog/controller tests pass, including backup-dialog coordination, first-use acknowledgment, prompt snapshot and explicit submission, inert response text, source-case guards, and explicit append.
Task 4: complete — integration callbacks added to both pages; 3 new page tests cover latest data, source-case protection, and no escalation append. Full suite passes (149 tests before the additional dialog-coordination test).
Task 4: Ruling: An append reports applied even when storage fails; preserve the existing unsaved-data warning and prevent duplicate append. Cost: the user must resolve the visible save failure before leaving.
Task 5: complete — downloadable ZIP uses an exact four-file allowlist; extracted package matches source and starts an authenticated endpoint. Browser verified first-use guide, revisit suppression, pairing, prompt preview, fake CLI round trip, explicit append, note persistence, and no-helper clipboard fallback. Real Devin and production HTTPS-to-loopback remain unverified.
Final review: fresh gpt-6-astra reviewer identified four Important lifecycle issues; fixed in one pass.
Final: fixed stale poll/cancel response ownership — late-poll regression RED→GREEN.
Final: fixed inaccessible completion while dialog closed — closed-dialog regression RED→GREEN; terminal response remains until explicit new request.
Final: fixed expired-job lockout — missing-job regression RED→GREEN.
Final: fixed duplicate-start cleanup — duplicate-listener regression RED→GREEN; cleanup is deferred until listener ownership.
Final: fixed response ID mismatch — transport regression RED→GREEN.
Final: minor (deferred): none. Additional Host, expiry, incompatible CLI, source deletion, race and closed-dialog tests address review coverage gaps.
Final: Ruling: Real Devin authentication, deployed HTTPS local-network permission, and terminal-window-close descendant cleanup cannot be demonstrated on this PC with no Devin install; hand off as a locally verified integration, not deployed certification. Cost: final environment validation is still required before publishing.
Validation: Final suite 158/158 passes; git diff --check passes. Package smoke test validates latest ZIP source fidelity. Preview helper stopped and browser pairing cleared. Static local preview remains available for user review.
