## What's new in v0.3.0
- Multi-instance: watch up to 8 independent Zabbix instances at once, each with its own URL and an optional token. Every problem in the popup is badged with its instance, and ack/snooze route to the correct one. Community contribution by @GoianoMarques.
- Per-instance host group filter: name the Zabbix host groups to watch and the extension filters them at the server (groupids); empty = all.
- Group the popup list by host or by instance, with collapsible group headers.
- Snooze a single problem (15 min to 4 h) without the global mute; it re-alerts when the snooze ends.
- Click a severity stat to filter the list; sort by severity, age or host.
- Export and import settings as JSON (instance tokens are never exported).

---

A dependency-free Chrome MV3 extension that fires a sound alarm and a browser notification the moment a new Zabbix problem appears, using the browser session you are already logged into. No token, nothing hardcoded.

## Features
- Multi-instance: up to 8 independent Zabbix servers, each with session-cookie auth or an optional token.
- Per-severity sound with volume and a test button.
- Re-alarm while a problem is unacknowledged, until you ack it or mute.
- Shows the host (and the instance, when you watch more than one) in the list and in the notification.
- Acknowledge or snooze a single problem from the popup.
- Resolved notification when a problem recovers.
- Click a problem to open the exact event in Zabbix.
- Filters: minimum severity, max age, host groups, exclude by text, hide suppressed/acknowledged/in-maintenance.
- Popup tools: live filter box, severity-stat filter, sort, and group by host or instance.
- Maintenance-aware: problems in a maintenance window get an MNT tag and stay silent.
- Export and import settings as JSON.
- Languages: English, Portuguese, Spanish, picked automatically from your browser.
- Nothing hardcoded: the URLs and optional tokens live only in the options.
- Accessibility: keyboard-navigable list, ARIA labels and live regions.

## Install
Easiest: install from the Chrome Web Store (https://chromewebstore.google.com/detail/zabbix-noc-alerter/nlbihmhpbdfhnglclecbaebnfpjbngep), then add a Zabbix instance in the options and keep a Zabbix tab logged in.

From source: download the zip below and unzip it (or clone the repo). Open `chrome://extensions`, turn on Developer mode, click Load unpacked and pick the folder. Then add a Zabbix instance in the options and keep a Zabbix tab logged in.
