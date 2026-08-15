# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version is the one
in `manifest.json`.

## [Unreleased]

## [0.5.0]

### Added
- Per-instance authentication mode: browser session (default, unchanged), API
  token, or username and password (the extension logs in via `user.login`,
  caches the session and renews it once automatically when it expires). The
  choice is explicit per instance; a mode with an empty credential is an error,
  it does not silently fall back to another mode.

### Fixed
- The severity counts in the popup header could contradict the visible list
  (for example "42 average" while the list showed none) when there were
  enough disaster/high problems to fill the internal list cap before lower
  severities were considered (GitHub #26).
- Problems from a disabled trigger no longer stay in the list forever; Zabbix
  does not close them on its own when the trigger is disabled (GitHub #25).
- The popup's text filter, severity filter, sort and grouping are now
  remembered between openings, instead of resetting every time (GitHub #25).
- Resolved-problem notifications now respect mute and meeting mode, not only
  working hours.
- A session or credential outage recovering (cookie renewed, token fixed) no
  longer fires a false alert for every problem that was already known before
  the outage started.
- Saving an option unrelated to filtering (volume, language, sounds, ...) no
  longer risks silently adopting a problem that appeared at that exact moment
  as "already known", which used to mean it never alerted.
- The re-alarm could occasionally send a duplicate notification for a
  just-arrived problem when the sound was turned off.
- The "unseen" popup badge could undercount a problem that was detected late
  (for example after a network hiccup), since it compared against the
  problem's own Zabbix timestamp instead of when the extension actually saw it.
- `PRIVACY.md` now documents the `tabs` permission and the username/password
  mode; a CI check keeps it in sync with `manifest.json` going forward.

### Changed
- A failing Zabbix instance now backs off (30s, doubling up to 5 min) instead
  of being retried every poll forever; it keeps showing its last known state
  while backing off, and a config change (fixing the URL or credential)
  retries right away instead of waiting out the backoff.
- `trigger.get` failing, or returning an incomplete response, now shows as a
  visible "host names unavailable" state in the popup instead of silently
  leaving every row without a host name.
- "Alert only during working hours" failing to read the schedule from the
  server is now shown in the popup status bar, not only discoverable by
  opening Options.
- A notification batch larger than the per-poll limit now says "and N more"
  on the last toast instead of the rest silently disappearing.

## [0.4.0]

### Added
- Meeting mode (Google Meet): silence sounds and/or notifications while a Meet call tab is open. Both sub-options now default to on, so enabling the mode actually silences alerts.
- "Alert only during working hours" option: reads the `work_period` from the Zabbix server (`settings.get`) and keeps sounds and notifications silent outside it; the list, badge and status keep updating. With multiple instances, all readable schedules are shown in the options and alerts fire when inside any of them. Fail-open: if the API cannot read the setting (permissions, Zabbix < 5.4), alerts work normally, and the options page disables the checkbox showing the reason.

### Fixed
- Volume at 0% is now truly mute; it used to fall back to 80% because 0 was treated as "unset".
- Popup no longer opens empty/"configure an instance" right after the browser starts: the last known status is persisted and shown, and both the popup and the background re-check automatically when the status is stale (no more manual "check now").
- The sub-30s polling heartbeat is re-armed every minute; Chrome silently destroys the offscreen document after ~30s without audio, which used to degrade polling to once a minute until a sound played.

### Removed
- The test-sound button in the popup toolbar (sounds can still be previewed per severity in the options page).

## [0.3.0]

### Added
- Multi-instance: watch up to 8 independent Zabbix instances at once, each with its own URL and an optional API token. The popup badges every problem with its instance, and acknowledge/snooze route to the correct one. Community contribution by @GoianoMarques.
- Per-instance host group filter: name the Zabbix host groups to watch; the extension resolves them to `groupids` and filters server-side (empty = all groups).
- Group the popup list by host or by instance, with collapsible group headers; composes with the text filter, the severity filter and the sort.
- Snooze a single problem (15 min to 4 h) without the global mute; it re-alerts when the snooze ends.
- Filter the popup list by clicking a severity stat (DIS/HIGH/AVG/WARN/INFO); composes with the text filter.
- Sort the popup list by severity (default), age (oldest first) or host.
- Export and import settings as a JSON file (instance tokens are never exported, and never overwritten on import).
- Option to toggle the re-alarm notification ("re-notify on re-alarm").

### Changed
- Options: each Zabbix instance is a collapsible card (collapsed when you open the page) for a cleaner view as you add more.

### Internal
- Dependency-free node test suite (pure functions plus multi-instance poll scenarios) and a JS-syntax lint, run on every push and pull request in CI.

## [0.2.0]

### Added
- Maintenance handling: problems in a Zabbix maintenance window get a distinct blue MNT tag (separate from the amber SUP), can be hidden with an "ignore maintenance" option, and are visual-only (they never trigger sound or notification).
- Live filter box in the popup to filter the list by host or problem name.
- The re-alarm (nag) now also shows a browser notification, not just the sound; it updates in place and clears once nothing is unacknowledged.
- Optional "unseen" badge mode: the toolbar badge counts only problems that appeared since the popup was last opened, and resets when you open it (off by default).

### Fixed
- The popup and options now show the full version including the patch (e.g. 0.1.1), not just major.minor.
- Silenced a benign "Receiving end does not exist" error from the offscreen audio messages.

### Changed
- Documented Zabbix compatibility (tested on 6.0 to 7.4).

## [0.1.1]

### Changed
- README (EN/PT/ES) now links to the Chrome Web Store listing as the recommended install, keeping the unpacked install as an alternative.

### Fixed
- Problem and resolved notifications now show the full extension name "Zabbix NOC Alerter" in the context line (was "Zabbix NOC").

## [0.1.0]

First public release.

### Added
- Sound alarm per severity (5 configurable presets) with volume and test buttons.
- Browser notification on a new problem, showing the host.
- Re-alarm (nag) while an unacknowledged problem exists, until ack or mute.
- Acknowledge a problem from the popup (with a message), showing any existing ack.
- Resolved notification when a problem recovers.
- Click a problem to open the exact event in Zabbix.
- Exclude filter (hide problems whose name or host matches a text).
- Age filter (max age in days, mirrors Zabbix "Age less than"; hides old chronic ones).
- Session-cookie auth as primary, optional API token as fallback.
- Internationalization: Portuguese, English and Spanish, self-extending.
- Nothing hardcoded: URL and token live only in the Options.
- Accessibility pass: keyboard-navigable problem list, ARIA labels and live regions.
