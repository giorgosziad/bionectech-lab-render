// AEGIS-4M v6.4.6 — core tier mechanism, extracted verbatim from the engine
// source (aegis4m_engine_v6_4_6_FULL.js). Tier-2 / production: no signature.
// Status field is the structural truth; score -> status -> action/response_window.
'use strict';

const AEGIS_VERSION = '6.4.6';
const ENGINE_STATUS = 'FINAL_LOCKED';
const RELEASE_DATE = '2026-05-11';

const TIERS = Object.freeze([
  Object.freeze({ idx: 0, status: 'STABLE',   score_min: 70, score_max: 100, default_action: 'Operate normally',         response_window: null   }),
  Object.freeze({ idx: 1, status: 'MONITOR',  score_min: 40, score_max: 69,  default_action: 'Review before proceeding', response_window: '24hr' }),
  Object.freeze({ idx: 2, status: 'ALERT',    score_min: 25, score_max: 39,  default_action: 'Intervene immediately',    response_window: '2hr'  }),
  Object.freeze({ idx: 3, status: 'CRITICAL', score_min: 0,  score_max: 24,  default_action: 'Escalate now',              response_window: '30min' }),
]);

const STATUS_VALUES = Object.freeze(TIERS.map(t => t.status));

function tierForScore(score) {
  const s = Number.isFinite(score) ? score : 0;
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const t = TIERS[i];
    if (s >= t.score_min && s <= t.score_max) return t;
  }
  return TIERS[TIERS.length - 1];
}

module.exports = { AEGIS_VERSION, ENGINE_STATUS, RELEASE_DATE, TIERS, STATUS_VALUES, tierForScore };
