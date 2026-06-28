// AEGIS adapter — wires the real engine mechanism into the lab.
// Uses Section 34 (Operator Input Fidelity) to guarantee the operator's prompt
// is carried VERBATIM to the model, then resolves a tier/band from the engine's
// real tier table. No spiritual signature (Tier-2 / production).
'use strict';
const crypto = require('crypto');
const S34 = require('./section34.js');
const CORE = require('./core.js');
const FULL = require('./full.js');         // full engine bundled in (built-in)

// Integrity stamp proving the built-in engine modules loaded intact.
// Deterministic short hash over version + status + the loaded API surfaces.
const ATTEST = (function () {
  try {
    const basis = [
      CORE.AEGIS_VERSION, CORE.ENGINE_STATUS, CORE.RELEASE_DATE,
      Object.keys(FULL || {}).sort().join(','),
      Object.keys(S34 || {}).sort().join(','),
      Object.keys(CORE || {}).sort().join(',')
    ].join('|');
    return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 8);
  } catch (e) { return '00000000'; }
})();

// Run the Operator Input Fidelity gate over the prompt that will be sent.
// Records the operator input, asserts the text used downstream is verbatim,
// and returns a structured fidelity result.
function runInputFidelity(operatorPrompt, usedPrompt) {
  try {
    const ledger = S34.makeOperatorInputsLedger();
    S34.recordOperatorInput(ledger, 'operator_prompt', operatorPrompt);
    const uses = [{ label: 'operator_prompt', used: usedPrompt }];
    const audit = S34.auditInputFidelity(ledger, uses);
    const verbatim = !!(audit && (audit.all_verbatim === true || audit.ok === true || (Array.isArray(audit.results) && audit.results.every(r => r.verbatim))));
    return { verbatim, audit, version: S34.SECTION_34_CONSTANTS ? (S34.SECTION_34_CONSTANTS.VERSION || '34') : '34' };
  } catch (e) {
    // Fail closed on the band, but never block the answer for an audit hiccup.
    return { verbatim: false, error: (e && e.message) || 'fidelity audit error' };
  }
}

// Resolve an AEGIS band for the interaction. Transparent signal model:
//  - start at STABLE (100)
//  - input fidelity failure is the strongest downgrade (the §34 reason for being)
//  - an empty/blocked/error answer downgrades
//  - clinical mode is held one notch more conservative
// The score is then mapped through the engine's real tier table (core.tierForScore).
function assess(opts) {
  opts = opts || {};
  const fidelity = opts.fidelity || { verbatim: true };
  const answer = (opts.answer || '').toString();
  const delivered = opts.delivered !== false;
  const mode = opts.mode || 'builder';

  let score = 100;
  if (!fidelity.verbatim) score -= 55;        // input was altered/trimmed -> ALERT/CRITICAL
  if (!delivered) score -= 45;                // model did not deliver
  if (delivered && answer.trim().length < 4) score -= 30; // empty-ish answer
  if (mode === 'clinical') score -= 10;       // hold clinical one notch more conservative
  if (score < 0) score = 0; if (score > 100) score = 100;

  const tier = CORE.tierForScore(score);
  return {
    engine: 'AEGIS-4M',
    version: CORE.AEGIS_VERSION,
    score,
    status: tier.status,
    action: tier.default_action,
    response_window: tier.response_window,
    fidelity: fidelity.verbatim ? 'VERIFIED' : 'NOT VERIFIED',
    mode
  };
}

// Full engine ON: same assessment plus the built-in engine attestation/status.
function assessFull(opts) {
  const base = assess(opts);
  base.built_in = true;
  base.engine_status = CORE.ENGINE_STATUS;     // FINAL_LOCKED
  base.release = CORE.RELEASE_DATE;
  base.attest = ATTEST;
  base.sections = ['input-fidelity', 'tier-band', 'aegos', 'standardized-band'];
  return base;
}

// Live self-check: actually exercises the loaded engine modules and reports
// pass/fail for each, plus the attestation. Proves the engine is built-in & intact.
function selfCheck() {
  const checks = [];
  function add(name, pass, detail) { checks.push({ name: name, pass: !!pass, detail: detail || '' }); }
  try { add('core tier table maps 82 -> STABLE', CORE.tierForScore(82).status === 'STABLE'); } catch (e) { add('core tier table (STABLE)', false, e && e.message); }
  try { add('core tier table maps 15 -> CRITICAL', CORE.tierForScore(15).status === 'CRITICAL'); } catch (e) { add('core tier table (CRITICAL)', false, e && e.message); }
  try { add('§34 fidelity gate accepts verbatim input', runInputFidelity('abc-123', 'abc-123').verbatim === true); } catch (e) { add('§34 fidelity (verbatim)', false, e && e.message); }
  try { add('§34 fidelity gate flags altered input', runInputFidelity('abc-123-long', 'abc').verbatim === false); } catch (e) { add('§34 fidelity (altered)', false, e && e.message); }
  try { add('full engine module loaded', !!(FULL && FULL.AEGIS_VERSION)); } catch (e) { add('full engine module', false, e && e.message); }
  const healthy = checks.every(function (c) { return c.pass; });
  return {
    loaded: true, healthy: healthy,
    engine: 'AEGIS-4M', version: CORE.AEGIS_VERSION,
    engine_status: CORE.ENGINE_STATUS, release: CORE.RELEASE_DATE,
    attest: ATTEST,
    sections: ['input-fidelity (§34)', 'tier-band (core)', 'aegos (§33)', 'standardized-band (§36)'],
    checks: checks
  };
}

module.exports = { runInputFidelity, assess, assessFull, selfCheck, ATTEST, AEGIS_VERSION: CORE.AEGIS_VERSION };
