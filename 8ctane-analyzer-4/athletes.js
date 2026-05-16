/* =============================================
   8CTANE BASEBALL — ATHLETE MANAGER
   athletes.js
   ============================================= */

const PITCH_COLORS = {
  FF:'#378ADD',FA:'#378ADD',SI:'#888780',FC:'#534AB7',
  SL:'#E24B4A',ST:'#D85A30',CU:'#1D9E75',KC:'#1D9E75',
  FS:'#BA7517',CH:'#BA7517',CS:'#1D9E75',OTHER:'#555566'
};
const PITCH_NAMES = {
  FF:'4-Seam',FA:'4-Seam',SI:'Sinker',FC:'Cutter',
  SL:'Slider',ST:'Sweeper',CU:'Curveball',KC:'K-Curve',
  FS:'Splitter',CH:'Changeup',CS:'Slow Curve',OTHER:'Other'
};

const pc = pt => PITCH_COLORS[pt] || '#555566';
const pn = pt => PITCH_NAMES[pt] || pt;
const pf = v => parseFloat(v) || 0;
function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

let SCRIPT_URL = localStorage.getItem('8ctane_script_url') || '';
let currentAthlete = null;
let athleteOutings = [];
let profileCharts = {};

/* ==================== INIT ==================== */
window.addEventListener('DOMContentLoaded', () => {
  if (!SCRIPT_URL) {
    showConfigBanner();
  } else {
    loadRoster();
  }

  // Profile tabs
  document.querySelectorAll('[data-ptab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.ptab;
      document.querySelectorAll('#profile-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.ptab === name));
      document.querySelectorAll('.ptab-panel').forEach(p => p.classList.toggle('active', p.id === `ptab-${name}`));
      if (name === 'trends') renderTrends();
      if (name === 'compare') populateCompareSelectors();
    });
  });
});

/* ==================== CONFIG ==================== */
function showConfigBanner() {
  document.getElementById('config-banner').style.display = '';
  const input = document.getElementById('script-url-input');
  if (SCRIPT_URL) input.value = SCRIPT_URL;
}

function saveScriptUrl() {
  const url = document.getElementById('script-url-input').value.trim();
  if (!url.startsWith('https://script.google.com')) {
    toast('Please paste a valid Apps Script URL', 'error'); return;
  }
  SCRIPT_URL = url;
  localStorage.setItem('8ctane_script_url', url);
  document.getElementById('config-banner').style.display = 'none';
  toast('Connected to Google Sheets ✓', 'success');
  loadRoster();
}

/* ==================== API ==================== */
async function api(action, body = {}) {
  if (!SCRIPT_URL) { showConfigBanner(); throw new Error('No script URL configured'); }
  const url = `${SCRIPT_URL}?action=${action}`;
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/* ==================== ROSTER ==================== */
async function loadRoster() {
  const grid = document.getElementById('athlete-grid');
  grid.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div>Loading athletes...</div>';
  try {
    const { athletes } = await api('getAthletes');
    renderRoster(athletes);
  } catch(e) {
    grid.innerHTML = `<div class="empty-state">Could not connect to Google Sheets.<br><small>${e.message}</small></div>`;
  }
}

function renderRoster(athletes) {
  const grid = document.getElementById('athlete-grid');
  const empty = document.getElementById('roster-empty');
  const count = document.getElementById('roster-count');
  count.textContent = `${athletes.length} athlete${athletes.length !== 1 ? 's' : ''}`;

  if (!athletes.length) {
    grid.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = athletes.map(a => {
    const initials = a.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
    return `<div class="athlete-card" onclick="openProfile('${a.id}')">
      <button class="card-delete-btn" onclick="event.stopPropagation();confirmDeleteAthlete('${a.id}','${a.name}')" title="Delete athlete">✕</button>
      <div class="athlete-card-header">
        <div class="athlete-avatar">${initials}</div>
        <div>
          <div class="athlete-card-name">${a.name}</div>
          <div class="athlete-card-meta">${a.throws}HP · ${a.team || '—'} · ${a.level || '—'}</div>
        </div>
      </div>
      <div class="athlete-card-footer">
        <span class="outing-count-badge" id="badge-${a.id}">Loading outings...</span>
        <span style="font-size:11px;color:var(--muted)">Click to view →</span>
      </div>
    </div>`;
  }).join('');

  // Load outing counts async
  athletes.forEach(a => loadOutingCount(a.id));
}

async function loadOutingCount(athleteId) {
  try {
    const { outings } = await api('getOutings', { athleteId });
    const badge = document.getElementById(`badge-${athleteId}`);
    if (badge) badge.textContent = `${outings.length} outing${outings.length !== 1 ? 's' : ''}`;
  } catch(e) {}
}

/* ==================== ADD ATHLETE ==================== */
function showAddAthlete() {
  openModal('Add Athlete', `
    <div class="form-group">
      <label class="form-label">Full Name *</label>
      <input class="form-input" id="f-name" placeholder="Thomas Harrington">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Throws</label>
        <select class="form-select" id="f-throws">
          <option value="R">Right</option>
          <option value="L">Left</option>
          <option value="S">Switch</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Position</label>
        <select class="form-select" id="f-position">
          <option value="SP">SP</option>
          <option value="RP">RP</option>
          <option value="P">P</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Team / Org</label>
        <input class="form-input" id="f-team" placeholder="Memphis Redbirds">
      </div>
      <div class="form-group">
        <label class="form-label">Level</label>
        <select class="form-select" id="f-level">
          <option value="MLB">MLB</option>
          <option value="AAA">AAA</option>
          <option value="AA">AA</option>
          <option value="A+">A+</option>
          <option value="A">A</option>
          <option value="College">College</option>
          <option value="HS">High School</option>
          <option value="Other">Other</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="f-notes" placeholder="Any notes about this athlete..."></textarea>
    </div>
    <div class="form-actions">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="submitAddAthlete()">Add Athlete</button>
    </div>
  `);
  setTimeout(() => document.getElementById('f-name').focus(), 50);
}

async function submitAddAthlete() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  try {
    await api('addAthlete', {
      name,
      throws:   document.getElementById('f-throws').value,
      position: document.getElementById('f-position').value,
      team:     document.getElementById('f-team').value.trim(),
      level:    document.getElementById('f-level').value,
      notes:    document.getElementById('f-notes').value.trim(),
    });
    closeModal();
    toast(`${name} added ✓`, 'success');
    loadRoster();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function confirmDeleteAthlete(id, name) {
  if (!confirm(`Delete ${name} and all their outings? This cannot be undone.`)) return;
  try {
    await api('deleteAthlete', { athleteId: id });
    toast(`${name} deleted`, 'success');
    loadRoster();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}

/* ==================== PROFILE ==================== */
async function openProfile(athleteId) {
  document.getElementById('view-roster').style.display = 'none';
  document.getElementById('view-profile').style.display = '';

  // Show loading
  document.getElementById('profile-hero').style.opacity = '.5';

  try {
    const { athletes } = await api('getAthletes');
    currentAthlete = athletes.find(a => a.id === athleteId);
    if (!currentAthlete) { showRoster(); return; }

    const { outings } = await api('getOutings', { athleteId });
    athleteOutings = outings;

    renderProfileHero();
    renderSeasonOverview();
    renderOutingsList();
    populateCompareSelectors();

    // Reset to overview tab
    document.querySelectorAll('#profile-tabs .tab').forEach((t,i) => t.classList.toggle('active', i===0));
    document.querySelectorAll('.ptab-panel').forEach((p,i) => p.classList.toggle('active', i===0));

  } catch(e) {
    toast('Error loading profile: ' + e.message, 'error');
    showRoster();
  }
}

function showRoster() {
  document.getElementById('view-roster').style.display = '';
  document.getElementById('view-profile').style.display = 'none';
  currentAthlete = null;
  athleteOutings = [];
  Object.keys(profileCharts).forEach(id => { if(profileCharts[id]) { profileCharts[id].destroy(); delete profileCharts[id]; } });
  loadRoster();
}

function renderProfileHero() {
  const a = currentAthlete;
  const initials = a.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
  document.getElementById('profile-avatar').textContent = initials;
  document.getElementById('profile-name').textContent = a.name;
  document.getElementById('profile-meta').innerHTML =
    `<span class="hero-meta-item">${a.throws}HP</span>
     <span class="hero-meta-item">${a.position}</span>
     <span class="hero-meta-item">${a.team || '—'}</span>
     <span class="hero-meta-item">${a.level || '—'}</span>`;
  document.getElementById('profile-hero').style.opacity = '1';

  // KPIs from all outings
  const totalPitches = athleteOutings.reduce((a,o)=>a+(+o.total_pitches||0), 0);
  const totalK = athleteOutings.reduce((a,o)=>a+(+o.strikeouts||0), 0);
  const totalBB = athleteOutings.reduce((a,o)=>a+(+o.walks||0), 0);
  const totalWhiffs = athleteOutings.reduce((a,o)=>a+(+o.whiffs||0), 0);
  const whiffRate = totalPitches ? (totalWhiffs/totalPitches*100).toFixed(1) : '—';

  document.getElementById('profile-kpis').innerHTML = [
    { v: athleteOutings.length, l: 'Outings' },
    { v: totalPitches.toLocaleString(), l: 'Total pitches' },
    { v: whiffRate+'%', l: 'Season whiff%' },
    { v: totalK, l: 'K' },
    { v: totalBB, l: 'BB' },
  ].map(k => `<div class="kpi"><div class="kpi-val mono">${k.v}</div><div class="kpi-lbl">${k.l}</div></div>`).join('');
}

/* ==================== SEASON OVERVIEW ==================== */
function renderSeasonOverview() {
  // Aggregate all pitch stats across all outings
  const combined = {};
  athleteOutings.forEach(o => {
    let pm = {};
    try { pm = typeof o.pitch_stats === 'object' ? o.pitch_stats : JSON.parse(o.pitch_stats_json || '{}'); } catch(e) {}
    Object.entries(pm).forEach(([pt, s]) => {
      if (!combined[pt]) combined[pt] = { count:0, velos:[], whiffs:0, cstrikes:0, hip:0, xwobas:[] };
      const c = combined[pt];
      c.count += (s.count||0);
      c.whiffs += (s.whiffs||0);
      c.cstrikes += (s.cstrikes||0);
      c.hip += (s.hip||0);
      if (s.avgVelo) c.velos.push(pf(s.avgVelo));
      if (s.avgXwoba) c.xwobas.push(pf(s.avgXwoba));
    });
  });

  const total = Object.values(combined).reduce((a,s)=>a+s.count, 0);
  const sorted = Object.entries(combined).sort((a,b)=>b[1].count-a[1].count);

  document.getElementById('season-arsenal-body').innerHTML = sorted.map(([pt, s]) => {
    const usagePct = total ? (s.count/total*100).toFixed(1) : 0;
    const whiff = s.count ? (s.whiffs/s.count*100).toFixed(1) : '—';
    const csw   = s.count ? ((s.whiffs+s.cstrikes)/s.count*100).toFixed(1) : '—';
    const avgV  = s.velos.length ? avg(s.velos).toFixed(1) : '—';
    const xwoba = s.xwobas.length ? avg(s.xwobas).toFixed(3) : '—';
    const mlbW  = MLB_BASELINE_REF[pt]?.whiff_pct;
    const wC    = parseFloat(whiff) >= 30 ? 'v-good' : parseFloat(whiff) >= 15 ? 'v-warn' : 'v-bad';
    const mlbTag = mlbW ? (() => {
      const d = parseFloat(whiff) - mlbW;
      return `${mlbW}% <span class="${d>=0?'delta-good':'delta-bad'}">${d>=0?'▲':'▼'}${Math.abs(d).toFixed(1)}</span>`;
    })() : '—';
    return `<tr>
      <td><span class="pitch-chip"><span class="pitch-dot" style="background:${pc(pt)}"></span>${pn(pt)}</span></td>
      <td class="v-num">${s.count}</td>
      <td class="v-num">${usagePct}%</td>
      <td class="v-num">${avgV}</td>
      <td class="${wC}">${whiff}%</td>
      <td class="v-num">${csw}%</td>
      <td class="v-num">${xwoba}</td>
      <td class="mlb-avg">${mlbTag}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="empty-state">No outing data yet.</td></tr>';

  // Charts
  if (profileCharts['season-mix']) { profileCharts['season-mix'].destroy(); }
  if (profileCharts['season-csw']) { profileCharts['season-csw'].destroy(); }

  profileCharts['season-mix'] = new Chart(document.getElementById('season-mix-chart'), {
    type: 'doughnut',
    data: { labels:sorted.map(([pt])=>pn(pt)), datasets:[{ data:sorted.map(([,s])=>s.count), backgroundColor:sorted.map(([pt])=>pc(pt)), borderWidth:2, borderColor:'#111316' }] },
    options: { responsive:true, maintainAspectRatio:false, cutout:'58%', plugins:{ legend:{ display:true, position:'right', labels:{ color:'#72747c', font:{size:11,family:'DM Mono'}, padding:10 } } } }
  });

  const cswVals = sorted.map(([,s]) => s.count ? Math.round((s.whiffs+s.cstrikes)/s.count*100) : 0);
  profileCharts['season-csw'] = new Chart(document.getElementById('season-csw-chart'), {
    type: 'bar',
    data: { labels:sorted.map(([pt])=>pn(pt)), datasets:[{ data:cswVals, backgroundColor:sorted.map(([pt])=>pc(pt)), borderRadius:3, borderSkipped:false }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ y:{beginAtZero:true,max:65,ticks:{callback:v=>v+'%',color:'#72747c',font:{size:10}},grid:{color:'rgba(255,255,255,0.04)'}}, x:{ticks:{color:'#72747c',font:{size:10}},grid:{display:false}} } }
  });
}

/* ==================== TRENDS ==================== */
function renderTrends() {
  if (!athleteOutings.length) return;
  const sorted = [...athleteOutings].sort((a,b) => a.date.localeCompare(b.date));
  const labels = sorted.map(o => o.date);

  // Velocity trend
  const veloData = sorted.map(o => pf(o.ff_velo) || null);
  if (profileCharts['trend-velo']) profileCharts['trend-velo'].destroy();
  profileCharts['trend-velo'] = new Chart(document.getElementById('trend-velo-chart'), {
    type: 'line',
    data: { labels, datasets:[{ label:'4-Seam avg velo', data:veloData, borderColor:'#378ADD', backgroundColor:'rgba(55,138,221,0.1)', fill:true, tension:.3, pointRadius:5, pointBackgroundColor:'#378ADD' }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ y:{ticks:{callback:v=>v+' mph',color:'#72747c',font:{size:10}},grid:{color:'rgba(255,255,255,0.04)'}}, x:{ticks:{color:'#72747c',font:{size:10}},grid:{display:false}} } }
  });

  // Whiff trend — top 3 pitches
  const pitchKeys = [['FF','#378ADD'],['ST','#D85A30'],['CU','#1D9E75'],['FS','#BA7517']];
  const whiffKey = { FF:'ff_whiff', ST:'st_whiff', CU:'cu_whiff', FS:'fs_whiff' };
  const whiffDs = pitchKeys.filter(([pt]) => sorted.some(o => pf(o[whiffKey[pt]]) > 0)).map(([pt, col]) => ({
    label: pn(pt),
    data: sorted.map(o => pf(o[whiffKey[pt]]) || null),
    borderColor: col, backgroundColor: 'transparent',
    tension:.3, pointRadius:4, pointBackgroundColor:col,
  }));
  if (profileCharts['trend-whiff']) profileCharts['trend-whiff'].destroy();
  profileCharts['trend-whiff'] = new Chart(document.getElementById('trend-whiff-chart'), {
    type:'line', data:{ labels, datasets:whiffDs },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'bottom', labels:{ color:'#72747c', font:{size:10,family:'DM Mono'}, padding:12, boxWidth:10 } } },
      scales:{ y:{ticks:{callback:v=>v+'%',color:'#72747c',font:{size:10}},grid:{color:'rgba(255,255,255,0.04)'}}, x:{ticks:{color:'#72747c',font:{size:10}},grid:{display:false}} } }
  });

  // Mix trend — stacked area
  const mixPitches = [['FF','#378ADD'],['ST','#D85A30'],['FS','#BA7517'],['FC','#534AB7'],['CU','#1D9E75']];
  const mixKey = { FF:'ff_pct', ST:'st_pct', FS:'fs_pct', FC:'fc_pct', CU:'cu_pct' };
  const mixDs = mixPitches.map(([pt,col]) => ({
    label:pn(pt), data:sorted.map(o=>pf(o[mixKey[pt]])||0),
    borderColor:col, backgroundColor:col+'55',
    fill:true, tension:.3, pointRadius:3,
  }));
  if (profileCharts['trend-mix']) profileCharts['trend-mix'].destroy();
  profileCharts['trend-mix'] = new Chart(document.getElementById('trend-mix-chart'), {
    type:'line', data:{ labels, datasets:mixDs },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'bottom', labels:{ color:'#72747c', font:{size:10,family:'DM Mono'}, padding:10, boxWidth:10 } } },
      scales:{ y:{stacked:true,ticks:{callback:v=>v+'%',color:'#72747c',font:{size:10}},grid:{color:'rgba(255,255,255,0.04)'}}, x:{ticks:{color:'#72747c',font:{size:10}},grid:{display:false}} } }
  });
}

/* ==================== OUTINGS LIST ==================== */
function renderOutingsList() {
  const container = document.getElementById('outings-list');
  if (!athleteOutings.length) {
    container.innerHTML = '<div class="empty-state">No outings yet. Add the first outing above.</div>';
    return;
  }
  const sorted = [...athleteOutings].sort((a,b) => b.date.localeCompare(a.date));
  container.innerHTML = sorted.map(o => {
    let pm = {};
    try { pm = typeof o.pitch_stats === 'object' ? o.pitch_stats : JSON.parse(o.pitch_stats_json || '{}'); } catch(e) {}
    const topPitches = Object.entries(pm).sort((a,b)=>b[1].count-a[1].count).slice(0,5);
    const whiffRate = o.total_pitches ? (o.whiffs/o.total_pitches*100).toFixed(1) : '—';
    return `<div class="outing-row">
      <div class="outing-date">${o.date}</div>
      <div class="outing-opp">${o.opponent || '—'}</div>
      <div class="outing-stats">
        <div class="outing-stat"><div class="outing-stat-val">${o.total_pitches||0}</div><div class="outing-stat-lbl">Pitches</div></div>
        <div class="outing-stat"><div class="outing-stat-val">${whiffRate}%</div><div class="outing-stat-lbl">Whiff%</div></div>
        <div class="outing-stat"><div class="outing-stat-val">${o.strikeouts||0}</div><div class="outing-stat-lbl">K</div></div>
        <div class="outing-stat"><div class="outing-stat-val">${o.walks||0}</div><div class="outing-stat-lbl">BB</div></div>
      </div>
      <div class="outing-pitch-pills">
        ${topPitches.map(([pt,s])=>{
          const total = Object.values(pm).reduce((a,b)=>a+b.count,0);
          const pct = total ? Math.round(s.count/total*100) : 0;
          return `<span class="pitch-pill" style="background:${pc(pt)}22;color:${pc(pt)}">${pt} ${pct}%</span>`;
        }).join('')}
      </div>
      ${o.notes ? `<div style="font-size:11px;color:var(--muted);font-style:italic;min-width:100%">${o.notes}</div>` : ''}
      <button class="outing-delete-btn" onclick="event.stopPropagation();confirmDeleteOuting('${o.id}','${o.date}')" title="Delete outing">✕</button>
    </div>`;
  }).join('');
}

/* ==================== ADD OUTING ==================== */
function showAddOuting() {
  openModal('Add Outing', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Date *</label>
        <input class="form-input" id="o-date" type="date" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <div class="form-group">
        <label class="form-label">Opponent</label>
        <input class="form-input" id="o-opp" placeholder="vs. Indianapolis">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="o-notes" placeholder="Any notes about this outing..."></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Upload Statcast CSV *</label>
      <div class="drop-area" id="outing-drop" style="padding:1.5rem;gap:.5rem">
        <div class="drop-icon" style="font-size:24px">⚾</div>
        <div class="drop-label" style="font-size:14px">Drop CSV here or click to select</div>
        <input type="file" id="outing-csv" accept=".csv" style="display:none">
      </div>
      <div class="form-hint" id="outing-csv-status">No file selected</div>
    </div>
    <div class="form-actions">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="btn-submit-outing" onclick="submitOuting()" disabled style="opacity:.4">Save Outing</button>
    </div>
  `);

  const drop = document.getElementById('outing-drop');
  const input = document.getElementById('outing-csv');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('dragging'); if(e.dataTransfer.files[0]) loadOutingCSV(e.dataTransfer.files[0]); });
  input.addEventListener('change', e => { if(e.target.files[0]) loadOutingCSV(e.target.files[0]); });
}

let pendingOutingData = null;

function loadOutingCSV(file) {
  Papa.parse(file, {
    header: true, skipEmptyLines: true,
    complete: r => {
      const rows = r.data;
      pendingOutingData = processOutingRows(rows);
      document.getElementById('outing-csv-status').textContent = `✓ ${file.name} — ${rows.length} pitches loaded`;
      document.getElementById('outing-csv-status').style.color = 'var(--good)';
      const btn = document.getElementById('btn-submit-outing');
      btn.disabled = false; btn.style.opacity = '1';
    }
  });
}

function processOutingRows(rows) {
  // Normalize pitch types
  const NORMALIZE = { FA:'FF', FO:'FS', CS:'CU', SV:'SL' };
  rows.forEach(r => {
    let pt = (r.pitch_type||'').trim().toUpperCase();
    pt = NORMALIZE[pt] || pt;
    if (!PITCH_COLORS[pt]) pt = 'OTHER';
    r._pt = pt;
  });

  const total = rows.length;
  const pitchMap = {};
  rows.forEach(r => {
    const pt = r._pt;
    if (!pitchMap[pt]) pitchMap[pt] = { count:0, velos:[], whiffs:0, cstrikes:0, balls:0, fouls:0, hip:0, xwobas:[], launch_speeds:[] };
    const s = pitchMap[pt];
    s.count++;
    if (r.release_speed) s.velos.push(pf(r.release_speed));
    const desc = r.description||'';
    if (desc.includes('swinging_strike')) s.whiffs++;
    else if (desc.includes('called_strike')) s.cstrikes++;
    else if (desc==='ball'||desc==='blocked_ball') s.balls++;
    else if (desc.includes('foul')) s.fouls++;
    else if (desc==='hit_into_play') {
      s.hip++;
      if (r.launch_speed) s.launch_speeds.push(pf(r.launch_speed));
      if (r.estimated_woba_using_speedangle) s.xwobas.push(pf(r.estimated_woba_using_speedangle));
    }
  });

  // Flatten for storage
  const flatMap = {};
  Object.entries(pitchMap).forEach(([pt, s]) => {
    flatMap[pt] = {
      count: s.count,
      whiffs: s.whiffs,
      cstrikes: s.cstrikes,
      hip: s.hip,
      avgVelo: s.velos.length ? +avg(s.velos).toFixed(1) : null,
      peakVelo: s.velos.length ? +Math.max(...s.velos).toFixed(1) : null,
      whiffPct: s.count ? +(s.whiffs/s.count*100).toFixed(1) : 0,
      cswPct: s.count ? +((s.whiffs+s.cstrikes)/s.count*100).toFixed(1) : 0,
      avgXwoba: s.xwobas.length ? +avg(s.xwobas).toFixed(3) : null,
      avgEV: s.launch_speeds.length ? +avg(s.launch_speeds).toFixed(1) : null,
    };
  });

  const totalWhiffs = Object.values(pitchMap).reduce((a,s)=>a+s.whiffs,0);
  const totalCS     = Object.values(pitchMap).reduce((a,s)=>a+s.cstrikes,0);
  const allEVs      = Object.values(pitchMap).flatMap(s=>s.launch_speeds);
  const hardHits    = allEVs.filter(ev=>ev>=95).length;

  return {
    pitchMap: flatMap,
    stats: {
      total,
      whiffs: totalWhiffs,
      calledStrikes: totalCS,
      walks: rows.filter(r=>r.events==='walk').length,
      ks: rows.filter(r=>r.events==='strikeout').length,
      avgEV: allEVs.length ? +avg(allEVs).toFixed(1) : null,
      hardHitPct: allEVs.length ? +(hardHits/allEVs.length*100).toFixed(1) : null,
    }
  };
}

async function submitOuting() {
  if (!pendingOutingData) { toast('Please upload a CSV first', 'error'); return; }
  const date = document.getElementById('o-date').value;
  if (!date) { toast('Date is required', 'error'); return; }

  const btn = document.getElementById('btn-submit-outing');
  btn.textContent = 'Saving...'; btn.disabled = true;

  try {
    await api('addOuting', {
      athleteId: currentAthlete.id,
      date,
      opponent: document.getElementById('o-opp').value.trim(),
      notes: document.getElementById('o-notes').value.trim(),
      pitchMap: pendingOutingData.pitchMap,
      stats: pendingOutingData.stats,
    });
    closeModal();
    pendingOutingData = null;
    toast('Outing saved ✓', 'success');
    // Reload profile
    await openProfile(currentAthlete.id);
  } catch(e) {
    toast('Error saving outing: ' + e.message, 'error');
    btn.textContent = 'Save Outing'; btn.disabled = false;
  }
}

async function confirmDeleteOuting(outingId, date) {
  if (!confirm(`Delete outing from ${date}? This cannot be undone.`)) return;
  try {
    await api('deleteOuting', { athleteId: currentAthlete.id, outingId });
    toast('Outing deleted', 'success');
    await openProfile(currentAthlete.id);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}

/* ==================== COMPARE ==================== */
function populateCompareSelectors() {
  const sorted = [...athleteOutings].sort((a,b)=>b.date.localeCompare(a.date));
  const options = sorted.map(o => `<option value="${o.id}">${o.date} vs. ${o.opponent||'Unknown'}</option>`).join('');
  ['compare-sel-1','compare-sel-2'].forEach((id,i) => {
    const sel = document.getElementById(id);
    sel.innerHTML = '<option value="">Select outing...</option>' + options;
    if (sorted[i]) sel.value = sorted[i].id;
  });
  renderComparison();
}

function renderComparison() {
  const id1 = document.getElementById('compare-sel-1').value;
  const id2 = document.getElementById('compare-sel-2').value;
  const container = document.getElementById('compare-result');
  if (!id1 || !id2 || id1 === id2) {
    container.innerHTML = '<div class="empty-state">Select two different outings to compare.</div>';
    return;
  }
  const o1 = athleteOutings.find(o=>o.id===id1);
  const o2 = athleteOutings.find(o=>o.id===id2);
  if (!o1||!o2) return;

  let pm1={},pm2={};
  try { pm1 = typeof o1.pitch_stats==='object' ? o1.pitch_stats : JSON.parse(o1.pitch_stats_json||'{}'); } catch(e){}
  try { pm2 = typeof o2.pitch_stats==='object' ? o2.pitch_stats : JSON.parse(o2.pitch_stats_json||'{}'); } catch(e){}

  const allPT = [...new Set([...Object.keys(pm1),...Object.keys(pm2)])];
  const t1 = Object.values(pm1).reduce((a,s)=>a+(s.count||0),0);
  const t2 = Object.values(pm2).reduce((a,s)=>a+(s.count||0),0);

  const w1 = o1.whiffs||0, w2 = o2.whiffs||0;
  const t1p = o1.total_pitches||1, t2p = o2.total_pitches||1;

  container.innerHTML = `
    <div class="chart-grid-2" style="margin-bottom:1rem">
      ${[{o:o1,t:t1,pm:pm1},{o:o2,t:t2,pm:pm2}].map(({o,t,pm},i)=>`
        <div class="chart-card">
          <div class="chart-card-title">${o.date} — vs. ${o.opponent||'—'}</div>
          <div style="display:flex;gap:1.5rem;margin-bottom:.75rem;flex-wrap:wrap">
            ${[
              {v:o.total_pitches||0,l:'Pitches'},
              {v:((o.whiffs/o.total_pitches||0)*100).toFixed(1)+'%',l:'Whiff%'},
              {v:o.strikeouts||0,l:'K'},
              {v:o.walks||0,l:'BB'},
            ].map(k=>`<div class="kpi"><div class="kpi-val mono" style="font-size:18px">${k.v}</div><div class="kpi-lbl">${k.l}</div></div>`).join('')}
          </div>
          <div>${Object.entries(pm).sort((a,b)=>b[1].count-a[1].count).map(([pt,s])=>{
            const pct = t ? Math.round(s.count/t*100) : 0;
            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px">
              <span style="width:28px;font-family:'DM Mono',monospace;font-size:10px;color:var(--muted)">${pt}</span>
              <div style="flex:1;background:var(--border);height:4px;border-radius:2px">
                <div style="width:${pct}%;height:4px;border-radius:2px;background:${pc(pt)}"></div>
              </div>
              <span class="v-num" style="font-size:10px;width:30px;text-align:right">${pct}%</span>
              <span style="font-size:10px;color:var(--muted);width:50px">W:${s.whiffPct||0}%</span>
            </div>`;
          }).join('')}</div>
        </div>`).join('')}
    </div>
    <div class="section-hd" style="margin-bottom:.75rem">Pitch mix delta (${o2.date} vs ${o1.date})</div>
    ${allPT.map(pt=>{
      const u1 = t1 ? (pm1[pt]?.count||0)/t1*100 : 0;
      const u2 = t2 ? (pm2[pt]?.count||0)/t2*100 : 0;
      const d = u2-u1;
      if (Math.abs(d) < 1) return '';
      return `<div style="display:flex;align-items:center;gap:10px;padding:.4rem 0;border-bottom:1px solid var(--border);font-size:12px">
        <span class="pitch-chip" style="min-width:90px"><span class="pitch-dot" style="background:${pc(pt)}"></span>${pn(pt)}</span>
        <span class="v-num" style="min-width:45px">${u1.toFixed(0)}%</span>
        <span style="color:var(--muted)">→</span>
        <span class="v-num" style="min-width:45px">${u2.toFixed(0)}%</span>
        <span class="${d>0?'delta-good':'delta-bad'}" style="font-size:11px">${d>0?'▲':'▼'}${Math.abs(d).toFixed(1)}pp</span>
      </div>`;
    }).join('')}
  `;
}

/* ==================== OPEN IN ANALYZER ==================== */
function openInAnalyzer() {
  window.open('index.html', '_blank');
}

/* ==================== MODAL ==================== */
function openModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-overlay').style.display = 'flex';
}
function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').style.display = 'none';
  pendingOutingData = null;
}

/* ==================== TOAST ==================== */
function toast(msg, type='success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type==='success'?'✓':'⚠'}</span> ${msg}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
