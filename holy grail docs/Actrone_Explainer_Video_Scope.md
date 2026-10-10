# Actrone explainer video — scope (Remotion)

> Status: **scoping / not built**. Owner: Matt. Drafted 2026-07-01.
> A separate marketing asset — NOT a replacement for the inline SVG diagrams
> (those stay: theme-aware, accessible, zero-JS). This is a 45–60s pre-rendered
> explainer video for the homepage hero, sales decks, and social.

---

## 1. Goal & success criteria

A short, on-brand "how Actrone works" film that converts a cold visitor in under a
minute: names the problem, shows the kernel thesis, walks one governed task, and
lands the CTA.

- **Length:** 45–60s (hard cap 60s — social attention + file size).
- **Placement:** homepage hero secondary CTA "Watch how it works" → modal `<video>`;
  reused on `/about`, sales decks, and social (1:1 + 9:16 crops).
- **Success:** measurable lift in hero → sign-up / sandbox click-through; usable as
  a standalone social clip.

## 2. Why Remotion (and the honest caveat)

- **Fit:** React + TypeScript authoring — same stack/mental model as the frontend;
  we can mirror our design tokens and diagram vocabulary. Deterministic MP4/WebM
  render via headless Chromium in CI. ([remotion.dev/player](https://www.remotion.dev/docs/player/), [docs](https://www.remotion.dev/docs/))
- **⚠️ Licensing (must resolve before adoption):** Remotion is free for individuals
  and for-profit teams of **≤3 people**; **4+ requires a paid company license**
  (~$25/seat/mo, min $100/mo or $1000/yr, counting only those touching the Remotion
  project). ([license](https://www.remotion.dev/docs/license), [company pricing](https://www.remotion.dev/blog/company-licenses)) If Actrone is/expects 4+,
  budget the license **or** use the MIT-licensed **Motion Canvas** / its fork
  **Revideo** for a canvas-rendered equivalent (different authoring model, no per-seat
  fee). Decision needed: **pay for Remotion (best DX/stack fit) vs Motion Canvas (free, canvas-only).**

## 3. Architecture — keep it out of the web bundle

The single most important technical decision: **the site ships a pre-rendered video
file, never the Remotion runtime.**

- New workspace folder `video/` (own `package.json`, Node ≥22) — sibling to
  `frontend/`, **not** under `frontend/src`. Deps (`remotion`, `@remotion/cli`,
  `@remotion/bundler`, `@remotion/renderer`) live only here.
- CI renders → outputs to `frontend/public/video/`:
  `actrone-explainer.mp4` (H.264), `actrone-explainer.webm` (VP9), `poster.webp`
  (still frame), `captions.vtt`.
- Do **not** use `@remotion/player` on the marketing site (it would ship the runtime
  to every visitor). Serve the pre-rendered file via plain `<video>`. Reserve
  `@remotion/player` only if we later want an interactive, scrubbable `/watch` page.

## 4. Brand constraints (locked identity)

Monochrome Black & Apple-Silver. `#000` canvas, silver text ramp, **Geist**, sentence
case, no gradients, chroma only for state (red = a blocked violation, green = pass).
Reuse the real diagram language (kernel stack, execution flow, Merkle ledger) so the
film matches the page. No fabricated metrics or logos.

## 5. Storyboard (grounded in the shipped product)

| # | Time | Scene | On-screen |
|---|------|-------|-----------|
| 1 | 0–5s | Cold open | Black → Geist wordmark → "Autonomy you can put in production." |
| 2 | 5–13s | The villain | An ungoverned action leaking PII / burning budget — "Most frameworks build a demo. None pass a security review." |
| 3 | 13–24s | The kernel | Agents → **Actrone kernel** → models; the six services light up (memory, routing, governance, tools, multi-agent, durability). |
| 4 | 24–37s | One governed task | Submit → Memory → Route → Supervise → **Govern** → Stream; tokens stream out. |
| 5 | 37–48s | Proof | A CRITICAL violation is **blocked + redacted**, hashed into the Merkle ledger — "signed audit, one click." |
| 6 | 48–58s | Close | "Self-hosted or managed. Any model. Governed by construction." → `actrone.com` · Start building free. |

## 6. Audio & accessibility

- **Muted by default** (autoplay-with-sound is blocked/annoying); optional subtle
  sound design + optional VO track. Meaning must survive with sound off.
- **Captions** (`captions.vtt`) + a **full transcript** rendered on the page.
- **`prefers-reduced-motion`:** don't autoplay — show `poster.webp` + transcript,
  play only on explicit click. No autoplay-with-sound, ever.

## 7. Render & delivery pipeline

- `remotion render` in GitHub Actions (headless Chromium) → mp4 + webm + poster +
  thumbnail; deterministic, source-versioned.
- On-site embed: `<video preload="none" poster=… muted playsinline>` with `<source>`
  webm then mp4, `<track kind="captions" src=…>`, lazy-mounted in a modal from the
  hero CTA. Host large files on the CDN, not the git repo, if size warrants.

## 8. Effort estimate (v1)

| Task | Est. |
|------|------|
| `video/` package + CI render setup | 0.5d |
| Scene components (reuse token/diagram vocabulary) | 2–3d |
| Brand/polish pass + timing | 1d |
| Captions + transcript + reduced-motion fallback | 0.5d |
| **Total** | **~4–5 dev-days** |

## 9. Open decisions

1. **Remotion (paid company license) vs Motion Canvas/Revideo (MIT, canvas-only).**
2. VO or captions-only for v1.
3. Aspect ratios for v1 (16:9 site + 9:16 social, or 16:9 only first).
4. Host: `public/` vs CDN (depends on final file size).
