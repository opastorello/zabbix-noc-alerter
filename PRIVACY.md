# Privacy Policy

**Zabbix NOC Alerter** (the "extension") alerts you to new problems in your own
Zabbix instance. This policy explains how it handles data.

## Summary

The extension does **not** collect, store, or transmit any personal data to the
developer or to any third party. It communicates only with the Zabbix server URL(s)
that **you** configure, using your existing browser session, an optional API token,
or a username and password, all provided by you.

## What the extension accesses

- **Your settings** (Zabbix URL, credentials for your chosen auth mode, sound and
  filter preferences, language, mute state): stored locally on your device via
  `chrome.storage.local`. They never leave your device except as part of a request
  to your own Zabbix.
- **Your Zabbix session cookie**: read locally to authenticate requests to the
  Zabbix URL you configured, so you do not need to enter a token. It is sent only
  to your Zabbix server, never to the developer or any third party.
- **Your Zabbix credentials, if you choose an auth mode that needs them**:
  - **API token**: stored as you entered it in `chrome.storage.local`, sent only
    to your Zabbix server as a Bearer token.
  - **Username and password**: the password is stored in plain text in
    `chrome.storage.local` (the same way the token is), used only to call your
    Zabbix `user.login` and obtain a session, and sent only to your Zabbix server.
    The browser-session mode above needs no stored credential at all and is the
    recommended default; token and user/password exist for kiosks and service
    accounts.
- **Open Google Meet tabs**: checked locally (tab URLs only, via the `tabs`
  permission) so the optional meeting mode can silence sound/notifications while
  you are in a call. No tab content is read, and nothing about your tabs is sent
  anywhere.
- **Problem data from your Zabbix**: fetched from your Zabbix API to show active
  problems in the popup and notifications. It stays on your device.

## What the extension does NOT do

- No analytics, no telemetry, no tracking of any kind.
- No selling or sharing of data with third parties.
- No remote code: all logic is bundled in the extension; alarm sounds are
  generated locally with the Web Audio API (no external files).
- It contacts no server other than the single Zabbix URL you set.

## Permissions and why they are needed

- **storage**: save your settings locally.
- **cookies**: read your Zabbix session cookie to authenticate to your Zabbix.
- **notifications**: show a desktop notification for new or resolved problems.
- **offscreen**: play the alarm sound (Manifest V3 service workers cannot play audio).
- **alarms**: wake the background worker periodically to check your Zabbix.
- **tabs**: read open tab URLs to detect a Google Meet call for the optional
  meeting mode. No tab content is read, and no browsing history is stored anywhere.
- **host permissions (`<all_urls>`)**: required because your Zabbix can be on any
  domain, IP, or port that only you know; the extension only ever contacts the
  URL(s) you configure in the options.

## Contact

Questions or issues: https://github.com/opastorello/zabbix-noc-alerter/issues

_Last updated: August 2026._
