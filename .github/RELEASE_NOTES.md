## What's new in v0.2.0
- Maintenance-aware: problems in a Zabbix maintenance window get a distinct MNT tag, can be hidden, and never make noise (visual-only).
- Live filter box in the popup (filter by host or problem name).
- The re-alarm (nag) now also raises a notification, not just the sound.
- Optional "unseen" badge mode: counts only problems that appeared since you last opened the popup, and resets on open (off by default).
- Fixes: the UI now shows the full version (with patch); a benign service-worker console error was silenced.

---

A dependency-free Chrome MV3 extension that fires a sound alarm and a browser notification the moment a new Zabbix problem appears, using the browser session you are already logged into. No token, nothing hardcoded.

## Features
- Per-severity sound with volume and a test button.
- Re-alarm while a problem is unacknowledged, until you ack it or mute.
- Shows the host in the list and in the notification.
- Acknowledge from the popup (with a message); shows any existing ack.
- Resolved notification when a problem recovers.
- Click a problem to open the exact event in Zabbix.
- Filters: minimum severity, max age, exclude by text, hide suppressed/acknowledged/in-maintenance.
- Live filter box in the popup (by host or problem name).
- Maintenance-aware: problems in a maintenance window get an MNT tag and stay silent.
- Languages: English, Portuguese, Spanish, picked automatically from your browser.
- Nothing hardcoded: the URL and an optional token live only in the options.
- Accessibility: keyboard-navigable list, ARIA labels and live regions.

## Install
Easiest: install from the Chrome Web Store (https://chromewebstore.google.com/detail/zabbix-noc-alerter/nlbihmhpbdfhnglclecbaebnfpjbngep), then set your Zabbix URL in the options and keep a Zabbix tab logged in.

From source: download the zip below and unzip it (or clone the repo). Open `chrome://extensions`, turn on Developer mode, click Load unpacked and pick the folder. Then set your Zabbix URL in the options and keep a Zabbix tab logged in.
