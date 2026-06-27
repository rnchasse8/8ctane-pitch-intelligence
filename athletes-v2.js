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
let cachedAthletes = [];

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
      if (name === 'trends')    renderTrends();
      if (name === 'splits')    renderSplits();
      if (name === 'locations') renderLocations();
      if (name === 'yoy')       renderYoY();
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
    cachedAthletes = athletes;
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
  document.getElementById('view-bulk-import').style.display = 'none';
  currentAthlete = null;
  athleteOutings = [];
  Object.keys(profileCharts).forEach(id => { if(profileCharts[id]) { profileCharts[id].destroy(); delete profileCharts[id]; } });
  loadRoster();
}

function showBulkImport() {
  document.getElementById('view-roster').style.display = 'none';
  document.getElementById('view-profile').style.display = 'none';
  document.getElementById('view-bulk-import').style.display = '';
  // Populate athlete dropdown
  const sel = document.getElementById('bulk-athlete-select');
  sel.innerHTML = '<option value="">Select athlete...</option>' +
    cachedAthletes.map(a => `<option value="${a.id}">${a.name} — ${a.team||''} ${a.level||''}</option>`).join('');
  sel.onchange = () => {
    const btn = document.getElementById('bulk-import-btn');
    const hasFile = bulkOutings.length > 0;
    const hasAthlete = sel.value;
    btn.disabled = !(hasFile && hasAthlete);
    btn.style.opacity = (hasFile && hasAthlete) ? '1' : '.4';
  };
  // Setup drag and drop
  const dz = document.getElementById('drop-zone');
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('drag-over'); };
  dz.ondragleave = () => dz.classList.remove('drag-over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('drag-over'); if(e.dataTransfer.files[0]) handleBulkFile(e.dataTransfer.files[0]); };
}

// =============================================
// BULK IMPORT
// =============================================
let bulkOutings = [];

function resetBulkImport() {
  bulkOutings = [];
  document.getElementById('bulk-preview').style.display = 'none';
  document.getElementById('bulk-result').style.display = 'none';
  document.getElementById('drop-zone').style.display = '';
  document.getElementById('csv-file-input').value = '';
}

function handleBulkFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => parseBulkCSV(e.target.result, file.name);
  reader.readAsText(file);
}

function parseBulkCSV(text, filename) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,'').toLowerCase());

  // Detect format: Statcast vs Trackman
  const isStatcast  = headers.includes('pitch_type') && headers.includes('release_speed');
  const isTrackman  = headers.includes('taggedpitchtype') || headers.includes('relspeed');

  if (!isStatcast && !isTrackman) {
    alert('Could not detect CSV format. Please use a Statcast or Trackman export.');
    return;
  }

  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h] = (vals[i]||'').trim().replace(/^"|"$/g,''));
    return obj;
  });

  if (!rows.length) { alert('No data found in CSV.'); return; }

  const parsed = isStatcast ? parseStatcastBulk(rows) : parseTrackmanBulk(rows);
  if (!parsed.outings.length) { alert('No outings detected in this file.'); return; }

  bulkOutings = parsed.outings;

  // Show preview
  document.getElementById('drop-zone').style.display = 'none';
  document.getElementById('bulk-preview').style.display = '';
  document.getElementById('bulk-preview-title').textContent = parsed.pitcher + ' — ' + parsed.outings.length + ' outings detected';
  document.getElementById('bulk-preview-sub').textContent =
    parsed.outings.reduce((a,o)=>a+o.total_pitches,0) + ' total pitches · ' +
    parsed.outings[0].date + ' to ' + parsed.outings[parsed.outings.length-1].date + ' · ' + filename;

  // Render outing rows
  document.getElementById('bulk-outing-rows').innerHTML = parsed.outings.map((o,i) => {
    const ptags = Object.entries(o.pitchMap).filter(([,s])=>s.count>0)
      .sort((a,b)=>b[1].count-a[1].count).slice(0,5)
      .map(([pt,s])=>`${pn(pt)} ${o.total_pitches?(s.count/o.total_pitches*100).toFixed(0):0}%`).join(' · ');
    const whiffPct = o.total_pitches ? (o.whiffs/o.total_pitches*100).toFixed(1) : '—';
    return `<div class="bulk-outing-row" id="bulk-row-${i}">
      <div class="bulk-outing-left">
        <div class="bulk-outing-date">${formatDate(o.date)}</div>
        <div>
          <div class="bulk-outing-opp">vs. ${o.opponent||'Unknown'}</div>
          <div class="bulk-outing-meta">${o.total_pitches} pitches · ${whiffPct}% whiff · ${o.ks}K ${o.walks}BB · ${ptags}</div>
        </div>
      </div>
      <div class="bulk-outing-status" id="bulk-status-${i}" style="color:var(--muted2)">Pending</div>
    </div>`;
  }).join('');

  // Try auto-select athlete by name
  const sel = document.getElementById('bulk-athlete-select');
  const nameMatch = cachedAthletes.find(a =>
    parsed.pitcher.toLowerCase().includes(a.name.split(' ').pop().toLowerCase()) ||
    a.name.toLowerCase().includes(parsed.pitcher.split(',')[0].toLowerCase().trim())
  );
  if (nameMatch) { sel.value = nameMatch.id; sel.dispatchEvent(new Event('change')); }
}

function parseCsvLine(line) {
  const result = []; let cur = ''; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; }
    else if (c === ',' && !inQuote) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

function parseStatcastBulk(rows) {
  const NORMALIZE = {FA:'FF',FO:'FS',CS:'CU',SV:'SL'};
  const VALID_PT  = new Set(['FF','SI','FC','SL','ST','CU','KC','FS','CH','OTHER']);
  const STRIKE_ZONES = new Set(['1','2','3','4','5','6','7','8','9']);

  const pitcher = rows[0]?.player_name || 'Unknown';
  const games = {};
  rows.forEach(r => {
    const key = (r.game_date||'') + '|' + (r.game_pk||'');
    if (!games[key]) games[key] = [];
    games[key].push(r);
  });

  const outings = Object.entries(games).sort((a,b)=>a[0].localeCompare(b[0])).map(([key, pitches]) => {
    const home = pitches[0]?.home_team||''; const away = pitches[0]?.away_team||'';
    const opp = pitches[0]?.inning_topbot==='Top' ? away : home;
    const date = pitches[0]?.game_date||'';

    const pm = {};
    let inZone=0,outZone=0,swingInZone=0,swingOutZone=0,contactInZone=0;
    let totalSwings=0,totalStrikes=0,gbCount=0,fbCount=0,ldCount=0,bipCount=0;
    let fp_total=0,fp_strikes=0,oneone_total=0,oneone_strikes=0;

    // Group pitches by at_bat_number for PA-level metrics
    const paMap = {};
    pitches.forEach(r => {
      const pa = r.at_bat_number||r.at_bat_number||'';
      if (!pa) return;
      if (!paMap[pa]) paMap[pa] = [];
      paMap[pa].push(r);
    });

    // Race to 2K: % of PAs where pitcher gets to 2 strikes within first 3 pitches
    let race2k_total = 0, race2k_hit = 0;
    // Putaway%: % of 2-strike plate appearances ending in strikeout
    let putaway_total = 0, putaway_k = 0;

    Object.values(paMap).forEach(paPitches => {
      const sorted = [...paPitches].sort((a,b) => (+a.pitch_number||0)-(+b.pitch_number||0));
      race2k_total++;
      // Check if pitcher reached 2 strikes within first 3 pitches
      let strikes = 0;
      for (let i = 0; i < Math.min(3, sorted.length); i++) {
        const desc = sorted[i].description||'';
        if (desc.includes('swinging_strike')||desc.includes('called_strike')||desc.includes('foul')||desc==='foul_tip') {
          strikes++;
          if (strikes >= 2) { race2k_hit++; break; }
        }
      }
      // Putaway: did this PA ever reach 2 strikes?
      const lastPitch = sorted[sorted.length-1];
      const maxStrikes = Math.max(...sorted.map(p=>+(p.strikes||0)));
      if (maxStrikes >= 2) {
        putaway_total++;
        if (lastPitch.events==='strikeout') putaway_k++;
      }
    });

    pitches.forEach(r => {
      let pt = (r.pitch_type||'').trim().toUpperCase();
      pt = NORMALIZE[pt] || pt;
      if (!pt || !VALID_PT.has(pt)) pt = 'OTHER';
      if (!pm[pt]) pm[pt] = {count:0,velos:[],whiffs:0,cstrikes:0,hip:0,xwobas:[],launch_speeds:[],pfx_xs:[],pfx_zs:[],vaas:[],haas:[],hard_hits:0,
        spins:[],locations:[],spray:[],
        lhh:{count:0,whiffs:0,cstrikes:0,hip:0,velos:[],xbas:[],xslgs:[],launch_speeds:[],hard_hits:0,gb:0,fb:0,ld:0,bip:0,totalStrikes:0,locations:[]},
        rhh:{count:0,whiffs:0,cstrikes:0,hip:0,velos:[],xbas:[],xslgs:[],launch_speeds:[],hard_hits:0,gb:0,fb:0,ld:0,bip:0,totalStrikes:0,locations:[]}};
      const s = pm[pt];
      s.count++;
      const stand = (r.stand||'').toUpperCase();
      const side = stand==='L' ? s.lhh : stand==='R' ? s.rhh : null;
      if (side) {
        side.count++;
        const sv = parseFloat(r.release_speed); if(!isNaN(sv)) side.velos.push(sv);
      }

      const v = parseFloat(r.release_speed); if (!isNaN(v)) s.velos.push(v);
      const hb = parseFloat(r.pfx_x); if (!isNaN(hb)) s.pfx_xs.push(-hb*12);
      const ivb = parseFloat(r.pfx_z); if (!isNaN(ivb)) s.pfx_zs.push(ivb*12);

      // Spin rate
      const spin = parseFloat(r.release_spin_rate); if (!isNaN(spin)) s.spins.push(spin);

      const desc = r.description||'';
      const zone = (r.zone||'').trim();
      const inSZ = STRIKE_ZONES.has(zone);
      if (inSZ) inZone++; else if (zone) outZone++;
      const isSwing = desc.includes('swinging_strike')||desc.includes('foul')||desc==='hit_into_play'||desc==='foul_tip';
      const isContact = desc.includes('foul')||desc==='hit_into_play'||desc==='foul_tip';
      const isStrikeResult = desc.includes('swinging_strike')||desc.includes('called_strike')||desc.includes('foul')||desc==='hit_into_play'||desc==='foul_tip';

      // Plate location — store as [x, z, outcome, stand] for scatter plot
      const px = parseFloat(r.plate_x); const pz = parseFloat(r.plate_z);
      if (!isNaN(px) && !isNaN(pz)) {
        const outcome = desc.includes('swinging_strike') ? 'W' : desc.includes('called_strike') ? 'CS' : desc==='hit_into_play' ? 'HIP' : desc.includes('foul') ? 'F' : 'B';
        const loc = [+px.toFixed(2), +pz.toFixed(2), outcome, stand];
        s.locations.push(loc);
        if (side) side.locations.push(loc);
      }
      if (isSwing) { totalSwings++; if(inSZ){swingInZone++;if(isContact)contactInZone++;} else if(zone)swingOutZone++; }
      if (desc.includes('swinging_strike')) {
        s.whiffs++;
        if(side) side.whiffs++;
      } else if (desc.includes('called_strike')) {
        s.cstrikes++;
        if(side) side.cstrikes++;
      } else if (desc==='hit_into_play') {
        s.hip++;
        if(side) side.hip++;
        const ev = parseFloat(r.launch_speed); if(!isNaN(ev)){s.launch_speeds.push(ev);if(ev>=95)s.hard_hits++;if(side){side.launch_speeds.push(ev);if(ev>=95)side.hard_hits++;}}
        const xw = parseFloat(r.estimated_woba_using_speedangle); if(!isNaN(xw))s.xwobas.push(xw);
        const xba  = parseFloat(r.estimated_ba_using_speedangle);  if(!isNaN(xba)  && side) side.xbas.push(xba);
        const xslg = parseFloat(r.estimated_slg_using_speedangle); if(!isNaN(xslg) && side) side.xslgs.push(xslg);
        // Spray chart
        const hcx = parseFloat(r.hc_x); const hcy = parseFloat(r.hc_y);
        if (!isNaN(hcx) && !isNaN(hcy)) {
          const bbt = (r.bb_type||'').toLowerCase();
          const ev2 = parseFloat(r.launch_speed);
          s.spray.push([+hcx.toFixed(1), +hcy.toFixed(1), bbt, isNaN(ev2)?null:+ev2.toFixed(1), stand]);
        }
      }
      // Track strikes and BIP types per side
      const isStrikeDesc = desc.includes('swinging_strike')||desc.includes('called_strike')||desc.includes('foul')||desc==='hit_into_play'||desc==='foul_tip';
      if(isStrikeDesc && side) side.totalStrikes++;
      const bbt2 = (r.bb_type||'').toLowerCase();
      if(bbt2 && side){side.bip++;if(bbt2==='ground_ball')side.gb++;else if(bbt2==='fly_ball')side.fb++;else if(bbt2==='line_drive')side.ld++;}
      if (isStrikeResult) totalStrikes++;
      const bbt = (r.bb_type||'').toLowerCase();
      if (bbt){bipCount++;if(bbt==='ground_ball')gbCount++;else if(bbt==='fly_ball')fbCount++;else if(bbt==='line_drive')ldCount++;}
      const balls_n=parseInt(r.balls||0),strikes_n=parseInt(r.strikes||0);
      if (balls_n===0&&strikes_n===0){fp_total++;if(isStrikeResult)fp_strikes++;}
      if (balls_n===1&&strikes_n===1){oneone_total++;if(isStrikeResult)oneone_strikes++;}
    });

    const total = pitches.length;
    const allEVs = Object.values(pm).flatMap(s=>s.launch_speeds);
    const hardHits = Object.values(pm).reduce((a,s)=>a+s.hard_hits,0);
    const zonedP = inZone+outZone;
    const ks = pitches.filter(r=>r.events==='strikeout').length;
    const walks = pitches.filter(r=>r.events==='walk'||r.events==='hit_by_pitch').length;
    const hrs   = pitches.filter(r=>r.events==='home_run').length;
    const hits  = pitches.filter(r=>['single','double','triple','home_run'].includes(r.events||'')).length;
    const outEvents = new Set(['field_out','strikeout','force_out','grounded_into_double_play','sac_fly','sac_bunt','fielders_choice_out','double_play','triple_play']);
    const outsRecorded = pitches.reduce((a,r)=>{
      const ev=r.events||'';
      if(ev==='grounded_into_double_play'||ev==='double_play') return a+2;
      if(ev==='triple_play') return a+3;
      if(outEvents.has(ev)) return a+1;
      return a;
    }, 0);
    const ip = +(outsRecorded/3).toFixed(2);
    const avgg = arr => arr.length ? arr.reduce((a,b)=>a+b)/arr.length : null;

    const makeSplitStats = (side) => {
      const xba  = side.xbas.length  ? avgg(side.xbas)  : null;
      const xslg = side.xslgs.length ? avgg(side.xslgs) : null;
      return {
        count:    side.count,
        whiffs:   side.whiffs,
        cstrikes: side.cstrikes,
        hip:      side.hip,
        whiffPct: side.count ? +(side.whiffs/side.count*100).toFixed(1) : 0,
        cswPct:   side.count ? +((side.whiffs+side.cstrikes)/side.count*100).toFixed(1) : 0,
        strikePct:side.count ? +(side.totalStrikes/side.count*100).toFixed(1) : 0,
        avgVelo:  side.velos.length ? +avgg(side.velos).toFixed(1) : null,
        avgXba:   xba  !== null ? +xba.toFixed(3)  : null,
        avgXslg:  xslg !== null ? +xslg.toFixed(3) : null,
        avgXops:  (xba!==null&&xslg!==null) ? +(xba+xslg).toFixed(3) : null,
        avgEV:    side.launch_speeds.length ? +avgg(side.launch_speeds).toFixed(1) : null,
        hardHitPct:side.launch_speeds.length ? +(side.hard_hits/side.launch_speeds.length*100).toFixed(1) : null,
        gbPct:    side.bip ? +(side.gb/side.bip*100).toFixed(1) : null,
        fbPct:    side.bip ? +(side.fb/side.bip*100).toFixed(1) : null,
        ldPct:    side.bip ? +(side.ld/side.bip*100).toFixed(1) : null,
      };
    };
    const flatMap = {};
    Object.entries(pm).forEach(([pt,s]) => {
      if (!s.count) return;
      const xbas_all  = [...(s.lhh.xbas||[]), ...(s.rhh.xbas||[])];
      const xslgs_all = [...(s.lhh.xslgs||[]), ...(s.rhh.xslgs||[])];
      flatMap[pt] = {
        count:s.count, whiffs:s.whiffs, cstrikes:s.cstrikes, hip:s.hip,
        avgVelo:  s.velos.length  ? +avgg(s.velos).toFixed(1)  : null,
        peakVelo: s.velos.length  ? +Math.max(...s.velos).toFixed(1) : null,
        whiffPct: +(s.whiffs/s.count*100).toFixed(1),
        cswPct:   +((s.whiffs+s.cstrikes)/s.count*100).toFixed(1),
        avgXwoba: s.xwobas.length ? +avgg(s.xwobas).toFixed(3) : null,
        avgXba:   xbas_all.length  ? +avgg(xbas_all).toFixed(3)  : null,
        avgXslg:  xslgs_all.length ? +avgg(xslgs_all).toFixed(3) : null,
        avgEV:    s.launch_speeds.length ? +avgg(s.launch_speeds).toFixed(1) : null,
        avgIVB:   s.pfx_zs.length ? +avgg(s.pfx_zs).toFixed(1) : null,
        avgHB:    s.pfx_xs.length ? +avgg(s.pfx_xs).toFixed(1) : null,
        avgSpin:  s.spins.length  ? +avgg(s.spins).toFixed(0)  : null,
        locations: s.locations || [],
        spray: s.spray || [],
        lhh: makeSplitStats(s.lhh),
        rhh: makeSplitStats(s.rhh),
      };
    });

    return {
      date, opponent:opp, total_pitches:total,
      whiffs:Object.values(pm).reduce((a,s)=>a+s.whiffs,0),
      calledStrikes:Object.values(pm).reduce((a,s)=>a+s.cstrikes,0),
      walks, ks, hrs, hits, ip,
      avgEV:allEVs.length?+avgg(allEVs).toFixed(1):null,
      hardHitPct:allEVs.length?+(hardHits/allEVs.length*100).toFixed(1):null,
      zonePct:    zonedP      ?+(inZone/zonedP*100).toFixed(1):null,
      oSwingPct:  outZone     ?+(swingOutZone/outZone*100).toFixed(1):null,
      zSwingPct:  inZone      ?+(swingInZone/inZone*100).toFixed(1):null,
      zContactPct:swingInZone ?+(contactInZone/swingInZone*100).toFixed(1):null,
      swingPct:   total       ?+(totalSwings/total*100).toFixed(1):null,
      strikePct:  total       ?+(totalStrikes/total*100).toFixed(1):null,
      gbPct:      bipCount    ?+(gbCount/bipCount*100).toFixed(1):null,
      fbPct:      bipCount    ?+(fbCount/bipCount*100).toFixed(1):null,
      ldPct:      bipCount    ?+(ldCount/bipCount*100).toFixed(1):null,
      fpStrikePct: fp_total    ?+(fp_strikes/fp_total*100).toFixed(1):null,
      oonStrikePct:oneone_total?+(oneone_strikes/oneone_total*100).toFixed(1):null,
      race2kPct:   race2k_total?+(race2k_hit/race2k_total*100).toFixed(1):null,
      putawayPct:  putaway_total?+(putaway_k/putaway_total*100).toFixed(1):null,
      pitchMap: flatMap,
    };
  });
  return { pitcher, outings };
}

function parseTrackmanBulk(rows) {
  const PT_MAP = {
    'Fastball':'FF','Four-Seam':'FF','FourSeamFastBall':'FF',
    'Sinker':'SI','TwoSeamFastBall':'SI','Cutter':'FC',
    'Slider':'SL','Sweeper':'ST','Curveball':'CU','CurveBall':'CU',
    'Splitter':'FS','Split-Finger':'FS','Changeup':'CH','ChangeUp':'CH',
  };
  const pitcher = rows[0]?.pitcher || rows[0]?.Pitcher || 'Unknown';
  const games = {};
  rows.forEach(r => {
    const date = r.date || r.Date || '';
    if (!games[date]) games[date] = [];
    games[date].push(r);
  });

  const outings = Object.entries(games).sort((a,b)=>a[0].localeCompare(b[0])).map(([date, pitches]) => {
    const opp = pitches[0]?.batterteam || pitches[0]?.BatterTeam || '';
    const pm = {};
    pitches.forEach(r => {
      const tagged = r.taggedpitchtype || r.TaggedPitchType || '';
      const auto   = r.autopitchtype   || r.AutoPitchType   || '';
      const pt = PT_MAP[tagged] || PT_MAP[auto] || 'OTHER';
      if (!pm[pt]) pm[pt] = {count:0,velos:[],whiffs:0,cstrikes:0,hip:0,launch_speeds:[],ivbs:[],hbs:[],lhh:{count:0,whiffs:0,cstrikes:0},rhh:{count:0,whiffs:0,cstrikes:0}};
      const s = pm[pt]; s.count++;
      const stand = (r.batterside||r.BatterSide||'').toUpperCase();
      const side = stand==='L'?s.lhh:stand==='R'?s.rhh:null;
      if(side) side.count++;
      const v = parseFloat(r.relspeed||r.RelSpeed); if(!isNaN(v))s.velos.push(v);
      const ivb=parseFloat(r.inducedvertbreak||r.InducedVertBreak); if(!isNaN(ivb))s.ivbs.push(ivb);
      const hb=parseFloat(r.horzbreak||r.HorzBreak); if(!isNaN(hb))s.hbs.push(hb);
      const call = r.pitchcall||r.PitchCall||'';
      if(call.includes('SwingingStrike')||call==='StrikeSwinging'){s.whiffs++;if(side)side.whiffs++;}
      else if(call.includes('CalledStrike')||call==='StrikeCalled'){s.cstrikes++;if(side)side.cstrikes++;}
      else if(call==='InPlay'){s.hip++;const ev=parseFloat(r.exitspeed||r.ExitSpeed);if(!isNaN(ev))s.launch_speeds.push(ev);}
      const korbb=r.korbb||r.KorBB||'';
      if(korbb==='Strikeout'){}; // handled above
    });
    const total=pitches.length;
    const ks=pitches.filter(r=>(r.korbb||r.KorBB||'')===('Strikeout')).length;
    const walks=pitches.filter(r=>(r.korbb||r.KorBB||'')==='Walk').length;
    const avgg=arr=>arr.length?arr.reduce((a,b)=>a+b)/arr.length:null;
    const flatMap={};
    Object.entries(pm).forEach(([pt,s])=>{
      if(!s.count)return;
      flatMap[pt]={
        count:s.count,whiffs:s.whiffs,cstrikes:s.cstrikes,hip:s.hip,
        avgVelo:s.velos.length?+avgg(s.velos).toFixed(1):null,
        peakVelo:s.velos.length?+Math.max(...s.velos).toFixed(1):null,
        whiffPct:+(s.whiffs/s.count*100).toFixed(1),
        cswPct:+((s.whiffs+s.cstrikes)/s.count*100).toFixed(1),
        avgIVB:s.ivbs.length?+avgg(s.ivbs).toFixed(1):null,
        avgHB:s.hbs.length?+avgg(s.hbs).toFixed(1):null,
        avgEV:s.launch_speeds.length?+avgg(s.launch_speeds).toFixed(1):null,
        avgXwoba:null,
        lhh:{count:s.lhh.count,whiffs:s.lhh.whiffs,cstrikes:s.lhh.cstrikes,whiffPct:s.lhh.count?+(s.lhh.whiffs/s.lhh.count*100).toFixed(1):0,cswPct:s.lhh.count?+((s.lhh.whiffs+s.lhh.cstrikes)/s.lhh.count*100).toFixed(1):0},
        rhh:{count:s.rhh.count,whiffs:s.rhh.whiffs,cstrikes:s.rhh.cstrikes,whiffPct:s.rhh.count?+(s.rhh.whiffs/s.rhh.count*100).toFixed(1):0,cswPct:s.rhh.count?+((s.rhh.whiffs+s.rhh.cstrikes)/s.rhh.count*100).toFixed(1):0},
      };
    });
    // Parse date from M/D/YY
    let isoDate = date;
    if (date.includes('/')) { const [m,d,y]=date.split('/'); isoDate=`20${y.slice(-2)}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
    return {date:isoDate,opponent:opp,total_pitches:total,whiffs:Object.values(pm).reduce((a,s)=>a+s.whiffs,0),calledStrikes:Object.values(pm).reduce((a,s)=>a+s.cstrikes,0),walks,ks,avgEV:null,hardHitPct:null,zonePct:null,oSwingPct:null,zSwingPct:null,zContactPct:null,swingPct:null,strikePct:null,gbPct:null,fbPct:null,ldPct:null,fpStrikePct:null,oonStrikePct:null,pitchMap:flatMap};
  });
  return { pitcher, outings };
}

async function runBulkImport() {
  const athleteId = document.getElementById('bulk-athlete-select').value;
  if (!athleteId || !bulkOutings.length) return;

  // Check for duplicates against existing outings
  const existingRes = await api('getOutings', { athleteId });
  const existingDates = new Set((existingRes.outings||[]).map(o => o.date?.toString().split('T')[0]));

  document.getElementById('bulk-import-btn').disabled = true;
  document.getElementById('bulk-import-btn').textContent = 'Importing...';
  document.getElementById('bulk-progress-wrap').style.display = '';

  let done=0, skipped=0, errors=0;

  for (let i=0; i<bulkOutings.length; i++) {
    const o = bulkOutings[i];
    const row = document.getElementById(`bulk-row-${i}`);
    const status = document.getElementById(`bulk-status-${i}`);

    // Check duplicate
    const dateKey = o.date?.toString().split('T')[0];
    if (existingDates.has(dateKey)) {
      row.className = 'bulk-outing-row skip';
      status.style.color = 'var(--muted2)';
      status.textContent = '— Skipped (exists)';
      skipped++;
      document.getElementById('bulk-progress-bar').style.width = ((i+1)/bulkOutings.length*100)+'%';
      continue;
    }

    row.className = 'bulk-outing-row active';
    status.style.color = 'var(--cyan)';
    status.textContent = 'Saving...';

    try {
      const cleanMap = {};
      Object.entries(o.pitchMap).forEach(([pt,s]) => { if(s.count>0) cleanMap[pt]=s; });
      await api('addOuting', {
        athleteId,
        date: o.date,
        opponent: o.opponent,
        notes: '',
        pitchMap: cleanMap,
        stats: {
          total: o.total_pitches, whiffs: o.whiffs, calledStrikes: o.calledStrikes,
          walks: o.walks, ks: o.ks, hrs: o.hrs||0, hits: o.hits||0, ip: o.ip||0, avgEV: o.avgEV, hardHitPct: o.hardHitPct,
          zonePct: o.zonePct, oSwingPct: o.oSwingPct, zSwingPct: o.zSwingPct,
          zContactPct: o.zContactPct, swingPct: o.swingPct, strikePct: o.strikePct,
          gbPct: o.gbPct, fbPct: o.fbPct, ldPct: o.ldPct,
          fpStrikePct: o.fpStrikePct, oonStrikePct: o.oonStrikePct,
          race2kPct: o.race2kPct, putawayPct: o.putawayPct,
        }
      });
      row.className = 'bulk-outing-row done';
      status.style.color = 'var(--good)';
      status.textContent = '✓ Saved';
      done++;
    } catch(e) {
      row.className = 'bulk-outing-row error';
      status.style.color = 'var(--danger)';
      status.textContent = '✗ Error';
      errors++;
    }

    document.getElementById('bulk-progress-bar').style.width = ((i+1)/bulkOutings.length*100)+'%';
    await new Promise(r => setTimeout(r, 500));
  }

  const title = errors===0
    ? `✓ ${done} outing${done!==1?'s':''} imported successfully`
    : `${done} imported · ${errors} failed · ${skipped} skipped`;
  const body = skipped > 0
    ? `${skipped} outing${skipped!==1?'s':''} were skipped because they already exist for this athlete.`
    : `All outings saved. Head to the athlete profile to view the updated season data.`;

  document.getElementById('bulk-result-title').textContent = title;
  document.getElementById('bulk-result-body').textContent = body;
  document.getElementById('bulk-result').style.display = '';
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

  const totalPitches = athleteOutings.reduce((a,o)=>a+(+o.total_pitches||0), 0);
  const totalK  = athleteOutings.reduce((a,o)=>a+(+o.strikeouts||0), 0);
  const totalBB = athleteOutings.reduce((a,o)=>a+(+o.walks||0), 0);
  const totalHR = athleteOutings.reduce((a,o)=>a+(+o.hrs||0), 0);
  const totalH  = athleteOutings.reduce((a,o)=>a+(+o.hits||0), 0);
  const totalWhiffs = athleteOutings.reduce((a,o)=>a+(+o.whiffs||0), 0);
  const totalIP = athleteOutings.reduce((a,o)=>a+(+o.ip||0), 0);

  const whiffRate = totalPitches ? (totalWhiffs/totalPitches*100).toFixed(1) : '—';

  // FIP = ((13*HR + 3*BB - 2*K) / IP) + 3.10
  const fip = totalIP > 0
    ? (((13*totalHR + 3*totalBB - 2*totalK) / totalIP) + 3.10).toFixed(2)
    : '—';

  // WHIP = (BB + H) / IP
  const whip = totalIP > 0
    ? ((totalBB + totalH) / totalIP).toFixed(2)
    : '—';

  // K%-BB%
  const totalBIP = athleteOutings.reduce((a,o) => {
    let pm = {};
    try { pm = typeof o.pitch_stats==='object' ? o.pitch_stats : JSON.parse(o.pitch_stats_json||'{}'); } catch(e){}
    return a + Object.values(pm).reduce((s,p)=>s+(p.hip||0), 0);
  }, 0);
  const totalPA = totalK + totalBB + totalBIP;
  const kPct  = totalPA ? (totalK/totalPA*100).toFixed(1) : null;
  const bbPct = totalPA ? (totalBB/totalPA*100).toFixed(1) : null;
  const kMinusBB = (kPct !== null && bbPct !== null)
    ? `${(parseFloat(kPct)-parseFloat(bbPct)).toFixed(1)}%`
    : '—';

  document.getElementById('profile-kpis').innerHTML = [
    { v: athleteOutings.length, l: 'Outings' },
    { v: fip,                   l: 'FIP' },
    { v: whip,                  l: 'WHIP' },
    { v: whiffRate+'%',         l: 'Whiff%' },
    { v: kMinusBB,              l: 'K%-BB%' },
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
      totalStrikes=0, gbCount=0, fbCount=0, ldCount=0, puCount=0, bipCount=0,
      fp_total=0, fp_strikes=0, oneone_total=0, oneone_strikes=0;

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

    // Count-based strike tracking
    const balls_n   = parseInt(r.balls||0);
    const strikes_n = parseInt(r.strikes||0);
    const isStrike  = desc.includes('swinging_strike')||desc.includes('called_strike')||desc.includes('foul')||desc==='hit_into_play'||desc==='foul_tip';
    if (balls_n===0 && strikes_n===0) { fp_total++; if(isStrike) fp_strikes++; }
    if (balls_n===1 && strikes_n===1) { oneone_total++; if(isStrike) oneone_strikes++; }

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
      fpStrikePct:   fp_total      ? +(fp_strikes/fp_total*100).toFixed(1) : null,
      oonStrikePct:  oneone_total  ? +(oneone_strikes/oneone_total*100).toFixed(1) : null,
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

function sharePlayerLink() {
  const base = window.location.origin + window.location.pathname.replace('athletes.html','');
  const url = `${base}player.html?id=${currentAthlete.id}`;
  navigator.clipboard.writeText(url).then(() => {
    toast(`Link copied for ${currentAthlete.name} ✓`, 'success');
  }).catch(() => {
    prompt('Copy this link to share:', url);
  });
}

/* ==================== PITCH METRICS EDITOR ==================== */
const PITCH_METRIC_FIELDS = [
  { key:'psStuffPlus',  label:'psStuff+',  type:'number', placeholder:'e.g. 117' },
  { key:'spinRate',     label:'Spin Rate', type:'number', placeholder:'e.g. 2332' },
  { key:'armSide',     label:'Arm Side',  type:'number', placeholder:'e.g. 7.01' },
  { key:'vertical',    label:'Vertical',  type:'number', placeholder:'e.g. 17.17' },
  { key:'xwOBA',       label:'xwOBA',     type:'number', placeholder:'e.g. .398' },
  { key:'xSLG',        label:'xSLG',      type:'number', placeholder:'e.g. .582' },
  { key:'xBA',         label:'xBA',       type:'number', placeholder:'e.g. .346' },
  { key:'whiffPct',    label:'Whiff%',    type:'number', placeholder:'e.g. 9.1' },
  { key:'hardHitPct',  label:'HardHit%',  type:'number', placeholder:'e.g. 66.67' },
];

const EDITABLE_PITCH_TYPES = [
  { code:'FF', label:'4-Seam' },
  { code:'SI', label:'Sinker' },
  { code:'FC', label:'Cutter' },
  { code:'ST', label:'Sweeper' },
  { code:'SL', label:'Slider' },
  { code:'CU', label:'Curveball' },
  { code:'CH', label:'Changeup' },
  { code:'FS', label:'Splitter' },
];

function showEditPitchMetrics() {
  const existing = currentAthlete.pitch_metrics || {};

  const pitchRows = EDITABLE_PITCH_TYPES.map(({ code, label }) => {
    const m = existing[code] || {};
    const fields = PITCH_METRIC_FIELDS.map(f =>
      `<div class="pm-field">
        <label class="pm-field-label">${f.label}</label>
        <input class="pm-field-input" type="${f.type}" placeholder="${f.placeholder}"
          id="pm-${code}-${f.key}" value="${m[f.key] !== undefined ? m[f.key] : ''}">
      </div>`
    ).join('');
    return `<div class="pm-pitch-block">
      <div class="pm-pitch-name">
        <span class="pitch-dot" style="background:${pc(code)};width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:8px"></span>
        ${label}
      </div>
      <div class="pm-fields-grid">${fields}</div>
    </div>`;
  }).join('');

  document.getElementById('modal-title').textContent = 'Edit Pitch Metrics';
  document.getElementById('modal-body').innerHTML = `
    <p style="font-size:12px;color:var(--muted);margin-bottom:1.25rem;line-height:1.6">
      Enter psStuff+ and pitch metrics from your analytics system. Leave fields blank if not available.
      These values are used in Season Insight analysis.
    </p>
    <div class="pm-editor">${pitchRows}</div>
    <div style="display:flex;gap:.75rem;margin-top:1.5rem;justify-content:flex-end">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="savePitchMetrics()">Save Metrics</button>
    </div>`;
  document.getElementById('modal-overlay').style.display = 'flex';
}

async function savePitchMetrics() {
  const metrics = {};
  EDITABLE_PITCH_TYPES.forEach(({ code }) => {
    const pitchData = {};
    let hasData = false;
    PITCH_METRIC_FIELDS.forEach(f => {
      const el = document.getElementById(`pm-${code}-${f.key}`);
      if (el && el.value.trim() !== '') {
        pitchData[f.key] = parseFloat(el.value.trim());
        hasData = true;
      }
    });
    if (hasData) metrics[code] = pitchData;
  });

  try {
    await api('updateAthlete', {
      athleteId: currentAthlete.id,
      pitch_metrics_json: JSON.stringify(metrics)
    });
    currentAthlete.pitch_metrics = metrics;
    closeModal();
    toast('Pitch metrics saved ✓', 'success');
  } catch(e) {
    toast('Error saving: ' + e.message, 'error');
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
  // Filter out pitches with ≤10 samples (likely mistagged)
  const pitchSummary = sorted
    .filter(([,s]) => s.count > 10)
    .map(([pt,s]) => {
      const mlb = MLB_BASELINE_REF[pt];
      const xbas  = athleteOutings.flatMap(o => { try { const pm = typeof o.pitch_stats==='object'?o.pitch_stats:JSON.parse(o.pitch_stats_json||'{}'); return pm[pt]?.avgXba ? [pf(pm[pt].avgXba)] : []; } catch(e){ return []; } });
      const xslgs = athleteOutings.flatMap(o => { try { const pm = typeof o.pitch_stats==='object'?o.pitch_stats:JSON.parse(o.pitch_stats_json||'{}'); return pm[pt]?.avgXslg ? [pf(pm[pt].avgXslg)] : []; } catch(e){ return []; } });
      const spins = athleteOutings.flatMap(o => { try { const pm = typeof o.pitch_stats==='object'?o.pitch_stats:JSON.parse(o.pitch_stats_json||'{}'); return pm[pt]?.avgSpin ? [pf(pm[pt].avgSpin)] : []; } catch(e){ return []; } });
      return {
        pitch: pn(pt),
        code: pt,
        count: s.count,
        usage: total ? +(s.count/total*100).toFixed(1) : 0,
        avgVelo: s.velos.length ? +avg(s.velos).toFixed(1) : null,
        whiffPct: s.count ? +(s.whiffs/s.count*100).toFixed(1) : 0,
        cswPct: s.count ? +((s.whiffs+s.cstrikes)/s.count*100).toFixed(1) : 0,
        avgXwoba: s.xwobas.length ? +avg(s.xwobas).toFixed(3) : null,
        avgXba:  xbas.length  ? +avg(xbas).toFixed(3)  : null,
        avgXslg: xslgs.length ? +avg(xslgs).toFixed(3) : null,
        avgEV: s.evs.length ? +avg(s.evs).toFixed(1) : null,
        avgIVB: s.ivbs.length ? +avg(s.ivbs).toFixed(1) : null,
        avgHB: s.hbs.length ? +avg(s.hbs).toFixed(1) : null,
        avgVAA: s.vaas.length ? +avg(s.vaas).toFixed(1) : null,
        avgSpin: spins.length ? Math.round(avg(spins)) : null,
        mlbWhiff: mlb?.whiff_pct || null,
        mlbXwoba: mlb?.avg_xwoba || null,
      };
    });

  // Zone/swing season averages
  const zonePct     = avg(athleteOutings.map(o=>pf(o.zone_pct)).filter(Boolean));
  const oSwingPct   = avg(athleteOutings.map(o=>pf(o.o_swing_pct)).filter(Boolean));
  const zContactPct = avg(athleteOutings.map(o=>pf(o.z_contact_pct)).filter(Boolean));
  const gbPct       = avg(athleteOutings.map(o=>pf(o.gb_pct)).filter(Boolean));

  const fpStrikePct  = avg(athleteOutings.map(o=>pf(o.fp_strike_pct)).filter(Boolean)) || null;
  const oonStrikePct = avg(athleteOutings.map(o=>pf(o.oon_strike_pct)).filter(Boolean)) || null;
  const race2kPct    = avg(athleteOutings.map(o=>pf(o.race2k_pct)).filter(Boolean)) || null;
  const putawayPct   = avg(athleteOutings.map(o=>pf(o.putaway_pct)).filter(Boolean)) || null;

  const pm_stored = (() => {
    let pm = currentAthlete.pitch_metrics || {};
    if (!Object.keys(pm).length) {
      const key = (currentAthlete.name || '').toLowerCase();
      pm = PSSTUFF_DATA[key]?.metrics || {};
    }
    return pm;
  })();

  const prompt = `You are a pitching coach at 8ctane Baseball writing directly to your pitcher. Your tone is direct, encouraging, and specific - like a coach who knows this pitcher well. Use "you" and "your" throughout. Frame weaknesses constructively. Speak plainly - no stat abbreviations in narrative text. NEVER mention psStuff+ or any stuff grade unless explicitly provided in the data.

PITCHER: ${currentAthlete.name} (${currentAthlete.throws}HP, ${currentAthlete.team||'unknown team'}, ${currentAthlete.level||''})
SEASON: ${athleteOutings.length} outings, ${total} pitches, ${totalK}K, ${totalBB}BB
ZONE%: ${zonePct?.toFixed(1)||'N/A'}% | O-Swing%: ${oSwingPct?.toFixed(1)||'N/A'}% | Z-Contact%: ${zContactPct?.toFixed(1)||'N/A'}% | GB%: ${gbPct?.toFixed(1)||'N/A'}% | F-Strike%: ${fpStrikePct?.toFixed(1)||'N/A'}% | 1-1 Strike%: ${oonStrikePct?.toFixed(1)||'N/A'}% | Race to 2K: ${race2kPct?.toFixed(1)||'N/A'}% | Putaway%: ${putawayPct?.toFixed(1)||'N/A'}%

NOTE: Pitches with 10 or fewer samples have been excluded as likely mistagged. Only analyze the pitches listed below.

ARSENAL (IVB and HB in inches — only pitches with >10 samples):
${pitchSummary.map(p => {
  const real = pm_stored[p.code] || pm_stored[p.code === 'FA' ? 'FF' : p.code === 'FF' ? 'FA' : p.code];
  const gradeStr = (real && real.psStuffPlus) ? ' | psStuff+:' + real.psStuffPlus + ' [8ctane]' : '';
  const spinStr = p.avgSpin ? ' | Spin:' + p.avgSpin + 'rpm' : '';
  const shapeStr = ' | IVB:' + (p.avgIVB||'?') + '" HB:' + (p.avgHB||'?') + '"';
  const resultsStr = ' | Whiff:' + p.whiffPct + '% (MLB avg:' + (p.mlbWhiff||'?') + '%) | xwOBA:' + (p.avgXwoba||'N/A') + ' | xBA:' + (p.avgXba||'N/A') + ' | xSLG:' + (p.avgXslg||'N/A');
  return p.pitch + ' (' + p.code + '): ' + p.count + ' pitches, ' + p.usage + '% usage | ' + (p.avgVelo||'?') + 'mph' + spinStr + shapeStr + resultsStr + gradeStr;
}).join('\n')}

8CTANE COACHING PHILOSOPHY — follow these exactly:

PRIORITY ORDER:
1. STUFF QUALITY — velo, movement shape, whiff rate. This is the primary signal for everything.
2. STRIKE THROWING — Zone%, F-Strike%, 1-1 Strike%, Race to 2K, and Putaway% are all critical. F-Strike% below 58% or 1-1 Strike% below 55% should lead concerns. Race to 2K below 45% means the pitcher is falling behind early. Putaway% below 28% means they struggle to finish when ahead.
3. RESULTS — xwOBA, xBA, xSLG as supporting context.

ARSENAL SHAPE RULES:
- Big shape fastball = IVB > 18". Big shape breaking ball = HB > 10" glove-side OR drop > 10".
- If pitcher has BOTH but NO bridging pitch (cutter/firm slider with < 6" movement), flag the gap and recommend the bridging pitch.
- ALWAYS include an MLB pitcher comp with similar arsenal and handedness — someone currently active who throws a similar mix. Make it specific and relevant.
- ONLY recommend adding a pitch if there is a clear shape gap. Stick to: cutter, sinker, slider, sweeper, changeup, splitter, curveball. NEVER suggest knuckleball, eephus, or screwball.
- Never remove a pitch based on usage alone — only on poor stuff AND poor results.

WHIFF RULES:
- 30%+ whiff = elite weapon, highlight prominently.
- Below 12% whiff with 20%+ usage = address constructively.

TONE: Lead with strengths. Name the actual pitch. Frame concerns as fixable. Speak directly to the pitcher.

Respond with JSON only (no markdown):
{
  "headline": "2-3 word headline capturing the season",
  "summary": "3-4 sentences to the pitcher — lead with strengths, address the main story",
  "pitchBlurbs": [
    {
      "pitch": "pitch name",
      "grade": "Elite / Plus / Average / Below Average / Poor — only include if psStuff+ was provided, otherwise omit this field",
      "blurb": "1-2 sentences covering what makes this pitch work or not — reference shape, velo, whiff rate, xwOBA/xBA/xSLG where relevant. Written directly to the pitcher."
    }
  ],
  "strengths": [{"title": "...", "detail": "specific and encouraging, name the pitch and what makes it work"}],
  "concerns": [{"title": "...", "detail": "honest but constructive — what needs fixing and why it's fixable"}],
  "arsenalAssessment": {
    "keepPitches": [{"pitch": "...", "reason": "why this pitch is a weapon for you"}],
    "developPitches": [{"pitch": "...", "reason": "what you can unlock with more work on this pitch"}],
    "addPitch": {"pitch": "...", "reason": "specific gap in arsenal + name MLB pitcher with similar profile and handedness who uses this pitch successfully"},
    "removePitch": {"pitch": "...", "reason": "honest explanation — only include if poor stuff AND poor results"}
  },
  "mlbComp": {
    "name": "MLB pitcher name",
    "reason": "2-3 sentences — why this pitcher is a relevant comp (similar handedness, similar arsenal shape, similar movement profiles). What can this pitcher learn from watching that comp?"
  },
  "splitAdvice": {
    "vsRHH": "2-3 sentences — specific pitch sequencing advice based on movement profiles",
    "vsLHH": "2-3 sentences — specific pitch sequencing advice based on movement profiles"
  },
  "developmentPriorities": ["most important thing to work on right now", "second priority", "third priority"]
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

  // Per-pitch blurbs
  const pitchBlurbs = (a.pitchBlurbs||[]).map(pb => {
    const match = pitchSummary.find(p => p.pitch === pb.pitch || p.code === pb.pitch);
    const dotColor = match ? pc(match.code) : '#555';
    const gradeHTML = pb.grade
      ? `<span class="pitch-blurb-grade ${pb.grade.toLowerCase().replace(' ','_')}">${pb.grade}</span>` : '';
    return `<div class="pitch-blurb-row">
      <div class="pitch-blurb-header">
        <span class="pitch-dot" style="background:${dotColor};width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:7px;flex-shrink:0"></span>
        <span class="pitch-blurb-name">${pb.pitch}</span>
        ${gradeHTML}
      </div>
      <div class="pitch-blurb-text">${pb.blurb}</div>
    </div>`;
  }).join('');

  // MLB comp
  const mlbCompHTML = a.mlbComp?.name ? `
    <div class="section-hd" style="margin-top:1.5rem">MLB Comparison</div>
    <div class="mlb-comp-card">
      <div class="mlb-comp-name">${a.mlbComp.name}</div>
      <div class="mlb-comp-reason">${a.mlbComp.reason}</div>
    </div>` : '';

  container.innerHTML = `
    <div class="insight-page">

      <div class="insight-headline">${a.headline||''}</div>
      <div class="insight-summary">${a.summary||''}</div>

      ${pitchBlurbs ? `<div class="section-hd" style="margin-top:1.5rem">Pitch Breakdown</div>
      <div class="pitch-blurbs-wrap">${pitchBlurbs}</div>` : ''}

      <div class="section-hd" style="margin-top:1.5rem">Strengths & concerns</div>
      <div class="insight-grid">${strengthCards}${concernCards}</div>

      <div class="section-hd" style="margin-top:1.5rem">Arsenal assessment</div>
      <div class="arsenal-recs">${keepPitches}${devPitches}${addPitch}${removePitch}</div>

      ${mlbCompHTML}

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

  const prompt = `You are a pitching coach at 8ctane Baseball writing directly to your pitcher after their outing. Your tone is direct, honest, and encouraging — like a coach who watched every pitch and wants to help them grow. Use "you" and "your" throughout. Be specific about what happened, what worked, and what to adjust. Speak plainly — avoid stat jargon. NEVER mention psStuff+ or any stuff grade unless it was explicitly provided in the data — do not calculate or infer it yourself.

PITCHER: ${currentAthlete.name} (${currentAthlete.throws}HP, ${currentAthlete.level||''})
OUTING: ${formatDate(outing.date)} vs. ${outing.opponent||'Unknown'} | ${total} pitches | ${outing.strikeouts||outing.ks||0}K ${outing.walks||0}BB
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

  // Build outing-level location chart
  const outingLocationChart = buildOutingLocationChart(pm, total);
  const outingSprayChart    = buildOutingSprayChart(pm);

  container.innerHTML = `
    <div class="insight-page">

      <div class="outing-insight-header">
        <div class="insight-headline">${a.headline||''}</div>
        <div class="outing-insight-meta">${formatDate(outing.date)} · vs. ${outing.opponent||'—'} · ${total} pitches · ${outing.strikeouts||outing.ks||0}K ${outing.walks||0}BB</div>
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

      ${(outingLocationChart || outingSprayChart) ? `
      <div class="section-hd" style="margin-top:1.5rem">Pitch locations</div>
      <div style="display:flex;flex-wrap:wrap;gap:1.5rem;margin-top:.75rem">
        ${outingLocationChart||''}
        ${outingSprayChart||''}
      </div>` : ''}

      <div class="section-hd" style="margin-top:1.5rem">What worked / what didn't</div>
      <div class="insight-grid">${workedCards}${didntCards}</div>

      ${a.keyMoments?.length ? `
      <div class="section-hd" style="margin-top:1.5rem">Key moments</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:.875rem 1.25rem">
        ${a.keyMoments.map(m=>`<div style="padding:.4rem 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--muted)">· ${m}</div>`).join('')}
      </div>` : ''}

      ${a.nextOutingFocus?.length ? `
      <div class="section-hd" style="margin-top:1.5rem">Focus for next outing</div>
      <div class="dev-priorities">
        ${a.nextOutingFocus.map((p,i)=>`<div class="dev-priority-row"><span class="dev-num">${i+1}</span><span>${p}</span></div>`).join('')}
      </div>` : ''}

    </div>`;
}

function buildOutingLocationChart(pm, total) {
  // Collect all locations from this outing's pitch map
  const allLocs = [];
  Object.entries(pm).forEach(([pt, s]) => {
    if (!s.locations || !s.locations.length) return;
    s.locations.forEach(loc => {
      const [x, z, outcome, stand] = loc;
      allLocs.push({ x, z, outcome, stand, pt });
    });
  });
  if (!allLocs.length) return null;

  const W = 260, H = 300, PAD = 22;
  const xMin=-1.75, xMax=1.75, zMin=0.5, zMax=5.0;
  const toSvgX = x => PAD + (x-xMin)/(xMax-xMin)*(W-PAD*2);
  const toSvgZ = z => H - PAD - (z-zMin)/(zMax-zMin)*(H-PAD*2);
  const szX1=toSvgX(-0.71), szX2=toSvgX(0.71);
  const szZ1=toSvgZ(3.5),   szZ2=toSvgZ(1.5);

  const OUTCOME_COLORS = { W:'#e91e8c', CS:'#00d4ff', HIP:'#BA7517', F:'#534AB7', B:'rgba(255,255,255,0.15)' };

  // Sort: balls behind, whiffs on top
  const priority = { B:0, F:1, HIP:2, CS:3, W:4 };
  const sorted = [...allLocs].sort((a,b)=>(priority[a.outcome]||0)-(priority[b.outcome]||0));

  const dots = sorted.map(({ x, z, outcome, pt }) => {
    const cx = toSvgX(x), cy = toSvgZ(z);
    if (cx < PAD-10 || cy < PAD-10 || cx > W+10 || cy > H+10) return '';
    const color = pc(pt);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${outcome==='W'?5:3.5}" fill="${color}" fill-opacity="0.75" stroke="${outcome==='W'?'#fff':color}" stroke-width="${outcome==='W'?0.8:0.3}"/>`;
  }).join('');

  // Pitch legend
  const ptCounts = {};
  allLocs.forEach(({pt}) => ptCounts[pt]=(ptCounts[pt]||0)+1);
  const legend = Object.entries(ptCounts).sort((a,b)=>b[1]-a[1])
    .map(([pt,n])=>`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;font-size:10px;color:var(--muted)"><span style="width:8px;height:8px;border-radius:50%;background:${pc(pt)};display:inline-block"></span>${pn(pt)}</span>`).join('');

  return `<div class="loc-zone-card">
    <div class="loc-zone-title">Locations <span style="font-size:11px;color:var(--muted);font-weight:400">${allLocs.length} pitches</span></div>
    <svg width="${W}" height="${H}" style="display:block">
      <rect x="${PAD}" y="${PAD}" width="${W-PAD*2}" height="${H-PAD*2}" fill="rgba(255,255,255,0.02)" rx="2"/>
      <rect x="${szX1}" y="${szZ1}" width="${szX2-szX1}" height="${szZ2-szZ1}" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" rx="1"/>
      ${[1,2].map(i=>`<line x1="${szX1+(szX2-szX1)/3*i}" y1="${szZ1}" x2="${szX1+(szX2-szX1)/3*i}" y2="${szZ2}" stroke="rgba(255,255,255,0.12)" stroke-width="0.75"/>`).join('')}
      ${[1,2].map(i=>`<line x1="${szX1}" y1="${szZ1+(szZ2-szZ1)/3*i}" x2="${szX2}" y2="${szZ1+(szZ2-szZ1)/3*i}" stroke="rgba(255,255,255,0.12)" stroke-width="0.75"/>`).join('')}
      <rect x="${toSvgX(-1.05)}" y="${toSvgZ(4.0)}" width="${toSvgX(1.05)-toSvgX(-1.05)}" height="${toSvgZ(1.0)-toSvgZ(4.0)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="4,3" rx="2"/>
      <polygon points="${toSvgX(0)},${H-PAD+4} ${toSvgX(-0.28)},${H-PAD-4} ${toSvgX(-0.28)},${H-PAD} ${toSvgX(0.28)},${H-PAD} ${toSvgX(0.28)},${H-PAD-4}" fill="rgba(255,255,255,0.25)"/>
      <text x="${W/2}" y="${H-2}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.2)">← Inside · Outside →</text>
      ${dots}
    </svg>
    <div style="margin-top:6px;line-height:1.8">${legend}</div>
    <div style="font-size:10px;color:var(--muted2);margin-top:2px">White outline = whiff</div>
  </div>`;
}

function buildOutingSprayChart(pm) {
  const sprayData = [];
  Object.entries(pm).forEach(([pt, s]) => {
    if (!s.spray || !s.spray.length) return;
    s.spray.forEach(sp => {
      const [x, y, bbt, ev] = sp;
      sprayData.push({ x, y, bbt, ev, pt });
    });
  });
  if (!sprayData.length) return null;

  const W=280, H=265;
  const BB_COLORS = { ground_ball:'#BA7517', line_drive:'#00d4ff', fly_ball:'#e91e8c', popup:'#888780' };
  const BB_LABELS  = { ground_ball:'Ground Ball', line_drive:'Line Drive', fly_ball:'Fly Ball', popup:'Popup' };
  const HX_CENTER=125, HY_HOME=205, SCALE=1.0;
  const cx=W/2, homY=H-18;
  const lfX=25, lfY=50, rfX=W-25, rfY=50, cfX=cx, cfY=5;

  const toX = hcx => W/2+(hcx-HX_CENTER)*SCALE;
  const toY = hcy => H-20-(HY_HOME-hcy)*SCALE;

  const dots = sprayData.map(({x,y,bbt,ev,pt})=>{
    const svgX=toX(x), svgY=toY(y);
    if(svgX<0||svgY<-10||svgX>W||svgY>H) return '';
    const color = BB_COLORS[bbt]||'#888';
    const hard = ev&&ev>=95;
    return `<circle cx="${svgX.toFixed(1)}" cy="${svgY.toFixed(1)}" r="${hard?6:4.5}" fill="${color}" fill-opacity="0.8" stroke="${hard?'rgba(255,255,255,0.8)':'none'}" stroke-width="${hard?1:0}"/>`;
  }).join('');

  const legend = Object.entries(BB_COLORS).map(([k,c])=>
    `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;font-size:10px;color:var(--muted)"><span style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block"></span>${BB_LABELS[k]}</span>`
  ).join('');

  return `<div class="loc-zone-card">
    <div class="loc-zone-title">Spray Chart <span style="font-size:11px;color:var(--muted);font-weight:400">${sprayData.length} batted balls</span></div>
    <svg width="${W}" height="${H}" style="display:block">
      <path d="M ${cx} ${homY} L ${lfX} ${lfY} Q ${cfX} ${cfY-5} ${rfX} ${rfY} Z" fill="rgba(255,255,255,0.02)" stroke="none"/>
      <path d="M ${lfX} ${lfY} Q ${cfX} ${cfY-5} ${rfX} ${rfY}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
      <line x1="${cx}" y1="${homY}" x2="${lfX-8}" y2="${lfY-12}" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
      <line x1="${cx}" y1="${homY}" x2="${rfX+8}" y2="${rfY-12}" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${homY-60}" r="46" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="3,3"/>
      <rect x="${cx-5}" y="${homY-115-5}" width="10" height="10" fill="rgba(255,255,255,0.2)" transform="rotate(45,${cx},${homY-115})" rx="1"/>
      <rect x="${cx-58-5}" y="${homY-58-5}" width="10" height="10" fill="rgba(255,255,255,0.2)" transform="rotate(45,${cx-58},${homY-58})" rx="1"/>
      <rect x="${cx+58-5}" y="${homY-58-5}" width="10" height="10" fill="rgba(255,255,255,0.2)" transform="rotate(45,${cx+58},${homY-58})" rx="1"/>
      <polygon points="${cx},${homY-3} ${cx-7},${homY-9} ${cx-7},${homY+2} ${cx+7},${homY+2} ${cx+7},${homY-9}" fill="rgba(255,255,255,0.3)"/>
      ${dots}
    </svg>
    <div style="margin-top:6px;line-height:1.8">${legend}</div>
    <div style="font-size:10px;color:var(--muted2);margin-top:2px">White outline = hard hit (95+ mph)</div>
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
        swingVals=[], strikeVals=[], gbVals=[], fbVals=[], ldVals=[],
        fpVals=[], oonVals=[], race2kVals=[], putawayVals=[];

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
    if (pf(o.fp_strike_pct))  fpVals.push(pf(o.fp_strike_pct));
    if (pf(o.oon_strike_pct)) oonVals.push(pf(o.oon_strike_pct));
    if (pf(o.race2k_pct))     race2kVals.push(pf(o.race2k_pct));
    if (pf(o.putaway_pct))    putawayVals.push(pf(o.putaway_pct));
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
  const fpStrikePct  = fpVals.length      ? avg(fpVals)      : null;
  const oonStrikePct = oonVals.length     ? avg(oonVals)     : null;
  const race2kPct    = race2kVals.length  ? avg(race2kVals)  : null;
  const putawayPct   = putawayVals.length ? avg(putawayVals) : null;

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
    fpStrikePct:  { p10:52, p25:57,  p50:62,  p75:67,  p90:72,  hib:true  },
    oonStrikePct: { p10:50, p25:55,  p50:60,  p75:65,  p90:70,  hib:true  },
    race2kPct:    { p10:40, p25:47,  p50:54,  p75:61,  p90:68,  hib:true  },
    putawayPct:   { p10:22, p25:28,  p50:34,  p75:40,  p90:48,  hib:true  },
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
      ${zonePct     !== null     ? pctBar('Zone%',         zonePct,      r(zonePct),      DIST.zonePct,     '%') : ''}
      ${oSwingPct   !== null     ? pctBar('O-Swing%',      oSwingPct,    r(oSwingPct),    DIST.oSwingPct,   '%') : ''}
      ${zSwingPct   !== null     ? pctBar('Z-Swing%',      zSwingPct,    r(zSwingPct),    DIST.zSwingPct,   '%') : ''}
      ${zContactPct !== null     ? pctBar('Z-Contact%',    zContactPct,  r(zContactPct),  DIST.zContactPct, '%') : ''}
      ${swingPct    !== null     ? pctBar('Swing%',        swingPct,     r(swingPct),     DIST.swingPct,    '%') : ''}
      ${strikePct   !== null     ? pctBar('Strike%',       strikePct,    r(strikePct),    DIST.strikePct,   '%') : ''}
      ${fpStrikePct !== null     ? pctBar('F-Strike%',     fpStrikePct,  r(fpStrikePct),  DIST.fpStrikePct, '%') : ''}
      ${oonStrikePct!== null     ? pctBar('1-1 Strike%',   oonStrikePct, r(oonStrikePct), DIST.oonStrikePct,'%') : ''}
      ${race2kPct   !== null     ? pctBar('Race to 2K',    race2kPct,    r(race2kPct),    DIST.race2kPct,   '%') : ''}
      ${putawayPct  !== null     ? pctBar('Putaway%',      putawayPct,   r(putawayPct),   DIST.putawayPct,  '%') : ''}

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

/* ==================== LOCATIONS ==================== */
let locationHand = 'all';
let locationColor = 'pitch';

function setLocationHand(hand, btn) {
  locationHand = hand;
  document.querySelectorAll('[data-hand]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLocations();
}

function setLocationColor(color, btn) {
  locationColor = color;
  document.querySelectorAll('[data-color]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLocations();
}

function renderLocations() {
  const container = document.getElementById('locations-content');
  if (!athleteOutings.length) { container.innerHTML = '<div class="empty-state">No outing data yet.</div>'; return; }

  // Aggregate locations per pitch type
  const pitchLocs = {};
  const allSpray = [];

  athleteOutings.forEach(o => {
    let pm = {};
    try { pm = typeof o.pitch_stats==='object' ? o.pitch_stats : JSON.parse(o.pitch_stats_json||'{}'); } catch(e){}
    Object.entries(pm).forEach(([pt, s]) => {
      if (s.locations && s.locations.length) {
        if (!pitchLocs[pt]) pitchLocs[pt] = [];
        s.locations.forEach(loc => {
          const [x, z, outcome, stand] = loc;
          if (locationHand === 'all' || stand === locationHand) pitchLocs[pt].push({ x, z, outcome, stand });
        });
      }
      if (s.spray && s.spray.length) {
        s.spray.forEach(sp => {
          const [x, y, bbt, ev, stand] = sp;
          if (locationHand === 'all' || stand === locationHand) allSpray.push({ x, y, bbt, ev, pt });
        });
      }
    });
  });

  const hasLocations = Object.values(pitchLocs).some(l => l.length > 0);
  const hasSpray     = allSpray.length > 0;

  if (!hasLocations && !hasSpray) {
    container.innerHTML = '<div class="empty-state">No pitch location data available. Re-import your outings using Bulk Import to capture locations.</div>';
    return;
  }

  const OUTCOME_COLORS = { W:'#e91e8c', CS:'#00d4ff', HIP:'#BA7517', F:'#534AB7', B:'rgba(255,255,255,0.15)' };
  const OUTCOME_LABELS = { W:'Whiff', CS:'Called Strike', HIP:'In Play', F:'Foul', B:'Ball' };

  // ---- Combined pitch location chart ----
  const W = 280, H = 320, PAD = 24;
  const xMin=-1.75, xMax=1.75, zMin=0.5, zMax=5.0;
  const toSvgX = x => PAD + (x - xMin) / (xMax - xMin) * (W - PAD*2);
  const toSvgZ = z => H - PAD - (z - zMin) / (zMax - zMin) * (H - PAD*2);
  const szX1 = toSvgX(-0.71), szX2 = toSvgX(0.71);
  const szZ1 = toSvgZ(3.5),   szZ2 = toSvgZ(1.5);

  // Collect all dots — draw balls first, then strikes, then whiffs on top
  const allDots = [];
  Object.entries(pitchLocs).forEach(([pt, locs]) => {
    locs.forEach(({ x, z, outcome }) => {
      const cx = toSvgX(x), cy = toSvgZ(z);
      if (cx < PAD-10 || cy < PAD-10 || cx > W+10 || cy > H+10) return;
      const color = locationColor === 'pitch' ? pc(pt) : (OUTCOME_COLORS[outcome] || '#444');
      const priority = outcome === 'W' ? 3 : outcome === 'CS' ? 2 : outcome === 'HIP' ? 1 : 0;
      allDots.push({ cx, cy, color, priority, pt, outcome });
    });
  });
  allDots.sort((a,b) => a.priority - b.priority);

  const dots = allDots.map(({ cx, cy, color, outcome }) =>
    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${outcome==='W'?5:4}" fill="${color}" fill-opacity="0.75" stroke="${color}" stroke-width="0.5"/>`
  ).join('');

  // Pitch type legend
  const pitchLegend = Object.entries(pitchLocs).filter(([,l])=>l.length>0).sort((a,b)=>b[1].length-a[1].length)
    .map(([pt, locs]) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:11px;color:var(--muted)"><span style="width:9px;height:9px;border-radius:50%;background:${pc(pt)};display:inline-block"></span>${pn(pt)} <span style="color:var(--muted2)">${locs.length}</span></span>`).join('');

  const outcomeLegend = Object.entries(OUTCOME_COLORS).map(([k,c]) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:11px;color:var(--muted)"><span style="width:9px;height:9px;border-radius:50%;background:${c};display:inline-block"></span>${OUTCOME_LABELS[k]}</span>`
  ).join('');

  const totalLocs = Object.values(pitchLocs).reduce((a,l)=>a+l.length, 0);

  const locationChart = `<div class="loc-zone-card">
    <div class="loc-zone-title">Pitch Locations <span style="font-size:11px;color:var(--muted);font-weight:400">${totalLocs} pitches</span></div>
    <svg width="${W}" height="${H}" style="display:block">
      <!-- background -->
      <rect x="${PAD}" y="${PAD}" width="${W-PAD*2}" height="${H-PAD*2}" fill="rgba(255,255,255,0.02)" rx="2"/>
      <!-- strike zone -->
      <rect x="${szX1}" y="${szZ1}" width="${szX2-szX1}" height="${szZ2-szZ1}" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" rx="1"/>
      <!-- 9-zone grid -->
      ${[1,2].map(i=>`<line x1="${szX1+(szX2-szX1)/3*i}" y1="${szZ1}" x2="${szX1+(szX2-szX1)/3*i}" y2="${szZ2}" stroke="rgba(255,255,255,0.12)" stroke-width="0.75"/>`).join('')}
      ${[1,2].map(i=>`<line x1="${szX1}" y1="${szZ1+(szZ2-szZ1)/3*i}" x2="${szX2}" y2="${szZ1+(szZ2-szZ1)/3*i}" stroke="rgba(255,255,255,0.12)" stroke-width="0.75"/>`).join('')}
      <!-- shadow zone (chase zone) dashed border -->
      <rect x="${toSvgX(-1.05)}" y="${toSvgZ(4.0)}" width="${toSvgX(1.05)-toSvgX(-1.05)}" height="${toSvgZ(1.0)-toSvgZ(4.0)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="4,3" rx="2"/>
      <!-- home plate -->
      <polygon points="${toSvgX(0)},${H-PAD+4} ${toSvgX(-0.28)},${H-PAD-4} ${toSvgX(-0.28)},${H-PAD} ${toSvgX(0.28)},${H-PAD} ${toSvgX(0.28)},${H-PAD-4}" fill="rgba(255,255,255,0.25)"/>
      <!-- axis labels -->
      <text x="${W/2}" y="${H-2}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.25)">← Inside · Outside →</text>
      ${dots}
    </svg>
    <div style="margin-top:8px;line-height:2">${locationColor==='pitch' ? pitchLegend : outcomeLegend}</div>
  </div>`;

  // ---- Spray chart ----
  const sprayChart = hasSpray ? buildSprayChart(allSpray) : '';

  container.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:1.5rem">${locationChart}${sprayChart}</div>`;
}

function buildSprayChart(sprayData) {
  const W = 340, H = 320;

  // Statcast coords: hc_x ~26-205 (left to right), hc_y ~45-180 (LOW=outfield, HIGH=home)
  // SVG: we want home plate near bottom (large SVG Y), outfield near top (small SVG Y)
  // So: svgY = map(hc_y) such that hc_y=180 -> svgY=H-20, hc_y=45 -> svgY=20

  const HX_CENTER = 125;
  const HY_HOME_REF = 205;  // reference home plate hc_y (extrapolated)
  const HY_CF_REF   = 30;   // reference CF hc_y

  const SVG_HOME_Y = H - 22;
  const SVG_CF_Y   = 18;
  const SVG_CX     = W / 2;

  const scaleY = (SVG_HOME_Y - SVG_CF_Y) / (HY_HOME_REF - HY_CF_REF);
  const scaleX = scaleY * 1.02;

  const toX = hcx => SVG_CX + (hcx - HX_CENTER) * scaleX;
  const toY = hcy => SVG_HOME_Y - (hcy - HY_CF_REF) * scaleY; // hc_y high -> svgY high (bottom)

  // Key SVG points
  const hpX = SVG_CX, hpY = SVG_HOME_Y;
  const cfX = SVG_CX, cfY = SVG_CF_Y;

  // Foul lines: 45 degrees from home, hc_x ~25 is LF line, ~205 is RF line
  const lfFenceX = toX(28),  lfFenceY = toY(55);
  const rfFenceX = toX(222), rfFenceY = toY(55);

  // Foul line extension beyond fence
  const lfFoulX = toX(10),  lfFoulY = toY(40);
  const rfFoulX = toX(240), rfFoulY = toY(40);

  // Bases
  const b2X = hpX,       b2Y = toY(HY_HOME_REF - 127);
  const b1X = hpX + 73,  b1Y = toY(HY_HOME_REF - 63);
  const b3X = hpX - 73,  b3Y = toY(HY_HOME_REF - 63);

  const BB_COLORS = { ground_ball:'#c13584', line_drive:'#f0d44a', fly_ball:'#4a9e4a', popup:'#e05c2a' };
  const BB_LABELS = { ground_ball:'Ground Ball', line_drive:'Line Drive', fly_ball:'Fly Ball', popup:'Popup' };

  const ptCounts = {};
  sprayData.forEach(({pt}) => ptCounts[pt] = (ptCounts[pt]||0)+1);

  // Only plot balls that landed in fair territory (between foul lines, not too far)
  const dots = sprayData.map(({ x, y, bbt, ev, pt }) => {
    const svgX = toX(x), svgY = toY(y);
    if (svgX < 5 || svgY < 5 || svgX > W-5 || svgY > H) return '';
    const color = locationColor === 'pitch' ? pc(pt) : (BB_COLORS[bbt] || '#888');
    const hard = ev && ev >= 95;
    return `<circle cx="${svgX.toFixed(1)}" cy="${svgY.toFixed(1)}" r="${hard?6:4.5}" fill="${color}" fill-opacity="0.9" stroke="${hard?'#fff':'rgba(0,0,0,0.4)'}" stroke-width="${hard?1.5:0.5}"/>`;
  }).join('');

  const pitchLegend = Object.entries(ptCounts).sort((a,b)=>b[1]-a[1])
    .map(([pt])=>`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:11px;color:var(--muted)"><span style="width:9px;height:9px;border-radius:50%;background:${pc(pt)};display:inline-block"></span>${pn(pt)}</span>`).join('');
  const outcomeLegend = Object.entries(BB_COLORS)
    .map(([k,c])=>`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:11px;color:var(--muted)"><span style="width:9px;height:9px;border-radius:50%;background:${c};display:inline-block"></span>${BB_LABELS[k]}</span>`).join('');
  const legend = locationColor === 'pitch' ? pitchLegend : outcomeLegend;

  return `<div class="loc-zone-card">
    <div class="loc-zone-title">Spray Chart <span style="font-size:11px;color:var(--muted);font-weight:400">${sprayData.length} batted balls</span></div>
    <svg width="${W}" height="${H}" style="display:block">
      <!-- Warning track (tan arc outside fence) -->
      <path d="M ${lfFoulX-5} ${lfFoulY} Q ${cfX} ${cfY-22} ${rfFoulX+5} ${rfFoulY} L ${rfFenceX} ${rfFenceY} Q ${cfX} ${cfY+12} ${lfFenceX} ${lfFenceY} Z" fill="rgba(120,85,35,0.5)"/>
      <!-- Outfield grass -->
      <path d="M ${hpX} ${hpY} L ${lfFenceX} ${lfFenceY} Q ${cfX} ${cfY+10} ${rfFenceX} ${rfFenceY} Z" fill="rgba(38,75,38,0.7)"/>
      <!-- Outfield fence arc -->
      <path d="M ${lfFenceX} ${lfFenceY} Q ${cfX} ${cfY+8} ${rfFenceX} ${rfFenceY}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2.5"/>
      <!-- Foul lines -->
      <line x1="${hpX}" y1="${hpY}" x2="${lfFoulX}" y2="${lfFoulY}" stroke="rgba(255,255,255,0.55)" stroke-width="1.5"/>
      <line x1="${hpX}" y1="${hpY}" x2="${rfFoulX}" y2="${rfFoulY}" stroke="rgba(255,255,255,0.55)" stroke-width="1.5"/>
      <!-- Infield dirt -->
      <path d="M ${hpX} ${hpY} L ${b1X+22} ${b1Y+12} L ${b2X} ${b2Y-10} L ${b3X-22} ${b3Y+12} Z" fill="rgba(140,95,40,0.45)"/>
      <!-- Infield grass -->
      <polygon points="${hpX},${hpY} ${b1X},${b1Y} ${b2X},${b2Y} ${b3X},${b3Y}" fill="rgba(38,75,38,0.8)"/>
      <!-- Base paths -->
      <line x1="${hpX}" y1="${hpY}" x2="${b1X}" y2="${b1Y}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <line x1="${b1X}" y1="${b1Y}" x2="${b2X}" y2="${b2Y}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <line x1="${b2X}" y1="${b2Y}" x2="${b3X}" y2="${b3Y}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <line x1="${b3X}" y1="${b3Y}" x2="${hpX}" y2="${hpY}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <!-- Pitcher mound -->
      <ellipse cx="${hpX}" cy="${(hpY+b2Y)/2+8}" rx="9" ry="7" fill="rgba(140,95,40,0.6)"/>
      <!-- Bases -->
      <rect x="${b2X-5}" y="${b2Y-5}" width="10" height="10" fill="rgba(240,240,220,0.85)" transform="rotate(45,${b2X},${b2Y})" rx="1"/>
      <rect x="${b1X-5}" y="${b1Y-5}" width="10" height="10" fill="rgba(240,240,220,0.85)" transform="rotate(45,${b1X},${b1Y})" rx="1"/>
      <rect x="${b3X-5}" y="${b3Y-5}" width="10" height="10" fill="rgba(240,240,220,0.85)" transform="rotate(45,${b3X},${b3Y})" rx="1"/>
      <!-- Home plate -->
      <polygon points="${hpX},${hpY-5} ${hpX-8},${hpY-12} ${hpX-8},${hpY+4} ${hpX+8},${hpY+4} ${hpX+8},${hpY-12}" fill="rgba(240,240,220,0.85)"/>
      ${dots}
    </svg>
    <div style="margin-top:8px;line-height:2">${legend}</div>
    <div style="font-size:10px;color:var(--muted2);margin-top:2px">White outline = hard hit (95+ mph EV)</div>
  </div>`;
}

/* ==================== SPLITS ==================== */
function renderSplits() {
  const container = document.getElementById('splits-content');
  if (!athleteOutings.length) {
    container.innerHTML = '<div class="empty-state">No outing data yet.</div>';
    return;
  }

  // Aggregate combined pitch map across all outings
  const combined = {};
  athleteOutings.forEach(o => {
    let pm = {};
    try { pm = typeof o.pitch_stats==='object' ? o.pitch_stats : JSON.parse(o.pitch_stats_json||'{}'); } catch(e){}
    Object.entries(pm).forEach(([pt, s]) => {
      if (!s.count) return;
      if (!combined[pt]) combined[pt] = {
        count:0, whiffs:0, cstrikes:0, hip:0, velos:[], xbas:[], xslgs:[], launch_speeds:[], hard_hits:0, gb:0, fb:0, ld:0, bip:0, totalStrikes:0,
        lhh:{ count:0, whiffs:0, cstrikes:0, hip:0, velos:[], xbas:[], xslgs:[], launch_speeds:[], hard_hits:0, gb:0, fb:0, ld:0, bip:0, totalStrikes:0 },
        rhh:{ count:0, whiffs:0, cstrikes:0, hip:0, velos:[], xbas:[], xslgs:[], launch_speeds:[], hard_hits:0, gb:0, fb:0, ld:0, bip:0, totalStrikes:0 },
      };
      const c = combined[pt];
      c.count += s.count||0; c.whiffs += s.whiffs||0; c.cstrikes += s.cstrikes||0; c.hip += s.hip||0;
      if (s.avgVelo) c.velos.push(pf(s.avgVelo));
      if (s.avgXba)  c.xbas.push(pf(s.avgXba));
      if (s.avgXslg) c.xslgs.push(pf(s.avgXslg));
      if (s.avgEV)   c.launch_speeds.push(pf(s.avgEV));

      // Accumulate split data
      ['lhh','rhh'].forEach(hand => {
        const src = s[hand]; if (!src || !src.count) return;
        const dst = c[hand];
        dst.count    += src.count    ||0;
        dst.whiffs   += src.whiffs   ||0;
        dst.cstrikes += src.cstrikes ||0;
        dst.hip      += src.hip      ||0;
        dst.gb       += src.gb       ||0;
        dst.fb       += src.fb       ||0;
        dst.ld       += src.ld       ||0;
        dst.bip      += src.bip      ||0;
        dst.totalStrikes += src.totalStrikes||0;
        if (src.avgVelo) dst.velos.push(pf(src.avgVelo));
        if (src.avgXba)  dst.xbas.push(pf(src.avgXba));
        if (src.avgXslg) dst.xslgs.push(pf(src.avgXslg));
        if (src.avgEV)   dst.launch_speeds.push(pf(src.avgEV));
      });
    });
  });

  const totalPitches = Object.values(combined).reduce((a,s)=>a+s.count, 0);
  const sorted = Object.entries(combined).sort((a,b)=>b[1].count-a[1].count);
  const noData = !sorted.some(([,s])=>s.lhh.count>0||s.rhh.count>0);

  function buildTable(title, getStats, accentColor) {
    const headers = ['Pitch','Total','Avg Velo','Strike%','Whiff%','xBA','xSLG','xOPS','GB%','FB%','LD%'];
    const rows = sorted.map(([pt, s]) => {
      const st = getStats(s);
      if (!st || !st.count) return '';
      const avgV = st.velos.length ? avg(st.velos).toFixed(1) : '—';
      const strikePct = st.count ? (st.totalStrikes/st.count*100).toFixed(1)+'%' : '—';
      const whiffPct  = st.count ? (st.whiffs/st.count*100).toFixed(1)+'%' : '—';
      const xba  = st.xbas.length  ? avg(st.xbas).toFixed(3)  : '—';
      const xslg = st.xslgs.length ? avg(st.xslgs).toFixed(3) : '—';
      const xops = (st.xbas.length&&st.xslgs.length) ? (avg(st.xbas)+avg(st.xslgs)).toFixed(3) : '—';
      const gb   = st.bip ? (st.gb/st.bip*100).toFixed(1)+'%' : '—';
      const fb   = st.bip ? (st.fb/st.bip*100).toFixed(1)+'%' : '—';
      const ld   = st.bip ? (st.ld/st.bip*100).toFixed(1)+'%' : '—';
      const wCls = parseFloat(whiffPct)>=30?'v-good':parseFloat(whiffPct)>=15?'':'v-bad';
      return `<tr>
        <td><span class="pitch-chip"><span class="pitch-dot" style="background:${pc(pt)}"></span>${pn(pt)}</span></td>
        <td class="v-num">${st.count}</td>
        <td class="v-num">${avgV}</td>
        <td class="v-num">${strikePct}</td>
        <td class="${wCls}">${whiffPct}</td>
        <td class="v-num">${xba}</td>
        <td class="v-num">${xslg}</td>
        <td class="v-num">${xops}</td>
        <td class="v-num">${gb}</td>
        <td class="v-num">${fb}</td>
        <td class="v-num">${ld}</td>
      </tr>`;
    }).join('');

    return `<div class="splits-table-wrap" style="margin-bottom:2rem">
      <div class="splits-table-header" style="background:${accentColor}">
        <span>${title}</span>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows||'<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:1rem">No data</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  }

  if (noData) {
    container.innerHTML = `
      ${buildTable('Overall — Pitch Performance', s=>s, '#1a3a5c')}
      <div class="empty-state" style="margin-top:1rem">
        L/R split data is only available for outings imported via the Bulk Import tool from Statcast CSVs. Re-import your outings to see splits.
      </div>`;
    return;
  }

  container.innerHTML =
    buildTable('Overall — Pitch Performance', s => ({
      count:s.count, whiffs:s.whiffs, cstrikes:s.cstrikes, hip:s.hip,
      velos:s.velos, xbas:s.xbas, xslgs:s.xslgs, launch_speeds:s.launch_speeds,
      totalStrikes:s.totalStrikes||0, gb:s.gb||0, fb:s.fb||0, ld:s.ld||0, bip:s.bip||0,
    }), '#1a3a5c') +
    buildTable('vs. RHB — Pitch Performance', s => s.rhh, '#3a1a1a') +
    buildTable('vs. LHB — Pitch Performance', s => s.lhh, '#1a2a1a');
}

/* ==================== YEAR-OVER-YEAR ==================== */
// Hardcoded psStuff+ data per athlete (from 8ctane analytics)
// Update these periodically — every 2-3 weeks or after a significant stretch of starts
const PSSTUFF_DATA = {
  'ryan weiss': {
    lastUpdated: 'May 21, 2026',
    metrics: {
      SI: { psStuffPlus:92,  spinRate:2189, armSide:14.46,  vertical:10.47,  xwOBA:.334, xSLG:.427, xBA:.305, whiffPct:10.80, hardHitPct:29.41  },
      FF: { psStuffPlus:117, spinRate:2332, armSide:7.01,   vertical:17.17,  xwOBA:.398, xSLG:.582, xBA:.346, whiffPct:9.10,  hardHitPct:66.67  },
      FA: { psStuffPlus:117, spinRate:2332, armSide:7.01,   vertical:17.17,  xwOBA:.398, xSLG:.582, xBA:.346, whiffPct:9.10,  hardHitPct:66.67  },
      ST: { psStuffPlus:104, spinRate:2473, armSide:-13.54, vertical:2.10,   xwOBA:.387, xSLG:.324, xBA:.278, whiffPct:23.50, hardHitPct:0.00   },
      CH: { psStuffPlus:105, spinRate:1151, armSide:11.60,  vertical:1.87,   xwOBA:.213, xSLG:.058, xBA:.051, whiffPct:44.40, hardHitPct:100.00 },
      CU: { psStuffPlus:81,  spinRate:2244, armSide:-7.91,  vertical:-11.70, xwOBA:.235, xSLG:.077, xBA:.076, whiffPct:60.00, hardHitPct:0.00   },
    }
  },
  'sam highfill': {
    lastUpdated: 'May 21, 2026',
    metrics: {
      FF: { spinRate:2256, armSide:10.8, vertical:15.9, whiffPct:9.5  },
      FA: { spinRate:2256, armSide:10.8, vertical:15.9, whiffPct:9.5  },
      SL: { spinRate:2346, armSide:5.8,  vertical:-2.2, whiffPct:31.8 },
      SW: { spinRate:2087, armSide:-11.7,vertical:-9.5, whiffPct:33.3 },
      CH: { spinRate:1564, armSide:11.9, vertical:10.7, whiffPct:30.8 },
    }
  }
};

function renderPsStuffCards() {
  const section = document.getElementById('metrics-psstuff-section');
  const container = document.getElementById('metrics-psstuff-cards');
  if (!section || !container) return;

  // Use stored data from Sheets, or fall back to hardcoded data
  let pm = currentAthlete.pitch_metrics || {};
  let lastUpdated = null;
  let source = 'stored';

  if (!Object.keys(pm).length) {
    const key = (currentAthlete.name || '').toLowerCase();
    const hardcoded = PSSTUFF_DATA[key];
    if (hardcoded) {
      pm = hardcoded.metrics;
      lastUpdated = hardcoded.lastUpdated;
      source = 'hardcoded';
    }
  }

  const entries = Object.entries(pm).filter(([,m]) => m && m.psStuffPlus);
  if (!entries.length) { section.style.display = 'none'; return; }

  section.style.display = '';

  // Only show columns where at least one pitch has data
  const allCols = [
    { label:'psStuff+',  key:'psStuffPlus' },
    { label:'Spin',      key:'spinRate'    },
    { label:'Arm Side',  key:'armSide'     },
    { label:'Vertical',  key:'vertical'    },
    { label:'xwOBA',     key:'xwOBA'       },
    { label:'xSLG',      key:'xSLG'        },
    { label:'xBA',       key:'xBA'         },
    { label:'Whiff%',    key:'whiffPct'    },
    { label:'HardHit%',  key:'hardHitPct'  },
  ];
  const activeCols = allCols.filter(c => entries.some(([,m]) => m[c.key] !== undefined && m[c.key] !== null && m[c.key] !== ''));

  const updatedNote = lastUpdated
    ? `<div style="font-size:11px;color:var(--muted);margin-bottom:.75rem;font-family:'DM Mono',monospace">
        Last updated: ${lastUpdated} &nbsp;·&nbsp; <span style="color:var(--warn)">Update every 2-3 weeks or after a significant stretch of starts</span>
       </div>`
    : '';

  const header = `<div class="mov-header-row">
    <div class="mov-header-label">Pitch</div>
    <div class="mov-header-stats">${activeCols.map(c=>`<div class="mov-header-stat">${c.label}</div>`).join('')}</div>
  </div>`;

  const rows = entries.sort((a,b) => {
    const pa = EDITABLE_PITCH_TYPES.findIndex(p=>p.code===a[0]);
    const pb = EDITABLE_PITCH_TYPES.findIndex(p=>p.code===b[0]);
    return (pa===-1?99:pa) - (pb===-1?99:pb);
  }).map(([pt, m]) => {
    const vals = activeCols.map(c => {
      const v = m[c.key];
      if (v === undefined || v === null || v === '') return '<span class="v-num">—</span>';
      if (c.key === 'psStuffPlus') {
        const cls = v >= 110 ? 'v-good' : v >= 95 ? 'v-num' : 'v-bad';
        return `<span class="${cls}">${v}</span>`;
      }
      return `<span class="v-num">${v}</span>`;
    });
    return `<div class="mov-pitch-row">
      <div class="mov-pitch-label">
        <span class="pitch-dot" style="background:${pc(pt)};width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:8px;flex-shrink:0"></span>
        <span class="mov-pitch-name">${pn(pt)}</span>
      </div>
      <div class="mov-stat-group">${vals.map(v=>`<div class="mov-stat"><div class="mov-stat-val">${v}</div></div>`).join('')}</div>
    </div>`;
  }).join('');

  container.innerHTML = updatedNote + header + rows;
}

function renderYoY() {
  if (!athleteOutings.length) {
    document.getElementById('yoy-empty').style.display = '';
    return;
  }
  document.getElementById('yoy-empty').style.display = 'none';

  // Render psStuff+ cards if data exists
  renderPsStuffCards();
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
      <div class="mov-header-stat">Spin</div>
      <div class="mov-header-stat">IVB</div>
      <div class="mov-header-stat">HB</div>
      <div class="mov-header-stat">VAA</div>
      <div class="mov-header-stat">HAA</div>
    </div>
  </div>`;

  const shapeRows = sorted.map(([pt, s]) => {
    const avgV  = s.velos.length    ? avg(s.velos).toFixed(1)    : '—';
    const pkV   = s.peakVelos.length? Math.max(...s.peakVelos).toFixed(1) : '—';
    // Get spin from stored outings pitch_stats
    const spinVals = athleteOutings.map(o => {
      let pm = {};
      try { pm = typeof o.pitch_stats==='object' ? o.pitch_stats : JSON.parse(o.pitch_stats_json||'{}'); } catch(e){}
      return pm[pt]?.avgSpin ? pf(pm[pt].avgSpin) : null;
    }).filter(Boolean);
    const spin  = spinVals.length   ? Math.round(avg(spinVals))+'rpm' : '—';
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
        <div class="mov-stat"><div class="mov-stat-val">${spin}</div></div>
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
