# Support workflow development preview

Extend the existing Case Notes workspace with case context, shared evidence, resolution verification, editable knowledge candidates, and local repeat-pattern review in Support Trends. All data stays within the existing case history and backup/version workflow. Existing Copy to Lightning and escalation transfer include recorded workflow results. Collection guidance lives under Evidence; the duplicate suggested-tools section has been removed from Triage.

Run: `python3 -m http.server 4187 --bind 127.0.0.1` from this directory.
Preview: http://127.0.0.1:4187/index.html
Tests: `node --test tests/*.test.cjs`

This development copy is separate from the published website. Preview storage is separate from the live site. Matching local configurations are candidates for investigation; this is not a team-wide FCR or repeat-call metric.

## Try the workflow

1. Open Case Notes and create a new note (or inspect DEV-WORKFLOW-001 in the preview browser).
2. Set Windows Server, a PowerEdge platform, the Performance issue type, and a Hyper-V issue description.
3. Use Triage for impact and recent changes, then Evidence for collection guidance and progress. Previously saved diagnostic findings remain editable under Evidence.
4. Under Verify resolution, enter a fix, verification result, prevention plan, and customer confirmation. The completion button becomes available once these are present.
5. Build and edit a knowledge candidate. Copy to Lightning and escalation source notes include the recorded workflow findings.
6. Open Support Trends to inspect locally recorded repeat contacts, missing verification, and matching configuration groups.

Release validation: 141 Node regression tests passed. Browser checks covered routing, evidence capture, completion gating, knowledge generation, reload persistence, Support Trends, the Chrome notes popout handoff, and knowledge export preparation. Synthetic QA cases are browser-local and are not shipped with the site.

The notes Pop out button opens a compact browser window with the existing rich editor and toolbox. Only one window can edit at a time. Return to case saves before returning; blocked popups offer a compact same-tab fallback.

Knowledge drafts support formatted copy for OneNote, Markdown downloads, and a clipboard-based Obsidian handoff. Agents must review/redact drafts and choose an approved destination. Obsidian handoff success cannot be confirmed by the browser; no automatic OneNote publishing or screenshot bundling is included.

## Troubleshooting guides

`troubleshooting.html` runs decision-tree guides from `troubleshoot-core.js` (engine, validation, summary text, Case Notes handoff) and data files such as `troubleshoot-data-windows.js`. To add guides for another OS, add it to `osList` in the core, create `troubleshoot-data-<os>.js` that calls `TroubleshootCore.register(...)`, and load it in `troubleshooting.html` and `tests/troubleshoot.test.cjs`.

Workflow shape: `{id, os:[...], area, title, summary, reviewed, sources:[https...], start, steps}`. A step is either `{prompt, detail?, commands?, answers:[{label, next}]}` (two or more answers) or `{outcome:{cause, fix:[...], links?}}`. `register` rejects dangling answers, cycles, unreachable steps, duplicate ids and non-HTTPS links, and the tests validate every registered workflow.

Send to Case Notes writes `dell-support.troubleshoot-handoff.v1`; only the Case Notes tab holding the editor lock reads it and appends it to the selected case after the user clicks **Add to case**.
# Optional Devin CLI integration preview

Run `python -m http.server 4187 --bind 127.0.0.1` from this checkout and open
`http://127.0.0.1:4187/case-notes.html`. Run `node --test tests/*.test.cjs` for
regression tests. AI Settings generates a one-command bootstrap: on localhost it
fetches `companion/Connect-Devin.ps1` from that preview server; in production it
fetches from the repository main branch. The bootstrap downloads only the two
runtime files into a unique temporary folder. It does not install dependencies
or register startup tasks. The legacy ZIP packaging script remains for developer
testing, but the user setup no longer links to it.

The Windows helper uses Node.js 22+ with no npm dependencies. See
`companion/README.md` for CLI installation, login, pairing, workspace trust,
and browser permission steps. Allow local preview explicitly with
`./companion/Start-DevinCompanion.ps1 -AllowOrigin http://127.0.0.1:4187`.

Direct production HTTPS-to-loopback connectivity and real authenticated Devin
execution require separate validation. No Devin executable is installed on
the development PC; automated tests use an isolated fake CLI and synthetic
case data. A real authenticated Devin response and deployed-browser local-network
permissions still require environment-specific verification.

Devin release checks: 158 Node tests passed, including authentication/origin
checks, prompt bytes, cleanup, duplicate launch, expiry, CLI incompatibility,
closed-dialog recovery, cancellation races, and source-case deletion. The ZIP
was extracted and its endpoint tested with header pairing. Browser checks
covered Case Notes first visit/revisit, settings, clipboard fallback on both
pages, synthetic CLI response review/append, and closed-dialog response recovery.
