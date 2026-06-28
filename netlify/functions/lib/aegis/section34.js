// ════════════════════════════════════════════════════════════════════════
//   AEGIS-4M · Section 34 · OPERATOR INPUT FIDELITY GATE
// ════════════════════════════════════════════════════════════════════════
//
//   Closes the input-side hole that §31, §32, and §33 do not cover.
//
//   §31 audits the tar contents.
//   §32 audits the delivery MESSAGE for AUDIT_BLOCK.
//   §33 audits the rendered DOM and protects confidential outputs.
//   §34 audits OPERATOR-PROVIDED INPUTS — every URL, exact string, path,
//   identifier, name, or numeric value the operator hands to Claude — and
//   proves byte-for-byte that what the operator typed is what Claude used.
//
//   Origin: 2026-05-18 incident — Claude trimmed an operator-supplied URL
//   without flagging the trim. The URL was technically equivalent but
//   was NOT what the operator had decided. This is the failure mode §34
//   exists to prevent: silent substitution of operator inputs.
//
//   §34 surface:
//     §34.1   makeOperatorInputsLedger()           append-only ledger factory
//     §34.2   recordOperatorInput(ledger, label, value)   record an input
//     §34.3   assertVerbatim(ledger, label, used)  strict byte-equal check
//     §34.4   auditInputFidelity(ledger, uses)     bulk verbatim audit
//     §34.5   buildInputFidelityBlock(ledger, uses) format the delivery block
//     §34.6   enforceInputFidelity(message_text, ledger, uses)  master gate
//     §34.7   SECTION_34_CONSTANTS                 frozen export
//
//   APPEND-only. Hash-chained forward from §33. Does not modify any
//   v6.0/6.1/6.2/6.3/6.4 export.
// ════════════════════════════════════════════════════════════════════════

'use strict';

// ──────────────────────────────────────────────────────────────────────
//   §34.1 · makeOperatorInputsLedger()
//   Returns a fresh append-only ledger object. Multiple calls return
//   independent ledgers (Claude can have one per delivery).
// ──────────────────────────────────────────────────────────────────────
function makeOperatorInputsLedger() {
  var entries = [];
  return {
    kind: 'operator_inputs_ledger',
    section: 34,
    created_at_iso: new Date().toISOString(),
    entries: entries,
    // expose a read-only count for inspection
    size: function () { return entries.length; },
    // snapshot — frozen copy for attestation
    snapshot: function () {
      return Object.freeze({
        kind: 'operator_inputs_ledger_snapshot',
        section: 34,
        size: entries.length,
        entries: Object.freeze(entries.map(function (e) {
          return Object.freeze({
            label: e.label,
            value: e.value,
            value_length: e.value.length,
            recorded_at_iso: e.recorded_at_iso
          });
        }))
      });
    }
  };
}

// ──────────────────────────────────────────────────────────────────────
//   §34.2 · recordOperatorInput(ledger, label, value)
//   Appends an operator-provided input to the ledger. label is a short
//   human-readable name (e.g., 'aegos_url'); value is the EXACT string
//   the operator provided, byte-for-byte. Returns the appended entry.
// ──────────────────────────────────────────────────────────────────────
function recordOperatorInput(ledger, label, value) {
  if (!ledger || ledger.kind !== 'operator_inputs_ledger') {
    throw new Error('recordOperatorInput: ledger must come from makeOperatorInputsLedger()');
  }
  if (typeof label !== 'string' || label.length === 0) {
    throw new Error('recordOperatorInput: label must be a non-empty string');
  }
  if (typeof value !== 'string') {
    throw new Error('recordOperatorInput: value must be a string (use String(x) for numbers/IDs)');
  }
  var entry = Object.freeze({
    label: label,
    value: value,
    value_length: value.length,
    recorded_at_iso: new Date().toISOString()
  });
  ledger.entries.push(entry);
  return entry;
}

// ──────────────────────────────────────────────────────────────────────
//   §34.3 · assertVerbatim(ledger, label, used)
//   Strict byte-equal comparison between the ledger entry for `label`
//   and the string `used` (what Claude actually placed in the deliverable).
//   Returns { ok, label, expected, actual, mismatch_at }.
//   The mismatch_at field gives the byte index of the first difference,
//   or -1 when ok.
// ──────────────────────────────────────────────────────────────────────
function assertVerbatim(ledger, label, used) {
  if (!ledger || ledger.kind !== 'operator_inputs_ledger') {
    throw new Error('assertVerbatim: ledger required');
  }
  if (typeof used !== 'string') {
    return Object.freeze({
      ok: false,
      label: label,
      code: 'USED_NOT_STRING',
      expected: null,
      actual: String(used),
      mismatch_at: 0
    });
  }
  var found = null;
  for (var i = 0; i < ledger.entries.length; i++) {
    if (ledger.entries[i].label === label) { found = ledger.entries[i]; break; }
  }
  if (!found) {
    return Object.freeze({
      ok: false,
      label: label,
      code: 'LABEL_NOT_IN_LEDGER',
      expected: null,
      actual: used,
      mismatch_at: 0
    });
  }
  // Byte-for-byte comparison
  if (found.value === used) {
    return Object.freeze({
      ok: true,
      label: label,
      code: 'VERBATIM',
      expected: found.value,
      actual: used,
      mismatch_at: -1,
      length: used.length
    });
  }
  // Find first differing byte
  var maxLen = Math.max(found.value.length, used.length);
  var idx = -1;
  for (var j = 0; j < maxLen; j++) {
    var a = j < found.value.length ? found.value.charCodeAt(j) : -1;
    var b = j < used.length ? used.charCodeAt(j) : -1;
    if (a !== b) { idx = j; break; }
  }
  return Object.freeze({
    ok: false,
    label: label,
    code: found.value.length === used.length ? 'BYTE_MISMATCH' : 'LENGTH_MISMATCH',
    expected: found.value,
    actual: used,
    expected_length: found.value.length,
    actual_length: used.length,
    mismatch_at: idx,
    // helpful slice for human debugging
    expected_around_mismatch: found.value.slice(Math.max(0, idx - 8), idx + 16),
    actual_around_mismatch: used.slice(Math.max(0, idx - 8), idx + 16)
  });
}

// ──────────────────────────────────────────────────────────────────────
//   §34.4 · auditInputFidelity(ledger, uses)
//   Bulk audit. `uses` is an array of { label, used } pairs that
//   Claude reports as "I used the operator's `label` and put `used` in
//   the deliverable." Runs assertVerbatim on each and aggregates.
//   Returns { ok, total, verbatim, mismatches, results, summary }.
// ──────────────────────────────────────────────────────────────────────
function auditInputFidelity(ledger, uses) {
  if (!Array.isArray(uses)) throw new Error('auditInputFidelity: uses must be an array of {label, used} pairs');
  var results = uses.map(function (u) { return assertVerbatim(ledger, u.label, u.used); });
  var verbatim = results.filter(function (r) { return r.ok; }).length;
  var mismatches = results.length - verbatim;
  // Also flag any ledger entries that were never audited (drop-on-floor detection)
  var auditedLabels = {};
  uses.forEach(function (u) { auditedLabels[u.label] = true; });
  var unaudited = ledger.entries
    .filter(function (e) { return !auditedLabels[e.label]; })
    .map(function (e) { return e.label; });
  return Object.freeze({
    ok: mismatches === 0 && unaudited.length === 0,
    total: results.length,
    verbatim: verbatim,
    mismatches: mismatches,
    unaudited_labels: unaudited,
    results: Object.freeze(results),
    summary: (mismatches === 0 && unaudited.length === 0)
      ? 'INPUT FIDELITY CLEAN · ' + verbatim + '/' + results.length + ' verbatim · 0 unaudited'
      : 'INPUT FIDELITY FAILED · ' + mismatches + ' mismatch(es) · ' + unaudited.length + ' unaudited'
  });
}

// ──────────────────────────────────────────────────────────────────────
//   §34.5 · buildInputFidelityBlock(ledger, uses)
//   Formats the INPUT_FIDELITY_BLOCK string for inclusion in a delivery
//   message. Mirrors the AUDIT_BLOCK shape from §32 for structural
//   familiarity.
// ──────────────────────────────────────────────────────────────────────
function buildInputFidelityBlock(ledger, uses) {
  var audit = auditInputFidelity(ledger, uses);
  var lines = [
    'INPUT_FIDELITY_BLOCK · §34 auditInputFidelity',
    '  inputs_recorded : ' + ledger.entries.length,
    '  inputs_audited  : ' + audit.total,
    '  inputs_verbatim : ' + audit.verbatim,
    '  mismatches      : ' + audit.mismatches,
    '  unaudited       : ' + audit.unaudited_labels.length +
        (audit.unaudited_labels.length > 0 ? ' (' + audit.unaudited_labels.join(', ') + ')' : ''),
    '  summary         : ' + audit.summary,
    '  read_protocol   : recordOperatorInput → assertVerbatim per use → require ok=true'
  ];
  if (audit.mismatches > 0) {
    lines.push('  mismatch_detail :');
    audit.results.forEach(function (r) {
      if (!r.ok) {
        lines.push('    - [' + r.code + '] label=' + r.label +
          ' mismatch_at=' + r.mismatch_at +
          (r.expected_around_mismatch !== undefined
            ? ' · expected=' + JSON.stringify(r.expected_around_mismatch) +
              ' · actual=' + JSON.stringify(r.actual_around_mismatch)
            : ''));
      }
    });
  }
  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────────────
//   §34.6 · enforceInputFidelity(message_text, ledger, uses)
//   Master gate: validates a delivery message contains an
//   INPUT_FIDELITY_BLOCK that matches the ledger + uses pairing.
//   Returns { ok, findings }.
// ──────────────────────────────────────────────────────────────────────
function enforceInputFidelity(message_text, ledger, uses) {
  if (typeof message_text !== 'string') {
    return Object.freeze({ ok: false, findings: [{ code: 'BAD_MESSAGE', detail: 'message_text must be string' }] });
  }
  var findings = [];
  if (message_text.indexOf('INPUT_FIDELITY_BLOCK') < 0) {
    findings.push({ code: 'INPUT_FIDELITY_BLOCK_MISSING', detail: 'No INPUT_FIDELITY_BLOCK marker in delivery message' });
    return Object.freeze({ ok: false, findings: findings });
  }
  var audit = auditInputFidelity(ledger, uses);
  if (!audit.ok) {
    findings.push({ code: 'INPUT_FIDELITY_AUDIT_FAILED', detail: audit.summary });
  }
  // Cross-check: the message's reported counts match audit
  var recMatch = message_text.match(/inputs_recorded\s*:\s*(\d+)/);
  if (recMatch && parseInt(recMatch[1], 10) !== ledger.entries.length) {
    findings.push({ code: 'RECORDED_COUNT_MISMATCH',
      detail: 'message says ' + recMatch[1] + ', ledger has ' + ledger.entries.length });
  }
  var mismatchMatch = message_text.match(/mismatches\s*:\s*(\d+)/);
  if (mismatchMatch && parseInt(mismatchMatch[1], 10) !== audit.mismatches) {
    findings.push({ code: 'MISMATCH_COUNT_INCORRECT',
      detail: 'message says ' + mismatchMatch[1] + ', actual ' + audit.mismatches });
  }
  return Object.freeze({ ok: findings.length === 0, findings: findings, audit: audit });
}

// ──────────────────────────────────────────────────────────────────────
//   §34.7 · SECTION_34_CONSTANTS (frozen export)
// ──────────────────────────────────────────────────────────────────────
var SECTION_34_CONSTANTS = Object.freeze({
  section: 34,
  title: 'Operator Input Fidelity Gate',
  closes: 'silent-substitution failure mode (2026-05-18 URL-trim incident)',
  rule: 'Inputs the operator provides — URLs, file paths, exact strings, names, ' +
        'numbers, IDs — are used verbatim. Never trimmed, normalized, cleaned, ' +
        'or reformatted. If a change is needed, ask the operator first.',
  delivery_requirement:
    'Every delivery that incorporates operator-provided strings MUST end with ' +
    'an INPUT_FIDELITY_BLOCK alongside the AUDIT_BLOCK (§32).',
  enforcement: Object.freeze([
    'Claude records every operator-provided input via recordOperatorInput at receipt',
    'Claude calls assertVerbatim before placing the input in the deliverable',
    'Claude appends INPUT_FIDELITY_BLOCK to the delivery message',
    'Operator (or auditor) re-runs assertVerbatim from the delivered tar to verify'
  ]),
  protocol_version: '1.0',
  canonical_date: '2026-05-18'
});

// ──────────────────────────────────────────────────────────────────────
//   Dual export
// ──────────────────────────────────────────────────────────────────────
var SECTION_34_API = {
  makeOperatorInputsLedger: makeOperatorInputsLedger,
  recordOperatorInput: recordOperatorInput,
  assertVerbatim: assertVerbatim,
  auditInputFidelity: auditInputFidelity,
  buildInputFidelityBlock: buildInputFidelityBlock,
  enforceInputFidelity: enforceInputFidelity,
  SECTION_34_CONSTANTS: SECTION_34_CONSTANTS
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SECTION_34_API;
} else if (typeof window !== 'undefined') {
  window.AEGIS_SECTION_34 = SECTION_34_API;
}
