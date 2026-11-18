## What's new in v0.6.0
- Timed mute: 15 min, 1 h, 4 h, until the end of your shift or until you unmute. A timed mute turns itself off and tells you, and anything that arrived while muted and is still open alerts once when it ends, so a forgotten mute no longer silences the NOC for a weekend.
- Blind-spot alert (on by default): when the extension cannot read an instance for 2 minutes (session lost, invalid token, Zabbix down, no network), it warns with a notification that stays on screen and its own sound, and again when the instance is back. A Zabbix you cannot see used to look exactly like a quiet one.
- Act straight from the notification: every problem notification has "ACK" and "Snooze 15 min" buttons.
- The trigger's operational data ("CPU 97%", "free 4%") is shown on each row of the popup and in the notification text.
- Tags: each problem shows its tags as chips (click one to filter the list), the text filter matches tags, and each instance accepts a tag filter like `service:web`, `env=prod` or `team`.
- New "Display" section in Options: the same tag settings as the Problems page in Zabbix (how many, the tag name format, which tags come first) and where the operational data goes; turn off the ACK message, the SNZ/ACK buttons or the severity counters; a compact one-line mode; and notifications without the value or the buttons. The defaults keep everything looking as before.
- "Newest" sort in the popup, and a NEW tag on problems that appeared since you last opened it (GitHub #28).
- Zabbix 8.0 LTS is supported, validated live with all three auth modes next to 6.0.
- The popup status bar now names the instance that stopped answering and why, instead of only "2/3 OK".
- Fixed: problems from a disabled host no longer stay in the list (GitHub #27).
- Fixed: a problem that only stops being shown (host disabled, acknowledged with "ignore acknowledged" on, entered maintenance) no longer fires a false "Resolved" notification.
- Fixed: importing a settings file no longer wipes the API token or password of your instances.
- Fixed: no burst of alerts for problems that already existed when an instance answers for the first time (for example after adding an instance before logging into that Zabbix, or starting the browser before the network is up).
- Fixed: clicking a notification or its buttons after the browser put the extension to sleep now works for every notification of a batch, not only the last one.
- Fixed: removing an instance no longer makes a snooze or a notification button point at a different Zabbix.
- Fixed: changing an instance's URL no longer keeps showing the old server's problems under it.
- Fixed: a snooze ending in the same check as a new problem plays one sound instead of two at once.
- Fixed: a problem name, host or tag with double quotes no longer breaks the popup row.
- Fixed: a settings file with a value an Options list does not know no longer leaves that list blank.

---

A dependency-free Chrome MV3 extension that fires a sound alarm and a browser notification the moment a new Zabbix problem appears, using the browser session you are already logged into. No token, nothing hardcoded.

## Features
- Multi-instance: up to 8 independent Zabbix servers, each with its own URL and authentication; every problem is badged with its instance.
- Three auth modes per instance: browser session (no credentials), API token, or username and password (the extension logs in and renews the session by itself).
- Per-severity sound with volume and a test button.
- Re-alarm (sound and notification) while a problem is unacknowledged, until you ack it or mute.
- Timed mute: 15 min, 1 h, 4 h, until the end of your shift or until you unmute; a timed mute turns itself off and tells you.
- Blind-spot alert: warns when the extension stops seeing an instance (session lost, invalid token, Zabbix down, no network).
- Alert only during working hours, read from the Zabbix server's Working time.
- Meeting mode: silence sounds and/or notifications during a Google Meet call.
- Maintenance-aware: problems in a maintenance window get an MNT tag and stay silent (or hide them).
- Live filter in the popup by host, problem name or tag, or by clicking a severity or a tag chip; sort (severity, age, newest, host) and group by host or instance; problems that appeared since you last looked are tagged NEW.
- Snooze a single problem (15 min to 4 h) without the global mute; it re-alerts when the snooze ends.
- Shows the host (and the instance, when you watch more than one), the trigger's operational data and its tags in the list; the host and the operational data also go in the notification.
- Choose what is shown: tag count, tag name format and priority (like the Problems page in Zabbix), where the operational data goes, the ACK message, the SNZ/ACK buttons and the severity counters, a compact one-line mode, and what the notifications carry.
- Acknowledge or snooze straight from the notification, or from the popup with a message; see any existing ack.
- Resolved notification when a problem recovers.
- Click a problem to open the exact event in Zabbix.
- Filters: minimum severity, max age, host groups, tags, exclude by text, hide suppressed/acknowledged/in-maintenance; optional "unseen" badge.
- Backup: export and import settings as JSON (instance tokens and passwords are never exported).
- Languages: English, Portuguese, Spanish, picked automatically from your browser.
- Nothing hardcoded: the URLs and credentials live only in the options.

## Install
Easiest: install from the Chrome Web Store (https://chromewebstore.google.com/detail/zabbix-noc-alerter/nlbihmhpbdfhnglclecbaebnfpjbngep), then add a Zabbix instance in the options and keep a Zabbix tab logged in.

From source: download the zip below and unzip it (or clone the repo). Open `chrome://extensions`, turn on Developer mode, click Load unpacked and pick the folder. Then add a Zabbix instance in the options and keep a Zabbix tab logged in.
