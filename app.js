(() => {
  const $ = selector => document.querySelector(selector);
  const storeKey = 'tempo-data-v1';
  const duration = { focus: 60 * 60, break: 15 * 60 };
  const ringLength = 2 * Math.PI * 130;
  let data = loadLocal();
  let timer = data.timer;
  timer.focusElapsed ??= 0;
  let pendingScoreId = null;
  let endHandled = false;

  function loadLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
      return { tasks: saved.tasks || [], sessions: saved.sessions || [], selectedTaskId: saved.selectedTaskId || null,
        timer: saved.timer || { mode: 'focus', status: 'idle', remaining: duration.focus, startedAt: null, phaseStartedAt: null, focusElapsed: 0 } };
    } catch { return { tasks: [], sessions: [], selectedTaskId: null, timer: { mode: 'focus', status: 'idle', remaining: duration.focus, startedAt: null, phaseStartedAt: null, focusElapsed: 0 } }; }
  }
  function persist() {
    data.timer = timer;
    localStorage.setItem(storeKey, JSON.stringify(data));
  }
  function apiUrl() { return window.TEMPO_CONFIG?.googleAppsScriptUrl?.trim() || ''; }
  async function syncRequest(payload) {
    const url = apiUrl(); if (!url) return;
    try {
      await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    } catch (error) { console.warn('Tempo Sheets sync failed; data remains saved locally.', error); }
  }
  function upsertTask(task) { syncRequest({ action: 'saveTask', task }); }
  function upsertSession(session) { syncRequest({ action: 'saveSession', session }); }
  function esc(value) { return value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
  function selectedTask() { return data.tasks.find(task => task.id === data.selectedTaskId && task.status === 'open'); }
  function renderTasks() {
    const openTasks = data.tasks.filter(task => task.status === 'open');
    $('#task-count').textContent = `${openTasks.length} open`;
    $('#current-task-title').textContent = selectedTask()?.title || 'Choose a task';
    $('#task-list').innerHTML = data.tasks.slice().sort((a,b) => b.created_at.localeCompare(a.created_at)).map(task => {
      const selected = task.id === data.selectedTaskId && task.status === 'open';
      return `<div class="task-row ${selected ? 'selected' : ''} ${task.status === 'completed' ? 'done' : ''}">
        <button class="task-select" type="button" data-task="${task.id}" ${task.status === 'completed' ? 'disabled' : ''}>
          <span class="task-check">${task.status === 'completed' ? 'âœ“' : selected ? 'âœ“' : ''}</span><span>${esc(task.title)}</span></button>
        ${selected ? '<span class="selected-tag">Selected</span>' : task.status === 'completed' ? '<span class="selected-tag">Done</span>' : ''}
        ${task.status === 'open' ? `<button class="complete-task" data-complete="${task.id}" aria-label="Complete ${esc(task.title)}" title="Complete task">&#10003;</button>` : ''}
      </div>`;
    }).join('');
    $('#tasks-empty').classList.toggle('hidden', data.tasks.length > 0);
  }
  function fmtTime(seconds) { const value = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(value / 60)).padStart(2,'0')}:${String(value % 60).padStart(2,'0')}`; }
  function renderTimer() {
    const mode = timer.mode;
    $('#mode-label').textContent = mode === 'focus' ? 'FOCUS SESSION' : 'BREAK TIME';
    $('#timer-time').textContent = fmtTime(timer.remaining);
    $('#timer-caption').textContent = timer.status === 'running' ? (mode === 'focus' ? 'STAY WITH THE MOMENT' : 'TAKE A BREATH') : timer.status === 'paused' ? 'PAUSED' : 'READY WHEN YOU ARE';
    $('#live-dot').style.background = mode === 'focus' ? 'var(--lime)' : '#8fc8b1';
    const fraction = timer.remaining / duration[mode];
    $('#ring-progress').style.strokeDasharray = ringLength;
    $('#ring-progress').style.strokeDashoffset = ringLength * (1 - fraction);
    $('#ring-progress').style.stroke = mode === 'focus' ? 'var(--lime)' : '#8fc8b1';
    const running = timer.status === 'running', paused = timer.status === 'paused';
    $('#start-button').classList.toggle('hidden', running || paused);
    $('#pause-button').classList.toggle('hidden', !running);
    $('#resume-button').classList.toggle('hidden', !paused);
    $('#stop-button').classList.toggle('hidden', !(running || paused));
    renderTasks();
  }
  function localDay(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function renderStats() {
    const now = new Date(); const today = localDay(now);
    const dated = data.sessions.filter(session => session.ended_at);
    const todaySessions = dated.filter(session => localDay(session.ended_at) === today);
    const mins = items => Math.floor(items.reduce((sum, session) => sum + Number(session.actual_duration || 0), 0) / 60);
    const label = value => value < 60 ? `${value}m` : `${Math.floor(value/60)}h ${value%60 ? `${value%60}m` : ''}`.trim();
    $('#today-time').textContent = label(mins(todaySessions));
    $('#today-sessions').textContent = todaySessions.length;
    const weekDates = Array.from({length:7}, (_, index) => { const date = new Date(now); date.setDate(now.getDate() - (6-index)); return date; });
    const perDay = weekDates.map(date => mins(dated.filter(session => localDay(session.ended_at) === localDay(date))));
    $('#week-time').textContent = label(perDay.reduce((a,b) => a+b, 0));
    const max = Math.max(1, ...perDay);
    $('#week-days').innerHTML = weekDates.map((date, index) => `<div class="week-day ${index === 6 ? 'today' : ''}"><div class="week-bar-track"><span class="week-bar" style="height:${Math.max(7, perDay[index] / max * 44)}px"></span></div><span class="week-day-label">${date.toLocaleDateString('en-US',{weekday:'short'}).slice(0,1)}</span></div>`).join('');
  }
  function setScreen(name) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === `screen-${name}`));
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.screen === name));
    if (name === 'statistics') renderStats();
  }
  function notifyEnd(mode) {
    try { const context = new (window.AudioContext || window.webkitAudioContext)(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.connect(gain); gain.connect(context.destination); oscillator.frequency.value = 660; gain.gain.setValueAtTime(.12, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .7); oscillator.start(); oscillator.stop(context.currentTime + .7); }
    catch {}
    if ('Notification' in window && Notification.permission === 'granted') new Notification(mode === 'focus' ? 'Focus complete' : 'Break complete', { body: mode === 'focus' ? 'Your break is ready.' : 'Ready for another focus session?', icon: './icon.svg' });
  }
  function finishFocus(endedAt = new Date().toISOString()) {
    if (endHandled) return; endHandled = true;
    const started = timer.startedAt ? new Date(timer.startedAt).getTime() : Date.now() - (duration.focus - timer.remaining) * 1000;
    const ongoing = timer.status === 'running' && timer.phaseStartedAt ? (Date.now() - new Date(timer.phaseStartedAt).getTime()) / 1000 : 0;
    const actual = Math.max(0, Math.floor(timer.focusElapsed + ongoing));
    const session = { id: crypto.randomUUID(), task_id: data.selectedTaskId, planned_duration: duration.focus, actual_duration: actual, started_at: timer.startedAt || new Date(started).toISOString(), ended_at: endedAt, focus_score: null };
    data.sessions.push(session); upsertSession(session); pendingScoreId = session.id;
    $('#score-dialog').showModal();
    timer.mode = 'break'; timer.status = 'idle'; timer.remaining = duration.break; timer.startedAt = null; timer.phaseStartedAt = null; timer.focusElapsed = 0;
    persist(); renderTimer(); renderStats();
  }
  function finishBreak() {
    notifyEnd('break'); timer.mode = 'focus'; timer.status = 'idle'; timer.remaining = duration.focus; timer.startedAt = null; timer.phaseStartedAt = null; timer.focusElapsed = 0;
    persist(); renderTimer();
  }
  function tick() {
    if (timer.status !== 'running') return;
    const remaining = Math.max(0, Math.ceil((new Date(timer.phaseStartedAt).getTime() + timer.remainingAtStart * 1000 - Date.now()) / 1000));
    timer.remaining = remaining;
    if (remaining <= 0) {
      if (timer.mode === 'focus') { notifyEnd('focus'); finishFocus(); }
      else finishBreak();
    } else { renderTimer(); persist(); }
  }
  function startTimer() {
    if (timer.mode === 'focus' && !selectedTask()) { setScreen('tasks'); $('#task-input').focus(); return; }
    endHandled = false; timer.status = 'running'; timer.remainingAtStart = timer.remaining; timer.phaseStartedAt = new Date().toISOString();
    if (timer.mode === 'focus' && !timer.startedAt) timer.startedAt = timer.phaseStartedAt;
    persist(); renderTimer();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }
  $('#task-form').addEventListener('submit', event => {
    event.preventDefault(); const input = $('#task-input'); const title = input.value.trim(); if (!title) return;
    const task = { id: crypto.randomUUID(), title, status: 'open', created_at: new Date().toISOString(), completed_at: null };
    data.tasks.push(task); data.selectedTaskId = task.id; persist(); upsertTask(task); input.value = ''; renderTasks(); renderTimer();
  });
  $('#task-list').addEventListener('click', event => {
    const select = event.target.closest('[data-task]'); const complete = event.target.closest('[data-complete]');
    if (select) { data.selectedTaskId = select.dataset.task; persist(); renderTasks(); renderTimer(); }
    if (complete) { const task = data.tasks.find(item => item.id === complete.dataset.complete); if (!task) return; task.status = 'completed'; task.completed_at = new Date().toISOString(); if (data.selectedTaskId === task.id) data.selectedTaskId = null; persist(); upsertTask(task); renderTasks(); renderTimer(); }
  });
  $('#task-picker').addEventListener('click', () => setScreen('tasks'));
  $('#start-button').addEventListener('click', startTimer);
  $('#resume-button').addEventListener('click', startTimer);
  $('#pause-button').addEventListener('click', () => { tick(); if (timer.status !== 'running') return; if (timer.mode === 'focus') timer.focusElapsed += Math.max(0, (Date.now() - new Date(timer.phaseStartedAt).getTime()) / 1000); timer.status = 'paused'; timer.phaseStartedAt = null; persist(); renderTimer(); });
  $('#stop-button').addEventListener('click', () => {
    if (timer.mode === 'focus' && timer.startedAt) { const ended = new Date().toISOString(); finishFocus(ended); notifyEnd('focus'); }
    else { timer.status = 'idle'; timer.mode = 'focus'; timer.remaining = duration.focus; timer.startedAt = null; timer.phaseStartedAt = null; timer.focusElapsed = 0; persist(); renderTimer(); }
  });
  $('#score-options').addEventListener('click', event => {
    const button = event.target.closest('[data-score]'); if (!button) return;
    const session = data.sessions.find(item => item.id === pendingScoreId); if (session) { session.focus_score = Number(button.dataset.score); persist(); upsertSession(session); }
    pendingScoreId = null; $('#score-dialog').close(); renderStats();
  });
  $('#skip-score').addEventListener('click', () => { pendingScoreId = null; $('#score-dialog').close(); });
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => setScreen(button.dataset.screen)));
  $('#today-label').textContent = new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  $('#stats-date').textContent = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' });
  renderTimer(); renderStats();
  setInterval(tick, 1000);
  if (apiUrl()) fetch(`${apiUrl()}?action=all`).then(response => response.json()).then(remote => {
    if (Array.isArray(remote.tasks) && Array.isArray(remote.sessions)) {
      data.tasks = remote.tasks; data.sessions = remote.sessions;
      if (!selectedTask()) data.selectedTaskId = null;
      persist(); renderTasks(); renderStats();
    }
  }).catch(error => console.warn('Tempo could not load Google Sheets; using local data.', error));
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
})();


