## What's new in v0.1.1
- Now on the Chrome Web Store: https://chromewebstore.google.com/detail/zabbix-noc-alerter/nlbihmhpbdfhnglclecbaebnfpjbngep - install in one click, with automatic updates.
- Notifications now show the full extension name "Zabbix NOC Alerter" (was "Zabbix NOC").

---

A dependency-free Chrome MV3 extension that fires a sound alarm and a browser notification the moment a new Zabbix problem appears, using the browser session you are already logged into. No token, nothing hardcoded.

## Features
- Per-severity sound with volume and a test button.
- Re-alarm while a problem is unacknowledged, until you ack it or mute.
- Shows the host in the list and in the notification.
- Acknowledge from the popup (with a message); shows any existing ack.
- Resolved notification when a problem recovers.
- Click a problem to open the exact event in Zabbix.
- Filters: minimum severity, max age, exclude by text, hide suppressed/acknowledged.
- Languages: English, Portuguese, Spanish, picked automatically from your browser.
- Nothing hardcoded: the URL and an optional token live only in the options.
- Accessibility: keyboard-navigable list, ARIA labels and live regions.

## Install
Easiest: install from the Chrome Web Store (https://chromewebstore.google.com/detail/zabbix-noc-alerter/nlbihmhpbdfhnglclecbaebnfpjbngep), then set your Zabbix URL in the options and keep a Zabbix tab logged in.

From source: download the zip below and unzip it (or clone the repo). Open `chrome://extensions`, turn on Developer mode, click Load unpacked and pick the folder. Then set your Zabbix URL in the options and keep a Zabbix tab logged in.
