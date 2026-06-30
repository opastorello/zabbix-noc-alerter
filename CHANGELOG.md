# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version is the one
in `manifest.json`.

## [Unreleased]

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
