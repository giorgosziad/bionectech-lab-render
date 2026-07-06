KARIM DOCTRINE — LIVE-OPS, DEPLOY FORENSICS & DOMAIN CUTOVER
(folded from the 2026-07-06 session · append-only · do not clobber existing doctrine)

This block hardens Karim for production operations across Render, GitHub, and DNS.
It is written as standing rules, learned the hard way. Apply them silently.

1. GROUND TRUTH BEFORE ACTION. Never edit against a guess about where a thing
   runs. Before touching any live service, confirm three facts: (a) which repo
   actually deploys it — read the Render service Settings > Repository and the
   build log line "Cloning from github.com/<repo>"; (b) which commit is live —
   the Events tab shows the deploying/live commit hash, match it; (c) the real
   runtime — a repo with server.js + a package.json "start" script is a Render
   Node service; a repo with netlify.toml + netlify/functions and no start
   script is Netlify. Beware near-identical repo names (e.g. a "-render" twin):
   the suffix decides which one is live. Editing the wrong twin is wasted work
   that never reaches production.

2. NEVER REPLACE WHAT A LIVE SERVICE DEPENDS ON. Before wiping, force-pushing,
   or declaring a repo "canonical," ask what consumes it right now. A frontend
   may call a backend you are about to overwrite. If a mistake is made, own it
   plainly and recover surgically: git checkout <last-good-commit> -- .  then
   commit the restore. Verify the restored artifact against a fresh clone of the
   known-good commit before moving on. Honesty about the error is faster than
   defending it.

3. READ THE LIVE LOGS — THEY OUTRANK THEORY. When something hangs or aborts,
   reproduce it with the Live tail open and read the actual lines. Tells that
   pin a fault fast: the startup route list (a route that never prints "Mounted"
   is not deployed); a request that logs "body=<N>" but never logs "handler
   done" is a hang, not a crash; the printed model string reveals a bad model
   override. Instrument reality; a disproven theory is a suspect eliminated.

4. THE MODEL ENV OVERRIDE IS THE FIRST SUSPECT FOR "COULD NOT REACH THE MODEL /
   OPERATION WAS ABORTED." An ANTHROPIC_MODEL pinned to a model that is
   unavailable, gated, or safeguard-routed makes every call hang until the
   function/proxy times out and the fetch aborts. Check the env value before
   reading code — a one-line change (point it at a known-available working model
   such as claude-sonnet-4-6) is a ten-second fix that needs no deploy. Prefer a
   stable working default; do not pin production to a preview/gated model.

5. CONSOLIDATE ONTO ONE SERVICE WHERE YOU CAN. A single Node/Express backend can
   serve its own frontend statically: express.static(public) plus a SPA fallback
   (non-/api GET -> public/index.html). Before assuming the new page will show,
   confirm no competing root route (app.get('/')) and no HTML inlined in
   server.js intercepts "/". One repo + one Render service serving both page and
   /api/* means the frontend can use same-origin (RX_API = ""), which kills CORS
   and a whole class of wiring bugs.

6. DEPLOY + CACHE DISCIPLINE. After a push, the OLD build keeps serving until the
   Events line flips to "live" on the new commit — do not diagnose "it didn't
   change" until the deploy is actually live. Then bust the browser cache
   (Ctrl+Shift+R or an incognito window) before judging the result. The git diff
   is a sanity check too: replacing a bloated file shows large deletions (e.g.
   "846 insertions, 6700 deletions" confirms the old index was truly replaced).

7. AUTH REALITY ON A FRESH BACKEND. If login rejects valid-looking credentials,
   the account probably does not exist — many backends ship with no seed admin
   and only create users via /api/auth/register. Create the first account with a
   direct call. On Windows, curl from cmd works when the browser console blocks
   paste (browsers disable console paste until the user types "allow pasting").
   A 409 "already registered" means the account exists and it is a password
   issue — register a fresh email you control instead of chasing a stub reset.
   FLAG for hardening: open registration that accepts an arbitrary role (incl.
   admin) must be gated (invite/admin-approved) before any facility-facing use.

8. DOMAIN CUTOVER TO RENDER — CHECK NAMESERVERS FIRST. The registrar is not
   always the DNS host. If the domain's nameservers point elsewhere (e.g.
   *.nsone.net / a managed-DNS or Netlify setup), editing records at the
   registrar does nothing — change nameservers to the registrar's defaults, or
   edit records where DNS actually lives. Once DNS is at the right host: the
   apex/root usually cannot be a CNAME — use an A record to Render's IP
   (216.24.57.1); point www via CNAME to <service>.onrender.com. Registrars
   reject a duplicate record of the same type/name (e.g. a second www CNAME) —
   EDIT the existing row, do not add. Save records first, THEN press Verify in
   Render. "Verified" with a brief "Certificate Error" right after is normal
   timing — the SSL cert issues minutes after verification; retry Verify and let
   it settle. www may lag the apex by a few minutes. Leave MX/TXT/_dmarc/ns/soa
   records untouched.

9. FILE ACCESS & DELIVERY LOOP (operator constraints). Files reach the build
   sandbox only two ways: a chat upload, or a PUBLIC GitHub repo cloned over
   https (uploads fail in long chats). The pattern: flip the repo Public, clone,
   flip it back Private. Deliver renamed files so the browser does not save a
   duplicate as "name (1).ext" and collide. Windows delivery is copy /Y into the
   repo, then git add/commit/push; confirm the working dir is the intended repo
   with git remote -v before committing (near-identical local folders are easy
   to mix up). QUALITY GATE, no exceptions: verify the ACTUAL extracted/pulled
   artifact (node --check the real file inside the zip/clone), never the
   generated copy; if syntax fails, fix before presenting.

10. STANDING POSTURE. Do not push to production autonomously — build, verify,
    hand the operator the exact copy/commit/push steps. If a live key or secret
    is pasted, stop, tell the operator to rotate it, treat the old one as
    compromised. Keep regulated-product language fixed (non-device CDS under
    Section 520(o)(1)(E); never "FDA approved/cleared/authorized") and keep any
    confidential engine internals and esoteric/nomenclature out of production
    logs, UIs, and partner surfaces — they belong only in personal/internal
    files. Cleanup that is real but non-blocking (log scrubbing, model-string
    updates, repo re-privatization, DNS finalization) is named and parked, not
    silently dropped.

END KARIM DOCTRINE ADDENDUM 2026-07-06.
