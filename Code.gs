const SPREADSHEET_ID = 'PASTE_SPREADSHEET_ID_HERE';
const TASK_HEADERS = ['id', 'title', 'status', 'created_at', 'completed_at'];
const SESSION_HEADERS = ['id', 'task_id', 'planned_duration', 'actual_duration', 'started_at', 'ended_at', 'focus_score'];

function doGet(e) {
  const lock = LockService.getScriptLock();
  try {
    if (e && e.parameter.action && e.parameter.action !== 'all') throw new Error('Unknown action');
    lock.waitLock(20000);
    return json_({ tasks: readRows_('Tasks', TASK_HEADERS), sessions: readRows_('Sessions', SESSION_HEADERS) });
  } catch (error) { return json_({ error: error.message }); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents);
    if (!['saveTask', 'saveSession'].includes(body.action)) throw new Error('Unknown action');
    const isTask = body.action === 'saveTask';
    const record = body[isTask ? 'task' : 'session'];
    validate_(record, isTask);
    lock.waitLock(20000);
    saveRow_(isTask ? 'Tasks' : 'Sessions', isTask ? TASK_HEADERS : SESSION_HEADERS, record);
    return json_({ ok: true });
  } catch (error) { return json_({ error: error.message }); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}

function validate_(record, isTask) {
  if (!record || typeof record.id !== 'string' || !record.id.trim()) throw new Error('Missing record ID');
  if (isTask) {
    if (typeof record.title !== 'string' || !record.title.trim() || record.title.length > 120) throw new Error('Invalid task title');
    if (!['open', 'completed'].includes(record.status)) throw new Error('Invalid task status');
    if (!Number.isFinite(Date.parse(record.created_at))) throw new Error('Invalid task creation time');
  } else {
    if (!Number.isFinite(record.planned_duration) || record.planned_duration <= 0) throw new Error('Invalid planned duration');
    if (!Number.isFinite(record.actual_duration) || record.actual_duration < 0) throw new Error('Invalid actual duration');
    if (!Number.isFinite(Date.parse(record.started_at)) || !Number.isFinite(Date.parse(record.ended_at))) throw new Error('Invalid session time');
    if (record.focus_score != null && (!Number.isInteger(record.focus_score) || record.focus_score < 1 || record.focus_score > 5)) throw new Error('Invalid focus score');
  }
}

function readRows_(name, headers) {
  const sheet = getSheet_(name, headers);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    .filter(row => row[0] !== '')
    .map(row => Object.fromEntries(headers.map((key, index) => [key, row[index] === '' ? null : row[index]])));
}

function saveRow_(name, headers, record) {
  const sheet = getSheet_(name, headers);
  const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues() : [];
  const index = existing.findIndex(row => row[0] === record.id);
  // A delayed request must not reopen a completed task or erase a saved score.
  if (index >= 0 && name === 'Tasks' && existing[index][2] === 'completed') {
    record.status = 'completed'; record.completed_at = existing[index][4];
  }
  if (index >= 0 && name === 'Sessions' && record.focus_score == null && existing[index][6] !== '') record.focus_score = existing[index][6];
  const row = headers.map(key => {
    const value = record[key] == null ? '' : record[key];
    return typeof value === 'string' && value.startsWith('=') ? "'" + value : value;
  });
  if (index < 0) sheet.appendRow(row);
  else sheet.getRange(index + 2, 1, 1, headers.length).setValues([row]);
}

function getSheet_(name, headers) {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'PASTE_SPREADSHEET_ID_HERE') throw new Error('Set SPREADSHEET_ID in Code.gs first.');
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (headers.some((header, index) => actual[index] !== header)) throw new Error('Unexpected headers in ' + name + '. Restore the documented column order.');
  return sheet;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
