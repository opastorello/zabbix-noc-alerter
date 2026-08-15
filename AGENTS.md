# Agent instructions - Zabbix NOC Alerter

Read this before doing any work in this repo. It applies to any coding agent
(Claude Code, Codex, Cursor, ...), not just one tool.

## What this is

A dependency-free Chrome MV3 extension, vanilla JavaScript, no build step. It
polls the Zabbix API for active problems and fires a sound + browser
notification the moment a new one appears. See `README.md` for the feature
list and `CONTRIBUTING.md` for the full house rules; this file is the short
version an agent needs before touching code.

## Before planning any work

1. Read `IDEAS.md` if it exists in your working copy (it is git-ignored, local
   only - `git status` won't show it, but check the file itself). It is the
   living backlog: a shipped ledger (what exists, do not re-plan it), an open
   backlog (what to pick up next), evolutions of shipped features, hardening
   items grounded in the current code, and a "decided against" list of things
   already rejected on purpose with the reason why. Never repropose either.
2. `IDEAS.md` is never committed. If you learn something worth remembering
   (a finding, a decision, external evidence), add it there in the same
   terse, evidence-based voice - not a new markdown file elsewhere.

## House rules (non-negotiable, CI enforces some of these)

- **Manifest V3, vanilla JS.** No external libraries, no bundler, no build
  step for the runtime code (`background.js`, `popup.js`, `options.js`,
  `offscreen.js`, `i18n.js`). The only exception is the dependency-free node
  scripts under `test/`, which stay dependency-free too.
- **Nothing hardcoded.** The Zabbix URL and credentials live only in
  `chrome.storage.local` via the Options page. Never embed a URL or
  credential in the code.
- **Version in one place.** `manifest.json` is the single source of truth;
  the UI reads it via `chrome.runtime.getManifest()`. Never hardcode a
  version anywhere else (this file included).
- **i18n.** Every user-visible string goes through `i18n.js`, kept in parity
  across `pt`/`en`/`es`. `npm run lint` fails if a key is missing in any
  language, used in code but undefined, or defined but never used (dynamic
  key families like `t('nsev' + sev, ...)` are allow-listed in
  `test/lint.js`, update that list if you add a new dynamic family).
- **No em-dash.** Plain hyphen `-` only, in source AND in docs/markdown. CI
  greps for the U+2014 character across `.js`/`.html`/`.css`/`.json`/`.md`.
- **Auth.** Three modes per instance: browser session (default and primary),
  API token, or username/password (`user.login`, session cached and renewed
  automatically). An explicit mode with an empty credential is an error,
  never a silent fallback to another mode.
- **Sounds** are synthesized with the Web Audio API, no bundled audio
  binaries in the repo. (A user bringing their own audio file at runtime,
  stored locally, is a different thing - see the relevant `IDEAS.md` item.)
- **Not a dashboard.** This is an alerting tool. When a feature idea starts
  looking like a wall display or a CMDB, it is out of scope - "open it in
  Zabbix" is the correct answer, not building a smaller Zabbix.

## Workflow that this repo has actually used and that works

- **One fix, one commit.** Do not batch unrelated changes.
- **Test first.** Before fixing a bug, write a regression test in
  `test/run.js` and confirm it fails against the current code. Only then
  apply the fix and confirm the same test passes. This caught real bugs that
  "just fix it" would have missed (see the branch history around
  2026-08-15 for examples: a session-outage alert storm, a nag double-notify,
  an undercounted unseen badge - all found by writing the test first, not by
  reading the code and guessing).
- **`npm run check`** before every commit (runs lint + tests). Treat any drop
  in the passing count as a stop-the-line signal, not something to explain
  away.
- **Validate UI changes live**, not just by reading the code. `popup.js` and
  `options.js` have no automated test coverage (`test/run.js` only loads
  `i18n.js` + `background.js`); for a popup/options change, either drive it
  in a real DOM (an isolated harness page with `chrome.*` mocked - see the
  pattern already used for this, not a new dependency) or ask the user to
  confirm before calling it done.
- **After a multi-commit round, do one more adversarial pass** over the
  whole diff before considering it done, not just the individual fixes in
  isolation. A round on this branch shipped a fix that individually tested
  fine but combined badly with an earlier fix in the same round (the
  `setConfig` re-baseline change removed a safety net that an unrelated
  auth-outage bug had been silently relying on) - only a full-diff review
  caught it, not the per-commit tests.
- Before claiming release-readiness, actually check: `manifest.json` version
  bumped, `CHANGELOG.md` `[Unreleased]` moved into a dated section,
  `.github/RELEASE_NOTES.md` rewritten (it becomes the literal GitHub Release
  body when a `v*` tag is pushed), and screenshots regenerated if the popup
  or options UI changed. The `release` skill in `.claude/skills/` runs this
  checklist.

## Commands

- `npm test` - the suite (`test/run.js`): pure functions plus multi-instance
  poll scenarios against a mocked Zabbix and mocked `chrome.*`.
- `npm run lint` - JS syntax of every source file, `PRIVACY.md` covers every
  `manifest.json` permission, i18n completeness (`test/lint.js`).
- `npm run check` - both. CI runs this plus a manifest-shape check and the
  em-dash guard on every push/PR (`.github/workflows/ci.yml`) - safe to
  replicate all of those locally instead of pushing just to find out.

## Available skills (`.claude/skills/`)

- `screenshots` - regenerate the marketing screenshots in `assets/` from the
  HTML mockups in `screenshots/`. Only slide 1 (popup) reuses the real
  `styles.css`; slides 2-4 are illustrated marketing mockups with their own
  inline CSS, not literal UI replicas - do not expect pixel parity with the
  real popup/options pages on those.
- `zbxnext-ideas` - mine `support.zabbix.com/projects/ZBXNEXT` (Zabbix's own
  public feature-request tracker) for demand signals relevant to this
  extension specifically, cross-checked against `IDEAS.md`.
- `release` - the version bump / CHANGELOG / RELEASE_NOTES / screenshot
  checklist above, as a repeatable procedure.
