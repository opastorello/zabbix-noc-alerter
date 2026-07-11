## What's new in v0.4.0
- Meeting mode (Google Meet): silences sounds and/or notifications while you are in a Meet call. Both sub-options come enabled by default.
- Alert only during working hours: reads the Working time from your Zabbix server (`settings.get`) and stays silent outside it; the list, badge and status keep updating. With multiple instances, all readable schedules are shown and alerts fire when inside any of them. Fail-open: if the setting cannot be read, alerts work normally and the options page disables the checkbox showing the reason.
- Fixed: volume at 0% is now truly mute (it used to fall back to 80%).
- Fixed: the popup no longer opens empty right after the browser starts; the last known status is persisted and both the popup and the background re-check automatically when it is stale.
- Fixed: the sub-30s polling heartbeat is re-armed every minute (Chrome silently destroys the offscreen document after ~30s without audio, which degraded polling to once a minute).
- Removed the test-sound button from the popup toolbar (per-severity previews remain in the options).

---

A dependency-free Chrome MV3 extension that fires a sound alarm and a browser notification the moment a new Zabbix problem appears, using the browser session you are already logged into. No token, nothing hardcoded.

## Features
- Multi-instance: up to 8 independent Zabbix servers, each with session-cookie auth or an optional token.
- Per-severity sound with volume and a test button.
- Re-alarm while a problem is unacknowledged, until you ack it or mute.
- Alert only during working hours, read from the Zabbix server's Working time.
- Meeting mode: silence sounds and/or notifications during a Google Meet call.
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
