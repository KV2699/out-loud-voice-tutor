/* =========================================================================
   VOICE TUTOR — token server

   The browser is never trusted with the AssemblyAI API key. It asks this
   server for a short-lived token, and this server is the only thing that
   ever sees the real key.

   Two things about AssemblyAI's tokens drive the whole design:

     1. `expires_in_seconds` is REQUIRED on the token call. Omit it and the
        request is rejected with a 400, which surfaces in the browser as a
        WebSocket that simply never opens.
     2. Each token is ONE-TIME USE. It buys a single WebSocket connection
        inside its redemption window. So every reconnect — including the
        automatic one after a dropped socket — has to come back here for a
        fresh token. There is no caching one and reusing it.
   ========================================================================= */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const API_KEY = process.env.ASSEMBLYAI_API_KEY;

const TOKEN_URL = 'https://agents.assemblyai.com/v1/token';

/* The redemption window only has to cover "browser receives token, browser
   opens socket" — a couple of seconds in practice. 120s is generous without
   leaving a usable token lying around in a tab that was left open. */
const EXPIRES_IN_SECONDS = 120;
const MAX_SESSION_SECONDS = 1500;          /* 25 min. The browser caps itself at
                                              20 and closes after 3 idle, so this
                                              only ever fires if the page dies
                                              without closing the socket — which
                                              is exactly the case that used to
                                              bill for the full half hour. */

/* ------------------------------------------------------------------------
   THE SESSION LEDGER

   "How much did that run cost?" was unanswerable, because a successful token
   mint was never recorded — only failures were. One token is one session, and
   a session bills at $4.50/hr for as long as its socket stays open, so the
   count of tokens is the only local evidence of spend there is.

   Appended to server/sessions.log, which is gitignored along with the rest of
   the private files. Nothing sensitive: a timestamp and a running count.
   ---------------------------------------------------------------------- */
const LEDGER = path.join(__dirname, 'sessions.log');
let sessionCount = 0;
try {
  sessionCount = (fs.readFileSync(LEDGER, 'utf8').match(/\n/g) || []).length;
} catch (e) {}

function noteSession() {
  sessionCount++;
  const line = new Date().toISOString() + '  session #' + sessionCount + '\n';
  try { fs.appendFileSync(LEDGER, line); } catch (e) {}
  console.log('[session] #' + sessionCount + ' started — billing runs until the socket closes');
}

app.get('/api/token', async (_req, res) => {
  if (!API_KEY || API_KEY === 'your_key_here') {
    /* Say exactly what is wrong and where to fix it. A generic 500 here
       costs an hour of looking in the wrong place. */
    return res.status(500).json({
      error: 'No AssemblyAI API key configured.',
      fix: 'Put your key in voice-tutor/server/.env as ASSEMBLYAI_API_KEY, then restart the server.'
    });
  }

  const url = `${TOKEN_URL}?expires_in_seconds=${EXPIRES_IN_SECONDS}` +
              `&max_session_duration_seconds=${MAX_SESSION_SECONDS}`;

  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
    const body = await r.text();
    if (r.ok) noteSession();

    if (!r.ok) {
      console.error(`[token] AssemblyAI returned ${r.status}: ${body}`);
      return res.status(r.status).json({
        error: `AssemblyAI rejected the token request (${r.status}).`,
        detail: body.slice(0, 400)
      });
    }

    const data = JSON.parse(body);
    /* Only the token crosses to the browser. */
    res.set('Cache-Control', 'no-store');
    return res.json({ token: data.token, expires_in_seconds: data.expires_in_seconds });
  } catch (err) {
    console.error('[token] request failed:', err);
    return res.status(502).json({ error: 'Could not reach AssemblyAI.', detail: String(err) });
  }
});

/* Health check — useful on Vercel to confirm the key landed. */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, keyConfigured: !!API_KEY && API_KEY !== 'your_key_here' });
});

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

/* Vercel imports the app; running it directly starts a listener. */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Voice tutor running:  http://localhost:${PORT}`);
    console.log(`  API key configured:   ${API_KEY && API_KEY !== 'your_key_here' ? 'yes' : 'NO — edit server/.env'}\n`);
  });
}

module.exports = app;
