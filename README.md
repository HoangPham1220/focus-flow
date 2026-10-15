# FocusFlow

A mobile-first focus timer built with plain HTML, CSS and JavaScript. It has Focus, Short Break and Long Break cycles, a simple task list, focus ratings, basic statistics, local storage, and an optional Google Sheets connection. Default cycle: 60-minute focus, 15-minute short break, 30-minute long break after 2 focus sessions. Change the durations and cycle length on the Settings screen.

## Run locally

From this folder, start any static web server, for example:

```sh
python -m http.server 8000
```

Open <http://localhost:8000>. The app stores tasks and sessions in this browser's localStorage when Sheets is not configured. Use localhost or HTTPS for service worker and install support; opening `index.html` directly still lets the app run without PWA features.

## Google Sheets setup

1. Create a Google spreadsheet and open **Extensions → Apps Script**.
2. Copy `Code.gs` into the script editor. In `SPREADSHEET_ID`, paste the ID from the spreadsheet URL (the text between `/d/` and `/edit`), then save.
3. Deploy it as a **Web app**. Set **Execute as** to yourself and access to **Anyone**. Authorize the requested spreadsheet access and copy the deployed web app URL.
4. Paste the URL into `googleAppsScriptUrl` in `config.js`, publish the updated app, then reload FocusFlow.
5. Apps Script creates the `Tasks` and `Sessions` sheets with headers. Existing local tasks and focus sessions are merged into Sheets; focus reports contain their task, planned/actual duration, start/end times, and score.

The web app reads both sheets with `?action=all` and writes task/session records as they change. Browser localStorage remains enabled as an offline fallback. Deploy `Code.gs` as a web app again after changing the script. When replacing an existing deployment, edit that deployment to use the new version.

## PWA

Serve over HTTPS (or localhost) to enable the service worker and browser install prompt. `manifest.json` and `icon.svg` are included; the SVG is a simple placeholder app icon.
