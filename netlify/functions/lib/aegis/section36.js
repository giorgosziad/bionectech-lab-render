// ════════════════════════════════════════════════════════════════════════
//   AEGIS-4M · Section 36 · STANDARDIZED_BAND REMEDIATION WITNESS
// ════════════════════════════════════════════════════════════════════════
//
//   Generic standardized-band remediation witness. Encodes the
//   structural pattern for asserting that a platform's frozen registry
//   has standardized a previously-divergent parameter set to a band
//   drawn from upstream authoritative reference documents.
//
//   This section is platform-agnostic. Platform-specific data
//   (original registry snapshot, standardized band values, source
//   identification) is supplied at runtime via configuration. The
//   engine does not embed any particular product, indication,
//   identifier, parameter, or authority reference.
//
//   NOTE: §36 STANDARDIZED_BAND framing is superseded by §37
//   PER_ENTITY_ALIGNMENT for any platform that adopts the per-entity
//   pattern. §36 is preserved as the structural acknowledgement of
//   the upstream finding; §37 is the operative corrective pattern.
//
//   §36 surface (APPEND-only, hash-chained forward from §35):
//     §36.1  buildOriginalRegistrySnapshot              caller-supplied
//     §36.2  buildStandardizedBand                      caller-supplied
//     §36.3  validateEntryAgainstStandardizedBand       per-entry band check
//     §36.4  assertStandardizedBandRemediation          structural assertion
//     §36.5  writeStandardizedBandRemediationChain      chains from §35
//     §36.6  buildBandRemediationWitnessBlock           renders witness block
//     §36.7  SECTION_36_CONSTANTS                       frozen export
//
//   APPEND-only. Does not modify §35, §34, or any prior export.
// ════════════════════════════════════════════════════════════════════════

'use strict';

var crypto = require('crypto');

// ──────────────────────────────────────────────────────────────────────
//   §36.1 · buildOriginalRegistrySnapshot(snapshot)
//   Frozen record of the platform's original registry state at the
//   moment the upstream finding was issued. Caller supplies the
//   snapshot data; engine does not embed any specific historical state.
// ──────────────────────────────────────────────────────────────────────
function buildOriginalRegistrySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new TypeError('snapshot must be an object');
  }
  return Object.freeze({
    kind: 'original_registry_snapshot',
    filed_on: snapshot.filed_on || null,
    source_document_id: snapshot.source_document_id || null,
    uniform_parameter_name: snapshot.uniform_parameter_name || null,
    uniform_parameter_value: snapshot.uniform_parameter_value || null,
    entry_count: Array.isArray(snapshot.entries) ? snapshot.entries.length : 0,
    upstream_finding_summary: snapshot.upstream_finding_summary || null
  });
}

// ──────────────────────────────────────────────────────────────────────
//   §36.2 · buildStandardizedBand(band)
//   Frozen declaration of the standardized band that replaces the
//   prior uniform parameter. Caller supplies band metadata; engine
//   does not embed any specific band values.
// ──────────────────────────────────────────────────────────────────────
function buildStandardizedBand(band) {
  if (!band || typeof band !== 'object') {
    throw new TypeError('band must be an object');
  }
  if (typeof band.min !== 'number' || typeof band.max !== 'number') {
    throw new TypeError('band.min and band.max must be numbers');
  }
  return Object.freeze({
    kind: 'standardized_band',
    min: band.min,
    max: band.max,
    unit: band.unit || null,
    source_type: band.source_type || null,
    source_description: band.source_description || null,
    replaces_prior_parameter: band.replaces_prior_parameter || null
  });
}

// ──────────────────────────────────────────────────────────────────────
//   §36.3 · validateEntryAgainstStandardizedBand(entry, band)
//   Per-entry band check. Caller supplies entry with stated
//   min/max parameters; engine compares to the band.
// ──────────────────────────────────────────────────────────────────────
function validateEntryAgainstStandardizedBand(entry, band) {
  if (!entry || typeof entry !== 'object') {
    throw new TypeError('entry must be an object');
  }
  if (!band || typeof band !== 'object') {
    throw new TypeError('band must be an object');
  }
  var min = entry.parameter_min;
  var max = entry.parameter_max;
  if (typeof min !== 'number' || typeof max !== 'number') {
    return Object.freeze({
      kind: 'entry_band_validation',
      entry_id: entry.entry_id || null,
      in_band: false,
      parameter_min: null,
      parameter_max: null,
      deviation: '__parameter_not_numeric__',
      band_min: band.min,
      band_max: band.max
    });
  }
  var bmin = band.min, bmax = band.max;
  var in_band = (min >= bmin) && (max <= bmax) && (min <= max);
  var deviation = 'NONE';
  if (!in_band) {
    if (min < bmin && max > bmax)      deviation = 'OUT_OF_BAND_BOTH_ENDS';
    else if (min < bmin)                deviation = 'OUT_OF_BAND_LOW';
    else if (max > bmax)                deviation = 'OUT_OF_BAND_HIGH';
    else if (min > max)                 deviation = 'INVERTED_RANGE';
  }
  return Object.freeze({
    kind: 'entry_band_validation',
    entry_id: entry.entry_id || null,
    in_band: in_band,
    parameter_min: min,
    parameter_max: max,
    deviation: deviation,
    band_min: bmin,
    band_max: bmax
  });
}

// ──────────────────────────────────────────────────────────────────────
//   §36.4 · assertStandardizedBandRemediation(facts)
//   Structural assertion under §36 (legacy pattern). Modern platforms
//   should adopt §37 PER_ENTITY_ALIGNMENT instead.
// ──────────────────────────────────────────────────────────────────────
function assertStandardizedBandRemediation(facts) {
  if (!facts || typeof facts !== 'object') {
    return Object.freeze({
      kind: 'standardized_band_remediation_witness',
      section: 36,
      met: false,
      assessment: 'STANDARDIZED_BAND_REMEDIATION_NOT_MET',
      reason: '__facts_object_missing__',
      per_entry_validations: Object.freeze([])
    });
  }
  var single_rec = facts.single_recommendation_per_indication === true;
  var traces_to_label = facts.parameters_trace_to_authoritative_reference === true;
  var band = facts.standardized_band || null;
  var entries = Array.isArray(facts.corrected_entries) ? facts.corrected_entries : [];
  if (!band) {
    return Object.freeze({
      kind: 'standardized_band_remediation_witness',
      section: 36,
      met: false,
      assessment: 'STANDARDIZED_BAND_REMEDIATION_NOT_MET',
      reason: '__standardized_band_missing__',
      per_entry_validations: Object.freeze([])
    });
  }
  var validations = entries.map(function (e) {
    return validateEntryAgainstStandardizedBand(e, band);
  });
  var all_in_band = validations.length > 0 &&
    validations.every(function (v) { return v.in_band === true; });
  var met = single_rec && traces_to_label && all_in_band;
  var reason = met ? 'ALL_CONDITIONS_MET' : (
    !single_rec      ? 'SINGLE_RECOMMENDATION_FLAG_NOT_SET' :
    !traces_to_label ? 'PARAMETERS_DO_NOT_TRACE_TO_AUTHORITATIVE_REFERENCE' :
    validations.length === 0 ? 'NO_CORRECTED_ENTRIES_SUPPLIED' :
    'ONE_OR_MORE_ENTRIES_OUT_OF_BAND'
  );
  return Object.freeze({
    kind: 'standardized_band_remediation_witness',
    section: 36,
    met: met,
    assessment: met ? 'STANDARDIZED_BAND_REMEDIATION_QUALIFIES'
                    : 'STANDARDIZED_BAND_REMEDIATION_NOT_MET',
    single_recommendation_flag: single_rec,
    parameters_trace_to_authoritative_reference: traces_to_label,
    entries_count: validations.length,
    entries_in_band: validations.filter(function (v) { return v.in_band; }).length,
    band_min: band.min,
    band_max: band.max,
    per_entry_validations: Object.freeze(validations),
    reason: reason,
    deterministic: true,
    note: 'For platforms requiring per-entity alignment (not uniform band), use §37.'
  });
}

// ──────────────────────────────────────────────────────────────────────
//   §36.5 · writeStandardizedBandRemediationChain(facts, opts)
// ──────────────────────────────────────────────────────────────────────
function writeStandardizedBandRemediationChain(facts, opts) {
  opts = opts || {};
  var witness = assertStandardizedBandRemediation(facts);
  var prior = opts.prior_chain_hash || '';
  var stages = [
    { stage: 'standardized_band_declared', payload: facts.standardized_band || {} },
    { stage: 'standardized_band_witness',  payload: witness }
  ];
  var chain = [];
  for (var i = 0; i < stages.length; i++) {
    var artifact_hash = crypto.createHash('sha256')
      .update(_stableStringify(stages[i].payload))
      .digest('hex');
    var chain_hash = crypto.createHash('sha256')
      .update(prior + '|' + artifact_hash)
      .digest('hex');
    chain.push({
      stage: stages[i].stage,
      artifact_hash: artifact_hash,
      chain_hash: chain_hash
    });
    prior = chain_hash;
  }
  return Object.freeze({
    kind: 'standardized_band_remediation_chain',
    section: 36,
    witness: witness,
    chain: Object.freeze(chain),
    terminal_hash: chain[chain.length - 1].chain_hash,
    prior_chain_hash: opts.prior_chain_hash || '',
    deterministic: true
  });
}

function _stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    var parts = [];
    for (var i = 0; i < value.length; i++) parts.push(_stableStringify(value[i]));
    return '[' + parts.join(',') + ']';
  }
  var keys = Object.keys(value).sort();
  var kv = [];
  for (var j = 0; j < keys.length; j++) {
    kv.push(JSON.stringify(keys[j]) + ':' + _stableStringify(value[keys[j]]));
  }
  return '{' + kv.join(',') + '}';
}

// ──────────────────────────────────────────────────────────────────────
//   §36.6 · buildBandRemediationWitnessBlock(chain_record, render_opts)
// ──────────────────────────────────────────────────────────────────────
function buildBandRemediationWitnessBlock(chain_record, render_opts) {
  if (!chain_record || chain_record.kind !== 'standardized_band_remediation_chain') {
    throw new TypeError('chain_record must be output of writeStandardizedBandRemediationChain');
  }
  render_opts = render_opts || {};
  var w = chain_record.witness;
  var lines = [];
  lines.push((render_opts.title || 'STANDARDIZED_BAND_REMEDIATION_WITNESS_BLOCK') +
             ' · AEGIS-4M v6.4.6 · §36');
  lines.push('  platform           : ' + (render_opts.platform_label || 'unspecified'));
  lines.push('  band               : ' + w.band_min + ' to ' + w.band_max);
  lines.push('  entries_total      : ' + w.entries_count);
  lines.push('  entries_in_band    : ' + w.entries_in_band);
  lines.push('  assessment         : ' + w.assessment);
  lines.push('  prior_chain_hash   : ' + chain_record.prior_chain_hash);
  lines.push('  terminal_chain_hash: ' + chain_record.terminal_hash);
  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────────────
//   §36.7 · SECTION_36_CONSTANTS
// ──────────────────────────────────────────────────────────────────────
var SECTION_36_CONSTANTS = Object.freeze({
  version: '1.1.0',
  parent_engine: 'AEGIS-4M v6.4.6',
  hash_chain_predecessor_section: 35,
  rule:
    'A standardized-band remediation pattern asserts that a previously-' +
    'divergent platform parameter has been standardized to a band drawn ' +
    'from upstream authoritative reference documents. Modern platforms ' +
    'requiring per-entity alignment should adopt §37 instead.',
  superseded_for_per_entity_use_by: 37
});

// ──────────────────────────────────────────────────────────────────────
//   Dual export
// ──────────────────────────────────────────────────────────────────────
var SECTION_36_API = {
  buildOriginalRegistrySnapshot: buildOriginalRegistrySnapshot,
  buildStandardizedBand: buildStandardizedBand,
  validateEntryAgainstStandardizedBand: validateEntryAgainstStandardizedBand,
  assertStandardizedBandRemediation: assertStandardizedBandRemediation,
  writeStandardizedBandRemediationChain: writeStandardizedBandRemediationChain,
  buildBandRemediationWitnessBlock: buildBandRemediationWitnessBlock,
  SECTION_36_CONSTANTS: SECTION_36_CONSTANTS
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SECTION_36_API;
} else if (typeof window !== 'undefined') {
  window.AEGIS_SECTION_36 = SECTION_36_API;
}
