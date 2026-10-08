const TASK_HEADERS = ['id', 'title', 'status', 'created_at', 'completed_at'];
const SESSION_HEADERS = ['id', 'task_id', 'planned_duration', 'actual_duration', 'started_at', 'ended_at', 'focus_score'];

function doGet(e) {
  const action = e.parameter.action || 'all';
  if (action !== 'all') return json({ error: 'Unknown action' });
  return json({ tasks: readRows_('Tasks', TASK_HEADERS), sessions: readRows_('Sessions', SESSION_HEADERS) });
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.action === 'saveTask') saveRow_('Tasks', TASK_HEADERS, body.task);
  else if (body.action === 'saveSession') saveRow_('Sessions', SESSION_HEADERS, body.session);
  else return json({ error: 'Unknown action' });
  return json({ ok: true });
}

function readRows_(name, headers) {
  const sheet = getSheet_(name, headers);
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values.map(row => Object.fromEntries(headers.map((key, index) => [key, row[index] === '' ? null : row[index]])));
}

function saveRow_(name, headers, record) {
  const sheet = getSheet_(name, headers);
  const idColumn = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().flat();
  const index = idColumn.indexOf(record.id);
  const row = headers.map(key => record[key] === undefined ? '' : record[key]);
  if (index < 0) sheet.appendRow(row);
  else sheet.getRange(index + 2, 1, 1, headers.length).setValues([row]);
}

function getSheet_(name, headers) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
