## What's new in v0.5.0
- Per-instance authentication mode: choose browser session (default, no credential needed), an API token, or a username and password for each Zabbix instance. Username/password logs in automatically (`user.login`) and renews the session by itself when it expires.
- Fixed: the severity counts in the popup header could disagree with the visible list when there were enough disaster/high problems (GitHub #26).
- Fixed: problems from a disabled trigger no longer stay in the list forever (GitHub #25).
- Fixed: the popup now remembers your text filter, severity filter, sort and grouping between openings (GitHub #25).
- Fixed: resolved-problem notifications now respect mute and meeting mode, not only working hours.
- Fixed: a Zabbix session or credential recovering after an outage no longer re-alerts every problem that was already known before the outage.
- Fixed: saving an unrelated option (volume, language, ...) no longer risks missing a problem that appeared at that exact moment.
- Fixed: the re-alarm could occasionally send a duplicate notification for a just-arrived problem when the sound was off.
- Fixed: the "unseen" badge could undercount a problem detected with a delay (for example after a brief network hiccup).
- A failing instance now backs off instead of being retried every poll forever, keeps showing its last known state while it recovers, and a config fix retries right away.
- A failing `trigger.get`, or "alert only during working hours" failing to read the schedule, now shows in the popup instead of failing silently.
- A notification batch larger than the per-poll limit now says "and N more" instead of the rest silently disappearing.

---

A dependency-free Chrome MV3 extension that fires a sound alarm and a browser notification the moment a new Zabbix problem appears, using the browser session you are already logged into. No token, nothing hardcoded.

## Features
- Multi-instance: up to 8 independent Zabbix servers, each with its own URL and authentication.
- Three auth modes per instance: browser session (no credentials), API token, or username and password.
- Per-severity sound with volume and a test button.
- Re-alarm while a problem is unacknowledged, until you ack it or mute.
- Alert only during working hours, read from the Zabbix server's Working time.
- Meeting mode: silence sounds and/or notifications during a Google Meet call.
- Shows the host (and the instance, when you watch more than one) in the list and in the notification.
- Acknowledge or snooze a single problem from the popup.
- Resolved notification when a problem recovers.
- Click a problem to open the exact event in Zabbix.
- Filters: minimum severity, max age, host groups, exclude by text, hide suppressed/acknowledged/in-maintenance.
- Popup tools: live filter box, severity-stat filter, sort, and group by host or instance; the view is remembered between openings.
- Maintenance-aware: problems in a maintenance window get an MNT tag and stay silent.
- Export and import settings as JSON.
- Languages: English, Portuguese, Spanish, picked automatically from your browser.
- Nothing hardcoded: the URLs and credentials live only in the options.

## Install
Easiest: install from the Chrome Web Store (https://chromewebstore.google.com/detail/zabbix-noc-alerter/nlbihmhpbdfhnglclecbaebnfpjbngep), then add a Zabbix instance in the options and keep a Zabbix tab logged in.

From source: download the zip below and unzip it (or clone the repo). Open `chrome://extensions`, turn on Developer mode, click Load unpacked and pick the folder. Then add a Zabbix instance in the options and keep a Zabbix tab logged in.
