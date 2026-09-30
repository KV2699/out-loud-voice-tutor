# Remove the `?demo=1` flag

Added 30 Sep 2026 so the closing screens could be filmed without playing the
whole course through. It fills the module in as complete with top marks and
pre-fills the certificate name.

**It is inert without the flag** — the plain URL reports the course honestly,
so this is tidying, not a fix. Remove it once the demo video is cut.

## Three blocks, all in `inclusive-practice/src/`

**1. `engine.js`** — delete the whole `function demoFlag() { … }` and the
IIFE that follows it, marked:

```
/* ------------------------------------------------------------------------
   DEMO STATE — ?demo=1 only
```

…down to the closing `})();` immediately before `window.__deck = {`.

**2. `certificate.js`** — in `initCertificate()`, delete:

```js
  /* ?demo=1 fills the name in too, so the certificate can be filmed as a
     finished artefact rather than a placeholder. Remove with the demo block
     in engine.js. */
  try {
    if (typeof demoFlag === 'function' && demoFlag()) {
      Cert.name = 'Kerrie Vincent';
      if (input) input.value = Cert.name;
    }
  } catch (e) {}
```

**3. `voice-tutor/public/index.html`** — one comment only, above the iframe:

```html
    <!-- ?demo=1 needs no forwarding: the deck shares this origin and reads
         the flag off parent.location itself. -->
```

## Then

```bash
cd ~/Desktop/"ELEARNING KIT"/inclusive-practice && python3 assemble.py \
  && cp dist/dei-clone.html ../voice-tutor/public/deck/dei-clone.html \
  && cd ../voice-tutor && git add -A \
  && git commit -m "Remove the demo flag used for filming" && git push
```

Check afterwards: `?scene=15&demo=1` should show "not yet taken" again.

## KEEP — not part of this

The certificate's **name size (4.5cqw)**, **equal margins**, **removed tick**
and **two-column footer** are permanent design changes. Do not revert those.
