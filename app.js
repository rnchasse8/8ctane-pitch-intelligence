/* =============================================
   8CTANE BASEBALL — PITCH INTELLIGENCE
   app.js
   ============================================= */

/* ==================== BASELINES ==================== */
let MLB_BASELINES = {};

fetch('baselines.json')
  .then(r => r.json())
  .then(data => { MLB_BASELINES = data; })
  .catch(() => { console.warn('baselines.json not found — running without MLB comparisons.'); });

function getBaseline(pt, metric) {
  const b = MLB_BASELINES[pt] || MLB_BASELINES[pt === 'FA' ? 'FF' : null];
  return b ? b[metric] : null;
}

function deltaTag(val, baseline, higherIsBetter) {
  if (baseline === null || val === null || isNaN(val) || isNaN(baseline)) return '';
  const diff = val - baseline;
  const pct = Math.abs(diff).toFixed(1);
  if (Math.abs(diff) < 0.5) return `<span class="delta neutral">~avg</span>`;
  const better = higherIsBetter ? diff > 0 : diff < 0;
  const arrow = diff > 0 ? '▲' : '▼';
  const cls = better ? 'delta-good' : 'delta-bad';
  return `<span class="${cls}">${arrow}${pct}</span>`;
}

function veloDelta(val, baseline) {
  if (!baseline || !val || isNaN(val)) return '';
  const diff = (parseFloat(val) - baseline).toFixed(1);
  const cls = diff >= 0 ? 'delta-good' : 'delta-bad';
  const arrow = diff >= 0 ? '▲' : '▼';
  return `<span class="${cls}">${arrow}${Math.abs(diff)}</span>`;
}

const PITCH_COLORS = {
  FF:'#378ADD', FA:'#378ADD', SI:'#888780', FC:'#534AB7',
  SL:'#E24B4A', ST:'#D85A30', CU:'#1D9E75', KC:'#1D9E75',
  FS:'#BA7517', CH:'#BA7517', CS:'#1D9E75', OTHER:'#555566'
};
const PITCH_NAMES = {
  FF:'4-Seam', FA:'4-Seam', SI:'Sinker', FC:'Cutter',
  SL:'Slider', ST:'Sweeper', CU:'Curveball', KC:'Knuckle-Curve',
  FS:'Splitter', CH:'Changeup', CS:'Slow Curve', OTHER:'Other'
};
const COUNT_ORDER = ['0-0','0-1','0-2','1-0','1-1','1-2','2-0','2-1','2-2','3-0','3-1','3-2'];

const charts = {};
let singleData = null;
let multiData = { s1: null, s2: null };
let currentMode = 'single';

/* ==================== UTILITIES ==================== */
const pf = v => parseFloat(v) || 0;
const pc = pt => PITCH_COLORS[pt] || '#555566';
const pn = pt => PITCH_NAMES[pt] || pt;

function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

function valClass(val, goodBelow, warnBelow) {
  if (val === '—' || val === null) return 'v-num';
  const n = parseFloat(val);
  if (goodBelow !== undefined) {
    if (n <= goodBelow) return 'v-good';
    if (n <= warnBelow) return 'v-warn';
    return 'v-bad';
  }
  return 'v-num';
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

/* ==================== PITCH INFERENCE ==================== */
function inferPitchType(r) {
  const v = pf(r.release_speed), hb = pf(r.pfx_x), vb = pf(r.pfx_z);
  if (v >= 90) return 'FF';
  if (v >= 84) return (hb > 0.5 && vb > 0.2) ? 'SI' : (hb < -0.2 ? 'FC' : 'FS');
  if (v >= 78) return (hb > 0.5 && vb < 0) ? 'ST' : 'CU';
  return 'CU';
}

/* ==================== PARSE ROWS ==================== */
function parseRows(rows) {
  rows.forEach(r => {
    let pt = (r.pitch_type || '').trim().toUpperCase();
    if (!pt || pt === '') pt = inferPitchType(r);
    if (!PITCH_COLORS[pt]) pt = 'OTHER';
    r._pt = pt;
  });
  return rows;
}

/* ==================== BUILD PITCH MAP ==================== */
function buildPitchMap(rows) {
  const map = {};
  rows.forEach(r => {
    const pt = r._pt;
    if (!map[pt]) map[pt] = { count:0, velos:[], whiffs:0, cstrikes:0, balls:0, fouls:0, hip:0, launch_speeds:[], xwobas:[], events:[], pfx_xs:[], pfx_zs:[] };
    const s = map[pt];
    s.count++;
    if (r.release_speed) s.velos.push(pf(r.release_speed));
    if (r.pfx_x) s.pfx_xs.push(pf(r.pfx_x));
    if (r.pfx_z) s.pfx_zs.push(pf(r.pfx_z));
    const desc = r.description || '';
    if (desc.includes('swinging_strike') || desc === 'missed_bunt') s.whiffs++;
    else if (desc.includes('called_strike')) s.cstrikes++;
    else if (desc === 'ball' || desc === 'blocked_ball') s.balls++;
    else if (desc.includes('foul')) s.fouls++;
    else if (desc === 'hit_into_play') {
      s.hip++;
      if (r.launch_speed) s.launch_speeds.push(pf(r.launch_speed));
      if (r.estimated_woba_using_speedangle) s.xwobas.push(pf(r.estimated_woba_using_speedangle));
    }
    if (r.events) s.events.push(r.events);
  });
  return map;
}

/* ==================== SORTED PITCHES ==================== */
function sortedPitches(pitchMap) {
  return Object.entries(pitchMap).sort((a,b) => b[1].count - a[1].count);
}

/* ==================== MODE TOGGLE ==================== */
function toggleMode() {
  currentMode = currentMode === 'single' ? 'multi' : 'single';
  const isSingle = currentMode === 'single';
  document.getElementById('upload-single').style.display = isSingle ? '' : 'none';
  document.getElementById('upload-multi').style.display  = isSingle ? 'none' : '';
  document.getElementById('report-single').style.display = 'none';
  document.getElementById('report-multi').style.display  = 'none';
  document.getElementById('mode-badge').textContent = isSingle ? 'SINGLE START' : 'MULTI-START';
  document.getElementById('toggle-mode-btn').textContent = isSingle ? 'Switch to Multi-Start' : 'Switch to Single';
}

/* ==================== SINGLE FILE HANDLING ==================== */
const dropSingle = document.getElementById('drop-single');
const fileSingle = document.getElementById('file-single');

dropSingle.addEventListener('dragover', e => { e.preventDefault(); dropSingle.classList.add('dragging'); });
dropSingle.addEventListener('dragleave', () => dropSingle.classList.remove('dragging'));
dropSingle.addEventListener('drop', e => {
  e.preventDefault(); dropSingle.classList.remove('dragging');
  if (e.dataTransfer.files[0]) processFileSingle(e.dataTransfer.files[0]);
});
dropSingle.addEventListener('click', e => { if (!e.target.classList.contains('btn-primary')) fileSingle.click(); });
fileSingle.addEventListener('change', e => { if (e.target.files[0]) processFileSingle(e.target.files[0]); });

function processFileSingle(file) {
  Papa.parse(file, {
    header: true, skipEmptyLines: true,
    complete: r => { buildSingleReport(r.data); },
    error: err => alert('Could not parse CSV: ' + err.message)
  });
}

function resetSingle() {
  Object.keys(charts).forEach(destroyChart);
  document.getElementById('report-single').style.display = 'none';
  document.getElementById('upload-single').style.display = '';
  fileSingle.value = '';
  singleData = null;
}

/* ==================== MULTI FILE HANDLING ==================== */
['1','2'].forEach(slot => {
  const fileEl = document.getElementById(`file-start${slot}`);
  const dropEl = document.getElementById(`drop-start${slot}`);
  dropEl.addEventListener('dragover', e => { e.preventDefault(); dropEl.classList.add('dragging'); });
  dropEl.addEventListener('dragleave', () => dropEl.classList.remove('dragging'));
  dropEl.addEventListener('drop', e => {
    e.preventDefault(); dropEl.classList.remove('dragging');
    if (e.dataTransfer.files[0]) processFileMulti(e.dataTransfer.files[0], slot);
  });
  dropEl.addEventListener('click', e => { if (!e.target.classList.contains('btn-primary')) fileEl.click(); });
  fileEl.addEventListener('change', e => { if (e.target.files[0]) processFileMulti(e.target.files[0], slot); });
});

function processFileMulti(file, slot) {
  Papa.parse(file, {
    header: true, skipEmptyLines: true,
    complete: r => {
      const rows = parseRows(r.data);
      multiData[`s${slot}`] = { rows, file: file.name };
      document.getElementById(`status-${slot}`).textContent = `✓ ${file.name}`;
      document.getElementById(`drop-start${slot}`).style.borderColor = 'var(--cyan)';
      const btn = document.getElementById('btn-compare');
      if (multiData.s1 && multiData.s2) { btn.disabled = false; btn.style.opacity = '1'; }
    }
  });
}

function resetMulti() {
  document.getElementById('report-multi').style.display = 'none';
  document.getElementById('upload-multi').style.display = '';
  multiData = { s1: null, s2: null };
  ['1','2'].forEach(s => {
    document.getElementById(`status-${s}`).textContent = 'No file loaded';
    document.getElementById(`drop-start${s}`).style.borderColor = '';
    document.getElementById(`file-start${s}`).value = '';
  });
  const btn = document.getElementById('btn-compare');
  btn.disabled = true; btn.style.opacity = '.4';
}

/* ==================== TAB SWITCHING ==================== */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    document.querySelectorAll('#main-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
  });
});

/* ==================== BUILD SINGLE REPORT ==================== */
function buildSingleReport(rawRows) {
  const rows = parseRows(rawRows);
  if (!rows.length) return;

  const pitchMap = buildPitchMap(rows);
  const total = rows.length;
  const pitcherName = rows[0].player_name || 'Unknown Pitcher';
  const gameDate = rows[0].game_date || '';
  const hand = rows[0].p_throws || 'R';
  const homeTeam = rows[0].home_team || '';
  const awayTeam = rows[0].away_team || '';
  const opp = homeTeam && awayTeam ? `${awayTeam} @ ${homeTeam}` : (homeTeam || awayTeam);

  const rhhRows = rows.filter(r => r.stand === 'R');
  const lhhRows = rows.filter(r => r.stand === 'L');
  const rhhMap = buildPitchMap(rhhRows);
  const lhhMap = buildPitchMap(lhhRows);

  const countMap = {};
  COUNT_ORDER.forEach(c => countMap[c] = {});
  rows.forEach(r => {
    const cnt = `${r.balls}-${r.strikes}`;
    if (!countMap[cnt]) countMap[cnt] = {};
    countMap[cnt][r._pt] = (countMap[cnt][r._pt]||0) + 1;
  });

  const hardContact = rows.filter(r => {
    const ev = pf(r.launch_speed);
    return (ev >= 90 && r.events) || ['triple','double','home_run'].includes(r.events);
  }).sort((a,b) => pf(b.launch_speed) - pf(a.launch_speed));

  const totalWhiffs = Object.values(pitchMap).reduce((a,s)=>a+s.whiffs, 0);
  const totalCS = Object.values(pitchMap).reduce((a,s)=>a+s.cstrikes, 0);
  const walks = rows.filter(r => r.events === 'walk').length;
  const ks = rows.filter(r => r.events === 'strikeout').length;
  const ffMap = pitchMap['FF'] || pitchMap['FA'];
  const avgVelo = ffMap && ffMap.velos.length ? avg(ffMap.velos).toFixed(1) : '—';
  const peakVelo = ffMap && ffMap.velos.length ? Math.max(...ffMap.velos).toFixed(1) : '—';

  singleData = { rows, pitchMap, rhhMap, lhhMap, countMap, hardContact, total, pitcherName, gameDate, hand, opp, avgVelo, peakVelo, totalWhiffs, totalCS, walks, ks };

  renderPlayerHeader();
  renderArsenal();
  renderSplits();
  renderCounts();
  renderMovement();
  renderHardContact();
  renderInsights();

  document.getElementById('upload-single').style.display = 'none';
  document.getElementById('report-single').style.display = '';

  // Reset to first tab
  document.querySelectorAll('#main-tabs .tab').forEach((t,i) => t.classList.toggle('active', i===0));
  document.querySelectorAll('.tab-panel').forEach((p,i) => p.classList.toggle('active', i===0));
}

/* ---- Player Header ---- */
function renderPlayerHeader() {
  const { pitcherName, gameDate, hand, opp, total, avgVelo, peakVelo, totalWhiffs, totalCS, walks, ks } = singleData;
  document.getElementById('ph-name').textContent = pitcherName;
  document.getElementById('ph-meta').innerHTML =
    `<span class="player-meta-item">${gameDate}</span>
     <span class="player-meta-item">vs. ${opp}</span>
     <span class="player-meta-item">${hand}HP</span>`;
  const whiffRate = total ? (totalWhiffs/total*100).toFixed(1) : '—';
  const cswRate   = total ? ((totalWhiffs+totalCS)/total*100).toFixed(1) : '—';
  document.getElementById('ph-kpis').innerHTML = [
    { v: total,          l: 'Pitches' },
    { v: avgVelo+' mph', l: '4S avg velo' },
    { v: peakVelo+' mph',l: 'Peak velo' },
    { v: whiffRate+'%',  l: 'Whiff%' },
    { v: cswRate+'%',    l: 'CSW%' },
    { v: ks,             l: 'K' },
    { v: walks,          l: 'BB' },
  ].map(k => `<div class="kpi"><div class="kpi-val mono">${k.v}</div><div class="kpi-lbl">${k.l}</div></div>`).join('');
}

/* ---- Arsenal ---- */
function renderArsenal() {
  const { pitchMap, total } = singleData;
  const sorted = sortedPitches(pitchMap);
  const hasBaselines = Object.keys(MLB_BASELINES).length > 0;

  // Update table headers to include MLB avg columns if baselines loaded
  document.querySelector('#arsenal-table thead tr').innerHTML = hasBaselines
    ? `<th>Pitch</th><th>N</th><th>Usage</th><th>Avg velo</th>
       <th>Whiff%</th><th>MLB avg</th><th>CSW%</th><th>MLB avg</th>
       <th>xwOBA</th><th>MLB avg</th><th>Avg EV</th>`
    : `<th>Pitch</th><th>N</th><th>Usage</th><th>Avg velo</th>
       <th>Whiff%</th><th>CSW%</th><th>Ball%</th><th>HIP</th><th>Avg EV</th><th>xwOBA</th>`;

  document.getElementById('arsenal-tbody').innerHTML = sorted.map(([pt, s]) => {
    const usagePct = (s.count/total*100).toFixed(1);
    const avgV  = s.velos.length ? avg(s.velos).toFixed(1) : '—';
    const whiff = s.count ? (s.whiffs/s.count*100).toFixed(1) : 0;
    const csw   = s.count ? ((s.whiffs+s.cstrikes)/s.count*100).toFixed(1) : 0;
    const ball  = s.count ? (s.balls/s.count*100).toFixed(0) : 0;
    const avgEV = s.launch_speeds.length ? avg(s.launch_speeds).toFixed(1) : '—';
    const xwoba = s.xwobas.length ? avg(s.xwobas).toFixed(3) : '—';
    const wC  = whiff >= 30 ? 'v-good' : whiff >= 15 ? 'v-warn' : 'v-bad';
    const cC  = csw >= 30 ? 'v-good' : csw >= 20 ? 'v-warn' : 'v-bad';
    const xwC = xwoba !== '—' ? (parseFloat(xwoba) <= .250 ? 'v-good' : parseFloat(xwoba) <= .350 ? 'v-warn' : 'v-bad') : 'v-num';

    const mlbWhiff   = getBaseline(pt, 'whiff_pct');
    const mlbCsw     = getBaseline(pt, 'csw_pct');
    const mlbXwoba   = getBaseline(pt, 'avg_xwoba');
    const mlbVelo    = getBaseline(pt, 'avg_velo');

    if (hasBaselines) {
      return `<tr>
        <td><span class="pitch-chip"><span class="pitch-dot" style="background:${pc(pt)}"></span>${pn(pt)}</span></td>
        <td class="v-num">${s.count}</td>
        <td><div class="usage-bar-wrap">
          <div class="usage-bar-bg"><div class="usage-bar-fill" style="width:${usagePct}%;background:${pc(pt)}"></div></div>
          <span class="v-num" style="font-size:11px">${usagePct}%</span>
        </div></td>
        <td class="v-num">${avgV} ${veloDelta(avgV, mlbVelo)}</td>
        <td class="${wC}">${whiff}%</td>
        <td class="mlb-avg">${mlbWhiff !== null ? mlbWhiff+'%' : '—'} ${deltaTag(parseFloat(whiff), mlbWhiff, true)}</td>
        <td class="${cC}">${csw}%</td>
        <td class="mlb-avg">${mlbCsw !== null ? mlbCsw+'%' : '—'} ${deltaTag(parseFloat(csw), mlbCsw, true)}</td>
        <td class="${xwC}">${xwoba}</td>
        <td class="mlb-avg">${mlbXwoba !== null ? mlbXwoba : '—'} ${deltaTag(parseFloat(xwoba), mlbXwoba, false)}</td>
        <td class="v-num">${avgEV}</td>
      </tr>`;
    } else {
      return `<tr>
        <td><span class="pitch-chip"><span class="pitch-dot" style="background:${pc(pt)}"></span>${pn(pt)}</span></td>
        <td class="v-num">${s.count}</td>
        <td><div class="usage-bar-wrap">
          <div class="usage-bar-bg"><div class="usage-bar-fill" style="width:${usagePct}%;background:${pc(pt)}"></div></div>
          <span class="v-num" style="font-size:11px">${usagePct}%</span>
        </div></td>
        <td class="v-num">${avgV}</td>
        <td class="${wC}">${whiff}%</td>
        <td class="${cC}">${csw}%</td>
        <td class="v-num">${ball}%</td>
        <td class="v-num">${s.hip}</td>
        <td class="v-num">${avgEV}</td>
        <td class="${xwC}">${xwoba}</td>
      </tr>`;
    }
  }).join('');

  // Donut
  destroyChart('mix-chart');
  charts['mix-chart'] = new Chart(document.getElementById('mix-chart'), {
    type: 'doughnut',
    data: { labels: sorted.map(([pt])=>pn(pt)), datasets: [{ data: sorted.map(([,s])=>s.count), backgroundColor: sorted.map(([pt])=>pc(pt)), borderWidth: 2, borderColor: '#111316' }] },
    options: { responsive:true, maintainAspectRatio:false, cutout:'58%', plugins:{ legend:{ display:true, position:'right', labels:{ color:'#72747c', font:{size:11,family:'DM Mono'}, padding:10 } } } }
  });

  // CSW bar
  destroyChart('csw-chart');
  const cswVals = sorted.map(([,s]) => s.count ? Math.round((s.whiffs+s.cstrikes)/s.count*100) : 0);
  charts['csw-chart'] = new Chart(document.getElementById('csw-chart'), {
    type: 'bar',
    data: { labels: sorted.map(([pt])=>pn(pt)), datasets: [{ data:cswVals, backgroundColor:sorted.map(([pt])=>pc(pt)), borderRadius:3, borderSkipped:false }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ y:{ beginAtZero:true, max:65, ticks:{callback:v=>v+'%',color:'#72747c',font:{size:10}}, grid:{color:'rgba(255,255,255,0.04)'} }, x:{ticks:{color:'#72747c',font:{size:10}},grid:{display:false}} } }
  });
}

/* ---- Splits ---- */
function renderSplitsTable(map, total, bodyId) {
  const sorted = sortedPitches(map);
  document.getElementById(bodyId).innerHTML = sorted.map(([pt, s]) => {
    const usagePct = total ? (s.count/total*100).toFixed(1) : '—';
    const whiff = s.count ? (s.whiffs/s.count*100).toFixed(0) : 0;
    const csw   = s.count ? ((s.whiffs+s.cstrikes)/s.count*100).toFixed(0) : 0;
    const xwoba = s.xwobas.length ? avg(s.xwobas).toFixed(3) : '—';
    const wC = whiff >= 30 ? 'v-good' : whiff >= 15 ? 'v-warn' : 'v-bad';
    const xC = xwoba !== '—' ? (xwoba <= .250 ? 'v-good' : xwoba <= .350 ? 'v-warn' : 'v-bad') : 'v-num';
    return `<tr>
      <td><span class="pitch-chip"><span class="pitch-dot" style="background:${pc(pt)}"></span>${pn(pt)}</span></td>
      <td class="v-num">${s.count}</td>
      <td class="v-num">${usagePct}%</td>
      <td class="${wC}">${whiff}%</td>
      <td class="${wC}">${csw}%</td>
      <td class="${xC}">${xwoba}</td>
    </tr>`;
  }).join('');
}

function renderSplitDonut(map, canvasId) {
  destroyChart(canvasId);
  const sorted = sortedPitches(map);
  charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'doughnut',
    data: { labels: sorted.map(([pt])=>pn(pt)), datasets:[{ data:sorted.map(([,s])=>s.count), backgroundColor:sorted.map(([pt])=>pc(pt)), borderWidth:2, borderColor:'#111316' }] },
    options: { responsive:true, maintainAspectRatio:false, cutout:'55%', plugins:{ legend:{ display:true, position:'right', labels:{ color:'#72747c', font:{size:10,family:'DM Mono'}, padding:8 } } } }
  });
}

function renderSplits() {
  const { rhhMap, lhhMap, rhhRows, lhhRows } = singleData;
  const rhhTotal = Object.values(rhhMap).reduce((a,s)=>a+s.count,0);
  const lhhTotal = Object.values(lhhMap).reduce((a,s)=>a+s.count,0);
  renderSplitsTable(rhhMap, rhhTotal, 'splits-rhh');
  renderSplitsTable(lhhMap, lhhTotal, 'splits-lhh');
  renderSplitDonut(rhhMap, 'split-rhh-chart');
  renderSplitDonut(lhhMap, 'split-lhh-chart');
}

/* ---- Counts ---- */
function renderCounts() {
  const { countMap, pitchMap } = singleData;
  const allTypes = sortedPitches(pitchMap).map(([pt])=>pt).slice(0,6);
  const validCounts = COUNT_ORDER.filter(c => countMap[c] && Object.keys(countMap[c]).length);

  document.getElementById('count-grid').innerHTML = validCounts.map(cnt => {
    const cm = countMap[cnt];
    const ctotal = Object.values(cm).reduce((a,b)=>a+b,0);
    const sorted = Object.entries(cm).sort((a,b)=>b[1]-a[1]);
    return `<div class="count-cell">
      <div class="count-lbl">${cnt}</div>
      ${sorted.slice(0,4).map(([pt,n]) => {
        const pct = Math.round(n/ctotal*100);
        return `<div class="count-row">
          <span style="width:22px;font-size:10px;color:var(--muted);font-family:'DM Mono',monospace">${pt}</span>
          <div class="count-bar-bg"><div class="count-bar-fill" style="width:${pct}%;background:${pc(pt)}"></div></div>
          <span style="font-size:10px;font-family:'DM Mono',monospace;color:var(--muted);width:28px;text-align:right">${pct}%</span>
        </div>`;
      }).join('')}
      <div class="count-total">${ctotal} pitches</div>
    </div>`;
  }).join('');

  destroyChart('count-stack-chart');
  const datasets = allTypes.map(pt => ({
    label: pn(pt),
    data: validCounts.map(cnt => {
      const cm = countMap[cnt]||{};
      const ct = Object.values(cm).reduce((a,b)=>a+b,0);
      return ct ? Math.round((cm[pt]||0)/ct*100) : 0;
    }),
    backgroundColor: pc(pt), borderWidth: 0,
  }));
  charts['count-stack-chart'] = new Chart(document.getElementById('count-stack-chart'), {
    type: 'bar',
    data: { labels: validCounts, datasets },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'bottom', labels:{ color:'#72747c', font:{size:10,family:'DM Mono'}, padding:12, boxWidth:10 } } },
      scales:{
        x:{ stacked:true, ticks:{color:'#72747c',font:{size:10,family:'DM Mono'}}, grid:{display:false} },
        y:{ stacked:true, max:100, ticks:{callback:v=>v+'%',color:'#72747c',font:{size:10}}, grid:{color:'rgba(255,255,255,0.04)'} }
      }
    }
  });
}

/* ---- Movement ---- */
/* VAA / HAA computed at plate using kinematic equations
   vx_f = vx0 + ax*t,  vy_f = vy0 + ay*t,  vz_f = vz0 + az*t
   t ≈ distance_to_plate / |vy0|  (60.5ft - extension) */
function computeApproachAngles(r) {
  const vx0 = pf(r.vx0), vy0 = pf(r.vy0), vz0 = pf(r.vz0);
  const ax  = pf(r.ax),  ay  = pf(r.ay),  az  = pf(r.az);
  const ext = pf(r.release_extension) || 6.0;
  if (!vy0) return { vaa: null, haa: null };
  const dist = 60.5 - ext;           // ft from release to plate
  const t    = dist / Math.abs(vy0); // time in seconds
  const vxf  = vx0 + ax * t;
  const vyf  = vy0 + ay * t;
  const vzf  = vz0 + az * t;
  const vaa  = Math.atan(vzf / Math.abs(vyf)) * (180 / Math.PI);
  const haa  = Math.atan(vxf / Math.abs(vyf)) * (180 / Math.PI);
  return { vaa: +vaa.toFixed(1), haa: +haa.toFixed(1) };
}

function renderMovement() {
  const { rows, pitchMap } = singleData;
  const sorted = sortedPitches(pitchMap);

  // Scatter plot — clean, centered axes
  destroyChart('movement-chart');
  charts['movement-chart'] = new Chart(document.getElementById('movement-chart'), {
    type: 'scatter',
    data: { datasets: sorted.map(([pt]) => ({
      label: pn(pt),
      data: rows.filter(r => r._pt===pt && r.pfx_x && r.pfx_z)
                .map(r => ({ x: -pf(r.pfx_x)*12, y: pf(r.pfx_z)*12 })),
      backgroundColor: pc(pt) + 'bb',
      pointRadius: 5, pointHoverRadius: 8,
    }))},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { color:'#72747c', font:{ size:11, family:'DM Mono' }, padding:12, boxWidth:10 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: HB ${ctx.parsed.x.toFixed(2)}, IVB ${ctx.parsed.y.toFixed(2)}` } }
      },
      scales: {
        x: { title:{ display:true, text:'Horizontal break (in)', color:'#72747c', font:{size:11} }, ticks:{ color:'#72747c', font:{size:10} }, grid:{ color:'rgba(255,255,255,0.05)' }, position:'center' },
        y: { title:{ display:true, text:'Induced vertical break (in)', color:'#72747c', font:{size:11} }, ticks:{ color:'#72747c', font:{size:10} }, grid:{ color:'rgba(255,255,255,0.05)' }, position:'center' }
      }
    }
  });

  // Build per-pitch stat objects with VAA/HAA
  const pitchStats = sorted.map(([pt, s]) => {
    const pitchRows = rows.filter(r => r._pt === pt);
    const angles = pitchRows.map(computeApproachAngles).filter(a => a.vaa !== null);
    const avgVAA = angles.length ? avg(angles.map(a => a.vaa)) : null;
    const avgHAA = angles.length ? avg(angles.map(a => a.haa)) : null;
    const peakVelo = s.velos.length ? Math.max(...s.velos) : null;
    return {
      pt,
      avgVelo:  s.velos.length    ? avg(s.velos).toFixed(1)   : '—',
      peakVelo: peakVelo           ? peakVelo.toFixed(1)        : '—',
      ivb:      s.pfx_zs.length   ? (avg(s.pfx_zs) * 12).toFixed(1)  : '—',
      hb:       s.pfx_xs.length   ? (-avg(s.pfx_xs) * 12).toFixed(1) : '—',
      vaa:      avgVAA !== null    ? avgVAA.toFixed(1)          : '—',
      haa:      avgHAA !== null    ? avgHAA.toFixed(1)          : '—',
    };
  });

  // Stat cards grid — header + one row per pitch
  const header = `<div class="mov-header-row">
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

  const statRows = pitchStats.map(p => `
    <div class="mov-pitch-row">
      <div class="mov-pitch-label">
        <span class="pitch-dot" style="background:${pc(p.pt)};width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:8px;flex-shrink:0"></span>
        <span class="mov-pitch-name">${pn(p.pt)}</span>
      </div>
      <div class="mov-stat-group">
        <div class="mov-stat"><div class="mov-stat-val">${p.avgVelo}</div></div>
        <div class="mov-stat"><div class="mov-stat-val">${p.peakVelo}</div></div>
        <div class="mov-stat"><div class="mov-stat-val">${p.ivb}"</div></div>
        <div class="mov-stat"><div class="mov-stat-val">${p.hb}"</div></div>
        <div class="mov-stat"><div class="mov-stat-val">${p.vaa}°</div></div>
        <div class="mov-stat"><div class="mov-stat-val">${p.haa}°</div></div>
      </div>
    </div>
  `).join('');

  document.getElementById('movement-stat-cards').innerHTML = header + statRows;
}

/* ---- Hard Contact ---- */
function renderHardContact() {
  const { hardContact, pitchMap, rows } = singleData;
  const wrap = document.getElementById('hc-table-wrap');
  if (!hardContact.length) {
    wrap.innerHTML = '<div class="empty-state">No hard contact events (EV ≥ 90 or XBH) in this dataset.</div>';
  } else {
    wrap.innerHTML = `<table class="data-table">
      <thead><tr><th>Pitch</th><th>EV (mph)</th><th>LA</th><th>Event</th><th>xwOBA</th><th>Count</th><th>Description</th></tr></thead>
      <tbody>${hardContact.slice(0,20).map(r => {
        const ev = pf(r.launch_speed);
        const evC = ev >= 105 ? 'ev-elite' : ev >= 95 ? 'ev-hard' : 'ev-ok';
        const xw = r.estimated_woba_using_speedangle ? pf(r.estimated_woba_using_speedangle).toFixed(3) : '—';
        return `<tr>
          <td><span class="pitch-chip"><span class="pitch-dot" style="background:${pc(r._pt)}"></span>${pn(r._pt)}</span></td>
          <td><span class="ev-pill ${evC}">${ev.toFixed(1)}</span></td>
          <td class="v-num">${r.launch_angle||'—'}°</td>
          <td style="font-size:12px">${(r.events||'in play').replace(/_/g,' ')}</td>
          <td class="v-num">${xw}</td>
          <td class="mono" style="font-size:11px">${r.balls}-${r.strikes}</td>
          <td style="font-size:11px;color:var(--muted)">${(r.des||'').substring(0,60)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  // Avg EV chart
  const sorted = sortedPitches(pitchMap);
  const evByPitch = sorted.map(([pt,s]) => ({ pt, avgEV: s.launch_speeds.length ? avg(s.launch_speeds) : 0, n: s.launch_speeds.length })).filter(d=>d.n>0);

  destroyChart('ev-chart');
  charts['ev-chart'] = new Chart(document.getElementById('ev-chart'), {
    type: 'bar', indexAxis: 'y',
    data: { labels:evByPitch.map(d=>pn(d.pt)), datasets:[{ data:evByPitch.map(d=>+d.avgEV.toFixed(1)), backgroundColor:evByPitch.map(d=>pc(d.pt)), borderRadius:3, borderSkipped:false }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{ min:60, ticks:{callback:v=>v+' mph',color:'#72747c',font:{size:10}}, grid:{color:'rgba(255,255,255,0.04)'}}, y:{ticks:{color:'#72747c',font:{size:11}},grid:{display:false}} } }
  });

  // Hard hit %
  const hhByPitch = sorted.map(([pt,s]) => {
    const hh = s.launch_speeds.filter(ev=>ev>=95).length;
    return { pt, pct: s.launch_speeds.length ? Math.round(hh/s.launch_speeds.length*100) : 0, n: s.launch_speeds.length };
  }).filter(d=>d.n>0);

  destroyChart('hh-chart');
  charts['hh-chart'] = new Chart(document.getElementById('hh-chart'), {
    type: 'bar', indexAxis: 'y',
    data: { labels:hhByPitch.map(d=>pn(d.pt)), datasets:[{ data:hhByPitch.map(d=>d.pct), backgroundColor:hhByPitch.map(d=>pc(d.pt)), borderRadius:3, borderSkipped:false }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{ beginAtZero:true, max:100, ticks:{callback:v=>v+'%',color:'#72747c',font:{size:10}}, grid:{color:'rgba(255,255,255,0.04)'}}, y:{ticks:{color:'#72747c',font:{size:11}},grid:{display:false}} } }
  });
}

/* ---- Insights ---- */
function renderInsights() {
  const { pitchMap, total, countMap, hardContact, walks } = singleData;
  const sorted = sortedPitches(pitchMap);
  const insights = [];

  sorted.forEach(([pt, s]) => {
    const usage   = s.count/total*100;
    const whiff   = s.count ? s.whiffs/s.count*100 : 0;
    const csw     = s.count ? (s.whiffs+s.cstrikes)/s.count*100 : 0;
    const avgXw   = s.xwobas.length ? avg(s.xwobas) : null;

    // Pull MLB baselines for this pitch type
    const mlbWhiff  = getBaseline(pt, 'whiff_pct');
    const mlbCsw    = getBaseline(pt, 'csw_pct');
    const mlbXwoba  = getBaseline(pt, 'avg_xwoba');
    const mlbVelo   = getBaseline(pt, 'avg_velo');
    const avgV      = s.velos.length ? avg(s.velos) : null;

    // Whiff vs MLB average
    if (mlbWhiff && s.count >= 5) {
      const diff = whiff - mlbWhiff;
      if (diff >= 8)
        insights.push({ type:'good', title:`${pn(pt)} — elite whiff rate`, body:`${whiff.toFixed(1)}% whiff vs. MLB avg ${mlbWhiff}% — ${diff.toFixed(1)}pp above average. This pitch is swing-and-miss at an elite level.` });
      else if (diff <= -6 && (pt==='FF'||pt==='FA'||pt==='SI'))
        insights.push({ type:'warn', title:`${pn(pt)} — below-avg whiff rate`, body:`${whiff.toFixed(1)}% vs. MLB avg ${mlbWhiff}%. Hitters are making contact on this pitch — use it as a tunnel/setup pitch rather than a finish pitch.` });
      else if (diff <= -8)
        insights.push({ type:'danger', title:`${pn(pt)} — low whiff rate`, body:`${whiff.toFixed(1)}% vs. MLB avg ${mlbWhiff}% (${Math.abs(diff).toFixed(1)}pp below). Evaluate whether this pitch belongs in the arsenal in two-strike counts.` });
    }

    // Velocity vs MLB average
    if (mlbVelo && avgV && (pt==='FF'||pt==='FA'||pt==='SI')) {
      const veloDiff = avgV - mlbVelo;
      if (veloDiff <= -2)
        insights.push({ type:'warn', title:`Below-avg ${pn(pt)} velocity`, body:`${avgV.toFixed(1)} mph vs. MLB avg ${mlbVelo} mph (${Math.abs(veloDiff).toFixed(1)} mph deficit). Must compensate with sequencing, tunneling, and secondary pitch quality.` });
      else if (veloDiff >= 2)
        insights.push({ type:'good', title:`Above-avg ${pn(pt)} velocity`, body:`${avgV.toFixed(1)} mph vs. MLB avg ${mlbVelo} mph (+${veloDiff.toFixed(1)} mph). Velocity is a weapon — use it to set up secondaries.` });
    }

    // xwOBA vs MLB average
    if (mlbXwoba && avgXw && s.hip >= 3) {
      const xwDiff = avgXw - mlbXwoba;
      if (xwDiff <= -0.05)
        insights.push({ type:'good', title:`${pn(pt)} — elite contact suppression`, body:`${avgXw.toFixed(3)} xwOBA vs. MLB avg ${mlbXwoba} — generating significantly weaker contact than league average.` });
      else if (xwDiff >= 0.07)
        insights.push({ type:'danger', title:`${pn(pt)} — contact quality concern`, body:`${avgXw.toFixed(3)} xwOBA vs. MLB avg ${mlbXwoba} (${xwDiff.toFixed(3)} above average). Hitters doing real damage — evaluate location and sequencing.` });
    }

    if ((pt==='FF'||pt==='FA') && usage > 40)
      insights.push({ type:'warn', title:'4-seam overuse', body:`${usage.toFixed(0)}% usage on 4-seam is above optimal for a sequencing-based profile. Consider redistributing 10–15pp toward your best secondary offering to reduce predictability.` });

    if (whiff >= 30 && usage < 20 && s.count >= 5)
      insights.push({ type:'good', title:`${pn(pt)} is underused`, body:`${whiff.toFixed(1)}% whiff rate on just ${usage.toFixed(0)}% usage. This is your best swing-and-miss pitch — increase deployment across more counts, including 0-0 and 2-0.` });
  });

  const fp = countMap['0-0']||{};
  const fpTotal = Object.values(fp).reduce((a,b)=>a+b,0);
  const fpFF = (fp['FF']||0)+(fp['FA']||0);
  if (fpTotal > 3 && fpFF/fpTotal > 0.4)
    insights.push({ type:'warn', title:'Heavy first-pitch fastball', body:`${Math.round(fpFF/fpTotal*100)}% first-pitch 4-seams. Hitters can sit fastball with no count pressure — sweeper or splitter as primary first-pitch offering creates immediate deficit.` });

  const o2 = countMap['0-2']||{};
  const o2total = Object.values(o2).reduce((a,b)=>a+b,0);
  if (o2total > 0 && ((o2['FF']||0)+(o2['FA']||0))/o2total > 0.2)
    insights.push({ type:'warn', title:'Fastball in 0-2 count', body:`${Math.round(((o2['FF']||0)+(o2['FA']||0))/o2total*100)}% 4-seam in 0-2. This is a chase count — breaking balls out of the zone are the correct offering here.` });

  if (walks > 1)
    insights.push({ type:'warn', title:`${walks} walks — command concern`, body:`Walk sequences commonly come from fastball command breakdown in hitter counts. Review 3-1 and 3-2 sequences — trust secondaries in full counts.` });

  const hcFF = hardContact.filter(r=>r._pt==='FF'||r._pt==='FA').length;
  if (hcFF >= 2)
    insights.push({ type:'danger', title:'4-seam hard contact pattern', body:`${hcFF} hard contact events (EV ≥ 90) on the 4-seam. Elevate it to the letters when throwing it, or use it purely as a tunnel pitch.` });

  document.getElementById('insight-grid').innerHTML = insights.slice(0,8).map(i =>
    `<div class="insight-card ${i.type}">
      <div class="insight-title">${i.title}</div>
      <div class="insight-body">${i.body}</div>
    </div>`).join('') || '<div class="empty-state">Upload a larger dataset for automated insights.</div>';

  // Sequencing recs
  const bestPitch = sorted.find(([pt,s]) => s.count >= 5 && s.whiffs/s.count > 0.25);
  const recs = [
    { cnt:'0-0 (first pitch)', rec: bestPitch ? `Lead with ${pn(bestPitch[0])} (${(bestPitch[1].whiffs/bestPitch[1].count*100).toFixed(0)}% whiff) — creates immediate count pressure. Reserve 4-seam as a surprise first-pitch offering.` : 'Mix primary secondaries on first pitch — avoid defaulting to the 4-seam.' },
    { cnt:'0-2 / 1-2',        rec: 'Chase pitch: sweeper or curveball expanded out of the zone. No fastball in two-strike counts. Expand down-and-away from RHH, back foot to LHH.' },
    { cnt:'3-2 (full count)',  rec: bestPitch ? `Trust ${pn(bestPitch[0])} — highest CSW pitch. Throwing 4-seam in 3-2 when command is marginal leads directly to walks.` : 'Trust your best secondary — avoid defaulting to 4-seam in full counts.' },
    { cnt:'2-0 / 3-0',        rec: 'Sweeper or splitter in 2-0 is unexpected and prevents hitters from sitting fastball. 4-seam only if command is locked in and location is elevated.' },
    { cnt:'1-0 / 1-1',        rec: 'Even counts are where the at-bat is decided. Mixing secondaries here prevents hitters from timing the fastball across the at-bat.' },
  ];
  document.getElementById('seq-recs').innerHTML = recs.map(r =>
    `<div class="seq-row"><div class="seq-count">${r.cnt}</div><div class="seq-text">${r.rec}</div></div>`).join('');

  document.getElementById('hand-recs').innerHTML = [
    { cnt:'vs. RHH', rec:'Sweeper shapes away from RHH into the back foot — primary weapon. 4-seam up-and-in (letters) to set up sweeper down-and-away. Curveball back foot in two-strike counts. Cutter jam pitch or backdoor strike.' },
    { cnt:'vs. LHH', rec:'Backdoor curveball at the knees is the best weapon vs. LHH. Cutter cuts back toward the plate for called strikes away. Sweeper moves into the LHH bat path — use carefully. 4-seam can work arm-side elevated.' },
  ].map(r => `<div class="seq-row"><div class="seq-count">${r.cnt}</div><div class="seq-text">${r.rec}</div></div>`).join('');
}

/* ==================== MULTI-START COMPARISON ==================== */
function runComparison() {
  const s1 = multiData.s1, s2 = multiData.s2;
  if (!s1||!s2) return;

  const pm1 = buildPitchMap(s1.rows), pm2 = buildPitchMap(s2.rows);
  const t1 = s1.rows.length, t2 = s2.rows.length;
  const name = s1.rows[0].player_name || 'Pitcher';
  const d1 = s1.rows[0].game_date||'Start 1', d2 = s2.rows[0].game_date||'Start 2';

  document.getElementById('multi-name').textContent = name;
  document.getElementById('multi-meta').innerHTML = `<span class="player-meta-item">${d1}</span> <span class="player-meta-item">vs.</span> <span class="player-meta-item">${d2}</span>`;

  // All pitch types across both
  const allPT = [...new Set([...Object.keys(pm1),...Object.keys(pm2)])].sort((a,b)=>(pm1[b]?.count||0)+(pm2[b]?.count||0)-(pm1[a]?.count||0)-(pm2[a]?.count||0));

  // Grouped bar — pitch mix
  destroyChart('multi-mix-chart');
  charts['multi-mix-chart'] = new Chart(document.getElementById('multi-mix-chart'), {
    type: 'bar',
    data: {
      labels: allPT.map(pn),
      datasets: [
        { label: d1, data: allPT.map(pt => t1?+((pm1[pt]?.count||0)/t1*100).toFixed(1):0), backgroundColor: allPT.map(pt=>pc(pt)+'bb'), borderSkipped:false, borderRadius:3 },
        { label: d2, data: allPT.map(pt => t2?+((pm2[pt]?.count||0)/t2*100).toFixed(1):0), backgroundColor: allPT.map(pt=>pc(pt)), borderSkipped:false, borderRadius:3 },
      ]
    },
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'top', labels:{ color:'#72747c', font:{size:11,family:'DM Mono'}, padding:16 } } },
      scales:{
        y:{ beginAtZero:true, ticks:{callback:v=>v+'%',color:'#72747c',font:{size:10}}, grid:{color:'rgba(255,255,255,0.04)'}},
        x:{ticks:{color:'#72747c',font:{size:11}},grid:{display:false}}
      }
    }
  });

  // Metrics grid
  const w1 = s1.rows.filter(r=>r.description?.includes('swinging_strike')).length;
  const w2 = s2.rows.filter(r=>r.description?.includes('swinging_strike')).length;
  const bb1 = s1.rows.filter(r=>r.events==='walk').length;
  const bb2 = s2.rows.filter(r=>r.events==='walk').length;
  const k1  = s1.rows.filter(r=>r.events==='strikeout').length;
  const k2  = s2.rows.filter(r=>r.events==='strikeout').length;
  const ff1 = pm1['FF']||pm1['FA']; const ff2 = pm2['FF']||pm2['FA'];
  const av1 = ff1?.velos.length ? avg(ff1.velos).toFixed(1) : '—';
  const av2 = ff2?.velos.length ? avg(ff2.velos).toFixed(1) : '—';

  document.getElementById('multi-metrics-grid').innerHTML = [
    { lbl:'Pitches',       v1:t1,                     v2:t2 },
    { lbl:'4S avg velo',   v1:av1+' mph',             v2:av2+' mph' },
    { lbl:'Whiff rate',    v1:(w1/t1*100).toFixed(1)+'%', v2:(w2/t2*100).toFixed(1)+'%' },
    { lbl:'Walks',         v1:bb1,                    v2:bb2 },
    { lbl:'Strikeouts',    v1:k1,                     v2:k2 },
  ].map(m => `<div class="chart-card" style="display:flex;align-items:center;justify-content:space-between;padding:1rem 1.5rem">
    <div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:6px;font-family:'Barlow Condensed',sans-serif">${m.lbl}</div>
      <div style="display:flex;gap:2rem">
        <div><div class="kpi-val mono" style="font-size:22px">${m.v1}</div><div class="kpi-lbl">${d1}</div></div>
        <div><div class="kpi-val mono" style="font-size:22px">${m.v2}</div><div class="kpi-lbl">${d2}</div></div>
      </div>
    </div>
  </div>`).join('');

  // Movement comparison scatter
  destroyChart('multi-movement-chart');
  const ds1 = allPT.map(pt => ({
    label:`${pn(pt)} (${d1})`,
    data: s1.rows.filter(r=>r._pt===pt&&r.pfx_x&&r.pfx_z).map(r=>({x:-pf(r.pfx_x)*12,y:pf(r.pfx_z)*12})),
    backgroundColor: pc(pt)+'99', pointRadius:4, pointStyle:'circle',
  }));
  const ds2 = allPT.map(pt => ({
    label:`${pn(pt)} (${d2})`,
    data: s2.rows.filter(r=>r._pt===pt&&r.pfx_x&&r.pfx_z).map(r=>({x:-pf(r.pfx_x)*12,y:pf(r.pfx_z)*12})),
    backgroundColor: pc(pt), pointRadius:4, pointStyle:'triangle',
  }));
  charts['multi-movement-chart'] = new Chart(document.getElementById('multi-movement-chart'), {
    type:'scatter',
    data:{ datasets:[...ds1,...ds2] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'right', labels:{ color:'#72747c', font:{size:10,family:'DM Mono'}, padding:8 } } },
      scales:{
        x:{ title:{display:true,text:'Horizontal break — arm-side (in)',color:'#72747c',font:{size:11}}, ticks:{color:'#72747c',font:{size:10}}, grid:{color:'rgba(255,255,255,0.05)'}, position:'center' },
        y:{ title:{display:true,text:'Induced vertical break (in)',color:'#72747c',font:{size:11}}, ticks:{color:'#72747c',font:{size:10}}, grid:{color:'rgba(255,255,255,0.05)'}, position:'center' }
      }
    }
  });

  // Trend insights
  const trendInsights = [];
  allPT.forEach(pt => {
    const u1 = pm1[pt]?.count ? pm1[pt].count/t1*100 : 0;
    const u2 = pm2[pt]?.count ? pm2[pt].count/t2*100 : 0;
    const delta = u2-u1;
    if (Math.abs(delta) >= 8) {
      const dir = delta > 0 ? 'increased' : 'decreased';
      const type = delta > 0 && (pt==='ST'||pt==='CU'||pt==='FC') ? 'good' : delta > 0 && (pt==='FF'||pt==='FA') ? 'warn' : 'neutral';
      trendInsights.push({ type, title:`${pn(pt)} usage ${dir} ${Math.abs(delta).toFixed(0)}pp`, body:`${d1}: ${u1.toFixed(0)}% → ${d2}: ${u2.toFixed(0)}%. ${delta<0&&(pt==='FF'||pt==='FA')?'Fastball dependency trending down — positive direction.':delta>0&&(pt==='ST')?'Sweeper usage increasing — keep this trend going.':'Monitor whether this shift correlates with better outcomes.'}` });
    }
  });
  if (bb2 < bb1) trendInsights.push({ type:'good', title:'Walk rate improved', body:`${bb1} walks in ${d1} → ${bb2} in ${d2}. Improved command or better trust in secondaries in full counts.` });
  if (bb2 > bb1) trendInsights.push({ type:'warn', title:'Walk rate increased', body:`${bb1} walks in ${d1} → ${bb2} in ${d2}. Review full-count sequencing — fastball in 3-2 is likely the cause.` });

  document.getElementById('multi-insights').innerHTML = trendInsights.slice(0,6).map(i =>
    `<div class="insight-card ${i.type||''}">
      <div class="insight-title">${i.title}</div>
      <div class="insight-body">${i.body}</div>
    </div>`).join('') || '<div class="empty-state">No significant trends detected between these two starts.</div>';

  document.getElementById('upload-multi').style.display = 'none';
  document.getElementById('report-multi').style.display = '';
}
