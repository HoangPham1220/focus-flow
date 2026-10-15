const SPREADSHEET_ID = 'PASTE_SPREADSHEET_ID_HERE';
const TASK_HEADERS = ['id', 'title', 'status', 'created_at', 'completed_at', 'type', 'parent_id'];
const SESSION_HEADERS = ['id', 'task_id', 'planned_duration', 'actual_duration', 'started_at', 'ended_at', 'focus_score'];

// Run once from the Apps Script editor opened through Sheets > Extensions.
// Script Properties survive code replacement and web app redeployment.
function setupSpreadsheet() {
  const properties = PropertiesService.getScriptProperties();
  const configuredId = properties.getProperty('SPREADSHEET_ID') || (SPREADSHEET_ID !== 'PASTE_SPREADSHEET_ID_HERE' ? SPREADSHEET_ID : '');
  const spreadsheet = configuredId ? SpreadsheetApp.openById(configuredId) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Open this script from your Sheet via Extensions > Apps Script, or set SPREADSHEET_ID in Project Settings > Script properties.');
  properties.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  getSheet_('Tasks', TASK_HEADERS);
  getSheet_('Sessions', SESSION_HEADERS);
  return 'Spreadsheet connection saved.';
}

function doGet(e) {
  const lock = LockService.getScriptLock();
  try {
    if (e && e.parameter.action && e.parameter.action !== 'all') throw new Error('Unknown action');
    lock.waitLock(20000);
    return json_({ task_schema_version: 2, task_moves_supported: true, tasks: readRows_('Tasks', TASK_HEADERS), sessions: readRows_('Sessions', SESSION_HEADERS) });
  } catch (error) { return json_({ error: error.message }); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents);
    if (!['saveTask', 'reopenTask', 'saveSession'].includes(body.action)) throw new Error('Unknown action');
    const isTask = body.action !== 'saveSession';
    const record = body[isTask ? 'task' : 'session'];
    validate_(record, isTask);
    if (body.action === 'reopenTask' && record.status !== 'open') throw new Error('Reopened task must have open status');
    if (body.move_to !== undefined && (!isTask || typeof body.move_to !== 'string' || !body.move_to)) throw new Error('Invalid destination group');
    lock.waitLock(20000);
    saveRow_(isTask ? 'Tasks' : 'Sessions', isTask ? TASK_HEADERS : SESSION_HEADERS, record, body.action === 'reopenTask', body.move_to);
    return json_({ ok: true });
  } catch (error) { return json_({ error: error.message }); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}

function validate_(record, isTask) {
  if (!record || typeof record.id !== 'string' || !record.id.trim()) throw new Error('Missing record ID');
  if (isTask) {
    if (typeof record.title !== 'string' || !record.title.trim() || record.title.length > 120) throw new Error('Invalid task title');
    if (!['open', 'completed', 'deleted'].includes(record.status)) throw new Error('Invalid task status');
    if (!Number.isFinite(Date.parse(record.created_at))) throw new Error('Invalid task creation time');
    if (record.type != null && !['task', 'group'].includes(record.type)) throw new Error('Invalid task type');
    if (record.parent_id != null && typeof record.parent_id !== 'string') throw new Error('Invalid parent ID');
    if (record.type === 'group' && record.parent_id) throw new Error('Groups cannot have a parent');
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
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length);
  const values = range.getValues();
  // Sheets may have inferred a title such as 15-10 as a Date or a number.
  // Return its visible text, while keeping session durations numeric.
  if (name === 'Tasks') {
    const titles = sheet.getRange(2, 2, values.length, 1).getDisplayValues();
    values.forEach((row, index) => { row[1] = titles[index][0]; row[5] = row[5] || 'task'; });
  }
  return values
    .filter(row => row[0] !== '')
    .map(row => Object.fromEntries(headers.map((key, index) => [key, row[index] === '' ? null : row[index]])));
}

function saveRow_(name, headers, record, reopen = false, moveTo) {
  const sheet = getSheet_(name, headers);
  const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues() : [];
  const index = existing.findIndex(row => row[0] === record.id);
  if (name === 'Tasks') {
    const storedType = index >= 0 ? existing[index][5] || 'task' : null;
    const storedParent = index >= 0 ? existing[index][6] || null : null;
    record.type = record.type || storedType || 'task';
    record.parent_id = record.parent_id || storedParent || null;
    if (record.type === 'group' && record.status !== 'deleted') record.status = 'open';
    if (index >= 0 && record.type !== storedType) throw new Error('Task type cannot be changed');
    if (moveTo !== undefined) {
      if (record.type !== 'task' || (index >= 0 && existing[index][2] === 'deleted' && (record.status !== 'deleted' || moveTo !== storedParent))) throw new Error('Deleted tasks and groups cannot be moved');
      const target = existing.find(row => row[0] === moveTo && row[5] === 'group' && (row[2] === 'open' || record.status === 'deleted'));
      if (!target) throw new Error('Destination group not found or deleted');
      record.parent_id = moveTo;
    } else if (index >= 0) record.parent_id = storedParent;
    if (record.type === 'group' && record.parent_id) throw new Error('Groups cannot have a parent');
    if (record.parent_id) {
      const parent = existing.find(row => row[0] === record.parent_id);
      if (!parent || parent[5] !== 'group') throw new Error('Parent group not found');
      if (parent[2] === 'deleted') record.status = 'deleted';
    }
  }
  if (index >= 0 && name === 'Tasks' && Object.prototype.toString.call(existing[index][1]) === '[object Date]' && record.title === existing[index][1].toISOString()) {
    // An old client may send back the ISO title produced by getValues().
    record.title = sheet.getRange(index + 2, 2, 1, 1).getDisplayValues()[0][0];
  }
  // Only an explicit Undo may reopen a task; deleted tasks stay deleted.
  if (index >= 0 && name === 'Tasks' && existing[index][2] === 'deleted') {
    record.status = 'deleted'; record.completed_at = null;
  } else if (index >= 0 && name === 'Tasks' && existing[index][2] === 'completed' && record.status !== 'deleted' && !reopen) {
    record.status = 'completed'; record.completed_at = existing[index][4];
  }
  if (name === 'Tasks' && record.status !== 'completed') record.completed_at = null;
  if (index >= 0 && name === 'Sessions' && record.focus_score == null && existing[index][6] !== '') record.focus_score = existing[index][6];
  const row = headers.map(key => {
    const value = record[key] == null ? '' : record[key];
    return typeof value === 'string' && value.startsWith('=') ? "'" + value : value;
  });
  const targetRow = index < 0 ? sheet.getLastRow() + 1 : index + 2;
  if (targetRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
  // Apply text format BEFORE writing so date-like titles remain exact strings.
  if (name === 'Tasks') sheet.getRange(targetRow, 2, 1, 1).setNumberFormat('@');
  sheet.getRange(targetRow, 1, 1, headers.length).setValues([row]);
  if (name === 'Tasks' && record.type === 'group' && record.status === 'deleted') {
    existing.forEach((child, childIndex) => {
      if (child[6] !== record.id || child[2] === 'deleted') return;
      sheet.getRange(childIndex + 2, 3, 1, 1).setValue('deleted');
      sheet.getRange(childIndex + 2, 5, 1, 1).clearContent();
    });
  }
}

function getSheet_(name, headers) {
  const properties = PropertiesService.getScriptProperties();
  const id = properties.getProperty('SPREADSHEET_ID') || (SPREADSHEET_ID !== 'PASTE_SPREADSHEET_ID_HERE' ? SPREADSHEET_ID : '');
  if (!id) throw new Error('Run setupSpreadsheet once in the Apps Script editor, then deploy a new version.');
  const spreadsheet = SpreadsheetApp.openById(id);
  if (!properties.getProperty('SPREADSHEET_ID')) properties.setProperty('SPREADSHEET_ID', id);
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  // Append only the two new columns to legacy Tasks sheets; preserve existing data.
  if (name === 'Tasks' && headers.slice(0, 5).every((header, index) => actual[index] === header)) {
    headers.slice(5).forEach((header, index) => {
      if (actual[index + 5] === '') { sheet.getRange(1, index + 6, 1, 1).setValue(header); actual[index + 5] = header; }
    });
  }
  if (headers.some((header, index) => actual[index] !== header)) throw new Error('Unexpected headers in ' + name + '. Restore the documented column order.');
  return sheet;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
