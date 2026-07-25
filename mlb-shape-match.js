/* ==================== MLB SHAPE-MATCHED BASELINES & COMPS ====================
   Shared by app.js (single/multi-start CSV tool) and athletes-v2.js (athlete
   profile dashboard). Instead of comparing a pitch to the flat MLB average
   for its pitch type, this matches on velo + movement + release point:
     - matchShapeCluster(): nearest MLB "shape cluster" for baseline stats
     - findPitchComps(): actual MLB pitchers with the closest single pitch
     - findArsenalComps(): actual MLB pitchers with the closest whole arsenal
*/

let SHAPE_BASELINES = {};
let PITCHER_COMPS = {};

fetch('shape_baselines.json')
  .then(r => r.json())
  .then(data => { SHAPE_BASELINES = data; })
  .catch(() => { console.warn('shape_baselines.json not found — shape-matched comparisons unavailable.'); });

fetch('pitcher_comps.json')
  .then(r => r.json())
  .then(data => { PITCHER_COMPS = data; })
  .catch(() => { console.warn('pitcher_comps.json not found — MLB comps unavailable.'); });

const SHAPE_FEATURES = ['velo', 'hb_norm', 'vb', 'side_norm', 'height', 'ext'];
// For data where release point wasn't saved (e.g. historical athlete-profile
// outings imported before release point tracking existed) — velo + movement
// still gives a meaningful comp, just without release-slot precision.
const REDUCED_FEATURES = ['velo', 'hb_norm', 'vb'];

// Normalizes a raw pitch into the handedness-normalized feature space the
// clusters/comps were built in. relX/relZ/ext may be omitted (null) when
// only reduced-feature matching is available.
function normalizeShape(throws, velo, hb, vb, relX = null, relZ = null, ext = null) {
  const sign = throws === 'L' ? -1 : 1;
  return {
    velo, hb_norm: hb * sign, vb,
    side_norm: relX != null ? relX * sign : null,
    height: relZ, ext
  };
}

function zDist(a, b, mean, scale, features = SHAPE_FEATURES) {
  let d = 0;
  for (const f of features) {
    const za = (a[f] - mean[f]) / scale[f];
    const zb = (b[f] - mean[f]) / scale[f];
    d += (za - zb) ** 2;
  }
  return Math.sqrt(d);
}

// Nearest MLB cluster for a single pitch — returns { n, centroid, metrics } or null.
function matchShapeCluster(pt, throws, velo, hb, vb, relX, relZ, ext, features = SHAPE_FEATURES) {
  const norm = pt === 'FA' ? 'FF' : pt;
  const data = SHAPE_BASELINES[norm];
  if (!data || [velo, hb, vb].some(v => v == null || isNaN(v))) return null;
  const feat = normalizeShape(throws, velo, hb, vb, relX, relZ, ext);
  let best = null, bestDist = Infinity;
  for (const c of data.clusters) {
    const dist = zDist(feat, c.centroid, data.scaler_mean, data.scaler_scale, features);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
}

// Actual MLB pitchers whose SAME pitch type most closely matches this one pitch.
function findPitchComps(pt, throws, velo, hb, vb, relX, relZ, ext, topN = 3, features = SHAPE_FEATURES) {
  const norm = pt === 'FA' ? 'FF' : pt;
  const scaler = SHAPE_BASELINES[norm];
  if (!scaler || [velo, hb, vb].some(v => v == null || isNaN(v))) return [];
  const feat = normalizeShape(throws, velo, hb, vb, relX, relZ, ext);
  const results = [];
  for (const p of Object.values(PITCHER_COMPS)) {
    const ap = p.arsenal[norm];
    if (!ap) continue;
    const dist = zDist(feat, ap, scaler.scaler_mean, scaler.scaler_scale, features);
    results.push({ name: p.name, throws: p.throws, n: ap.n, dist, metrics: ap });
  }
  results.sort((a, b) => a.dist - b.dist);
  return results.slice(0, topN);
}

// Actual MLB pitchers whose WHOLE ARSENAL (mix + shape of each pitch) most
// closely resembles the athlete's. athleteArsenal: { PT: {usage_pct, velo,
// hb_norm, vb, [side_norm, height, ext]}, ... } — already handedness-normalized.
function findArsenalComps(athleteArsenal, topN = 3, minPitcherSample = 150, features = SHAPE_FEATURES) {
  const results = [];
  for (const p of Object.values(PITCHER_COMPS)) {
    if (p.total_n < minPitcherSample) continue;
    let total = 0, wsum = 0;
    for (const [pt, ap] of Object.entries(athleteArsenal)) {
      const scaler = SHAPE_BASELINES[pt];
      if (!scaler) continue;
      const w = ap.usage_pct / 100;
      wsum += w;
      const pp = p.arsenal[pt];
      const dist = pp ? zDist(ap, pp, scaler.scaler_mean, scaler.scaler_scale, features) : 3.0; // penalty: pitcher doesn't throw this pitch at all
      total += w * dist;
    }
    // small penalty for pitches the comp throws that the athlete doesn't
    for (const [pt, pp] of Object.entries(p.arsenal)) {
      if (!athleteArsenal[pt]) total += 0.3 * (pp.usage_pct / 100);
    }
    if (wsum > 0) results.push({ name: p.name, throws: p.throws, total_n: p.total_n, score: total / Math.max(wsum, 0.01) });
  }
  results.sort((a, b) => a.score - b.score);
  return results.slice(0, topN);
}
