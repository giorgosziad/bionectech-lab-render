# Persona Embodiment Interface - what this is, and what it deliberately is not

CARRIED REFERENCE ARCHITECTURE. NOT WIRED into the live Lab engine.
Verified 2026-07-26: node --check clean, self-test 7/7 passed, 0 non-ASCII bytes.

## What it is
A platform-agnostic software CONTRACT: the interface any future physical
embodiment (a Sophia-class robot, a kiosk, anything else) would need to
implement to receive a persona's speech/expression requests. Proven today
with a MockRobotAdapter - a simulator with zero real hardware, because none
exists yet to build against.

The one design law worth naming: autonomousPhysicalAction is hardcoded false
in every charter, not a configurable field. A persona can REQUEST speech or
an expression; a human must pass humanConfirmed=true or the gateway refuses,
regardless of validity. This is the Lab's existing "minds prepare, humans
decide" doctrine, encoded as a gate the interface itself enforces - not a
policy that has to be remembered separately.

## What it is NOT
- NOT a robot driver. No real hardware exists to drive. The moment a specific
  platform is chosen (Sophia's SDK, a ROS-based system, anything else), a NEW
  concrete adapter class implements this same contract for that platform -
  this file changes nothing when that happens; it is the part that doesn't
  need to change.
- NOT a robotics safety design. Real physical embodiment - motion in a space
  with people - is a different engineering domain: collision avoidance,
  real-time control, the actual standards that govern this (ISO 10218 /
  ISO/TS 15066 for collaborative robots). That requires robotics and safety
  engineers and a physical review, not a software interface written from a
  codebase that has never touched hardware. This file does not attempt it
  and should not be read as having done so.
- NOT tested against anything physical. Every PASS above is the mock
  simulator behaving correctly. It proves the SOFTWARE CONTRACT is sound.
  It proves nothing about any real robot, because there is no real robot.

## Where this sits relative to Nour's masterbook
Section 11.1 (Role Charters) proposes a one-page structured definition per
persona: what it owns, what it escalates, what it may never decide.
`makeCharter()` here is the literal, executable version of that concept,
scoped specifically to physical expression - the concrete artifact a future
embodiment would consume, built now while the platform is still unknown.

## Next real step, when a platform is actually chosen
Write ONE new adapter class (e.g. SophiaAdapter extends RobotAdapter) that
implements speak/express/getStatus/emergencyStop against that platform's
real SDK. Nothing else in this file needs to change. That is the entire
point of building the contract first.
