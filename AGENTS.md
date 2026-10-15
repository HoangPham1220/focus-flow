# Repository Guidelines

## Project Structure

FocusFlow is a small static web app with no framework or build step. The app shell is `index.html`, interaction and timer logic are in `app.js`, and presentation is in `styles.css`. PWA files are `manifest.json`, `service-worker.js`, and `icon.svg`. `config.js` holds the Google Apps Script endpoint; `Code.gs` is the Apps Script backend for the `Tasks` and `Sessions` sheets. `README.md` documents setup. There is currently no test directory or automated test framework.

## Run and Validate Locally

- `python -m http.server 8000` serves the app at `http://localhost:8000` and enables service-worker behavior.
- `node --check app.js` and `node --check service-worker.js` check browser JavaScript syntax.
- `Get-Content -Raw Code.gs | node --check` checks Apps Script syntax with Node.
- `git diff --check` catches whitespace errors before committing.

There is no compile or bundle command. For behavior changes, manually check the affected flow in a browser, including mobile-sized layouts when UI changes.

## Style and Conventions

Keep changes small and consistent with the existing vanilla JavaScript, HTML, and CSS. Use two spaces for JavaScript indentation, `camelCase` for functions and variables, descriptive kebab-case HTML IDs/classes, and CSS custom properties for shared colors. Avoid dependencies and features outside the requested scope. Keep timer settings in the existing settings model rather than duplicating hard-coded values.

## Tests

No automated test suite or coverage threshold is configured. Validate relevant behavior manually and run the syntax/whitespace checks above. If adding tests, keep them focused on observable app flows and document how to run them.

## Commits and Pull Requests

Recent commits use short imperative subjects, for example `Add customizable focus timer cycles` and `Improve Google Sheets report sync`. Follow that pattern. PRs should describe user-visible changes, list validation performed, and include mobile screenshots for visual changes. Mention any Apps Script redeployment or configuration steps.

## Security and Configuration

Do not add credentials or spreadsheet contents to source control. The Apps Script URL in `config.js` is an accessible endpoint when deployed with public access; anyone who obtains it may read or write sheet data. Treat it as sensitive and avoid sharing it publicly. Keep `SPREADSHEET_ID` configured in Apps Script, not in client-side files.
