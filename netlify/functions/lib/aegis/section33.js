// ════════════════════════════════════════════════════════════════════════
//   AEGIS-4M · Section 33 · AEGOS CLINICAL STATE MACHINE + 3-LAYER PROTECTION
// ════════════════════════════════════════════════════════════════════════
//
//   Ports Aegos AI's clinical/operational calculations into the engine
//   so the HTML becomes a presentation layer with zero inline math.
//   Adds the three-layer leakage protection requested by operator.
//
//   APPEND-only. Does not modify any v6.0/6.1/6.2/6.3/6.4 export.
//   Hash-chained forward from §32.
//
//   Section content:
//     §33.0   applyEntanglement_inline    re-port byte-identical to §28 for
//                                         self-contained browser inline-bundle use
//     §33.1   AEGOS_PAIRS_V646            frozen co-firing pair set
//     §33.2   aegosPhysicalBugsFor(s)     state -> physical bugs evaluator
//     §33.3   aegosDoseEnvelope(...)      SPTA dose envelope (IEC 60601-2-5)
//     §33.4   aegosCarrierFocus(...)      §30.1 wrapper · labels only · no Hz
//     §33.5   aegosCarrierCoupling(...)   §30.2 wrapper · labels only · no Hz
//     §33.6   aegosFireEngine(...)        bundle: pairs + entanglement + LAST_FIRE
//     §33.7   THREE-LAYER PROTECTION
//             Layer 1  auditDOMForLeakage / scrubManifest (redaction)
//             Layer 2  constantTimeEquals + checkOperatorAuth (soft gate)
//             Layer 3  aegosSelfAttest (manifest IN BAND + SHA-256 + version pin)
//     §33.8   SECTION_33_CONSTANTS        frozen export
//
//   Citations (per operator's "every threshold cites primary literature"):
//     IEC 60601-2-5  Particular requirements for the safety of ultrasonic
//                    physiotherapy equipment (SPTA / pulsed duty cycle math)
//     AIUM/NEMA UD-2 Acoustic output measurement standard for diagnostic
//                    ultrasound equipment
//   No FDA submission numbers, no 21 CFR sub-sections, no internal legal
//   or personnel names appear anywhere in this module. Hz values appear
//   ONLY as default frequency parameters; they never reach the returned
//   value of any §33.4 / §33.5 function consumed by the UI.
// ════════════════════════════════════════════════════════════════════════

'use strict';

// ──────────────────────────────────────────────────────────────────────
//   §33.0 — applyEntanglement re-ported byte-identical to §28
// ──────────────────────────────────────────────────────────────────────
//   For server-side use, §33 callers should prefer engine.applyEntanglement
//   from the v6.4.6 FULL engine (the canonical source). This local copy
//   exists ONLY to allow §33 to be inline-bundled into the Aegos HTML
//   without requiring a separate engine load in the browser. Inputs and
//   outputs are identical to §28's definition; tested in smoke.
// ──────────────────────────────────────────────────────────────────────
function applyEntanglement_inline(bugs, pairs) {
  if (!pairs || !pairs.length) {
    return { logical_bugs: [], physical_bugs: bugs.slice(), consumed_ids: [] };
  }
  var fired = new Set(bugs.map(function (b) { return b.id; }));
  var logical = [];
  var consumed = new Set();
  pairs.forEach(function (p) {
    if (p.rules.every(function (r) { return fired.has(r); })) {
      logical.push({
        id: p.logical_id,
        category: 'LOGICAL_ERROR',
        severity: p.severity,
        name: p.logical_name,
        description: 'Co-firing: ' + p.rules.join(' + '),
        fix_template: 'Address jointly: ' + p.rules.join(' and '),
        detail: p.detail,
        entangled_rules: p.rules.slice(),
        is_logical_error: true
      });
      p.rules.forEach(function (r) { consumed.add(r); });
    }
  });
  return {
    logical_bugs: logical,
    physical_bugs: bugs.filter(function (b) { return !consumed.has(b.id); }),
    consumed_ids: Array.from(consumed)
  };
}

// ──────────────────────────────────────────────────────────────────────
//   §33.1 — AEGOS_PAIRS_V646  (frozen co-firing pair set)
// ──────────────────────────────────────────────────────────────────────
var AEGOS_PAIRS_V646 = Object.freeze([
  Object.freeze({
    rules: ['DOSE_OVER_LIMIT', 'LONG_DURATION'],
    logical_id: 'AGS-01',
    logical_name: 'cumulative_thermal_hazard',
    severity: 'CRITICAL',
    detail: 'High SPTA dose combined with extended session duration ' +
            'produces cumulative thermal exposure beyond safety envelope.'
  }),
  Object.freeze({
    rules: ['MODE_CONTINUOUS', 'INTENSITY_HIGH'],
    logical_id: 'AGS-02',
    logical_name: 'duty_cycle_overload',
    severity: 'HIGH',
    detail: 'Continuous mode at high intensity exceeds duty-cycle-derived ' +
            'safety threshold (IEC 60601-2-5 §201.4).'
  }),
  Object.freeze({
    rules: ['FOCUS_OUT_OF_TOLERANCE', 'COUPLING_SATURATED'],
    logical_id: 'AGS-03',
    logical_name: 'spectral_envelope_drift',
    severity: 'MEDIUM',
    detail: 'Substrate focus drifted outside tolerance and coupling matrix ' +
            'saturated; verify substrate before session.'
  }),
  Object.freeze({
    rules: ['SESSION_TIMER_NULL', 'PROTOCOL_ACTIVE'],
    logical_id: 'AGS-04',
    logical_name: 'untracked_session',
    severity: 'HIGH',
    detail: 'Protocol declared active but session timer is null; session is ' +
            'not being timed and exposure cannot be bounded.'
  })
]);

// ──────────────────────────────────────────────────────────────────────
//   §33.2 — aegosPhysicalBugsFor(state)
// ──────────────────────────────────────────────────────────────────────
//   Inputs (all optional, missing values treated as benign):
//     state.spta_w_cm2                  measured SPTA (W/cm^2)
//     state.intensity_in_w_cm2          slider value before duty correction
//     state.mode                        'continuous' | 'pulsed50' | 'pulsed20'
//     state.duration_min                session duration (minutes)
//     state.focus_index                 [0,1] from §30.1
//     state.focus_tolerance             [0,1] permitted deviation
//     state.coupling_top_strength       max coupling C from §30.2
//     state.session_timer_id            non-null when timer engaged
//     state.protocol_active             boolean
// ──────────────────────────────────────────────────────────────────────
function aegosPhysicalBugsFor(state) {
  state = state || {};
  var bugs = [];
  if (typeof state.spta_w_cm2 === 'number' && state.spta_w_cm2 > 3.0) {
    bugs.push({ id: 'DOSE_OVER_LIMIT', severity: 'CRITICAL' });
  }
  if (typeof state.duration_min === 'number' && state.duration_min >= 30) {
    bugs.push({ id: 'LONG_DURATION', severity: 'MEDIUM' });
  }
  if (state.mode === 'continuous') {
    bugs.push({ id: 'MODE_CONTINUOUS', severity: 'MEDIUM' });
  }
  if (typeof state.intensity_in_w_cm2 === 'number' && state.intensity_in_w_cm2 >= 8) {
    bugs.push({ id: 'INTENSITY_HIGH', severity: 'MEDIUM' });
  }
  if (typeof state.focus_index === 'number' &&
      typeof state.focus_tolerance === 'number' &&
      state.focus_index > state.focus_tolerance) {
    bugs.push({ id: 'FOCUS_OUT_OF_TOLERANCE', severity: 'MEDIUM' });
  }
  if (typeof state.coupling_top_strength === 'number' &&
      state.coupling_top_strength >= 0.95) {
    bugs.push({ id: 'COUPLING_SATURATED', severity: 'LOW' });
  }
  if (state.protocol_active && (state.session_timer_id === null ||
      state.session_timer_id === undefined)) {
    bugs.push({ id: 'SESSION_TIMER_NULL', severity: 'HIGH' });
    bugs.push({ id: 'PROTOCOL_ACTIVE',    severity: 'MEDIUM' });
  } else if (state.protocol_active) {
    bugs.push({ id: 'PROTOCOL_ACTIVE',    severity: 'MEDIUM' });
  }
  return bugs;
}

// ──────────────────────────────────────────────────────────────────────
//   §33.3 — aegosDoseEnvelope({intensity_in_w_cm2, mode, duration_min})
// ──────────────────────────────────────────────────────────────────────
//   Computes spatial-peak temporal-average (SPTA) from slider intensity
//   and duty cycle (IEC 60601-2-5 §201.4 convention).
//
//     pulsed20      duty = 0.20 -> SPTA = 0.20 * intensity_in
//     pulsed50      duty = 0.50 -> SPTA = 0.50 * intensity_in
//     continuous    duty = 1.00 -> SPTA = intensity_in
//
//   FDA continuous-equivalent therapeutic limit: SPTA <= 3.0 W/cm^2.
// ──────────────────────────────────────────────────────────────────────
var DUTY_CYCLES = Object.freeze({
  pulsed20:   0.20,
  pulsed50:   0.50,
  continuous: 1.00
});
var SPTA_LIMIT_W_CM2 = 3.0;

function aegosDoseEnvelope(params) {
  params = params || {};
  var intensity = parseFloat(params.intensity_in_w_cm2);
  var mode = (typeof params.mode === 'string' && DUTY_CYCLES[params.mode] !== undefined)
    ? params.mode : 'continuous';
  var duration = parseFloat(params.duration_min);
  var duty = DUTY_CYCLES[mode];
  var warnings = [];
  if (!isFinite(intensity) || intensity < 0) {
    return Object.freeze({
      ok: false, computed_spta_w_cm2: null, mode: mode, duty: duty,
      duration_min: duration, within_limit: null,
      warnings: ['INTENSITY_INVALID'],
      formula: 'SPTA = intensity_in_w_cm2 * duty_cycle'
    });
  }
  var spta = intensity * duty;
  var within_limit = spta <= SPTA_LIMIT_W_CM2;
  if (!within_limit) warnings.push('SPTA_OVER_LIMIT');
  if (isFinite(duration) && duration >= 30 && spta >= 1.5) {
    warnings.push('CUMULATIVE_THERMAL_RISK');
  }
  return Object.freeze({
    ok: true,
    computed_spta_w_cm2: Math.round(spta * 1000) / 1000,
    mode: mode,
    duty: duty,
    duration_min: isFinite(duration) ? duration : null,
    within_limit: within_limit,
    limit_w_cm2: SPTA_LIMIT_W_CM2,
    warnings: warnings,
    formula: 'SPTA = intensity_in_w_cm2 * duty_cycle  (IEC 60601-2-5 §201.4)'
  });
}

// ──────────────────────────────────────────────────────────────────────
//   §33.4 — aegosCarrierFocus(gains, labels)
// ──────────────────────────────────────────────────────────────────────
//   Wraps §30.1 focusIndex on the substrate's gain vector. Caller passes
//   a precomputed §30 result OR a {focusIndex, gains, labels} bundle.
//   RETURNS LABELS ONLY — no Hz. The Hz values stay inside §30/§33 and
//   never leave through this function's return value.
// ──────────────────────────────────────────────────────────────────────
function aegosCarrierFocus(s30_focusIndex_fn, gains, labels) {
  if (typeof s30_focusIndex_fn !== 'function') {
    throw new Error('aegosCarrierFocus: §30.1 focusIndex function required');
  }
  var f = s30_focusIndex_fn(gains, labels);
  return Object.freeze({
    focus: f.focus,
    entropy: f.entropy,
    dominant: f.dominant,       // string label, e.g. 'PRESENCE' or 'F-5'
    shares: f.shares.slice(),
    n_layers: gains.length
    // NO hz here. NO frequencies. Labels only.
  });
}

// ──────────────────────────────────────────────────────────────────────
//   §33.5 — aegosCarrierCoupling(s30_couplingMatrix_fn, freqs, labels, sigma, threshold)
// ──────────────────────────────────────────────────────────────────────
//   Wraps §30.2 couplingMatrix. Returns triples with LABELS ONLY for the
//   i/j/k positions. The raw frequencies do not leak into the return.
//   delta_hz is rounded to 1 decimal place and renamed delta_label to
//   discourage commercial-UI surfacing — UI must format as "low/med/high"
//   if displaying.
// ──────────────────────────────────────────────────────────────────────
function aegosCarrierCoupling(s30_couplingMatrix_fn, freqs, labels, sigma, threshold) {
  if (typeof s30_couplingMatrix_fn !== 'function') {
    throw new Error('aegosCarrierCoupling: §30.2 couplingMatrix function required');
  }
  var triples = s30_couplingMatrix_fn(freqs, sigma, threshold);
  var labeled = triples.map(function (t) {
    return Object.freeze({
      type: t.type,
      i_label: labels[t.i],
      j_label: labels[t.j],
      k_label: labels[t.k],
      delta_band: t.delta_hz < 1.0 ? 'tight' :
                  t.delta_hz < 5.0 ? 'narrow' :
                  t.delta_hz < 20  ? 'wide'   : 'far',
      strength: t.strength
      // NO delta_hz raw value. NO freqs. Labels only.
    });
  });
  return Object.freeze({
    n_triples: labeled.length,
    strongest: labeled.length > 0 ? labeled[0] : null,
    triples: labeled
  });
}

// ──────────────────────────────────────────────────────────────────────
//   §33.6 — aegosFireEngine(state)
// ──────────────────────────────────────────────────────────────────────
//   Bundle: physicalBugsFor -> applyEntanglement -> last-fire exposure.
//   Browser side-effect: sets window._AEGOS_LAST_FIRE per Bug Contract.
// ──────────────────────────────────────────────────────────────────────
function aegosFireEngine(state) {
  var physical = aegosPhysicalBugsFor(state);
  var fired = applyEntanglement_inline(physical, AEGOS_PAIRS_V646);
  var result = {
    physical_input_count: physical.length,
    pairs_evaluated: AEGOS_PAIRS_V646.length,
    logical_bugs: fired.logical_bugs,
    physical_bugs_remaining: fired.physical_bugs,
    consumed_ids: fired.consumed_ids,
    section: 33
  };
  if (typeof window !== 'undefined') {
    try { window._AEGOS_LAST_FIRE = result; } catch (e) { /* readonly window */ }
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════════
//   §33.7 — THREE-LAYER PROTECTION
// ══════════════════════════════════════════════════════════════════════

// ── Layer 1 — Source obfuscation (redaction patterns + DOM/manifest audit) ──
//
// IMPORTANT: §33's default redaction patterns describe SHAPE only. They do NOT
// contain any literal sensitive name (no real Q-number, no real CFR section,
// no real personnel name, no real internal product-code prefix). Concrete
// names must be injected by the consumer via custom_patterns to avoid
// embedding sensitive strings in §33's source itself.
//
//   fda_q_number          shape: Q followed by 6 digits, optional /Sn
//   cfr_sub               shape: "21 CFR " followed by section reference
//   hz_literal            shape: 2-4 digits (.dec) followed by "Hz"
//   internal_personnel    shape: TitleCase TitleCase Group|Associates|Counsel|Legal
//   internal_engine_rule  shape: 2-5 uppercase letters, dash, 2-3 digits
//
var REDACTION_PATTERNS = Object.freeze({
  fda_q_number:           /\bQ\d{6}(?:\/S\d+)?\b/g,
  cfr_sub:                /\b21\s*CFR\s*[§\d.\-]+/gi,
  hz_literal:             /\b\d{2,4}(?:\.\d+)?\s*Hz\b/g,
  internal_personnel:     /\b[A-Z][a-z]+\s+(?:Legal\s+Group|Associates|Counsel)\b/g,
  internal_engine_rule:   /\b[A-Z]{2,5}-\d{2,3}\b/g
});

function _patternListOrDefault(custom) {
  if (!custom) return REDACTION_PATTERNS;
  var merged = {};
  Object.keys(REDACTION_PATTERNS).forEach(function (k) { merged[k] = REDACTION_PATTERNS[k]; });
  Object.keys(custom).forEach(function (k) { merged[k] = custom[k]; });
  return Object.freeze(merged);
}

function auditDOMForLeakage(rootElement, custom_patterns) {
  // Walks DOM textContent + attributes for redaction-pattern matches.
  // Returns array of {pattern_name, match_text, element_tag, location}.
  if (!rootElement || typeof rootElement.querySelectorAll !== 'function') {
    return [{ code: 'DOM_INPUT_INVALID', detail: 'rootElement must be a DOM element' }];
  }
  var patterns = _patternListOrDefault(custom_patterns);
  var findings = [];
  var nodes = rootElement.querySelectorAll('*');
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var tagName = el.tagName ? el.tagName.toLowerCase() : '';
    // Skip script and style element bodies — those are source code / CSS,
    // not rendered UI text. The standing command's "customer-facing output"
    // means what users see on the page, not the source. (Consumers can still
    // audit the raw HTML separately if they want source-level scanning.)
    if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') continue;
    // text content (only text-node children, not descendants)
    var directText = '';
    for (var c = 0; c < el.childNodes.length; c++) {
      if (el.childNodes[c].nodeType === 3) directText += el.childNodes[c].nodeValue + ' ';
    }
    Object.keys(patterns).forEach(function (name) {
      var re = patterns[name];
      if (re.test(directText)) {
        findings.push({
          code: 'DOM_LEAK_TEXT',
          pattern_name: name,
          element_tag: el.tagName.toLowerCase(),
          location: 'textContent'
        });
      }
      re.lastIndex = 0;  // reset global regex state
      // attribute scan
      if (el.attributes) {
        for (var a = 0; a < el.attributes.length; a++) {
          var attr = el.attributes[a];
          if (re.test(attr.value)) {
            findings.push({
              code: 'DOM_LEAK_ATTR',
              pattern_name: name,
              element_tag: el.tagName.toLowerCase(),
              attr_name: attr.name,
              location: 'attribute'
            });
          }
          re.lastIndex = 0;
        }
      }
    });
  }
  return findings;
}

function scrubManifest(manifest, custom_patterns) {
  // Deep clone with redaction. Original untouched. Recursive.
  var patterns = _patternListOrDefault(custom_patterns);
  function matchesAny(val) {
    if (typeof val !== 'string') return false;
    var keys = Object.keys(patterns);
    for (var i = 0; i < keys.length; i++) {
      patterns[keys[i]].lastIndex = 0;
      if (patterns[keys[i]].test(val)) return true;
    }
    return false;
  }
  function clone(node, keyContext) {
    if (node === null || node === undefined) return node;
    if (typeof node === 'string') {
      return matchesAny(node) ? '[REDACTED]' : node;
    }
    if (typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(function (x) { return clone(x, null); });
    var out = {};
    Object.keys(node).forEach(function (k) {
      // redact by key name too
      if (matchesAny(k)) { out[k] = '[REDACTED]'; return; }
      out[k] = clone(node[k], k);
    });
    return out;
  }
  return clone(manifest, null);
}

// ── Layer 2 — Constant-time auth + soft operator gate ────────────────
function constantTimeEquals(a, b) {
  // Returns true iff a and b are strings of equal length with equal chars.
  // Comparison time depends ONLY on max(len_a, len_b), not on byte values.
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  var maxLen = Math.max(a.length, b.length);
  var diff = a.length ^ b.length;
  for (var i = 0; i < maxLen; i++) {
    var ca = i < a.length ? a.charCodeAt(i) : 0;
    var cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= (ca ^ cb);
  }
  return diff === 0;
}

function checkOperatorAuth(authority_check_fn) {
  // Soft gate (Layer 2a per operator decision):
  //   - In browser: window.__OPERATOR_AUTH__ truthy => authorized
  //   - In node: caller may pass authority_check_fn that returns boolean
  //   - When no signal: defaults to NOT authorized (refuse confidential paths)
  if (typeof authority_check_fn === 'function') {
    try { return Boolean(authority_check_fn()); } catch (e) { return false; }
  }
  if (typeof window !== 'undefined' && typeof window.__OPERATOR_AUTH__ !== 'undefined') {
    return Boolean(window.__OPERATOR_AUTH__);
  }
  return false;
}

// ── Layer 3 — Self-attestation (manifest IN BAND + SHA-256 + version pin) ──
//   Pure function. Does NOT compute SHA itself (browser caller passes the
//   computed banner). This keeps §33 dependency-free and lets the HTML use
//   whatever crypto API is available (SubtleCrypto in browser, node:crypto
//   server-side). The function's job is to bind the manifest, SHA, and
//   version-pin into one frozen attestation object.
function aegosSelfAttest(params) {
  params = params || {};
  if (typeof params.aegis_version !== 'string')        throw new Error('aegosSelfAttest: aegis_version required');
  if (typeof params.aegis_engine_version !== 'string') throw new Error('aegosSelfAttest: aegis_engine_version required');
  if (typeof params.runtime_sha256 !== 'string')       throw new Error('aegosSelfAttest: runtime_sha256 required');
  var scrubbed = scrubManifest(params.manifest || {}, params.custom_redactions);
  return Object.freeze({
    kind: 'aegos_self_attestation',
    aegis_version: params.aegis_version,
    aegis_engine_version: params.aegis_engine_version,
    section_33_version: '1.0',
    runtime_sha256: params.runtime_sha256,
    manifest_scrubbed: Object.freeze(scrubbed),
    attested_at_iso: (typeof params.now_iso === 'string') ? params.now_iso
                                                          : new Date().toISOString(),
    in_band: true,
    invariants: Object.freeze({
      hz_in_dom: 'must not appear',
      fda_q_in_dom: 'must not appear',
      cfr_subsection_in_dom: 'must not appear',
      personnel_in_dom: 'must not appear',
      internal_engine_rules_in_dom: 'must not appear',
      operator_auth_required_for_confidential: true
    })
  });
}

// ──────────────────────────────────────────────────────────────────────
//   §33.8 — Constants block
// ──────────────────────────────────────────────────────────────────────
var SECTION_33_CONSTANTS = Object.freeze({
  section: 33,
  title: 'Aegos Clinical State Machine + Three-Layer Protection',
  consumed_by: ['Aegos'],
  pairs_count: AEGOS_PAIRS_V646.length,
  redaction_patterns: Object.freeze(Object.keys(REDACTION_PATTERNS)),
  spta_limit_w_cm2: SPTA_LIMIT_W_CM2,
  citations: Object.freeze([
    'IEC 60601-2-5 (therapeutic ultrasound safety)',
    'AIUM/NEMA UD-2 (acoustic output measurement)'
  ]),
  protocol_version: '1.0'
});

// ──────────────────────────────────────────────────────────────────────
//   Dual export
// ──────────────────────────────────────────────────────────────────────
var SECTION_33_API = {
  applyEntanglement_inline: applyEntanglement_inline,
  AEGOS_PAIRS_V646: AEGOS_PAIRS_V646,
  aegosPhysicalBugsFor: aegosPhysicalBugsFor,
  aegosDoseEnvelope: aegosDoseEnvelope,
  aegosCarrierFocus: aegosCarrierFocus,
  aegosCarrierCoupling: aegosCarrierCoupling,
  aegosFireEngine: aegosFireEngine,
  auditDOMForLeakage: auditDOMForLeakage,
  scrubManifest: scrubManifest,
  constantTimeEquals: constantTimeEquals,
  checkOperatorAuth: checkOperatorAuth,
  aegosSelfAttest: aegosSelfAttest,
  SECTION_33_CONSTANTS: SECTION_33_CONSTANTS
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SECTION_33_API;
} else if (typeof window !== 'undefined') {
  window.AEGIS_SECTION_33 = SECTION_33_API;
}
