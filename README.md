# Inclusive Practice at Work — Voice Tutor

AssemblyAI Voice Agent Hackathon submission. A learner opens the page, presses
one button, and has a spoken conversation with a tutor that teaches the
"Inclusive Practice at Work" module, checks understanding and gives feedback.

The whole voice pipeline is **one AssemblyAI WebSocket** — it hears the learner,
decides what to say, and speaks back. No separate STT, LLM or TTS to wire up.

**The demo moment:** the tutor doesn't just talk *about* the module — it drives
it. A `show_section` tool lets the agent turn the page, so the courseware on the
left follows the conversation on the right. Say "let's start Part 2" and the
deck moves to Part 2.

---

## 1. Get an AssemblyAI API key

1. Sign up at **https://www.assemblyai.com/**
2. Go to **https://www.assemblyai.com/app/api-keys**
3. Copy the key.
4. Paste it into `server/.env`:

   ```
   ASSEMBLYAI_API_KEY=your_actual_key
   PORT=8080
   ```

The key stays on the server. The browser only ever receives a short-lived,
single-use token.

## 2. Run it locally

```bash
npm install
npm start
```

Open **http://localhost:8080** and press *Start Learning*. Allow the microphone
when asked — it is only requested on that click, never on page load.

Check the key landed: **http://localhost:8080/api/health** →
`{"ok":true,"keyConfigured":true}`

## 3. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Then add the key as an environment variable — **not** in a file:

```bash
vercel env add ASSEMBLYAI_API_KEY
vercel --prod
```

`vercel.json` already routes `/api/*` to the Express function and everything
else to `public/`. `server/.env` is gitignored and is never uploaded.

> Microphone access needs a secure context. Vercel serves HTTPS, so it works
> there; locally it works because `localhost` counts as secure. It will **not**
> work over plain `http://` on a LAN IP.

---

## How it works

**Voice is the input device.** The learner answers out loud. The agent listens,
decides what to say, and calls tools that click the deck's real buttons on the
learner's behalf. Part 1 answers are "Inclusive" or "Worth flagging"
(`answer_card`). Part 2 answers are "True" or "False" (`answer_statement`).
Part 3 answers are "A", "B" or "C" (`answer_question`).

**The golden rule: the agent may answer, but only the learner advances.** This
is enforced by the tool list, not by the prompt. A prompt rule is a request; a
missing tool is a guarantee. There is deliberately no tool to press Submit,
Continue, Next question, See your results, Take this part again, or Back to your
route. Those buttons exist, and the learner presses them to move on at their
own pace.

**The tool list** has eight tools:

- `get_progress` — read what is on screen, which card or question is current,
  what the learner must press next, and evidence of their pacing (dwell time,
  narration heard, gap between answers). Call before discussing any activity
  and after every answer.
- `answer_card` — Part 1 only. File a situation into "inclusive" or "flag".
- `answer_statement` — Part 2 only. Judge a statement "true" or "false".
- `answer_question` — Part 3 only. Choose an option "a", "b", or "c".
- `show_section` — jump to a section *only when the learner asks to*.
- `go_back` — step back one screen *only when the learner asks to*.
- `restart_activity` — clear the current activity and start it again.
- `retake_part` — start one of the three parts over *only when the learner asks
  to*.

Four tools are learner-request-only: `show_section`, `go_back`, `restart_activity`,
and `retake_part`.

**Drag is gone in voice mode.** The deck reads localStorage `'ipw:voiceinput' === '1'`,
set by the tutor page before the iframe boots. When set, the deck skips binding
pointer drag and exposes `window.__deck.voice` — the tool surface. Unset, the
standalone module at `inclusive-practice/dist` works exactly as before. This
flag is the only difference between the two builds.

**Every answer goes through the deck's own button, via `__deck.voice`.** Never
set state directly. The deck's rule is that every physical action has a button
equivalent, and one function serves both — because parallel routes drift. A
spoken answer that set state would skip the character's walk in Part 2, the
tally, the spoken response, and the scoring.

**The agent cannot speak unprompted.** The Voice Agent API has four client→server
message types: `session.update`, `input.audio`, `session.resume`, `tool.result`.
None makes the agent talk. This is fine in practice because the learner now
answers out loud, so every answer is a turn the agent can end with "press
Continue when you're ready". The one gap is a silent learner, covered by an
on-screen cue (#cue) that names the live button.

**The front door.** Browsers block audio and microphone access until the user
clicks the page. A tutor that greets you on load is not possible. Instead, there
is one full-page overlay at start — a single blue circle (`.door`). It replaced
two competing buttons and solved the problem. The circle breathes, and a line
fades in every 15 seconds as a visual nudge (the only channel open before the
first click). The door lifts on `session.ready`, not on click, so the page is
never revealed silent.

**Pacing and skip detection.** `get_progress` returns evidence, not a verdict:
how long the learner has been on screen (`state.dwell`), how much of the
narration was played (`state.heard`), the gap between recent answers, and how
many earlier screens were stepped over. The system prompt tells the agent that
fast and correct is not a problem, and rate-limits pacing notes to once per 45
seconds.

**End-of-part wrap-ups use different evidence-backed techniques:**
- Part 1 uses elaborative interrogation (the learner explains *why* a fact is
  true).
- Part 2 uses a keyword mnemonic (HFG — Hiring, Flexible, Good work).
- Part 3 uses spaced retrieval practice (the learner recalls facts from memory,
  then does so again tomorrow and at the end of the week).

---

## Architecture

```
public/index.html      the demo — deck on the left, voice tutor on the right
public/voice-only.html the tutor with no deck. Demo insurance: if the iframe
                       misbehaves, this still works
server/index.js        mints tokens, serves the pages. The only thing that
                       ever sees the key
public/deck/           the 14-screen module the tutor drives
```

**The flow:** browser asks `/api/token` → server calls AssemblyAI with the real
key → browser opens `wss://agents.assemblyai.com/v1/ws?token=…` → sends a
`session.update` carrying the tutor's system prompt → streams 24 kHz PCM16 up and
plays 24 kHz PCM16 back.

---

## Things that will bite you

**Tokens are single-use.** Each one buys exactly one WebSocket connection inside
its redemption window. Reconnecting means fetching a new token — never retrying
with the old one. The 1006 handler does this automatically, once.

**`expires_in_seconds` is required** on the token call. Leave it off and
AssemblyAI returns 400, which reaches the browser as a socket that just never
opens.

**Use AudioWorklet, not MediaRecorder.** MediaRecorder hands back encoded
webm/opus; this API wants raw PCM frames. The worklet here is built from a Blob
so the frontend stays one file.

**Audio is base64 JSON, not binary frames.** Both directions.

**Schedule playback, don't just play it.** Audio chunks arrive faster than real
time; playing each on arrival overlaps them into noise. Each chunk is scheduled
to start where the last one ended.

**Interruptions need flushing.** When the learner talks over the tutor,
already-queued audio must be stopped or the tutor keeps talking over itself.

**The deck's internals are not on `window`.** It is assembled into one
`<script>`, so its top-level `const Deck` / `const Voice` are script-scope
bindings. `win.Voice.setOn(false)` looks like the way to silence it and does
nothing — the guard around it passes quietly and you get two voices at once.
Everything goes through `win.__deck` (explicitly assigned to window) and the
DOM instead.

**The two doc pages disagree about `tool.result`.** The websocket spec puts
`call_id` and `result` at the top level; the tools guide nests them under
`tool`. The reply here carries both — extra fields are ignored, a missing one
leaves the agent waiting.

---

## Verified

- Token endpoint returns a clear, actionable error when no key is set
- PCM16 ↔ base64 round-trips losslessly, including −32768 and +32767
- A 10-second buffer encodes without blowing the call stack
- 48 kHz → 24 kHz downsampling halves the sample count and preserves the signal
- Float→Int16 clamping does not wrap at the rails
- AudioWorklet compiles from a Blob URL and delivers 128-sample frames
- Both audio contexts open at exactly 24 kHz

- All 10 sections the tutor can request navigate to the right screen
- `tool.call` handled in **both** documented shapes, each landing correctly
- An unknown tool and a bad section name both answer rather than hang the agent
- The phrase-match fallback resolves 7 navigational sentences and correctly
  ignores a non-navigational one
- The deck boots silent, so it never talks over the tutor
- Renders correctly at 1440×900; no console errors

**Not yet verified:** a live end-to-end call, and whether the agent reliably
chooses to call `show_section`. Both need a real API key. The phrase-match
fallback exists precisely because the second one is unproven — if the tool call
doesn't fire, the deck still follows what the tutor says.
