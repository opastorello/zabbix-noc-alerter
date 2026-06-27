---
name: screenshots
description: Regenerate the Zabbix NOC Alerter marketing screenshots (used in the READMEs and the Chrome Web Store listing) from the HTML mockups in screenshots/. Use when the popup or options UI changed and the images in assets/ are out of date, or when asked to refresh/rebuild the screenshots.
---

# Regenerate screenshots

The marketing screenshots are 1280x800 HTML mockups under
`screenshots/<lang>/screenshot-<n>.html` that render to
`assets/<lang>/screenshot-<n>.jpeg`. The same image serves both the README and
the Chrome Web Store (1280x800 is a valid store size), so there is only one set
of files to maintain: `assets/`.

Languages: `en`, `pt`, `es`. Slides: `1` popup, `2` notifications, `3` options,
`4` privacy.

## If the UI changed

Edit the matching `screenshots/<lang>/screenshot-<n>.html` first. The popup and
options frames reuse the extension's real `../../styles.css` and `../../icons/`,
so keep using the same CSS classes (`.row`, `.badge`, `.tag`, `.tag.mnt`,
`.filter-box`, the options `.tg`/`.tr`, etc.) and the rendering stays in sync
with the actual extension. Keep the text in sync across the three languages.

## Render (uses the chrome-devtools MCP)

1. Confirm a Chrome is reachable: `list_pages`. If not, ask the user to open
   Chrome (the MCP needs a running browser).
2. `resize_page` to width 1280, height 800 (once).
3. For each `lang` in en/pt/es and each `n` in 1..4:
   - `navigate_page` (type url) to
     `file:///<absolute-repo-path>/screenshots/<lang>/screenshot-<n>.html`
   - then `take_screenshot` with `format: jpeg`, `quality: 90`, and
     `filePath: <absolute-repo-path>/assets/<lang>/screenshot-<n>.jpeg`.
   - Do navigate and screenshot as separate steps (the capture must happen
     after the page loads). A `take_screenshot` can occasionally time out;
     just retry it (the page is already loaded).
4. Spot-check a few results by reading the saved JPEGs.

## Guard rails

- No em-dash characters anywhere in the source HTML (CI rejects them; use a
  plain hyphen).
- `screenshots/` and `.claude/` are `export-ignore` in `.gitattributes`, so
  they never ship in the packaged extension zip. Only `assets/` JPEGs are
  committed for the READMEs (and `assets/` is itself export-ignore too).
- Commit the regenerated `assets/*.jpeg` on a `docs/` branch.
