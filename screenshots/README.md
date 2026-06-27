# Screenshots (source)

Source mockups for the marketing screenshots shown in the READMEs and used
for the Chrome Web Store listing. One HTML file per language and slide:

```
screenshots/<lang>/screenshot-<n>.html  ->  assets/<lang>/screenshot-<n>.jpeg
```

- **1280x800** each. That is a valid Chrome Web Store screenshot size and the
  size the READMEs embed, so the **same** image serves both. No separate
  "store" copy is needed.
- The popup/options frames reuse the extension's real `../../styles.css` and
  `../../icons/`, so colors, badges and tags always match the actual UI.
- This folder is `export-ignore` (see `.gitattributes`): it never ships in the
  packaged extension zip.

## Slides

1. Popup with active problems (live filter box, MNT/SUP tags)
2. Desktop notifications
3. Options and filters (toggles)
4. Privacy

## Regenerate

When the popup or options UI changes, edit the matching
`screenshots/<lang>/screenshot-<n>.html`, then re-render:

- **With Claude Code:** run the `screenshots` skill (it renders every
  language/slide and writes the JPEGs into `assets/`).
- **By hand:** open each file in Chrome at a 1280x800 viewport and capture the
  viewport to `assets/<lang>/screenshot-<n>.jpeg` (JPEG, quality ~90).

Keep the HTML free of em-dash characters; the CI guard rail rejects them.
