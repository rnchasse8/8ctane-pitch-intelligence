// =============================================
// 8CTANE BASEBALL — PITCH INTELLIGENCE
// Google Apps Script Backend
// Paste this entire file into:
// Your Google Sheet → Extensions → Apps Script
// Then deploy as a Web App (see README)
// =============================================

const SHEET_ID = '1DBLYIi4AtmdyJk5ihXR9Q-7ExTVpSE3X3o2Nh6ylcZM';
const ss = SpreadsheetApp.openById(SHEET_ID);

// ---- CORS wrapper ----
function doGet(e)  { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  let result;
  try {
    const p = e.parameter || {};
    const body = e.postData ? JSON.parse(e.postData.contents) : {};
    const action = p.action || body.action;
    switch (action) {
      case 'getAthletes':    result = getAthletes(); break;
      case 'addAthlete':     result = addAthlete(body); break;
      case 'deleteAthlete':  result = deleteAthlete(body); break;
      case 'getOutings':     result = getOutings(body.athleteId); break;
      case 'addOuting':      result = addOuting(body); break;
      case 'deleteOuting':   result = deleteOuting(body); break;
      default: result = { error: 'Unknown action: ' + action };
    }
  } catch(err) {
    result = { error: err.toString() };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- Sheet helpers ----
function getOrCreateSheet(name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1a1b1f').setFontColor('#00d4ff')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

// =============================================
// ATHLETES
// =============================================
const ATHLETE_HEADERS = ['id','name','position','throws','team','level','notes','createdAt'];

function getAthletes() {
  const sheet = getOrCreateSheet('Athletes', ATHLETE_HEADERS);
  return { athletes: sheetToObjects(sheet) };
}

function addAthlete(body) {
  const sheet = getOrCreateSheet('Athletes', ATHLETE_HEADERS);
  const id = 'ath_' + Date.now();
  const row = [
    id,
    body.name || '',
    body.position || 'P',
    body.throws || 'R',
    body.team || '',
    body.level || '',
    body.notes || '',
    new Date().toISOString()
  ];
  sheet.appendRow(row);
  // Create this athlete's outings sheet
  getOrCreateSheet('Outings_' + id, OUTING_HEADERS);
  return { success: true, id };
}

function deleteAthlete(body) {
  const sheet = getOrCreateSheet('Athletes', ATHLETE_HEADERS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === body.athleteId) {
      sheet.deleteRow(i + 1);
      // Delete outing sheet too
      const os = ss.getSheetByName('Outings_' + body.athleteId);
      if (os) ss.deleteSheet(os);
      return { success: true };
    }
  }
  return { error: 'Athlete not found' };
}

// =============================================
// OUTINGS
// =============================================
const OUTING_HEADERS = [
  'id','athleteId','date','opponent','inning_start','notes',
  'total_pitches','strikes','balls','whiffs','called_strikes',
  'walks','strikeouts',
  'pitch_stats_json',
  'ff_pct','st_pct','fs_pct','fc_pct','cu_pct','sl_pct','si_pct','ch_pct',
  'ff_velo','ff_whiff','st_whiff','fs_whiff','cu_whiff',
  'avg_ev','hard_hit_pct',
  'zone_pct','o_swing_pct','z_swing_pct','z_contact_pct','swing_pct','strike_pct','gb_pct','fb_pct','ld_pct',
  'createdAt'
];

function getOutings(athleteId) {
  if (!athleteId) return { error: 'athleteId required' };
  const sheet = getOrCreateSheet('Outings_' + athleteId, OUTING_HEADERS);
  const outings = sheetToObjects(sheet).map(o => {
    // Parse JSON blob back out
    try { o.pitch_stats = JSON.parse(o.pitch_stats_json || '{}'); } catch(e) { o.pitch_stats = {}; }
    return o;
  });
  return { outings };
}

function addOuting(body) {
  if (!body.athleteId) return { error: 'athleteId required' };
  const sheet = getOrCreateSheet('Outings_' + body.athleteId, OUTING_HEADERS);
  const s = body.stats || {};
  const pm = body.pitchMap || {};

  // Helper to get pitch stat safely
  const ps = (pt, key) => (pm[pt] && pm[pt][key] !== undefined) ? pm[pt][key] : '';
  const pct = (pt) => pm[pt] ? +(pm[pt].count / (s.total||1) * 100).toFixed(1) : 0;

  const id = 'out_' + Date.now();
  const row = [
    id,
    body.athleteId,
    body.date || '',
    body.opponent || '',
    body.inning_start || '',
    body.notes || '',
    s.total || 0,
    s.strikes || 0,
    s.balls || 0,
    s.whiffs || 0,
    s.calledStrikes || 0,
    s.walks || 0,
    s.ks || 0,
    JSON.stringify(pm),
    pct('FF'), pct('ST'), pct('FS'), pct('FC'), pct('CU'), pct('SL'), pct('SI'), pct('CH'),
    ps('FF','avgVelo'), ps('FF','whiffPct'), ps('ST','whiffPct'), ps('FS','whiffPct'), ps('CU','whiffPct'),
    s.avgEV || '',
    s.hardHitPct || '',
    s.zonePct     || '',
    s.oSwingPct   || '',
    s.zSwingPct   || '',
    s.zContactPct || '',
    s.swingPct    || '',
    s.strikePct   || '',
    s.gbPct       || '',
    s.fbPct       || '',
    s.ldPct       || '',
    new Date().toISOString()
  ];
  sheet.appendRow(row);
  return { success: true, id };
}

function deleteOuting(body) {
  if (!body.athleteId || !body.outingId) return { error: 'athleteId and outingId required' };
  const sheet = getOrCreateSheet('Outings_' + body.athleteId, OUTING_HEADERS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === body.outingId) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { error: 'Outing not found' };
}
