const fs = require('fs');
const path = 'c:\\Users\\59351\\Downloads\\我创造的完美球员\\game_files\\__ai_app.html';
let content = fs.readFileSync(path, 'utf8');

let idx = content.indexOf('function getSeasonStatScale');
let endIdx = content.indexOf('function getSeasonUsageBias');

if (idx < 0 || endIdx < 0) {
    console.error('Could not find function boundaries');
    process.exit(1);
}

const newFunc = `function getSeasonStatScale() {
  if (STATE.season && STATE.season._statScale) return STATE.season._statScale;
  var defaultScale = { pts: 1.0, reb: 1.0, ast: 1.0, stl: 1.0, blk: 1.0 };
  var attrs = STATE.attrs || {};
  var pos = STATE.position || 'SF';
  var myOVR = STATE.finalOVR || 75;
  var cfg = (typeof SIM_CONFIG !== 'undefined' && SIM_CONFIG.PLAYER_STATS) ? SIM_CONFIG.PLAYER_STATS : null;
  var posScale = (cfg && cfg.POS_SCALE) ? (cfg.POS_SCALE[pos] || cfg.POS_SCALE.PG) : { reb: 0.35, ast: 0.4 };
  var factors = (cfg && cfg.FACTORS) ? (cfg.FACTORS[pos] || cfg.FACTORS.PG) : null;

  // paceMult: 假设 totalScore≈220 (totalScore/200=1.1), statMinsFactor≈1.05, random≈1.05
  var paceMult = 1.21;

  // 篮板理论值 = af(REB) * posScale.reb * 12 * paceMult
  var rebTheoretical = af(attrs.REB || 50) * (posScale.reb || 0.35) * 12 * paceMult;

  // 助攻理论值 = af((PAS+HAN+CLU)/3) * posScale.ast * 14 * paceMult
  var pasAvg = ((attrs.PAS || 50) + (attrs.HAN || 50) + (attrs.CLU || 50)) / 3;
  var astTheoretical = af(pasAvg) * (posScale.ast || 0.4) * 14 * paceMult;

  // 抢断理论值（用 FACTORS 加权，与 generatePlayerStatsNew 对齐）
  var stlAvg;
  if (factors && factors.stl) {
    var sF = factors.stl;
    var sSum = (sF.PDEF || 0) + (sF.ATH || 0) + (sF.HAN || 0);
    stlAvg = sSum > 0 ? (af(attrs.PDEF || 50) * (sF.PDEF || 0) + af(attrs.ATH || 50) * (sF.ATH || 0) + af(attrs.HAN || 50) * (sF.HAN || 0)) / sSum : af(attrs.PDEF || 50);
  } else {
    stlAvg = af(attrs.PDEF || 50) * 0.5 + af(attrs.ATH || 50) * 0.25 + af(attrs.HAN || 50) * 0.25;
  }
  var stlTheoretical = stlAvg * 3.9 * paceMult;

  // 盖帽理论值（用 FACTORS 加权，与 generatePlayerStatsNew 对齐）
  var blkAvg;
  if (factors && factors.blk) {
    var bF = factors.blk;
    var bSum = (bF.BLK || 0) + (bF.IDEF || 0) + (bF.ATH || 0);
    blkAvg = bSum > 0 ? (af(attrs.BLK || 50) * (bF.BLK || 0) + af(attrs.IDEF || 50) * (bF.IDEF || 0) + af(attrs.ATH || 50) * (bF.ATH || 0)) / bSum : af(attrs.BLK || 50);
  } else {
    blkAvg = af(attrs.BLK || 50) * 0.5 + af(attrs.IDEF || 50) * 0.25 + af(attrs.ATH || 50) * 0.25;
  }
  var blkTheoretical = blkAvg * 5.2 * paceMult;

  // 得分基础值（保持原逻辑但用 USAGE 配置替代硬编码）
  var posOffAttrs = {
    'PG': ['threePT','MID','HAN','PAS'],
    'SG': ['threePT','MID','FIN','HAN'],
    'SF': ['threePT','MID','FIN','DNK','ATH'],
    'PF': ['MID','FIN','DNK','STR','REB'],
    'C':  ['FIN','DNK','STR','MID']
  };
  var offList = posOffAttrs[pos] || posOffAttrs['SF'];
  var offSum = 0;
  for (var oi = 0; oi < offList.length; oi++) offSum += parseInt(attrs[offList[oi]]) || 50;
  var offAvg = offSum / offList.length;
  var offFactor = af(offAvg);
  var baseUsage = (cfg && cfg.USAGE) ? (cfg.USAGE[pos] || cfg.USAGE['SF'] || 0.20) : 0.20;
  var usageScaleBase = myOVR > 75 ? 1 + (myOVR - 75) * 0.018 : 1.0;
  var expectedPtsPerFga = 1.35;
  var ptsTheoretical = offFactor * baseUsage * Math.min(1.8, usageScaleBase) * 48 * expectedPtsPerFga * 1.05;

  // ── 2. 获取当赛季历史数据王 ──
  var maxPts = 0, maxReb = 0, maxAst = 0, maxStl = 0, maxBlk = 0;
  var year = typeof getCurrentSeasonYear === 'function' ? getCurrentSeasonYear() : null;
  var seasonKey = year ? String(year) + '-' + String((parseInt(year, 10) + 1) % 100).padStart(2, '0') : '';
  var full = window.CAREER_FULL_PLAYER_DATA;
  var rows = full && full.seasons && full.seasons[seasonKey] && full.seasons[seasonKey].players;
  if (rows && rows.length) {
    rows.forEach(function(p) {
      maxPts = Math.max(maxPts, Number(p.pts) || 0);
      maxReb = Math.max(maxReb, Number(p.reb) || 0);
      maxAst = Math.max(maxAst, Number(p.ast) || 0);
      maxStl = Math.max(maxStl, Number(p.stl) || 0);
      maxBlk = Math.max(maxBlk, Number(p.blk) || 0);
    });
  }
  if (maxPts < 15) maxPts = 34;
  if (maxReb < 8)  maxReb = 16;
  if (maxAst < 6)  maxAst = 12;
  if (maxStl < 1)  maxStl = 2.8;
  if (maxBlk < 1)  maxBlk = 3.2;

  // ── 3. 计算 scale ──
  function calcScale(theoretical, maxStat, attrVal, cap) {
    var attrFactor = Math.max(0, Math.min(1, (attrVal - 55) / 25));
    if (attrFactor <= 0) return 1.0;
    if (theoretical * 1.15 >= maxStat) return 1.0;
    var needed = maxStat / Math.max(0.5, theoretical);
    var raw = 1.0 + (needed - 1.0) * attrFactor * 0.85;
    return Math.max(1.0, Math.min(cap, raw));
  }
  var scale = {
    pts: calcScale(ptsTheoretical, maxPts, offAvg, 1.7),
    reb: calcScale(rebTheoretical, maxReb, parseInt(attrs.REB) || 50, 2.2),
    ast: calcScale(astTheoretical, maxAst, pasAvg, 2.2),
    stl: calcScale(stlTheoretical, maxStl, parseInt(attrs.PDEF) || 50, 2.5),
    blk: calcScale(blkTheoretical, maxBlk, parseInt(attrs.BLK) || 50, 2.5)
  };
  if (STATE.season) STATE.season._statScale = scale;
  return scale;
}`;

content = content.substring(0, idx) + newFunc + content.substring(endIdx);
fs.writeFileSync(path, content, 'utf8');
console.log('Done! File updated successfully.');
console.log('Old func replaced. New length:', newFunc.length);