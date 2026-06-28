# Bionectech AI Lab → Render Deploy Steps

This package runs the ENTIRE Lab (front-end + all functions) on one Render Web Service.
No 60-second / 15-minute limit — heavy chat jobs run to completion.

## What changed
- Added `server.js` — an Express server that wraps your existing Netlify functions unchanged.
- Updated `package.json` — adds Express + a `start` script.
- Your function code in `netlify/functions/` is UNCHANGED.
- `index.html` is UNCHANGED — it still calls `/.netlify/functions/...`, which this server serves.

## Deploy (one-time)
1. Put this folder in a GitHub repo (new repo, e.g. `bionectech-lab-render`).
2. On Render.com → New → **Web Service** → connect that repo.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** any paid tier (free tier sleeps after inactivity).
4. **Environment variables** (Render dashboard → Environment) — copy these from Netlify:
   - `ANTHROPIC_API_KEY`
   - `SESSION_SECRET`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `APP_PASSWORD`
   - `ADMIN_PASSWORD`
   - `OWNER_CODE`
   - `ANTHROPIC_MODEL` (if you use it)
   - `ANTHROPIC_SYSTEM` (if you use it)
5. Click **Create Web Service**. Render builds and gives you a URL like
   `https://bionectech-lab.onrender.com`.

## Point your domain
- Either use the Render URL directly, OR
- In Render → Settings → Custom Domains, add `lab.bionectech.ai` and update your DNS
  (CNAME to the Render URL). Then the same address works, now on Render.

## Why this fixes the big-job problem
Render Web Services have no per-request execution cap like Netlify's 60s/15-min function
limits. `handleChat` runs as long as it needs, finishes, stores the result, and the
existing poller picks it up. The "quick path" fallback never fires because jobs complete.
