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
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const clean = dateStr.toString().split('T')[0].trim();
  const d = new Date(clean + 'T12:00:00');
  if (isNaN(d)) return clean;
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

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
      if (name === 'yoy')    renderYoY();
      if (name === 'report') renderReport();
      if (name === 'season-insight') renderSeasonInsight();
      if (name === 'outing-insight') initOutingInsight();
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

  // Clean labels: "Apr 11 vs LOU"
  const labels = sorted.map(o => {
    const clean = (o.date||'').toString().split('T')[0].trim();
    const d = new Date(clean + 'T12:00:00');
    const dateStr = d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    return o.opponent ? `${dateStr} vs ${o.opponent}` : dateStr;
  });

  // Shared x-axis options
  const xAxis = { ticks:{ color:'#72747c', font:{size:10}, maxRotation:40, minRotation:30 }, grid:{display:false} };
  const yPct  = { ticks:{ callback:v=>v+'%', color:'#72747c', font:{size:10} }, grid:{color:'rgba(255,255,255,0.04)'} };
  const yMph  = { ticks:{ callback:v=>v+' mph', color:'#72747c', font:{size:10} }, grid:{color:'rgba(255,255,255,0.04)'} };
  const legend = { display:true, position:'bottom', labels:{ color:'#72747c', font:{size:10,family:'DM Mono'}, padding:12, boxWidth:10 } };

  // ---- Avg velocity ----
  const veloData = sorted.map(o => pf(o.ff_velo) || null);
  if (profileCharts['trend-velo']) profileCharts['trend-velo'].destroy();
  profileCharts['trend-velo'] = new Chart(document.getElementById('trend-velo-chart'), {
    type: 'line',
    data: { labels, datasets:[{
      label:'Avg velo', data:veloData,
      borderColor:'#378ADD', backgroundColor:'rgba(55,138,221,0.1)',
      fill:true, tension:.3, pointRadius:5, pointBackgroundColor:'#378ADD'
    }]},
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{ y:yMph, x:xAxis } }
  });

  // ---- Peak velocity ----
  const peakData = sorted.map(o => {
    let pm = {};
    try { pm = typeof o.pitch_stats==='object' ? o.pitch_stats : JSON.parse(o.pitch_stats_json||'{}'); } catch(e){}
    const ff = pm['FF'] || pm['FA'];
    return ff?.peakVelo ? pf(ff.peakVelo) : null;
  });
  if (profileCharts['trend-peak']) profileCharts['trend-peak'].destroy();
  profileCharts['trend-peak'] = new Chart(document.getElementById('trend-peak-chart'), {
    type: 'line',
    data: { labels, datasets:[{
      label:'Peak velo', data:peakData,
      borderColor:'#00d4ff', backgroundColor:'rgba(0,212,255,0.08)',
      fill:true, tension:.3, pointRadius:5, pointBackgroundColor:'#00d4ff',
      borderDash:[],
    },{
      label:'Avg velo', data:veloData,
      borderColor:'#378ADD', backgroundColor:'transparent',
      tension:.3, pointRadius:4, pointBackgroundColor:'#378ADD',
      borderDash:[4,3],
    }]},
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'bottom', labels:{ color:'#72747c', font:{size:10,family:'DM Mono'}, padding:12, boxWidth:10 } } },
      scales:{ y:yMph, x:xAxis } }
  });

  // ---- Whiff trend ----
  const pitchKeys = [['FF','#378ADD'],['ST','#D85A30'],['CU','#1D9E75'],['FS','#BA7517']];
  const whiffKey  = { FF:'ff_whiff', ST:'st_whiff', CU:'cu_whiff', FS:'fs_whiff' };
  const whiffDs = pitchKeys
    .filter(([pt]) => sorted.some(o => pf(o[whiffKey[pt]]) > 0))
    .map(([pt, col]) => ({
      label: pn(pt), data: sorted.map(o => pf(o[whiffKey[pt]]) || null),
      borderColor:col, backgroundColor:'transparent',
      tension:.3, pointRadius:4, pointBackgroundColor:col,
    }));
  if (profileCharts['trend-whiff']) profileCharts['trend-whiff'].destroy();
  profileCharts['trend-whiff'] = new Chart(document.getElementById('trend-whiff-chart'), {
    type:'line', data:{ labels, datasets:whiffDs },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend },
      scales:{ y:yPct, x:xAxis } }
  });

  // ---- Mix trend ----
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
      plugins:{ legend },
      scales:{ y:{ stacked:true, ...yPct }, x:xAxis } }
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
      <div class="outing-date">${formatDate(o.date)}</div>
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
      <button class="outing-delete-btn" onclick="event.stopPropagation();confirmDeleteOuting('${o.id}','${formatDate(o.date)}')" title="Delete outing">✕</button>
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
  const NORMALIZE = { FA:'FF', FO:'FS', CS:'CU', SV:'SL' };
  rows.forEach(r => {
    let pt = (r.pitch_type||'').trim().toUpperCase();
    pt = NORMALIZE[pt] || pt;
    if (!PITCH_COLORS[pt]) pt = 'OTHER';
    r._pt = pt;
  });

  const total = rows.length;
  const pitchMap = {};

  // Zone/swing counters (outing-level)
  let inZone=0, outZone=0, swingInZone=0, swingOutZone=0,
      contactInZone=0, contactOutZone=0, totalSwings=0,
      totalStrikes=0, gbCount=0, fbCount=0, ldCount=0, puCount=0, bipCount=0;

  const STRIKE_ZONES = new Set(['1','2','3','4','5','6','7','8','9']);

  rows.forEach(r => {
    const pt = r._pt;
    if (!pitchMap[pt]) pitchMap[pt] = { count:0, velos:[], whiffs:0, cstrikes:0, balls:0, fouls:0, hip:0, xwobas:[], launch_speeds:[], pfx_xs:[], pfx_zs:[], rawRows:[] };
    const s = pitchMap[pt];
    s.count++;
    s.rawRows.push(r);
    if (r.release_speed) s.velos.push(pf(r.release_speed));
    if (r.pfx_x) s.pfx_xs.push(pf(r.pfx_x));
    if (r.pfx_z) s.pfx_zs.push(pf(r.pfx_z));

    const desc = r.description||'';
    const zone = (r.zone||'').toString().trim();
    const inStrikeZone = STRIKE_ZONES.has(zone);
    if (inStrikeZone) inZone++; else if (zone) outZone++;

    const isSwing = desc.includes('swinging_strike') || desc.includes('foul') || desc === 'hit_into_play' || desc === 'foul_tip';
    const isContact = desc.includes('foul') || desc === 'hit_into_play' || desc === 'foul_tip';

    if (isSwing) {
      totalSwings++;
      if (inStrikeZone) { swingInZone++; if(isContact) contactInZone++; }
      else if (zone) { swingOutZone++; if(isContact) contactOutZone++; }
    }

    if (desc.includes('swinging_strike')) s.whiffs++;
    else if (desc.includes('called_strike')) s.cstrikes++;
    else if (desc==='ball'||desc==='blocked_ball') s.balls++;
    else if (desc.includes('foul')) s.fouls++;
    else if (desc==='hit_into_play') {
      s.hip++;
      if (r.launch_speed) s.launch_speeds.push(pf(r.launch_speed));
      if (r.estimated_woba_using_speedangle) s.xwobas.push(pf(r.estimated_woba_using_speedangle));
    }

    // Strikes = swinging strikes + called strikes + fouls + HIP
    if (desc.includes('swinging_strike')||desc.includes('called_strike')||desc.includes('foul')||desc==='hit_into_play') totalStrikes++;

    // BIP types
    const bbt = (r.bb_type||'').toLowerCase();
    if (bbt) {
      bipCount++;
      if (bbt==='ground_ball') gbCount++;
      else if (bbt==='fly_ball') fbCount++;
      else if (bbt==='line_drive') ldCount++;
      else if (bbt==='popup') puCount++;
    }
  });

  // Flatten pitch map
  const flatMap = {};
  Object.entries(pitchMap).forEach(([pt, s]) => {
    const angles = s.rawRows.map(r => {
      const vx0=pf(r.vx0),vy0=pf(r.vy0),vz0=pf(r.vz0),ax=pf(r.ax),ay=pf(r.ay),az=pf(r.az),ext=pf(r.release_extension)||6;
      if (!vy0) return null;
      const t = (60.5-ext)/Math.abs(vy0);
      return { vaa: +(Math.atan((vz0+az*t)/Math.abs(vy0+ay*t))*(180/Math.PI)).toFixed(1), haa: +(Math.atan((vx0+ax*t)/Math.abs(vy0+ay*t))*(180/Math.PI)).toFixed(1) };
    }).filter(Boolean);
    flatMap[pt] = {
      count:    s.count,
      whiffs:   s.whiffs,
      cstrikes: s.cstrikes,
      hip:      s.hip,
      avgVelo:  s.velos.length  ? +avg(s.velos).toFixed(1)  : null,
      peakVelo: s.velos.length  ? +Math.max(...s.velos).toFixed(1) : null,
      whiffPct: s.count ? +(s.whiffs/s.count*100).toFixed(1) : 0,
      cswPct:   s.count ? +((s.whiffs+s.cstrikes)/s.count*100).toFixed(1) : 0,
      avgXwoba: s.xwobas.length ? +avg(s.xwobas).toFixed(3) : null,
      avgEV:    s.launch_speeds.length ? +avg(s.launch_speeds).toFixed(1) : null,
      avgIVB:   s.pfx_zs.length ? +(avg(s.pfx_zs)*12).toFixed(1) : null,
      avgHB:    s.pfx_xs.length ? +(-avg(s.pfx_xs)*12).toFixed(1) : null,
      avgVAA:   angles.length   ? +avg(angles.map(a=>a.vaa)).toFixed(1) : null,
      avgHAA:   angles.length   ? +avg(angles.map(a=>a.haa)).toFixed(1) : null,
    };
  });

  const totalWhiffs = Object.values(pitchMap).reduce((a,s)=>a+s.whiffs,0);
  const totalCS     = Object.values(pitchMap).reduce((a,s)=>a+s.cstrikes,0);
  const allEVs      = Object.values(pitchMap).flatMap(s=>s.launch_speeds);
  const hardHits    = allEVs.filter(ev=>ev>=95).length;
  const zonedPitches = inZone + outZone;

  return {
    pitchMap: flatMap,
    stats: {
      total,
      whiffs:        totalWhiffs,
      calledStrikes: totalCS,
      walks:         rows.filter(r=>r.events==='walk').length,
      ks:            rows.filter(r=>r.events==='strikeout').length,
      avgEV:         allEVs.length ? +avg(allEVs).toFixed(1) : null,
      hardHitPct:    allEVs.length ? +(hardHits/allEVs.length*100).toFixed(1) : null,
      zonePct:       zonedPitches  ? +(inZone/zonedPitches*100).toFixed(1) : null,
      oSwingPct:     outZone       ? +(swingOutZone/outZone*100).toFixed(1) : null,
      zSwingPct:     inZone        ? +(swingInZone/inZone*100).toFixed(1) : null,
      zContactPct:   swingInZone   ? +(contactInZone/swingInZone*100).toFixed(1) : null,
      swingPct:      total         ? +(totalSwings/total*100).toFixed(1) : null,
      strikePct:     total         ? +(totalStrikes/total*100).toFixed(1) : null,
      gbPct:         bipCount      ? +(gbCount/bipCount*100).toFixed(1) : null,
      fbPct:         bipCount      ? +(fbCount/bipCount*100).toFixed(1) : null,
      ldPct:         bipCount      ? +(ldCount/bipCount*100).toFixed(1) : null,
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

/* ==================== SEASON INSIGHT ==================== */
async function renderSeasonInsight() {
  const container = document.getElementById('season-insight-content');
  if (!athleteOutings.length) {
    container.innerHTML = '<div class="empty-state">No outing data yet.</div>';
    return;
  }

  container.innerHTML = `<div class="ai-loading"><div class="loading-spinner"></div><p>Analyzing season data...</p></div>`;

  // Aggregate full season data
  const combined = {};
  athleteOutings.forEach(o => {
    let pm = {};
    try { pm = typeof o.pitch_stats==='object' ? o.pitch_stats : JSON.parse(o.pitch_stats_json||'{}'); } catch(e){}
    Object.entries(pm).forEach(([pt, s]) => {
      if (!s.count) return;
      if (!combined[pt]) combined[pt] = { count:0, whiffs:0, cstrikes:0, hip:0, xwobas:[], evs:[], hardHits:0, velos:[], ivbs:[], hbs:[], vaas:[] };
      const c = combined[pt];
      c.count += s.count||0; c.whiffs += s.whiffs||0; c.cstrikes += s.cstrikes||0; c.hip += s.hip||0;
      if (s.avgVelo)  c.velos.push(pf(s.avgVelo));
      if (s.avgXwoba) c.xwobas.push(pf(s.avgXwoba));
      if (s.avgEV)    c.evs.push(pf(s.avgEV));
      if (s.avgIVB)   c.ivbs.push(pf(s.avgIVB));
      if (s.avgHB)    c.hbs.push(pf(s.avgHB));
      if (s.avgVAA)   c.vaas.push(pf(s.avgVAA));
    });
  });

  const total = Object.values(combined).reduce((a,s)=>a+s.count,0);
  const totalK  = athleteOutings.reduce((a,o)=>a+(+o.strikeouts||0),0);
  const totalBB = athleteOutings.reduce((a,o)=>a+(+o.walks||0),0);
  const sorted  = Object.entries(combined).sort((a,b)=>b[1].count-a[1].count);

  // Build pitch summary for AI
  const pitchSummary = sorted.map(([pt,s]) => {
    const mlb = MLB_BASELINE_REF[pt];
    return {
      pitch: pn(pt),
      code: pt,
      usage: total ? +(s.count/total*100).toFixed(1) : 0,
      avgVelo: s.velos.length ? +avg(s.velos).toFixed(1) : null,
      whiffPct: s.count ? +(s.whiffs/s.count*100).toFixed(1) : 0,
      cswPct: s.count ? +((s.whiffs+s.cstrikes)/s.count*100).toFixed(1) : 0,
      avgXwoba: s.xwobas.length ? +avg(s.xwobas).toFixed(3) : null,
      avgEV: s.evs.length ? +avg(s.evs).toFixed(1) : null,
      avgIVB: s.ivbs.length ? +avg(s.ivbs).toFixed(1) : null,
      avgHB: s.hbs.length ? +avg(s.hbs).toFixed(1) : null,
      avgVAA: s.vaas.length ? +avg(s.vaas).toFixed(1) : null,
      mlbWhiff: mlb?.whiff_pct || null,
      mlbXwoba: mlb?.avg_xwoba || null,
    };
  });

  // Zone/swing season averages
  const zonePct     = avg(athleteOutings.map(o=>pf(o.zone_pct)).filter(Boolean));
  const oSwingPct   = avg(athleteOutings.map(o=>pf(o.o_swing_pct)).filter(Boolean));
  const zContactPct = avg(athleteOutings.map(o=>pf(o.z_contact_pct)).filter(Boolean));
  const gbPct       = avg(athleteOutings.map(o=>pf(o.gb_pct)).filter(Boolean));

  const prompt = `You are a pitching coach at 8ctane Baseball writing directly to your pitcher. Your tone is direct, encouraging, and specific — like a coach who knows this pitcher well and wants to help them improve. Use "you" and "your" throughout. Be honest about weaknesses but frame everything constructively. Avoid analytical jargon — say "your curveball is your best swing-and-miss pitch" not "CU xwOBA suppression indicates elite contact quality."

PITCHER: ${currentAthlete.name} (${currentAthlete.throws}HP, ${currentAthlete.team||'unknown team'}, ${currentAthlete.level||''})
SEASON: ${athleteOutings.length} outings, ${total} pitches, ${totalK}K, ${totalBB}BB
ZONE%: ${zonePct?.toFixed(1)||'N/A'}% | O-Swing%: ${oSwingPct?.toFixed(1)||'N/A'}% | Z-Contact%: ${zContactPct?.toFixed(1)||'N/A'}% | GB%: ${gbPct?.toFixed(1)||'N/A'}%

ARSENAL (weight psStuff+, whiff%, and contact suppression heavily):
${pitchSummary.map(p => {
  const stuffScore = (() => {
    const mlb = MLB_BASELINE_REF[p.code];
    if (!mlb) return null;
    const veloIdx  = p.avgVelo  ? (p.avgVelo/mlb.avg_velo)*100 : 100;
    const whiffIdx = mlb.whiff_pct ? (p.whiffPct/mlb.whiff_pct)*100 : 100;
    const xwIdx    = p.avgXwoba && mlb.avg_xwoba ? (mlb.avg_xwoba/p.avgXwoba)*100 : 100;
    return Math.round(veloIdx*0.3 + whiffIdx*0.4 + xwIdx*0.3);
  })();
  return `${p.pitch} (${p.code}): psStuff+≈${stuffScore||'N/A'} | ${p.usage}% usage | ${p.avgVelo||'?'} mph | Whiff: ${p.whiffPct}% (MLB avg: ${p.mlbWhiff||'?'}%) | CSW: ${p.cswPct}% | xwOBA: ${p.avgXwoba||'?'} (MLB avg: ${p.mlbXwoba||'?'}) | IVB: ${p.avgIVB||'?'}" HB: ${p.avgHB||'?'}" VAA: ${p.avgVAA||'?'}°`;
}).join('\n')}

CRITICAL RULES:
1. Pitches with psStuff+ > 105 should be PRIORITIZED regardless of current usage.
2. Pitches with psStuff+ < 95 and high usage should be addressed honestly but constructively.
3. Whiff% vs MLB average is the most important results metric.
4. DO NOT recommend removing a pitch based on usage alone — base it on stuff quality.
5. Write everything as if speaking directly to the pitcher.

Respond with JSON only (no markdown):
{
  "headline": "2-3 word headline — encouraging, captures the season",
  "summary": "3-4 sentences written directly to the pitcher about their season — what they did well, what to build on",
  "strengths": [{"title": "...", "detail": "written to the pitcher, specific and encouraging"}],
  "concerns": [{"title": "...", "detail": "written to the pitcher, honest but constructive — frame as opportunity"}],
  "arsenalAssessment": {
    "keepPitches": [{"pitch": "...", "reason": "why this pitch is working for you"}],
    "developPitches": [{"pitch": "...", "reason": "what you can unlock with this pitch"}],
    "addPitch": {"pitch": "...", "reason": "why adding this would help you"},
    "removePitch": {"pitch": "...", "reason": "honest explanation of why this isn't serving you"}
  },
  "splitAdvice": {
    "vsRHH": "2-3 sentences of direct advice for attacking right-handed hitters",
    "vsLHH": "2-3 sentences of direct advice for attacking left-handed hitters"
  },
  "developmentPriorities": ["specific actionable focus area written to the pitcher", "...", "..."]
}`;

  try {
    const analysis = await callClaudeProxy(prompt);
    renderSeasonInsightHTML(analysis, pitchSummary, total);
  } catch(e) {
    container.innerHTML = `<div class="empty-state">Could not generate insights: ${e.message}</div>`;
  }
}

function renderSeasonInsightHTML(a, pitchSummary, total) {
  const container = document.getElementById('season-insight-content');

  const strengthCards = (a.strengths||[]).map(s =>
    `<div class="insight-card good"><div class="insight-title">${s.title}</div><div class="insight-body">${s.detail}</div></div>`
  ).join('');

  const concernCards = (a.concerns||[]).map(c =>
    `<div class="insight-card danger"><div class="insight-title">${c.title}</div><div class="insight-body">${c.detail}</div></div>`
  ).join('');

  const keepPitches = (a.arsenalAssessment?.keepPitches||[]).map(p =>
    `<div class="arsenal-rec keep">✓ <strong>${p.pitch}</strong> — ${p.reason}</div>`
  ).join('');
  const devPitches = (a.arsenalAssessment?.developPitches||[]).map(p =>
    `<div class="arsenal-rec develop">↑ <strong>${p.pitch}</strong> — ${p.reason}</div>`
  ).join('');
  const addPitch = a.arsenalAssessment?.addPitch
    ? `<div class="arsenal-rec add">+ Add: <strong>${a.arsenalAssessment.addPitch.pitch}</strong> — ${a.arsenalAssessment.addPitch.reason}</div>` : '';
  const removePitch = a.arsenalAssessment?.removePitch
    ? `<div class="arsenal-rec remove">− Consider removing: <strong>${a.arsenalAssessment.removePitch.pitch}</strong> — ${a.arsenalAssessment.removePitch.reason}</div>` : '';

  const countRows = (a.countStrategy||[]).map(c => `
    <div class="count-strategy-row">
      <div class="cs-count">${c.count}</div>
      <div class="cs-detail">
        <div class="cs-pitch">${c.pitch}</div>
        <div class="cs-rec">${c.recommendation}</div>
      </div>
    </div>`).join('');

  container.innerHTML = `
    <div class="insight-page">

      <div class="insight-headline">${a.headline||''}</div>
      <div class="insight-summary">${a.summary||''}</div>

      <div class="section-hd" style="margin-top:1.5rem">Strengths & concerns</div>
      <div class="insight-grid">${strengthCards}${concernCards}</div>

      <div class="section-hd" style="margin-top:1.5rem">Arsenal assessment</div>
      <div class="arsenal-recs">${keepPitches}${devPitches}${addPitch}${removePitch}</div>

      <div class="section-hd" style="margin-top:1.5rem">Splits sequencing</div>
      <div class="splits-advice-grid">
        <div class="splits-advice-card">
          <div class="splits-advice-hd" style="color:#378ADD">vs. Right-handed hitters</div>
          <div class="splits-advice-body">${a.splitAdvice?.vsRHH||''}</div>
        </div>
        <div class="splits-advice-card">
          <div class="splits-advice-hd" style="color:#D85A30">vs. Left-handed hitters</div>
          <div class="splits-advice-body">${a.splitAdvice?.vsLHH||''}</div>
        </div>
      </div>

      <div class="section-hd" style="margin-top:1.5rem">Development priorities</div>
      <div class="dev-priorities">
        ${(a.developmentPriorities||[]).map((p,i) =>
          `<div class="dev-priority-row"><span class="dev-num">${i+1}</span><span>${p}</span></div>`
        ).join('')}
      </div>

    </div>`;
}

/* ==================== OUTING INSIGHT ==================== */
function initOutingInsight() {
  const sel = document.getElementById('outing-insight-sel');
  const sorted = [...athleteOutings].sort((a,b) => b.date.localeCompare(a.date));
  sel.innerHTML = '<option value="">Select an outing...</option>' +
    sorted.map(o => `<option value="${o.id}">${formatDate(o.date)} vs. ${o.opponent||'—'} (${o.total_pitches||0} pitches)</option>`).join('');
  document.getElementById('outing-insight-content').innerHTML = '';
}

async function loadOutingInsight() {
  const sel = document.getElementById('outing-insight-sel');
  const outingId = sel.value;
  if (!outingId) return;

  const outing = athleteOutings.find(o => o.id === outingId);
  if (!outing) return;

  const container = document.getElementById('outing-insight-content');
  container.innerHTML = `<div class="ai-loading"><div class="loading-spinner"></div><p>Analyzing outing...</p></div>`;

  let pm = {};
  try { pm = typeof outing.pitch_stats==='object' ? outing.pitch_stats : JSON.parse(outing.pitch_stats_json||'{}'); } catch(e){}

  const total = outing.total_pitches || 0;
  const pitchLines = Object.entries(pm)
    .filter(([,s])=>s.count>0)
    .sort((a,b)=>b[1].count-a[1].count)
    .map(([pt,s]) => {
      const mlb = MLB_BASELINE_REF[pt];
      return `${pn(pt)}: ${s.count} pitches (${total?(s.count/total*100).toFixed(0):0}%) | ${s.avgVelo||'?'} mph | Whiff: ${s.whiffPct||0}% | CSW: ${s.cswPct||0}% | xwOBA: ${s.avgXwoba||'N/A'} | IVB: ${s.avgIVB||'?'}" HB: ${s.avgHB||'?'}" VAA: ${s.avgVAA||'?'}° (MLB whiff avg: ${mlb?.whiff_pct||'?'}%)`;
    }).join('\n');

  const prompt = `You are a pitching coach at 8ctane Baseball writing directly to your pitcher after their outing. Your tone is direct, honest, and encouraging — like a coach who watched every pitch and wants to help them grow. Use "you" and "your" throughout. Be specific about what happened, what worked, and what to adjust. Speak plainly — avoid stat jargon.

PITCHER: ${currentAthlete.name} (${currentAthlete.throws}HP, ${currentAthlete.level||''})
OUTING: ${formatDate(outing.date)} vs. ${outing.opponent||'Unknown'} | ${total} pitches | ${outing.ks||0}K ${outing.walks||0}BB
Zone%: ${outing.zone_pct||'N/A'}% | O-Swing%: ${outing.o_swing_pct||'N/A'}% | Z-Contact%: ${outing.z_contact_pct||'N/A'}% | GB%: ${outing.gb_pct||'N/A'}% | SwStr%: ${total?(+outing.whiffs/total*100).toFixed(1):'N/A'}%

PITCH-BY-PITCH:
${pitchLines}

Respond with JSON only (no markdown):
{
  "headline": "2-3 word outing summary — direct and honest",
  "summary": "3-4 sentences written directly to the pitcher — what happened tonight, the good and the bad",
  "whatWorked": [{"title": "...", "detail": "specific encouragement about what worked and why to keep doing it"}],
  "whatDidnt": [{"title": "...", "detail": "honest but constructive — what went wrong and how to fix it"}],
  "keyMoments": ["specific moment from the outing written to the pitcher", "..."],
  "adjustments": [{"count": "...", "current": "...", "suggested": "...", "pitch": "...", "reason": "direct coaching advice"}],
  "nextOutingFocus": ["specific actionable focus written to the pitcher", "...", "..."]
}`;

  try {
    const analysis = await callClaudeProxy(prompt);
    renderOutingInsightHTML(analysis, outing, pm, total);
  } catch(e) {
    container.innerHTML = `<div class="empty-state">Could not generate insights: ${e.message}</div>`;
  }
}

function renderOutingInsightHTML(a, outing, pm, total) {
  const container = document.getElementById('outing-insight-content');

  const workedCards = (a.whatWorked||[]).map(s =>
    `<div class="insight-card good"><div class="insight-title">${s.title}</div><div class="insight-body">${s.detail}</div></div>`
  ).join('');
  const didntCards = (a.whatDidnt||[]).map(s =>
    `<div class="insight-card danger"><div class="insight-title">${s.title}</div><div class="insight-body">${s.detail}</div></div>`
  ).join('');

  const adjustRows = (a.adjustments||[]).map(adj => `
    <div class="count-strategy-row">
      <div class="cs-count">${adj.count}</div>
      <div class="cs-detail">
        <div class="cs-pitch">${adj.pitch}</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Was: ${adj.current}</div>
        <div class="cs-rec">${adj.reason}</div>
      </div>
    </div>`).join('');

  const pitchRows = Object.entries(pm).filter(([,s])=>s.count>0).sort((a,b)=>b[1].count-a[1].count)
    .map(([pt,s]) => `
      <div style="display:flex;align-items:center;gap:10px;padding:.5rem 0;border-bottom:1px solid var(--border)">
        <span class="pitch-chip" style="min-width:90px"><span class="pitch-dot" style="background:${pc(pt)}"></span>${pn(pt)}</span>
        <span class="v-num" style="min-width:35px">${s.count}</span>
        <span style="color:var(--muted);font-size:11px;min-width:45px">${total?(s.count/total*100).toFixed(0):0}%</span>
        <span class="v-num" style="min-width:55px">${s.avgVelo||'—'} mph</span>
        <span class="${s.whiffPct>=30?'v-good':s.whiffPct>=15?'v-warn':'v-bad'}">${s.whiffPct||0}% W</span>
        <span class="v-num" style="font-size:11px">${s.cswPct||0}% CSW</span>
      </div>`).join('');

  container.innerHTML = `
    <div class="insight-page">

      <div class="outing-insight-header">
        <div class="insight-headline">${a.headline||''}</div>
        <div class="outing-insight-meta">${formatDate(outing.date)} · vs. ${outing.opponent||'—'} · ${total} pitches · ${outing.ks||0}K ${outing.walks||0}BB</div>
      </div>
      <div class="insight-summary">${a.summary||''}</div>

      <div class="section-hd" style="margin-top:1.5rem">Pitch breakdown</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:.75rem 1.25rem">
        <div style="display:flex;gap:10px;padding:.4rem 0;margin-bottom:4px">
          <span style="min-width:90px;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Pitch</span>
          <span style="min-width:35px;font-size:10px;color:var(--muted);text-transform:uppercase">N</span>
          <span style="min-width:45px;font-size:10px;color:var(--muted);text-transform:uppercase">Use%</span>
          <span style="min-width:55px;font-size:10px;color:var(--muted);text-transform:uppercase">Velo</span>
          <span style="font-size:10px;color:var(--muted);text-transform:uppercase">Results</span>
        </div>
        ${pitchRows}
      </div>

      <div class="section-hd" style="margin-top:1.5rem">What worked / what didn't</div>
      <div class="insight-grid">${workedCards}${didntCards}</div>

      ${a.keyMoments?.length ? `
      <div class="section-hd" style="margin-top:1.5rem">Key moments</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:.875rem 1.25rem">
        ${a.keyMoments.map(m=>`<div style="padding:.4rem 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--muted)">· ${m}</div>`).join('')}
      </div>` : ''}

      ${adjustRows ? `
      <div class="section-hd" style="margin-top:1.5rem">Count-by-count adjustments</div>
      <div class="count-strategy-wrap">${adjustRows}</div>` : ''}

      ${a.nextOutingFocus?.length ? `
      <div class="section-hd" style="margin-top:1.5rem">Focus for next outing</div>
      <div class="dev-priorities">
        ${a.nextOutingFocus.map((p,i)=>`<div class="dev-priority-row"><span class="dev-num">${i+1}</span><span>${p}</span></div>`).join('')}
      </div>` : ''}

    </div>`;
}

/* ==================== STRIKE ZONE DIAGRAM ==================== */
function strikeZoneDiagram(location, pitchName) {
  // 3x3 grid: positions = up-in, up-middle, up-away / middle-in, middle, middle-away / low-in, low-middle, low-away
  const grid = [
    ['up-in','up-middle','up-away'],
    ['middle-in','middle','middle-away'],
    ['low-in','low-middle','low-away'],
  ];
  const ptColor = Object.entries(PITCH_NAMES).find(([,v])=>v===pitchName)?.[0];
  const color = ptColor ? pc(ptColor) : 'var(--cyan)';

  const cells = grid.map(row =>
    row.map(zone => {
      const isActive = zone === location;
      return `<div class="sz-cell ${isActive?'active':''}" style="${isActive?`background:${color};border-color:${color}`:''}"></div>`;
    }).join('')
  ).join('');

  return `<div class="strike-zone">${cells}</div>`;
}

async function callClaudeProxy(prompt) {
  const res = await api('analyze', {
    messages: [{ role: 'user', content: prompt }]
  });
  if (res.error) throw new Error(res.error);
  return JSON.parse(res.text);
}
function renderReport() {
  const container = document.getElementById('report-content');
  if (!athleteOutings.length) {
    container.innerHTML = '<div class="empty-state">No outing data available yet.</div>';
    return;
  }

  // Detect level — skip MLB percentiles for independent league
  const level = (currentAthlete.level || '').toLowerCase();
  const isIndependent = level === 'other' || level === 'atlantic' || level === 'indy';
  const hasBaselines = Object.keys(MLB_BASELINE_REF).length > 0 && !isIndependent;

  // Aggregate season stats from pitch map
  const combined = {};
  athleteOutings.forEach(o => {
    let pm = {};
    try { pm = typeof o.pitch_stats==='object' ? o.pitch_stats : JSON.parse(o.pitch_stats_json||'{}'); } catch(e){}
    Object.entries(pm).forEach(([pt, s]) => {
      if (!s.count) return;
      if (!combined[pt]) combined[pt] = { count:0, whiffs:0, cstrikes:0, hip:0, xwobas:[], evs:[], hardHits:0, velos:[] };
      const c = combined[pt];
      c.count    += s.count    || 0;
      c.whiffs   += s.whiffs   || 0;
      c.cstrikes += s.cstrikes || 0;
      c.hip      += s.hip      || 0;
      if (s.avgVelo)   c.velos.push(pf(s.avgVelo));
      if (s.avgXwoba)  c.xwobas.push(pf(s.avgXwoba));
      if (s.avgEV)     c.evs.push(pf(s.avgEV));
    });
  });

  const totalPitches = Object.values(combined).reduce((a,s)=>a+s.count,0);
  const totalWhiffs  = Object.values(combined).reduce((a,s)=>a+s.whiffs,0);
  const totalCS      = Object.values(combined).reduce((a,s)=>a+s.cstrikes,0);
  const totalHIP     = Object.values(combined).reduce((a,s)=>a+s.hip,0);
  const allXwobas    = Object.values(combined).flatMap(s=>s.xwobas);
  const allEVs       = Object.values(combined).flatMap(s=>s.evs);
  const allHardHits  = Object.values(combined).reduce((a,s)=>a+s.hardHits,0);
  const totalBB      = athleteOutings.reduce((a,o)=>a+(+o.walks||0),0);
  const totalK       = athleteOutings.reduce((a,o)=>a+(+o.strikeouts||0),0);

  const whiffPct   = totalPitches ? totalWhiffs/totalPitches*100 : 0;
  const cswPct     = totalPitches ? (totalWhiffs+totalCS)/totalPitches*100 : 0;
  const kPct       = totalHIP+totalK+totalBB > 0 ? totalK/(totalHIP+totalK+totalBB)*100 : 0;
  const bbPct      = totalHIP+totalK+totalBB > 0 ? totalBB/(totalHIP+totalK+totalBB)*100 : 0;
  const avgXwoba   = allXwobas.length ? avg(allXwobas) : null;
  const avgEV      = allEVs.length ? avg(allEVs) : null;
  const hardHitPct = allEVs.length ? allHardHits/allEVs.length*100 : 0;
  const ffMap      = combined['FF'] || combined['FA'];
  const avgVelo    = ffMap?.velos.length ? avg(ffMap.velos) : null;
  const swStrPct   = totalPitches ? totalWhiffs/totalPitches*100 : 0;

  // Aggregate zone/swing metrics from stored outing stats
  const zoneVals=[], oSwingVals=[], zSwingVals=[], zContactVals=[],
        swingVals=[], strikeVals=[], gbVals=[], fbVals=[], ldVals=[];

  athleteOutings.forEach(o => {
    if (pf(o.zone_pct))      zoneVals.push(pf(o.zone_pct));
    if (pf(o.o_swing_pct))   oSwingVals.push(pf(o.o_swing_pct));
    if (pf(o.z_swing_pct))   zSwingVals.push(pf(o.z_swing_pct));
    if (pf(o.z_contact_pct)) zContactVals.push(pf(o.z_contact_pct));
    if (pf(o.swing_pct))     swingVals.push(pf(o.swing_pct));
    if (pf(o.strike_pct))    strikeVals.push(pf(o.strike_pct));
    if (pf(o.gb_pct))        gbVals.push(pf(o.gb_pct));
    if (pf(o.fb_pct))        fbVals.push(pf(o.fb_pct));
    if (pf(o.ld_pct))        ldVals.push(pf(o.ld_pct));
  });

  const zonePct     = zoneVals.length     ? avg(zoneVals)     : null;
  const oSwingPct   = oSwingVals.length   ? avg(oSwingVals)   : null;
  const zSwingPct   = zSwingVals.length   ? avg(zSwingVals)   : null;
  const zContactPct = zContactVals.length ? avg(zContactVals) : null;
  const swingPct    = swingVals.length    ? avg(swingVals)    : null;
  const strikePct   = strikeVals.length   ? avg(strikeVals)   : null;
  const gbPct       = gbVals.length       ? avg(gbVals)       : null;
  const fbPct       = fbVals.length       ? avg(fbVals)       : null;
  const ldPct       = ldVals.length       ? avg(ldVals)       : null;

  // Peak velo
  const ffOutingPeaks = [];
  athleteOutings.forEach(o => {
    let pm={};
    try { pm = typeof o.pitch_stats==='object' ? o.pitch_stats : JSON.parse(o.pitch_stats_json||'{}'); } catch(e){}
    const ff = pm['FF'] || pm['FA'];
    if (ff?.peakVelo) ffOutingPeaks.push(pf(ff.peakVelo));
  });
  const peakVelo = ffOutingPeaks.length ? Math.max(...ffOutingPeaks) : null;

  // MLB baseline distributions — percentile curves (p10,p25,p50,p75,p90)
  const DIST = {
    whiffPct:   { p10:12,  p25:17,  p50:22,  p75:27,  p90:33,  hib:true  },
    cswPct:     { p10:14,  p25:19,  p50:24,  p75:29,  p90:35,  hib:true  },
    kPct:       { p10:14,  p25:18,  p50:22,  p75:27,  p90:32,  hib:true  },
    bbPct:      { p10:4,   p25:6,   p50:8,   p75:11,  p90:14,  hib:false },
    avgXwoba:   { p10:.26, p25:.29, p50:.32, p75:.35, p90:.39, hib:false },
    avgEV:      { p10:85,  p25:87,  p50:89,  p75:91,  p90:93,  hib:false },
    hardHitPct: { p10:28,  p25:33,  p50:38,  p75:43,  p90:49,  hib:false },
    avgVelo:    { p10:90,  p25:92,  p50:94,  p75:96,  p90:98,  hib:true  },
    zonePct:    { p10:40,  p25:44,  p50:48,  p75:52,  p90:56,  hib:true  },
    oSwingPct:  { p10:22,  p25:26,  p50:30,  p75:35,  p90:40,  hib:true  },
    zSwingPct:  { p10:58,  p25:63,  p50:68,  p75:73,  p90:78,  hib:true  },
    zContactPct:{ p10:74,  p25:78,  p50:82,  p75:86,  p90:90,  hib:false },
    swingPct:   { p10:38,  p25:42,  p50:46,  p75:50,  p90:55,  hib:true  },
    strikePct:  { p10:58,  p25:61,  p50:64,  p75:67,  p90:70,  hib:true  },
    gbPct:      { p10:30,  p25:38,  p50:45,  p75:52,  p90:58,  hib:true  },
    fbPct:      { p10:20,  p25:25,  p50:30,  p75:36,  p90:42,  hib:false },
    ldPct:      { p10:14,  p25:17,  p50:20,  p75:23,  p90:27,  hib:false },
  };

  function getPercentile(val, dist) {
    if (val === null || val === undefined || isNaN(val)) return null;
    const { p10, p25, p50, p75, p90, hib } = dist;
    let pct;
    if (val <= p10) pct = hib ? 5 : 95;
    else if (val <= p25) pct = hib ? 15 + (val-p10)/(p25-p10)*15 : 80 - (val-p10)/(p25-p10)*15;
    else if (val <= p50) pct = hib ? 30 + (val-p25)/(p50-p25)*20 : 65 - (val-p25)/(p50-p25)*20;
    else if (val <= p75) pct = hib ? 50 + (val-p50)/(p75-p50)*25 : 40 - (val-p50)/(p75-p50)*25;
    else if (val <= p90) pct = hib ? 75 + (val-p75)/(p90-p75)*15 : 15 - (val-p75)/(p90-p75)*10;
    else pct = hib ? 92 : 5;
    return Math.min(99, Math.max(1, Math.round(pct)));
  }

  function pctColor(p) {
    if (p === null) return '#555';
    if (p >= 80) return '#e91e8c';
    if (p >= 60) return '#e91e8c99';
    if (p >= 40) return '#72747c';
    if (p >= 20) return '#534AB7';
    return '#378ADD';
  }

  function pctBar(label, val, displayVal, dist, unit='') {
    if (!hasBaselines) {
      return `<div class="pct-row">
        <div class="pct-label">${label}</div>
        <div class="pct-bar-track"><div class="pct-bar-fill-plain" style="width:50%;background:var(--cyan)"></div></div>
        <div class="pct-value">${displayVal !== null && displayVal !== undefined ? displayVal+unit : '—'}</div>
      </div>`;
    }
    const p = getPercentile(val, dist);
    const color = pctColor(p);
    return `<div class="pct-row">
      <div class="pct-label">${label}</div>
      <div class="pct-bar-track">
        <div class="pct-bar-fill" style="width:${p||0}%;background:${color}">
          ${p !== null ? `<span class="pct-bubble" style="background:${color}">${p}</span>` : ''}
        </div>
      </div>
      <div class="pct-value">${displayVal !== null && displayVal !== undefined ? displayVal+unit : '—'}</div>
    </div>`;
  }

  const r = (v,d=1) => v !== null && v !== undefined ? (+v).toFixed(d) : null;

  const levelBadge = isIndependent
    ? `<div class="report-note">Percentile rankings not shown — independent league data compared to MLB baselines would not be meaningful.</div>`
    : '';

  const sorted = Object.entries(combined).sort((a,b)=>b[1].count-a[1].count);

  container.innerHTML = `
    <div class="report-card">
      <div class="report-header">
        <div class="report-name">${currentAthlete.name}</div>
        <div class="report-meta">${currentAthlete.throws}HP · ${currentAthlete.team||''} · ${currentAthlete.level||''} · 2026 Season</div>
        <div class="report-summary-strip">
          ${[
            { v: athleteOutings.length,               l: 'G' },
            { v: totalPitches,                        l: 'Pitches' },
            { v: totalK,                              l: 'K' },
            { v: totalBB,                             l: 'BB' },
            { v: avgVelo  ? avgVelo.toFixed(1)  : '—',l: 'FB avg' },
            { v: peakVelo ? peakVelo.toFixed(1) : '—',l: 'FB peak' },
          ].map(k=>`<div class="report-sum-stat"><div class="report-sum-val">${k.v}</div><div class="report-sum-lbl">${k.l}</div></div>`).join('')}
        </div>
      </div>

      ${levelBadge}

      <div class="report-section-hd">Season Percentiles${!hasBaselines?' (raw values)':' vs. MLB'}</div>
      <div class="pct-axis-labels"><span>Poor</span><span>Average</span><span>Great</span></div>

      <div class="pct-group-hd">Results</div>
      ${avgXwoba !== null        ? pctBar('xwOBA',      avgXwoba,    r(avgXwoba,3),  DIST.avgXwoba)       : ''}
      ${pctBar('Whiff%',          whiffPct,    r(whiffPct),    DIST.whiffPct,   '%')}
      ${pctBar('CSW%',            cswPct,      r(cswPct),      DIST.cswPct,     '%')}
      ${pctBar('K%',              kPct,        r(kPct),        DIST.kPct,       '%')}
      ${pctBar('BB%',             bbPct,       r(bbPct),       DIST.bbPct,      '%')}
      ${pctBar('SwStr%',          swStrPct,    r(swStrPct),    DIST.whiffPct,   '%')}

      <div class="pct-group-hd">Plate discipline</div>
      ${zonePct     !== null     ? pctBar('Zone%',       zonePct,     r(zonePct),     DIST.zonePct,    '%') : ''}
      ${oSwingPct   !== null     ? pctBar('O-Swing%',    oSwingPct,   r(oSwingPct),   DIST.oSwingPct,  '%') : ''}
      ${zSwingPct   !== null     ? pctBar('Z-Swing%',    zSwingPct,   r(zSwingPct),   DIST.zSwingPct,  '%') : ''}
      ${zContactPct !== null     ? pctBar('Z-Contact%',  zContactPct, r(zContactPct), DIST.zContactPct,'%') : ''}
      ${swingPct    !== null     ? pctBar('Swing%',      swingPct,    r(swingPct),    DIST.swingPct,   '%') : ''}
      ${strikePct   !== null     ? pctBar('Strike%',     strikePct,   r(strikePct),   DIST.strikePct,  '%') : ''}

      <div class="pct-group-hd">Contact quality</div>
      ${avgEV       !== null     ? pctBar('Avg EV',      avgEV,       r(avgEV),       DIST.avgEV,      ' mph') : ''}
      ${pctBar('Hard Hit%',       hardHitPct,  r(hardHitPct),  DIST.hardHitPct, '%')}
      ${gbPct       !== null     ? pctBar('GB%',         gbPct,       r(gbPct),       DIST.gbPct,      '%') : ''}
      ${fbPct       !== null     ? pctBar('FB%',         fbPct,       r(fbPct),       DIST.fbPct,      '%') : ''}
      ${ldPct       !== null     ? pctBar('LD%',         ldPct,       r(ldPct),       DIST.ldPct,      '%') : ''}

      <div class="pct-group-hd">Stuff</div>
      ${avgVelo     !== null     ? pctBar('FB Avg Velo', avgVelo,     r(avgVelo),     DIST.avgVelo,    ' mph') : ''}
      ${peakVelo    !== null     ? pctBar('FB Peak Velo',peakVelo,    r(peakVelo),    DIST.avgVelo,    ' mph') : ''}

    </div>`;
}

/* ==================== YEAR-OVER-YEAR ==================== */
function renderYoY() {
  if (!athleteOutings.length) {
    document.getElementById('yoy-empty').style.display = '';
    return;
  }
  document.getElementById('yoy-empty').style.display = 'none';

  // Aggregate all outings into a single season pitch map
  const combined = {};
  athleteOutings.forEach(o => {
    let pm = {};
    try { pm = typeof o.pitch_stats==='object' ? o.pitch_stats : JSON.parse(o.pitch_stats_json||'{}'); } catch(e){}
    Object.entries(pm).forEach(([pt, s]) => {
      if (!s.count || s.count === 0) return;
      if (!combined[pt]) combined[pt] = { count:0, velos:[], peakVelos:[], whiffs:0, cstrikes:0, hip:0, xwobas:[], evs:[], hardHits:0, ivbs:[], hbs:[], vaas:[], haas:[] };
      const c = combined[pt];
      c.count    += s.count   || 0;
      c.whiffs   += s.whiffs  || 0;
      c.cstrikes += s.cstrikes|| 0;
      c.hip      += s.hip     || 0;
      if (s.avgVelo)   c.velos.push(pf(s.avgVelo));
      if (s.peakVelo)  c.peakVelos.push(pf(s.peakVelo));
      if (s.avgXwoba)  c.xwobas.push(pf(s.avgXwoba));
      if (s.avgEV)     c.evs.push(pf(s.avgEV));
      if (s.avgIVB)    c.ivbs.push(pf(s.avgIVB));
      if (s.avgHB)     c.hbs.push(pf(s.avgHB));
      if (s.avgVAA)    c.vaas.push(pf(s.avgVAA));
      if (s.avgHAA)    c.haas.push(pf(s.avgHAA));
    });
  });

  const total = Object.values(combined).reduce((a,s)=>a+s.count, 0);
  const sorted = Object.entries(combined).sort((a,b)=>b[1].count-a[1].count);

  // ---- Shape stat cards (same layout as analyzer) ----
  const shapeHeader = `<div class="mov-header-row">
    <div class="mov-header-label">Pitch</div>
    <div class="mov-header-stats">
      <div class="mov-header-stat">Avg velo</div>
      <div class="mov-header-stat">Peak velo</div>
      <div class="mov-header-stat">IVB</div>
      <div class="mov-header-stat">HB</div>
      <div class="mov-header-stat">VAA</div>
      <div class="mov-header-stat">HAA</div>
    </div>
  </div>`;

  const shapeRows = sorted.map(([pt, s]) => {
    const avgV  = s.velos.length    ? avg(s.velos).toFixed(1)    : '—';
    const pkV   = s.peakVelos.length? Math.max(...s.peakVelos).toFixed(1) : '—';
    const ivb   = s.ivbs.length     ? avg(s.ivbs).toFixed(1)+'"' : '—';
    const hb    = s.hbs.length      ? avg(s.hbs).toFixed(1)+'"'  : '—';
    const vaa   = s.vaas.length     ? avg(s.vaas).toFixed(1)+'°' : '—';
    const haa   = s.haas.length     ? avg(s.haas).toFixed(1)+'°' : '—';
    return `<div class="mov-pitch-row">
      <div class="mov-pitch-label">
        <span class="pitch-dot" style="background:${pc(pt)};width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:8px;flex-shrink:0"></span>
        <span class="mov-pitch-name">${pn(pt)}</span>
      </div>
      <div class="mov-stat-group">
        <div class="mov-stat"><div class="mov-stat-val">${avgV}</div></div>
        <div class="mov-stat"><div class="mov-stat-val">${pkV}</div></div>
        <div class="mov-stat"><div class="mov-stat-val">${ivb}</div></div>
        <div class="mov-stat"><div class="mov-stat-val">${hb}</div></div>
        <div class="mov-stat"><div class="mov-stat-val">${vaa}</div></div>
        <div class="mov-stat"><div class="mov-stat-val">${haa}</div></div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('metrics-shape-cards').innerHTML = shapeHeader + shapeRows;

  // ---- Performance table ----
  document.getElementById('metrics-perf-body').innerHTML = sorted.map(([pt, s]) => {
    const usagePct = total ? (s.count/total*100).toFixed(1) : 0;
    const whiff    = s.count ? (s.whiffs/s.count*100).toFixed(1) : '—';
    const csw      = s.count ? ((s.whiffs+s.cstrikes)/s.count*100).toFixed(1) : '—';
    const xwoba    = s.xwobas.length ? avg(s.xwobas).toFixed(3) : '—';
    const ev       = s.evs.length    ? avg(s.evs).toFixed(1) : '—';
    const hhPct    = s.evs.length    ? (s.hardHits/s.evs.length*100).toFixed(0)+'%' : '—';
    const mlbW     = MLB_BASELINE_REF[pt]?.whiff_pct;
    const mlbC     = MLB_BASELINE_REF[pt]?.csw_pct;
    const mlbX     = MLB_BASELINE_REF[pt]?.avg_xwoba;
    const wC  = parseFloat(whiff) >= 30 ? 'v-good' : parseFloat(whiff) >= 15 ? 'v-warn' : 'v-bad';
    const cC  = parseFloat(csw) >= 30 ? 'v-good' : parseFloat(csw) >= 20 ? 'v-warn' : 'v-bad';
    const xC  = xwoba !== '—' ? (parseFloat(xwoba) <= .250 ? 'v-good' : parseFloat(xwoba) <= .350 ? 'v-warn' : 'v-bad') : 'v-num';

    function mlbDelta(val, base, higherBetter) {
      if (!base || val === '—') return `<span class="v-num">${base||'—'}</span>`;
      const d = (parseFloat(val) - base).toFixed(1);
      const better = higherBetter ? d > 0 : d < 0;
      const cls = Math.abs(d) < 0.5 ? '' : better ? 'delta-good' : 'delta-bad';
      const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '';
      return `<span class="v-num">${base}</span> <span class="${cls}">${arrow}${Math.abs(d)}</span>`;
    }

    return `<tr>
      <td><span class="pitch-chip"><span class="pitch-dot" style="background:${pc(pt)}"></span>${pn(pt)}</span></td>
      <td class="v-num">${s.count}</td>
      <td class="v-num">${usagePct}%</td>
      <td class="${wC}">${whiff}%</td>
      <td class="mlb-avg">${mlbDelta(whiff, mlbW, true)}</td>
      <td class="${cC}">${csw}%</td>
      <td class="mlb-avg">${mlbDelta(csw, mlbC, true)}</td>
      <td class="${xC}">${xwoba}</td>
      <td class="mlb-avg">${mlbDelta(xwoba, mlbX, false)}</td>
      <td class="v-num">${ev}</td>
      <td class="v-num">${hhPct}</td>
    </tr>`;
  }).join('');

  // ---- Velo bar chart ----
  if (profileCharts['metrics-velo']) profileCharts['metrics-velo'].destroy();
  profileCharts['metrics-velo'] = new Chart(document.getElementById('metrics-velo-chart'), {
    type: 'bar',
    data: {
      labels: sorted.map(([pt])=>pn(pt)),
      datasets: [
        { label:'Avg velo',  data:sorted.map(([,s])=>s.velos.length?+avg(s.velos).toFixed(1):0),           backgroundColor:sorted.map(([pt])=>pc(pt)+'88'), borderRadius:3, borderSkipped:false },
        { label:'Peak velo', data:sorted.map(([,s])=>s.peakVelos.length?+Math.max(...s.peakVelos).toFixed(1):0), backgroundColor:sorted.map(([pt])=>pc(pt)),     borderRadius:3, borderSkipped:false },
      ]
    },
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'top', labels:{ color:'#72747c', font:{size:10,family:'DM Mono'}, padding:12 } } },
      scales:{ y:{ ticks:{callback:v=>v+' mph',color:'#72747c',font:{size:10}}, grid:{color:'rgba(255,255,255,0.04)'}}, x:{ticks:{color:'#72747c',font:{size:11}},grid:{display:false}} } }
  });

  // ---- Whiff% vs MLB avg grouped bar ----
  if (profileCharts['metrics-whiff']) profileCharts['metrics-whiff'].destroy();
  const whiffPitches = sorted.filter(([,s])=>s.count>=3);
  profileCharts['metrics-whiff'] = new Chart(document.getElementById('metrics-whiff-chart'), {
    type: 'bar',
    data: {
      labels: whiffPitches.map(([pt])=>pn(pt)),
      datasets: [
        { label:'Season whiff%', data:whiffPitches.map(([,s])=>s.count?+(s.whiffs/s.count*100).toFixed(1):0), backgroundColor:whiffPitches.map(([pt])=>pc(pt)), borderRadius:3, borderSkipped:false },
        { label:'MLB avg',       data:whiffPitches.map(([pt])=>MLB_BASELINE_REF[pt]?.whiff_pct||0),           backgroundColor:'rgba(255,255,255,0.08)',           borderRadius:3, borderSkipped:false },
      ]
    },
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'top', labels:{ color:'#72747c', font:{size:10,family:'DM Mono'}, padding:12 } } },
      scales:{ y:{ beginAtZero:true, ticks:{callback:v=>v+'%',color:'#72747c',font:{size:10}}, grid:{color:'rgba(255,255,255,0.04)'}}, x:{ticks:{color:'#72747c',font:{size:11}},grid:{display:false}} } }
  });

  // ---- Movement scatter — one point per outing per pitch ----
  if (profileCharts['metrics-movement']) profileCharts['metrics-movement'].destroy();
  const movDS = sorted.map(([pt]) => {
    const points = athleteOutings.map(o => {
      let pm = {};
      try { pm = typeof o.pitch_stats==='object' ? o.pitch_stats : JSON.parse(o.pitch_stats_json||'{}'); } catch(e){}
      const s = pm[pt];
      if (!s?.avgHB || !s?.avgIVB) return null;
      return { x: pf(s.avgHB), y: pf(s.avgIVB) };
    }).filter(Boolean);
    return { label:pn(pt), data:points, backgroundColor:pc(pt)+'cc', pointRadius:6, pointHoverRadius:9 };
  }).filter(ds => ds.data.length);

  profileCharts['metrics-movement'] = new Chart(document.getElementById('metrics-movement-chart'), {
    type:'scatter', data:{ datasets:movDS },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'right', labels:{ color:'#72747c', font:{size:11,family:'DM Mono'}, padding:10 } } },
      scales:{
        x:{ position:'center', title:{display:false}, ticks:{color:'#72747c',font:{size:10},stepSize:5}, grid:{color:'rgba(255,255,255,0.06)'}, min:-25, max:25 },
        y:{ position:'center', title:{display:false}, ticks:{color:'#72747c',font:{size:10},stepSize:5}, grid:{color:'rgba(255,255,255,0.06)'}, min:-20, max:25 }
      }
    }
  });
}

/* ==================== COMPARE ==================== */
function populateCompareSelectors() {
  const sorted = [...athleteOutings].sort((a,b)=>b.date.localeCompare(a.date));
  const options = sorted.map(o => `<option value="${o.id}">${formatDate(o.date)} vs. ${o.opponent||'Unknown'}</option>`).join('');
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
          <div class="chart-card-title">${formatDate(o.date)} — vs. ${o.opponent||'—'}</div>
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
