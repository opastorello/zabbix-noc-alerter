# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version is the one
in `manifest.json`.

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
