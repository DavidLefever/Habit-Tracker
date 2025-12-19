(function () {
  // --- Utilities ---
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function startOfWeek(d){
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = (x.getDay() + 6) % 7; // 0=Mon..6=Sun (Mon start)
    x.setDate(x.getDate() - day);
    x.setHours(0,0,0,0);
    return x;
  }

  // --- Settings ---
  const SETTINGS_KEY = 'habit-tracker.settings';
  const defaultSettings = { rolloverHour: 4 };
  function loadSettings(){
    try{ return { ...defaultSettings, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY))||{}) }; }
    catch{ return { ...defaultSettings }; }
  }
  function saveSettings(s){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
  let settings = loadSettings();

  function todayKey(){
    const now = new Date();
    const adj = new Date(now.getTime() - settings.rolloverHour * 60 * 60 * 1000);
    return dateKey(adj);
  }
  function parseKeyToDate(key){ const [y,m,d] = key.split('-').map(Number); return new Date(y, m-1, d); }
  function prevDayKey(key){ const dt = parseKeyToDate(key); dt.setDate(dt.getDate()-1); return dateKey(dt); }

  // --- Storage ---
  const STORE_KEY = 'habit-tracker.v1';
  const THEME_KEY = 'habit-tracker-theme';
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } };
  const save = data => localStorage.setItem(STORE_KEY, JSON.stringify(data));

  // --- State & elements ---
  let habits = load();
  let lastRenderedIds = [];
  let prevHabits = null; // for undo

  const habitsEl = document.getElementById('habits');
  const todayEl = document.getElementById('today');
  const nameEl = document.getElementById('habitName');
  const goalEl = document.getElementById('habitGoal');
  const freqEl = document.getElementById('habitFreq');
  const weeklyCfg = document.getElementById('weeklyConfig');
  const weeklyTargetEl = document.getElementById('weeklyTarget');
  const addBtn = document.getElementById('addBtn');
  const themeBtn = document.getElementById('themeBtn');
  const themePanel = document.getElementById('themePanel');
  const sortEl = document.getElementById('sortSelect');
  const filterEl = document.getElementById('filterSelect');
  const rolloverEl = document.getElementById('rolloverSelect');
  const undoBtn = document.getElementById('undoBtn');

  todayEl.textContent = `Today: ${todayKey()}`;

  // --- Toast/celebration helpers ---
  function getToastWrap(){
    let el = document.getElementById('toastWrap');
    if(!el){ el = document.createElement('div'); el.id='toastWrap'; el.className='toast-wrap'; document.body.appendChild(el); }
    return el;
  }
  function showToast(title, message){
    const wrap = getToastWrap();
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `<span class="title">${title}</span> ${message || ''}`;
    wrap.appendChild(t);
    requestAnimationFrame(()=> t.classList.add('show'));
    setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=> t.remove(), 250); }, 3000);
  }
  function weekStartKey(){ return dateKey(startOfWeek(parseKeyToDate(todayKey()))); }

  // Show/hide custom weekly target input
  function updateWeeklyCfgVisibility(){
    if(!weeklyCfg) return;
    weeklyCfg.style.display = (freqEl && freqEl.value === 'weekly') ? 'flex' : 'none';
  }
  freqEl?.addEventListener('change', updateWeeklyCfgVisibility);
  updateWeeklyCfgVisibility();

  // --- Theme logic ---
  function applyTheme(n) {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const start = cs.getPropertyValue(`--theme${n}-start`).trim();
    const end = cs.getPropertyValue(`--theme${n}-end`).trim();
    root.style.setProperty('--accent', start);
    root.style.setProperty('--ok', end);
    localStorage.setItem(THEME_KEY, String(n));
  }
  applyTheme(localStorage.getItem(THEME_KEY) || 1);

  if (themeBtn && themePanel) {
    themeBtn.addEventListener('click', (e) => { e.stopPropagation(); themePanel.hidden = !themePanel.hidden; });
    document.addEventListener('click', () => { themePanel.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') themePanel.hidden = true; });
    themePanel.addEventListener('click', (e) => e.stopPropagation());
    themePanel.querySelectorAll('.swatch').forEach(btn => {
      btn.addEventListener('click', () => { applyTheme(btn.dataset.theme); themePanel.hidden = true; });
    });
  }

  // --- Scheduling helpers ---
  function isAllowedOnDate(h, key){
    const d = parseKeyToDate(key); const wd = d.getDay(); // 0=Sun..6=Sat
    const type = h.schedule?.type || 'daily';
    if(type === 'daily') return true;
    if(type === 'mwf') return wd===1 || wd===3 || wd===5;
    if(type === 'tuth') return wd===2 || wd===4;
    if(type === 'weekly') return true; // any day counts toward weekly quota
    return true;
  }
  function weekTarget(h){
    const type = h.schedule?.type || 'daily';
    if(type==='daily') return 7;
    if(type==='mwf') return 3;
    if(type==='tuth') return 2;
    if(type==='weekly') return Math.max(1, Number(h.schedule.perWeek||3));
    return 7;
  }
  function countThisWeek(h){
    const now = parseKeyToDate(todayKey());
    const ws = startOfWeek(now);
    const we = new Date(ws); we.setDate(ws.getDate()+6);
    const days = new Set(h.days || []);
    let n = 0;
    for(const key of days){
      const d = parseKeyToDate(key);
      if(d >= ws && d <= we){
        if((h.schedule?.type||'daily') === 'weekly') n++;
        else if(isAllowedOnDate(h, key)) n++;
      }
    }
    return n;
  }
  function computeStreak(h){
    const days = new Set(h.days || []);
    let k = todayKey(), s = 0;
    while (days.has(k)) { s++; k = prevDayKey(k); }
    return s;
  }
  function computeBest(h){
    const arr = Array.from(new Set(h.days || [])).sort();
    if (arr.length === 0) return 0;
    let best = 1, run = 1;
    for (let i = 1; i < arr.length; i++) {
      if (prevDayKey(arr[i]) === arr[i - 1]) { run++; if (run > best) best = run; }
      else run = 1;
    }
    return best;
  }

  // --- Undo helper ---
  function commit(){ prevHabits = JSON.parse(JSON.stringify(habits)); undoBtn.hidden = false; }
  function undo(){ if(prevHabits){ habits = prevHabits; prevHabits = null; save(habits); undoBtn.hidden = true; render(); } }
  undoBtn?.addEventListener('click', undo);

  // --- Mutations ---
  function toggleToday(id) {
    commit();
    const key = todayKey();
    habits = habits.map(h => {
      if (h.id !== id) return h;
      const set = new Set(h.days || []);
      if (set.has(key)) set.delete(key); else set.add(key);
      return { ...h, days: Array.from(set) };
    });
    save(habits);

    // Acknowledgements (goal met / weekly target met)
    const updated = habits.find(h => h.id === id);
    if(updated){
      const streak = computeStreak(updated);
      const goal = Number(updated.goalDays)||null;

      // goal streak reached today and not already acknowledged today
      if(goal && streak >= goal && updated.lastGoalCongratsKey !== key){
        showToast('🎯 Goal met!', `${updated.name}: ${streak}/${goal} day streak`);
        updated.lastGoalCongratsKey = key;
        save(habits);
      }

      // weekly target reached and not already acknowledged this week
      const wt = weekTarget(updated);
      const wc = countThisWeek(updated);
      const wkKey = weekStartKey();
      if(wt && wc >= wt && updated.lastWeeklyCongratsWeek !== wkKey){
        showToast('✅ Weekly target hit!', `${updated.name}: ${wc}/${wt} this week`);
        updated.lastWeeklyCongratsWeek = wkKey;
        save(habits);
      }
    }

    render();
  }
  function updateGoal(id, val) {
    commit();
    const n = Number(val);
    habits = habits.map(h => h.id === id ? { ...h, goalDays: (n > 0 ? n : null) } : h);
    save(habits); render();
  }
  function removeHabit(id) {
    if (!confirm('Delete this habit?')) return;
    commit();
    habits = habits.filter(h => h.id !== id);
    save(habits); render();
  }

  // --- Sorting & filtering ---
  function allowedToday(h){ return isAllowedOnDate(h, todayKey()); }
  function didToday(h){ return (h.days||[]).includes(todayKey()); }

  function sortHabits(list){
    const mode = sortEl?.value || 'streak';
    const goalPct = h => (Number(h.goalDays)>0 ? (computeStreak(h)/Number(h.goalDays)) : 0);
    const overdueRank = h => (allowedToday(h) && !didToday(h)) ? 0 : 1;

    const arr = [...list];
    switch(mode){
      case 'best': arr.sort((a,b) => computeBest(b) - computeBest(a)); break;
      case 'progress': arr.sort((a,b) => goalPct(b) - goalPct(a)); break;
      case 'recent': arr.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
      case 'overdue': arr.sort((a,b) => overdueRank(a)-overdueRank(b) || computeStreak(b)-computeStreak(a)); break;
      case 'name': arr.sort((a,b) => (a.name||'').localeCompare(b.name||'')); break;
      case 'streak':
      default: arr.sort((a,b) => computeStreak(b) - computeStreak(a));
    }
    return arr;
  }
  function filterHabits(list){
    const f = filterEl?.value || 'all';
    if(f==='open') return list.filter(h => allowedToday(h) && !didToday(h));
    if(f==='doneToday') return list.filter(h => didToday(h));
    return list;
  }
  sortEl?.addEventListener('change', render);
  filterEl?.addEventListener('change', render);

  // --- Rollover control ---
  if(rolloverEl){
    rolloverEl.value = String(settings.rolloverHour);
    rolloverEl.addEventListener('change', () => {
      settings.rolloverHour = Number(rolloverEl.value);
      saveSettings(settings);
      todayEl.textContent = `Today: ${todayKey()}`;
      render();
    });
  }

  // --- Render ---
  function render(){
    habitsEl.innerHTML = '';
    const list = sortHabits(filterHabits(habits));
    lastRenderedIds = list.map(h=>h.id);

    if (list.length === 0) {
      const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No habits yet. Add one above.'; habitsEl.appendChild(p); return;
    }
    for (const h of list) {
      const key = todayKey();
      const doneToday = (h.days || []).includes(key);
      const streak = computeStreak(h);
      const best = computeBest(h);
      const goal = Number(h.goalDays) || null;
      const pct = goal ? Math.min(100, Math.round((streak / goal) * 100)) : 0;

      const type = h.schedule?.type || 'daily';
      const weeklyCount = countThisWeek(h);
      const weeklyTarget = weekTarget(h);
      const allowed = allowedToday(h);

      const goalHit = goal && streak >= goal;
      const weekHit = weeklyTarget && weeklyCount >= weeklyTarget;

      const card = document.createElement('div');
      card.className = 'habit-card' + (h.collapsed ? ' collapsed' : '');
      const top = document.createElement('div'); top.className = 'habit-top';

      const left = document.createElement('div');
      left.innerHTML = `<div class=\"habit-name\">${escapeHtml(h.name)}</div>
                        <div class=\"small muted\">Started ${new Date(h.createdAt).toLocaleDateString()}</div>`;

      const mid = document.createElement('div');
      mid.className = 'badges';
      let scheduleLabel = 'Daily';
      if(type==='mwf') scheduleLabel = 'Mon/Wed/Fri';
      else if(type==='tuth') scheduleLabel = 'Tue/Thu';
      else if(type==='weekly') scheduleLabel = `Weekly: ${weeklyTarget}`;
      mid.innerHTML = `
        <span class=\"badge ${streak > 0 ? 'streak-active' : ''}\">Streak: <b>${streak}</b> 🔥</span>
        <span class=\"badge\">Best: ${best}</span>
        <span class=\"badge ${weekHit ? 'success' : ''}\">Days this week: ${weeklyCount}/${weeklyTarget}</span>
        <span class=\"badge\">${allowed ? 'Due today' : 'Rest day'}</span>
        <span class=\"badge\">${scheduleLabel}</span>
        ${goalHit ? '<span class=\"badge success\">Goal met</span>' : ''}
      `;

      const right = document.createElement('div');
      right.className = 'actions';

      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'pill collapse-btn';
      collapseBtn.title = h.collapsed ? 'Expand' : 'Collapse';
      collapseBtn.textContent = h.collapsed ? '▸' : '▾';
      collapseBtn.addEventListener('click', () => toggleCollapsed(h.id));
      right.appendChild(collapseBtn);

      const btn = document.createElement('button');
      btn.className = 'pill';
      btn.textContent = doneToday ? 'Undo today' : 'Did it today';
      btn.addEventListener('click', () => toggleToday(h.id));
      right.appendChild(btn);

      top.appendChild(left); top.appendChild(mid); top.appendChild(right);
      card.appendChild(top);

      const cols = document.createElement('div'); cols.className = 'cols';
      const col1 = document.createElement('div');
      if (goal) {
        col1.innerHTML = `<div class=\"small muted\">Goal: ${goal} days in a row</div>
                          <div class=\"progress ${pct>=100 ? 'celebrate' : ''}\"><div class=\"bar\" style=\"width:${pct}%;\"></div></div>`;
      } else {
        col1.innerHTML = `<div class=\"small muted\">Set a goal to see progress →</div>`;
      }

      const col2 = document.createElement('div');
      const goalInput = document.createElement('input'); goalInput.type = 'number'; goalInput.placeholder = 'Set goal days'; goalInput.min = '1'; goalInput.max = '365'; goalInput.value = goal || ''; goalInput.className = 'pill goal-input';
      const saveGoal = document.createElement('button'); saveGoal.className = 'pill'; saveGoal.textContent = 'Save goal'; saveGoal.addEventListener('click', () => updateGoal(h.id, goalInput.value));
      col2.appendChild(goalInput); col2.appendChild(saveGoal);

      const col3 = document.createElement('div'); col3.style.textAlign = 'right';
      const del = document.createElement('button'); del.className = 'pill danger'; del.textContent = 'Delete habit'; del.addEventListener('click', () => removeHabit(h.id));
      col3.appendChild(del);

      cols.appendChild(col1); cols.appendChild(col2); cols.appendChild(col3);
      card.appendChild(cols);

      habitsEl.appendChild(card);
    }
  }

  // add habit
  function addHabit(){
    const name = (nameEl.value || '').trim();
    const goal = Number(goalEl.value);
    if (!name) { alert('Enter a habit name.'); return; }
    commit();
    const freqVal = (freqEl?.value)||'daily';
    let schedule;
    if(freqVal==='daily') schedule = { type:'daily' };
    else if(freqVal==='mwf') schedule = { type:'mwf' };
    else if(freqVal==='tuth') schedule = { type:'tuth' };
    else if(freqVal==='weekly') schedule = { type:'weekly', perWeek: Math.min(7, Math.max(1, Number(weeklyTargetEl?.value||3))) };
    else schedule = { type:'daily' };

    const h = { id: Date.now(), name, goalDays: goal > 0 ? goal : null, days: [], schedule, createdAt: new Date().toISOString(), collapsed: false };
    habits.push(h); save(habits);
    nameEl.value = ''; goalEl.value = '';
    render();
  }
  function toggleCollapsed(id) {
    commit();
    habits = habits.map(h => h.id === id ? { ...h, collapsed: !h.collapsed } : h);
    save(habits);
    render();
  }

  addBtn.addEventListener('click', addHabit);
  nameEl.addEventListener('keydown', (e)=>{ if(e.key==='Enter') addHabit(); });

  // keyboard shortcut: Shift+T toggles first habit in current view
  document.addEventListener('keydown', (e)=>{ if(e.shiftKey && (e.key==='T' || e.key==='t')){ const firstId = lastRenderedIds[0]; if(firstId) toggleToday(firstId); } });

  render();
})();