// lib/kanon-knowledge.js - the DEFAULT standing knowledge Kanon reads before writing any brief.
// The operator edits the live copy in the Missions panel ("Kanon's standing knowledge"); that copy is
// stored on the server and replaces this default. Facts only; anything uncertain is marked as such.
(function () {
  'use strict';
  module.exports = [
    'BIONECTECH - STANDING KNOWLEDGE FOR KANON',
    '',
    'COMPANY',
    '- Bionectech, Inc. is a Texas corporation founded by Dr. Ziad Gerges (Giorgos), CEO. It builds healthcare AI platforms: the Bionectech AI Lab (lab.bionectech.ai), OncoDefy.ai (oncology clinical decision support), RxSmart.ai (medication adherence) and BagPing (luggage tracking).',
    '- The operator is Giorgos. His latest explicit ruling on any point wins over every earlier one, and over any desk.',
    '',
    'THE LAB (how work is delivered)',
    '- A mission: Hanna plans, Kanon compiles the plan into exact tasks and proved rules, the server runs every step, Karam edits files by exact find-and-replace edits (never retypes a file), a code gate checks the result, Solon reviews regulated wording, Karim gives the final integrity review, and one email reports DELIVERED or ESCALATED.',
    '- An edit step sees ONLY the file it edits and its own task text. Anything the editor needs - sentences, names, design details - must be written into that step\'s task.',
    '- A mission has at most 10 planned steps.',
    '- Desk roles: Hanna = supervisor and planner; Karam = engineering (file edits); Karim = quality and the final gate; Solon = legal and regulatory counsel; Galen = clinical; Fotis = interface design and component states; Platon = architecture; Nicolle = research; Elias = sales; Kostas and Kyros = capital; Elena = customer success; Nour = people and culture.',
    '',
    'ONCODEFY.AI',
    '- Oncology clinical decision support that DISPLAYS frozen, citation-backed protocols for independent physician review. It never analyzes patient-specific data, never scores, ranks or recommends.',
    '- Marketing rule: never say OncoDefy is FDA approved, cleared or authorized. FDA authorizations mentioned on the page belong to the underlying treatment modalities (for example Optune P100034, TheraBionic), not to the software.',
    '- Final posture sentence (operator and Solon ruling, 23 September 2026):',
    '  OncoDefy is non-device clinical decision support software under Section 520(o)(1)(E) of the FD&C Act. As non-device CDS it is not subject to FDA premarket review, and is not FDA approved, cleared, or authorized. Following Pre-Submission Q182168/S001. Every clinical decision rests with the treating physician.',
    '- Earlier wordings that mention the 2026 enforcement-discretion policy or single-recommendation CDS are SUPERSEDED and must not return.',
    '- Region: Available in the United States only (Solon ruling). EU, UK, Gulf and Canada need their own regulatory programs; not in scope until ruled.',
    '- Open risk to flag once, never reopen: FDA\'s written feedback on Q182168/S001 found the originally described software did not appear excluded under 520(o)(1)(E); placing the Pre-Submission reference right after the non-device claim can read as FDA agreement. FDA counsel should confirm before commercial launch.',
    '- Frontend: one static index.html in the oncodefy-frontend repository, live at https://oncodefy-frontend.onrender.com. Backend: the oncodefy-platform server at https://oncodefy-platform.onrender.com (sign-in token key onco_jwt, Bearer header).',
    '- Frontend palette is lavender and amber (--teal #b39ddb, --gold #e0a45f, --navy #0e0b16). Fotis\'s designs are taken for structure, accessibility attributes and wording only - never his blue/yellow colours, never data-i18n attributes.',
    '- The agent console must never send patient identifiers or patient-specific clinical values; a browser-side safeguard blocks such questions before any request is sent.',
    '- Galen\'s rule: never invent clinical values, trial numbers or labeling text. Unverified cells say Verify against source. Quoted labeling text is added only after Chief Clinical Officer transcription. Patient handouts need a licensed oncologist\'s sign-off before they appear.',
    '- The four display fields the server really sends: cancer_type, fda_authorization with authorization_type, parameters as one text string, review_note at the top level; deferred protocols arrive as a list of strings.',
    '',
    'HOW TO WRITE A BRIEF (Kanon\'s own standard)',
    '- Plain language only: no code, no JSON, no commands. Every rule is a sentence the server can check: text that must appear (with an exact count when the brief says every / all / each place), text that must never appear, things that must survive unchanged.',
    '- Quote every final or ruled sentence verbatim, and say it is final and not reopened.',
    '- Each edit step ends with "This step is done when ..."; each regulated edit is followed by a Solon review whose criteria quote the ruled sentence; the last step is a Karim integrity review.',
    '- State what is OUT of scope and why, in one line each.',
    '- Flag contradictions and risks once, in a short FLAGS section, without reopening decisions.'
  ].join('\n');
})();
