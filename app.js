(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const storeKey = 'tempo-data-v1'; // Keep existing installations and their data.
  const defaults = { focusDuration: 60, shortBreakDuration: 15, longBreakDuration: 30, sessionsBeforeLongBreak: 2 };
  const modes = { focus: 'FOCUS SESSION', shortBreak: 'SHORT BREAK', longBreak: 'LONG BREAK' };
  const ringLength = 2 * Math.PI * 130;
  const data = load();
  let timer = data.timer;
  let syncing = false;
  let audio;

  function validNumber(value) {
    return Number.isSafeInteger(value) && value > 0 && value <= Math.floor(Number.MAX_SAFE_INTEGER / 60000);
  }

  function freshTimer(mode = 'focus', count = 0) {
    return { mode, status: 'idle', remaining: data.settings[`${mode}Duration`] * 60,
      startedAt: null, phaseStartedAt: null, focusElapsed: 0, focusesInCycle: count };
  }

  function load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(storeKey) || '{}') || {}; }
    catch (error) { console.warn('FocusFlow could not read local data.', error); }
    const settings = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) =>
      [key, validNumber(saved.settings?.[key]) ? saved.settings[key] : fallback]));
    const tasks = Array.isArray(saved.tasks) ? saved.tasks.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string') : [];
    const sessions = Array.isArray(saved.sessions) ? saved.sessions.filter(item => item && typeof item.id === 'string') : [];
    const restored = saved.timer || {};
    const mode = restored.mode === 'break' ? 'shortBreak' : Object.hasOwn(modes, restored.mode) ? restored.mode : 'focus';
    const phaseDuration = Number(restored.phaseDuration || restored.plannedDuration) || settings[`${mode}Duration`] * 60;
    const status = ['running', 'paused'].includes(restored.status) ? restored.status : 'idle';
    const timer = { ...restored, mode, status, phaseDuration,
      remaining: Number.isFinite(restored.remaining) ? Math.max(0, restored.remaining) : phaseDuration,
      focusElapsed: Math.max(0, Number(restored.focusElapsed) || 0),
      focusesInCycle: Math.max(0, Number(restored.focusesInCycle) || 0) };
    if (status !== 'idle') {
      timer.taskId ??= saved.selectedTaskId || null;
      timer.plannedDuration ||= phaseDuration;
    }
    if (status === 'running' && !Number.isFinite(Date.parse(timer.phaseStartedAt))) timer.status = 'paused';
    if (timer.status === 'running') timer.remainingAtStart = Number(timer.remainingAtStart) || timer.remaining;
    const pendingSync = saved.pendingSync || { tasks: tasks.map(item => item.id), sessions: sessions.map(item => item.id) };
    return { settings, tasks, sessions, timer, selectedTaskId: saved.selectedTaskId || null,
      pendingScoreId: saved.pendingScoreId || null,
      pendingTaskActions: saved.pendingTaskActions || {},
      pendingSync: { tasks: Array.isArray(pendingSync.tasks) ? pendingSync.tasks : [], sessions: Array.isArray(pendingSync.sessions) ? pendingSync.sessions : [] } };
  }

  function persist() {
    data.timer = timer;
    try { localStorage.setItem(storeKey, JSON.stringify(data)); }
    catch (error) { console.error('FocusFlow could not save local data.', error); }
  }

  function changed(type, record) {
    if (!data.pendingSync[type].includes(record.id)) data.pendingSync[type].push(record.id);
    persist();
    syncSheets();
  }

  function apiUrl() { return window.TEMPO_CONFIG?.googleAppsScriptUrl?.trim() || ''; }

  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`Sheets returned HTTP ${response.status}`);
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      return result;
    } finally { clearTimeout(timeout); }
  }

  function mergeRecords(type, remote) {
    const dirty = new Set(data.pendingSync[type]);
    const merged = new Map(data[type].map(item => [item.id, item]));
    remote.forEach(record => {
      if (!record || typeof record.id !== 'string') return;
      const local = merged.get(record.id);
      if (local && dirty.has(record.id)) {
        // Completing a task cannot rename it. Keep a repaired server title
        // instead of sending an old date serialization back to Sheets.
        if (type === 'tasks' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(local.title) && typeof record.title === 'string' && record.title !== local.title) local.title = record.title;
        if (type === 'tasks' && record.status === 'deleted') {
          local.status = 'deleted'; local.completed_at = null;
          delete data.pendingTaskActions[record.id];
        }
        if (type === 'tasks' && record.status === 'completed' && local.status !== 'deleted' && data.pendingTaskActions[record.id] !== 'reopenTask') {
          local.status = 'completed'; local.completed_at = record.completed_at;
        }
        if (type === 'sessions' && local.focus_score == null && record.focus_score != null) local.focus_score = record.focus_score;
      }
      if (!local || !dirty.has(record.id)) merged.set(record.id, record);
    });
    return [...merged.values()];
  }

  async function syncSheets() {
    const url = apiUrl();
    if (!url || syncing || navigator.onLine === false) return;
    syncing = true;
    try {
      const remote = await request(`${url}${url.includes('?') ? '&' : '?'}action=all`, { cache: 'no-store' });
      if (!Array.isArray(remote.tasks) || !Array.isArray(remote.sessions)) throw new Error('Invalid Sheets response');
      data.tasks = mergeRecords('tasks', remote.tasks);
      data.sessions = mergeRecords('sessions', remote.sessions);
      persist(); renderTasks(); renderStats();
      // Serialize writes so an earlier unscored session cannot overwrite its rating.
      while (data.pendingSync.tasks.length || data.pendingSync.sessions.length) {
        const type = data.pendingSync.tasks.length ? 'tasks' : 'sessions';
        const id = data.pendingSync[type][0];
        const record = data[type].find(item => item.id === id);
        if (!record) { data.pendingSync[type].shift(); persist(); continue; }
        const snapshot = JSON.stringify(record);
        const action = type === 'tasks' ? data.pendingTaskActions[id] || 'saveTask' : 'saveSession';
        const payload = type === 'tasks' ? { action, task: record } : { action, session: record };
        const result = await request(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
        if (result.ok !== true) throw new Error('Sheets did not confirm the write');
        if (JSON.stringify(data[type].find(item => item.id === id)) === snapshot && (type !== 'tasks' || (data.pendingTaskActions[id] || 'saveTask') === action)) {
          data.pendingSync[type].shift();
          if (type === 'tasks') delete data.pendingTaskActions[id];
        }
        persist();
      }
    } catch (error) { console.warn('FocusFlow sync failed. Pending records remain saved locally.', error); }
    finally { syncing = false; }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function selectedTask() { return data.tasks.find(task => task.id === data.selectedTaskId && task.status === 'open'); }

  function renderTasks() {
    $('#task-count').textContent = `${data.tasks.filter(task => task.status === 'open').length} open`;
    const current = timer.status !== 'idle' && timer.mode === 'focus' ? data.tasks.find(task => task.id === timer.taskId) : selectedTask();
    $('#current-task-title').textContent = current?.title || 'Choose a task';
    const visibleTasks = data.tasks.filter(task => task.status !== 'deleted');
    $('#task-list').innerHTML = visibleTasks.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(task => {
      const done = task.status === 'completed';
      const selected = !done && task.id === data.selectedTaskId;
      return `<div class="task-row ${done ? 'done' : ''} ${selected ? 'selected' : ''}">
        <button class="task-select" type="button" data-task="${escapeHtml(task.id)}" ${done ? 'disabled' : ''} aria-pressed="${selected}">
          <span class="task-check" aria-hidden="true">${done || selected ? '&#10003;' : ''}</span><span>${escapeHtml(task.title)}</span>
        </button>
        ${selected ? '<span class="selected-tag">Selected</span>' : done ? '<span class="selected-tag">Done</span>' : ''}
        <div class="task-actions">
          ${done ? `<button type="button" class="task-action" data-undo="${escapeHtml(task.id)}" aria-label="Mark ${escapeHtml(task.title)} as not completed">Undo</button>` : `<button type="button" class="complete-task" data-complete="${escapeHtml(task.id)}" aria-label="Complete ${escapeHtml(task.title)}">&#10003;</button>`}
          <button type="button" class="task-action task-delete" data-delete="${escapeHtml(task.id)}" aria-label="Delete ${escapeHtml(task.title)}">Delete</button>
        </div>
      </div>`;
    }).join('');
    $('#tasks-empty').classList.toggle('hidden', visibleTasks.length > 0);
  }

  function phaseDuration() { return timer.phaseDuration || data.settings[`${timer.mode}Duration`] * 60; }

  function remaining(now = Date.now()) {
    if (timer.status !== 'running') return timer.remaining;
    return Math.max(0, timer.remainingAtStart - (now - Date.parse(timer.phaseStartedAt)) / 1000);
  }

  function renderTimer() {
    const seconds = Math.ceil(remaining());
    $('#timer-time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    $('#mode-label').textContent = modes[timer.mode];
    $('#timer-caption').textContent = timer.status === 'running' ? (timer.mode === 'focus' ? 'STAY WITH THE MOMENT' : 'TAKE A BREATH') : timer.status === 'paused' ? 'PAUSED' : 'READY WHEN YOU ARE';
    const color = timer.mode === 'focus' ? 'var(--lime)' : '#8fc8b1';
    $('#live-dot').style.background = color;
    $('#ring-progress').style.stroke = color;
    $('#ring-progress').style.strokeDasharray = ringLength;
    $('#ring-progress').style.strokeDashoffset = ringLength * (1 - Math.min(1, seconds / phaseDuration()));
    $('#start-button span').textContent = timer.mode === 'focus' ? 'Start focus' : 'Start break';
    $('#cycle-note').textContent = `${data.settings.focusDuration} min focus · ${data.settings.shortBreakDuration} min short · ${data.settings.longBreakDuration} min long · every ${data.settings.sessionsBeforeLongBreak} sessions`;
    $('#start-button').classList.toggle('hidden', timer.status !== 'idle');
    $('#pause-button').classList.toggle('hidden', timer.status !== 'running');
    $('#resume-button').classList.toggle('hidden', timer.status !== 'paused');
    $('#skip-button').classList.toggle('hidden', timer.status === 'idle');
    $('#stop-button').classList.toggle('hidden', timer.status === 'idle');
  }

  function dayKey(value) {
    const date = new Date(value);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  function renderStats() {
    const now = new Date();
    $('#today-label').textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    $('#stats-date').textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const total = records => records.reduce((sum, session) => sum + Math.max(0, Number(session.actual_duration) || 0), 0);
    const label = seconds => { const minutes = Math.floor(seconds / 60); return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`; };
    const today = data.sessions.filter(session => dayKey(session.ended_at) === dayKey(now));
    $('#today-time').textContent = label(total(today));
    $('#today-sessions').textContent = today.length;
    const dates = Array.from({ length: 7 }, (_, index) => { const date = new Date(now); date.setDate(date.getDate() - 6 + index); return date; });
    const totals = dates.map(date => total(data.sessions.filter(session => dayKey(session.ended_at) === dayKey(date))));
    $('#week-time').textContent = label(totals.reduce((sum, seconds) => sum + seconds, 0));
    const max = Math.max(1, ...totals);
    $('#week-days').innerHTML = dates.map((date, index) => `<div class="week-day ${index === 6 ? 'today' : ''}" title="${date.toLocaleDateString()}: ${label(totals[index])}"><div class="week-bar-track"><span class="week-bar" style="height:${Math.max(3, totals[index] / max * 44)}px"></span></div><span class="week-day-label">${date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)}</span></div>`).join('');
  }

  function setScreen(name) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === `screen-${name}`));
    document.querySelectorAll('.nav-item').forEach(button => {
      button.classList.toggle('active', button.dataset.screen === name);
      if (button.dataset.screen === name) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (name === 'statistics') renderStats();
  }

  function notifyEnd(mode) {
    try {
      if (audio) {
        audio.resume().catch(() => {});
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.frequency.value = 660;
        gain.gain.setValueAtTime(0.12, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.7);
        oscillator.start(); oscillator.stop(audio.currentTime + 0.7);
      }
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(mode === 'focus' ? 'Focus complete' : 'Break complete', { body: mode === 'focus' ? 'Your break is ready.' : 'Ready for another focus session?', icon: './icon.svg' });
      }
    } catch (error) { console.warn('FocusFlow notification unavailable.', error); }
  }

  function showScore() {
    if (data.pendingScoreId && data.sessions.some(session => session.id === data.pendingScoreId) && !$('#score-dialog').open) $('#score-dialog').showModal();
  }

  function finishBlock(natural = false) {
    if (timer.status === 'idle') return;
    const mode = timer.mode;
    const endedAt = natural && timer.status === 'running' ? Date.parse(timer.phaseStartedAt) + timer.remainingAtStart * 1000 : Date.now();
    let session;
    if (mode === 'focus') {
      session = { id: crypto.randomUUID(), task_id: timer.taskId || null,
        planned_duration: timer.plannedDuration || phaseDuration(),
        actual_duration: Math.floor(Math.min(timer.plannedDuration || phaseDuration(), Math.max(0, phaseDuration() - remaining(endedAt)))),
        started_at: timer.startedAt, ended_at: new Date(endedAt).toISOString(), focus_score: null };
      data.sessions.push(session);
      data.pendingScoreId = session.id;
      const count = timer.focusesInCycle + 1;
      timer = freshTimer(count >= data.settings.sessionsBeforeLongBreak ? 'longBreak' : 'shortBreak', count);
    } else timer = freshTimer('focus', mode === 'longBreak' ? 0 : timer.focusesInCycle);
    persist(); renderTimer(); renderTasks(); renderStats();
    if (session) { changed('sessions', session); showScore(); }
    if (natural) notifyEnd(mode);
  }

  function tick() {
    if (timer.status !== 'running') return;
    if (remaining() <= 0) finishBlock(true);
    else renderTimer();
  }

  function startTimer() {
    if (timer.status === 'running') return;
    if (timer.status === 'idle') {
      if (timer.mode === 'focus' && !selectedTask()) { setScreen('tasks'); $('#task-input').focus(); return; }
      timer.phaseDuration = data.settings[`${timer.mode}Duration`] * 60;
      timer.remaining = timer.phaseDuration;
      timer.startedAt = new Date().toISOString();
      timer.taskId = selectedTask()?.id || null;
      timer.plannedDuration = timer.phaseDuration;
    }
    timer.status = 'running';
    timer.remainingAtStart = timer.remaining;
    timer.phaseStartedAt = new Date().toISOString();
    persist(); renderTimer(); renderTasks();
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      audio.resume().catch(() => {});
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    } catch {}
  }

  $('#task-form').addEventListener('submit', event => {
    event.preventDefault();
    const title = $('#task-input').value.trim();
    if (!title) return;
    const task = { id: crypto.randomUUID(), title: title.slice(0, 120), status: 'open', created_at: new Date().toISOString(), completed_at: null };
    data.tasks.push(task); data.selectedTaskId = task.id;
    changed('tasks', task); $('#task-input').value = ''; renderTasks();
  });
  $('#task-list').addEventListener('click', event => {
    const select = event.target.closest('[data-task]');
    const complete = event.target.closest('[data-complete]');
    const undo = event.target.closest('[data-undo]');
    const remove = event.target.closest('[data-delete]');
    if (select && !select.disabled) { data.selectedTaskId = select.dataset.task; persist(); renderTasks(); }
    if (complete) {
      const task = data.tasks.find(item => item.id === complete.dataset.complete);
      if (!task || task.status !== 'open') return;
      task.status = 'completed'; task.completed_at = new Date().toISOString();
      delete data.pendingTaskActions[task.id];
      if (task.id === data.selectedTaskId) data.selectedTaskId = null;
      changed('tasks', task); renderTasks();
    }
    if (undo) {
      const task = data.tasks.find(item => item.id === undo.dataset.undo);
      if (!task || task.status !== 'completed') return;
      task.status = 'open'; task.completed_at = null;
      data.pendingTaskActions[task.id] = 'reopenTask';
      changed('tasks', task); renderTasks();
    }
    if (remove) {
      const task = data.tasks.find(item => item.id === remove.dataset.delete);
      if (!task || task.status === 'deleted' || !window.confirm('Delete this task? Focus history will be kept.')) return;
      task.status = 'deleted'; task.completed_at = null;
      delete data.pendingTaskActions[task.id];
      if (data.selectedTaskId === task.id) data.selectedTaskId = null;
      changed('tasks', task); renderTasks();
    }
  });
  $('#task-picker').addEventListener('click', () => setScreen('tasks'));
  $('.brand').addEventListener('click', event => { event.preventDefault(); setScreen('focus'); });
  $('#start-button').addEventListener('click', startTimer);
  $('#resume-button').addEventListener('click', startTimer);
  $('#pause-button').addEventListener('click', () => {
    tick();
    if (timer.status !== 'running') return;
    timer.remaining = remaining(); timer.focusElapsed = phaseDuration() - timer.remaining;
    timer.status = 'paused'; timer.phaseStartedAt = null;
    persist(); renderTimer();
  });
  $('#skip-button').addEventListener('click', () => { tick(); finishBlock(); });
  $('#stop-button').addEventListener('click', () => {
    tick();
    if (timer.status === 'idle') return;
    if (timer.mode === 'focus') finishBlock();
    else { timer = freshTimer('focus', timer.focusesInCycle); persist(); renderTimer(); renderTasks(); }
  });
  function closeScore(score = null) {
    const session = data.sessions.find(item => item.id === data.pendingScoreId);
    data.pendingScoreId = null;
    if (session && score !== null) { session.focus_score = score; changed('sessions', session); }
    persist(); $('#score-dialog').close(); renderStats();
  }
  $('#score-options').addEventListener('click', event => {
    const button = event.target.closest('[data-score]');
    if (button) closeScore(Number(button.dataset.score));
  });
  $('#skip-score').addEventListener('click', () => closeScore());
  $('#score-dialog').addEventListener('cancel', event => { event.preventDefault(); closeScore(); });
  $('#settings-form').addEventListener('submit', event => {
    event.preventDefault();
    const inputs = [...$('#settings-form').querySelectorAll('input')];
    if (!inputs.every(input => input.checkValidity() && validNumber(Number(input.value)))) {
      $('#settings-feedback').textContent = 'Enter a valid positive whole number for each setting.';
      return;
    }
    tick();
    inputs.forEach(input => { data.settings[input.name] = Number(input.value); });
    if (timer.status === 'idle') timer = freshTimer(timer.mode, timer.focusesInCycle);
    persist(); renderTimer(); $('#settings-feedback').textContent = 'Settings saved';
  });
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => setScreen(button.dataset.screen)));
  Object.entries(data.settings).forEach(([name, value]) => { $(`[name="${name}"]`).value = value; });
  renderTimer(); renderTasks(); renderStats(); persist(); tick(); showScore();
  setInterval(tick, 250);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); renderStats(); } });
  window.addEventListener('online', syncSheets);
  syncSheets();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).catch(error => console.warn('FocusFlow offline cache unavailable.', error));
  }
})();
