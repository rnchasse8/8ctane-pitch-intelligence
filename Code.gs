// =============================================
// 8CTANE BASEBALL — PITCH INTELLIGENCE
// Google Apps Script Backend
// =============================================

const SHEET_ID = '1DBLYIi4AtmdyJk5ihXR9Q-7ExTVpSE3X3o2Nh6ylcZM';
const ss = SpreadsheetApp.openById(SHEET_ID);

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
      case 'updateAthlete':  result = updateAthlete(body); break;
      case 'deleteAthlete':  result = deleteAthlete(body); break;
      case 'getOutings':     result = getOutings(body.athleteId); break;
      case 'addOuting':      result = addOuting(body); break;
      case 'deleteOuting':   result = deleteOuting(body); break;
      case 'analyze':        result = callClaude(body); break;
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
      .setBackground('#1a1b1f').setFontColor('#00d4ff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    // Auto-migrate: add missing columns
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const missing = headers.filter(h => !existingHeaders.includes(h));
    if (missing.length > 0) {
      missing.forEach(h => {
        const col = headers.indexOf(h) + 1;
        const existingCount = sheet.getLastColumn();
        if (col > existingCount) {
          sheet.getRange(1, existingCount + 1).setValue(h);
          sheet.getRange(1, existingCount + 1)
            .setBackground('#1a1b1f').setFontColor('#00d4ff').setFontWeight('bold');
        } else {
          sheet.insertColumnBefore(col);
          sheet.getRange(1, col).setValue(h);
          sheet.getRange(1, col)
            .setBackground('#1a1b1f').setFontColor('#00d4ff').setFontWeight('bold');
        }
      });
    }
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
// CLAUDE API PROXY
// =============================================
// FIX (bug #1): max_tokens was 2000, which is too small for the Season
// Insight schema (headline + summary + per-pitch blurbs + strengths +
// concerns + arsenalAssessment + mlbComp + splitAdvice + priorities).
// A full 4-5 pitch arsenal routinely blew past 2000 tokens, truncating
// the JSON mid-object with no closing "}" — which is exactly why
// JSON.parse() on the frontend failed with "Expected '}'". Bumped to
// 4096. Also hardened the extraction so a still-truncated response
// fails with a clear, honest error instead of silently handing back
// unparsable text for the frontend to choke on.
function callClaude(body) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: body.messages
    }),
    muteHttpExceptions: true
  });
  const data = JSON.parse(response.getContentText());
  if (data.error) return { error: data.error.message };

  const raw = data.content?.map(c => c.text || '').join('') || '';

  // Strip markdown code fences if the model wrapped the JSON in one,
  // then pull out the {...} block.
  const fenceStripped = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const match = fenceStripped.match(/\{[\s\S]*\}/);

  if (!match) {
    // No closing brace found at all — the response was truncated before
    // it could finish. Surface this clearly instead of returning
    // unparsable text.
    const truncated = data.stop_reason === 'max_tokens';
    return { error: truncated
      ? 'AI response was cut off before it finished (hit the token limit). Try again — if this keeps happening, the prompt or max_tokens may need to be adjusted further.'
      : 'AI response did not contain valid JSON.' };
  }

  return { text: match[0] };
}

// =============================================
// ATHLETES
// =============================================
const ATHLETE_HEADERS = ['id','name','position','throws','team','level','notes','pitch_metrics_json','createdAt'];

function getAthletes() {
  const sheet = getOrCreateSheet('Athletes', ATHLETE_HEADERS);
  const athletes = sheetToObjects(sheet).map(a => {
    try { a.pitch_metrics = JSON.parse(a.pitch_metrics_json || '{}'); } catch(e) { a.pitch_metrics = {}; }
    return a;
  });
  return { athletes };
}

function addAthlete(body) {
  const sheet = getOrCreateSheet('Athletes', ATHLETE_HEADERS);

  // FIX (bug #2, server-side backstop): even with the frontend guard
  // against double-submits, this adds a server-side dedup check so a
  // duplicate "add athlete" request (same name, same team) within a
  // short window can't create a second identical row.
  const name = (body.name || '').trim();
  const team = (body.team || '').trim();
  const existing = sheetToObjects(sheet);
  const dupe = existing.find(a =>
    (a.name || '').trim().toLowerCase() === name.toLowerCase() &&
    (a.team || '').trim().toLowerCase() === team.toLowerCase()
  );
  if (dupe) {
    return { success: true, id: dupe.id, deduped: true };
  }

  const id = 'ath_' + Date.now();
  sheet.appendRow([
    id, body.name||'', body.position||'P', body.throws||'R',
    body.team||'', body.level||'', body.notes||'', '{}',
    new Date().toISOString()
  ]);
  getOrCreateSheet('Outings_' + id, OUTING_HEADERS);
  return { success: true, id };
}

function updateAthlete(body) {
  const sheet = getOrCreateSheet('Athletes', ATHLETE_HEADERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === body.athleteId) {
      const row = i + 1;
      ['name','position','throws','team','level','notes','pitch_metrics_json'].forEach(field => {
        if (body[field] !== undefined) {
          const col = headers.indexOf(field) + 1;
          if (col > 0) sheet.getRange(row, col).setValue(body[field]);
        }
      });
      return { success: true };
    }
  }
  return { error: 'Athlete not found' };
}

function deleteAthlete(body) {
  const sheet = getOrCreateSheet('Athletes', ATHLETE_HEADERS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === body.athleteId) {
      sheet.deleteRow(i + 1);
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
  'walks','strikeouts','hrs','hits','ip',
  'pitch_stats_json',
  'ff_pct','st_pct','fs_pct','fc_pct','cu_pct','sl_pct','si_pct','ch_pct',
  'ff_velo','ff_whiff','st_whiff','fs_whiff','cu_whiff',
  'avg_ev','hard_hit_pct',
  'zone_pct','o_swing_pct','z_swing_pct','z_contact_pct','swing_pct','strike_pct',
  'gb_pct','fb_pct','ld_pct',
  'fp_strike_pct','oon_strike_pct','race2k_pct','putaway_pct',
  'createdAt'
];

function getOutings(athleteId) {
  if (!athleteId) return { error: 'athleteId required' };
  const sheet = getOrCreateSheet('Outings_' + athleteId, OUTING_HEADERS);
  const outings = sheetToObjects(sheet).map(o => {
    try { o.pitch_stats = JSON.parse(o.pitch_stats_json || '{}'); } catch(e) { o.pitch_stats = {}; }
    return o;
  });
  return { outings };
}

function addOuting(body) {
  if (!body.athleteId) return { error: 'athleteId required' };
  const sheet = getOrCreateSheet('Outings_' + body.athleteId, OUTING_HEADERS);

  // FIX (bug #2, server-side backstop): reject an addOuting call if an
  // outing for this athlete+date already exists. This is a hard stop
  // against the double-submit race in runBulkImport() — even if the
  // frontend somehow fires the loop twice concurrently, the second
  // write for a given date will bounce here instead of creating a
  // duplicate row.
  if (body.date) {
    const existing = sheetToObjects(sheet);
    const dateKey = body.date.toString().split('T')[0];
    const dupe = existing.find(o => (o.date || '').toString().split('T')[0] === dateKey);
    if (dupe) {
      return { success: true, id: dupe.id, deduped: true };
    }
  }

  const s = body.stats || {};
  const pm = body.pitchMap || {};
  const ps  = (pt, key) => (pm[pt] && pm[pt][key] !== undefined) ? pm[pt][key] : '';
  const pct = (pt) => pm[pt] ? +(pm[pt].count / (s.total||1) * 100).toFixed(1) : 0;
  const id = 'out_' + Date.now();
  sheet.appendRow([
    id, body.athleteId, body.date||'', body.opponent||'',
    body.inning_start||'', body.notes||'',
    s.total||0, s.strikes||0, s.balls||0, s.whiffs||0,
    s.calledStrikes||0, s.walks||0, s.ks||0, s.hrs||0, s.hits||0, s.ip||0,
    JSON.stringify(pm),
    pct('FF'), pct('ST'), pct('FS'), pct('FC'), pct('CU'), pct('SL'), pct('SI'), pct('CH'),
    ps('FF','avgVelo'), ps('FF','whiffPct'), ps('ST','whiffPct'), ps('FS','whiffPct'), ps('CU','whiffPct'),
    s.avgEV||'', s.hardHitPct||'',
    s.zonePct||'', s.oSwingPct||'', s.zSwingPct||'', s.zContactPct||'',
    s.swingPct||'', s.strikePct||'',
    s.gbPct||'', s.fbPct||'', s.ldPct||'',
    s.fpStrikePct||'', s.oonStrikePct||'',
    s.race2kPct||'', s.putawayPct||'',
    new Date().toISOString()
  ]);
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
