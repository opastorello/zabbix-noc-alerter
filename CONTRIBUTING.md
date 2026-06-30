# Contributing

Thanks for helping improve **Zabbix NOC Alerter**. It is a small, dependency-free
Chrome MV3 extension (vanilla JavaScript, no bundler). Contributions of all sizes
are welcome: bug fixes, accessibility, translations, docs.

## Run it locally

1. Clone the repo.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**
   and select the project folder.
3. Edit a file, then hit the reload icon on the extension card to apply changes.
4. Set your Zabbix URL in the extension **Options** (nothing is hardcoded).

## Add a language

The whole UI is translatable and the language list is self-extending:

1. In `i18n.js`, copy the `en` block inside `I18N`, change the key (for example `fr`)
   and translate the values.
2. Add the language to `LANG_NAMES` (the name shown in the selector) and to
   `LANG_TAGS` (the BCP47 tag used for `<html lang>`).
3. Reload the extension. The language selector and every screen pick it up
   automatically. No other file needs to change.

## Screenshots

If you change the popup or options UI, update the matching mockup in
`screenshots/` and regenerate the images in `assets/` (open each mockup at a
1280x800 viewport and capture it). See `screenshots/README.md` for details.
The same images are reused in the READMEs and the Chrome Web Store listing.

## Tests

Pure functions and the multi-instance poll logic have node-based tests (no
framework, no dependencies, no install):

- `npm test` runs the suite (`test/run.js`): pure functions (`problemUrl`,
  `migrateConfig`, `normalizeUrl`, `inMaintenance`, filters) plus poll scenarios
  driven against a mocked Zabbix (multi-instance aggregation, composite
  `instId:eventid` keys, snooze, maintenance, resolved, disabled instance).
- `npm run lint` checks the syntax of every source `.js` (`test/lint.js`).
- `npm run check` runs both. CI runs them on every push and pull request.

## House rules (please keep these)

These keep the project simple, private and portable:

- **Manifest V3, vanilla JS.** No external libraries, no bundler, no build step
  for the runtime code.
- **Nothing hardcoded.** The Zabbix URL and the optional API token live only in
  the Options (`chrome.storage.local`). Never embed a URL or token in the code.
- **Auth.** The browser session cookie is the primary auth; an API token is an
  optional fallback. Keep both paths working.
- **Version in one place.** `manifest.json` is the single source of truth; the UI
  reads it via `chrome.runtime.getManifest()`. Do not hardcode a version anywhere else.
- **i18n.** Every user-visible string goes through `i18n.js` (PT / EN / ES kept in
  parity). Use correct accents.
- **No em-dash.** Use a plain hyphen `-` (the em-dash character, U+2014, is not allowed).
- **Sounds** are synthesized with the Web Audio API. No audio binaries.

CI enforces a few of these (manifest validity and no em-dash).

## Pull requests

Keep PRs focused. Describe what changed and why, and test the extension reloaded
in Chrome before opening the PR. Be kind in reviews.
