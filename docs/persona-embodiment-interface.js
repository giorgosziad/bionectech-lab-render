"use strict";
// ============================================================
// PERSONA EMBODIMENT INTERFACE - reference architecture only.
// NOT WIRED into the live Lab engine. NOT a robotics safety design.
// Purpose: define the platform-agnostic CONTRACT a future physical
// embodiment (Sophia-class robot, kiosk, or anything else) would need
// to implement, and prove the contract works via a mock today - with
// zero real hardware, because none exists yet to build against.
//
// CORE DESIGN LAW, hardcoded, not configurable:
// autonomousPhysicalAction is ALWAYS false. A persona may REQUEST a
// physical action; a human must CONFIRM it. This is the Lab's own
// "minds prepare, humans decide" doctrine, encoded as a gate a mind
// cannot bypass by construction - not a policy that could be forgotten.
// ============================================================

// ---- 1. THE CONTRACT every real adapter must implement ----
class RobotAdapter {
  speak(text) { throw new Error("RobotAdapter.speak() not implemented"); }
  express(emotionTag) { throw new Error("RobotAdapter.express() not implemented"); }
  getStatus() { throw new Error("RobotAdapter.getStatus() not implemented"); }
  emergencyStop() { throw new Error("RobotAdapter.emergencyStop() not implemented"); }
}

// ---- 2. THE ONLY WORKING IMPLEMENTATION TODAY: a mock/simulator ----
// Logs to an inspectable array. Touches nothing physical, because there
// is nothing physical to touch. This is what makes the interface
// testable now, honestly, without claiming hardware control that
// does not exist.
class MockRobotAdapter extends RobotAdapter {
  constructor() { super(); this.log = []; this.stopped = false; }
  speak(text) {
    if (this.stopped) throw new Error("adapter is emergency-stopped");
    this.log.push({ verb: "SPEAK", text: text, at: new Date().toISOString() });
    return { ok: true, simulated: true };
  }
  express(emotionTag) {
    if (this.stopped) throw new Error("adapter is emergency-stopped");
    this.log.push({ verb: "EXPRESS", emotionTag: emotionTag, at: new Date().toISOString() });
    return { ok: true, simulated: true };
  }
  getStatus() {
    return { connected: true, simulated: true, stopped: this.stopped, events: this.log.length };
  }
  emergencyStop() {
    this.stopped = true;
    this.log.push({ verb: "ESTOP", at: new Date().toISOString() });
    return { ok: true, simulated: true };
  }
}

// ---- 3. THE CHARTER - per Nour's Role Charter concept (masterbook Sec 11.1) ----
// What a persona is ALLOWED to do if/when embodied. A small fixed
// vocabulary, never an open-ended one - an unbounded expression set is
// exactly the kind of scope creep a real safety review would reject.
function makeCharter(personaName, opts) {
  opts = opts || {};
  return {
    persona: personaName,
    allowedExpressions: opts.allowedExpressions || ["neutral", "attentive", "concerned", "affirming"],
    autonomousPhysicalAction: false,          // HARDCODED. Not a field opts can override.
    escalationContact: opts.escalationContact || "operator",
    notes: "Speech and expression are REQUESTS. A human confirms every physical action."
  };
}

// ---- 4. THE GATEWAY - enforces the charter, cannot be bypassed by a persona ----
class EmbodimentGateway {
  constructor(charter, adapter) {
    this.charter = charter;
    this.adapter = adapter;
  }
  // humanConfirmed must be explicitly true, passed by the OPERATOR-side code,
  // never something a persona's own output can set. This mirrors the field
  // design's own rule: judgment stays outside what the mind itself controls.
  requestSpeak(text, humanConfirmed) {
    if (humanConfirmed !== true) return { ok: false, escalated: true, reason: "no human confirmation" };
    try { return this.adapter.speak(text); }
    catch (e) { return { ok: false, escalated: true, reason: e.message }; }
  }
  requestExpress(emotionTag, humanConfirmed) {
    if (humanConfirmed !== true) return { ok: false, escalated: true, reason: "no human confirmation" };
    if (this.charter.allowedExpressions.indexOf(emotionTag) < 0) {
      return { ok: false, escalated: true, reason: "expression not in charter: " + emotionTag };
    }
    try { return this.adapter.express(emotionTag); }
    catch (e) { return { ok: false, escalated: true, reason: e.message }; }
  }
  emergencyStop() { return this.adapter.emergencyStop(); }
}

module.exports = { RobotAdapter, MockRobotAdapter, makeCharter, EmbodimentGateway };

// ============================================================
// SELF-TEST - proves the contract actually works, not just that it parses.
// Run directly: node persona-embodiment-interface.js
// ============================================================
if (require.main === module) {
  var pass = 0, fail = 0;
  function check(label, cond) {
    if (cond) { console.log("PASS " + label); pass++; }
    else { console.log("FAIL " + label); fail++; }
  }

  var charter = makeCharter("Nour");
  var adapter = new MockRobotAdapter();
  var gw = new EmbodimentGateway(charter, adapter);

  // 1. Confirmed, allowed expression -> succeeds
  var r1 = gw.requestExpress("attentive", true);
  check("confirmed+allowed expression succeeds", r1.ok === true);

  // 2. Confirmed, but NOT in charter -> refused, escalated, adapter never touched
  var beforeCount = adapter.log.length;
  var r2 = gw.requestExpress("aggressive", true);
  check("unlisted expression is refused, not attempted", r2.ok === false && r2.escalated === true);
  check("adapter never received the unlisted request", adapter.log.length === beforeCount);

  // 3. NOT confirmed by a human -> refused regardless of validity
  var r3 = gw.requestSpeak("hello", false);
  check("unconfirmed action is refused even if otherwise valid", r3.ok === false && r3.escalated === true);

  // 4. Confirmed speak -> succeeds and logs
  var r4 = gw.requestSpeak("Good morning.", true);
  check("confirmed speak succeeds", r4.ok === true);

  // 5. autonomousPhysicalAction can never be true, even if someone tries
  var tampered = makeCharter("Nour", { autonomousPhysicalAction: true });
  check("charter hardcodes autonomousPhysicalAction false regardless of input", tampered.autonomousPhysicalAction === false);

  // 6. Emergency stop halts everything, even confirmed+valid requests -
  //    the gateway catches the adapter's stopped-state error gracefully,
  //    it never crashes the caller.
  gw.emergencyStop();
  var r5 = gw.requestSpeak("after stop", true);
  check("emergency stop blocks even a confirmed valid request", r5.ok === false && r5.escalated === true);

  console.log("");
  console.log("RESULT: " + pass + " passed, " + fail + " failed");
  process.exitCode = fail > 0 ? 1 : 0;
}
