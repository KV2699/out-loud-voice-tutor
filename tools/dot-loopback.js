/* =============================================================================
   DOT LOOPBACK — does the speech engine voice a character aloud?

   You cannot hear the agent, so this hears it for you. The phrase under test
   is set as the session GREETING, so the agent speaks it verbatim the moment
   the session opens. The audio is captured, fed straight back in as
   microphone input, and the transcription printed. If a character is being
   spoken as a word, it appears in the text.

   Run from the voice-tutor directory with a real key in server/.env:
       node tools/dot-loopback.js
   ============================================================================= */
const fs = require('fs');
const KEY = fs.readFileSync('server/.env','utf8').match(/ASSEMBLYAI_API_KEY\s*=\s*(\S+)/)[1].trim();
const b64 = i => Buffer.from(i.buffer, i.byteOffset, i.byteLength).toString('base64');

const CASES = [
  ['M middle dot',        'On screen, Part 1 · Three words. Ask them to continue.'],
  ['N arrows',            'Screens visited 3 → 6 → 9. Activities completed, none yet.'],
  ['O em dash',           'Judge it — if they are getting things right, say nothing.'],
  ['P crumb then stop',   'Part 1 · Sort the situations. Say Inclusive or Worth flagging.'],
  ['Q plain control',     'Part one, three words. Ask them to continue.'],
];

async function one(label, phrase) {
  const r = await fetch('https://agents.assemblyai.com/v1/token?expires_in_seconds=300',
                        { headers:{ Authorization:'Bearer '+KEY }});
  const ws = new WebSocket('wss://agents.assemblyai.com/v1/ws?token='+encodeURIComponent((await r.json()).token));
  let phase='boot', buf=[], heard='';
  return await new Promise(resolve => {
    const fin = () => { try{ws.close();}catch(e){} resolve({label, phrase, heard}); };
    const t = setTimeout(fin, 45000);
    ws.onopen = () => ws.send(JSON.stringify({ type:'session.update', session:{
      system_prompt:'Say nothing unless spoken to.',
      greeting: phrase,                       // <- the agent speaks THIS, verbatim
      input:{format:{encoding:'audio/pcm'},language_codes:['en'],turn_detection:{interrupt_response:false}},
      output:{voice:'anna',format:{encoding:'audio/pcm'}}}}));
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.type === 'reply.audio' && phase !== 'listening') { phase='capturing'; buf.push(Buffer.from(m.data,'base64')); return; }
      if (m.type === 'reply.done' && phase === 'capturing') {
        phase = 'listening';
        const all = Buffer.concat(buf);
        const pcm = new Int16Array(all.buffer, all.byteOffset, all.length/2);
        for (let i=0;i<pcm.length;i+=480) ws.send(JSON.stringify({type:'input.audio',audio:b64(pcm.subarray(i,Math.min(i+480,pcm.length)))}));
        const sil=b64(new Int16Array(480));
        for (let i=0;i<50;i++) ws.send(JSON.stringify({type:'input.audio',audio:sil}));
        return;
      }
      if (m.type === 'transcript.user' && phase === 'listening' && m.text) {
        heard = m.text; clearTimeout(t); setTimeout(fin, 300);
      }
    };
    ws.onerror = () => fin();
  });
}
(async () => {
  for (const [l,p] of CASES) {
    const x = await one(l,p);
    console.log('\n' + x.label);
    console.log('  spoke : ' + p);
    console.log('  heard : ' + (x.heard || '(nothing)'));
    console.log('  >> DOT: ' + (/\bdot\b/i.test(x.heard) ? '*** YES ***' : 'no'));
  }
  process.exit(0);
})();
