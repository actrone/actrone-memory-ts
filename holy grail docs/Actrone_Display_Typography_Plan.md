# Actrone Display Typography Plan: matching type to the logo

> **Status:** P0 through P3 all shipped (2026-07-25). `<Emphasis>` (Big Shoulders, free/OFL) is
> wired into: the marketing hero (`OssHero`/`HeroSection`, both apps' full-width heroes),
> control-tower's Agent Studio wizard step titles, and the Dashboard hero greeting. The section 7
> governance amendment is written into `docs/branding.md` section 4.2.1 and `CLAUDE.md`'s
> typography rule. No paid font was licensed; the free Option D pilot face was kept for the full
> rollout rather than upgrading to a paid option (see section 9).
> **Scope:** How to give Actrone a distinctive, "bold word/letter" display treatment that visually
> matches the logo, and exactly where that treatment is and is not allowed to appear.
> **Owner:** Matt. **Last updated:** 2026-07-25.

---

## 0. TL;DR

The request was: fonts that let a bold letter or word carry "cool style," matching the logo and
branding. Two things had to be true before any font could be picked:

1. **What does the logo actually look like, structurally?** (checked the real SVG paths, not a
   description of them)
2. **What does the current brand system actually allow today?** (checked the live CSS and the
   locked rules, not assumptions)

Both turned up something worth saying plainly. **The logo is a completely bespoke, all-straight-line
geometric mark** (more on this in section 1.1), and **the current, explicitly locked brand rule is
"Geist only, weights 400 to 600, font-weight 700/800 nowhere"** (section 1.2). A "bold word with
cool style" is not something the current system can produce without a conscious change to that
rule; this isn't a style question, it's a governance question, and it comes first.

The recommendation: **don't make Geist bolder.** Bring in **one** additional, tightly-scoped
"signal" display typeface whose letterforms share the logo's rectilinear, engineered DNA, and
reserve it only for deliberate emphasis (a word in a headline, a wizard step title, a hero
statistic), never body text, never buttons, never regular UI chrome, all of which keep using Geist
exactly as today. Restraint is what makes it read as premium rather than as a gamer-font cliche;
research below explains why. Section 5 has concrete candidates (paid and free) with rationale and
licensing notes, and section 9 records the decisions made so far and what is still open.

---

## 1. Current state (verified against the repo, not assumed)

### 1.1 The logo is a bespoke, 100%-rectilinear mark, not a rendered font at all

`frontend/apps/control-tower/public/brand/actrone-wordmark.svg` and `actrone-brandmark.svg` are not
text set in a typeface. They're hand-drawn SVG `<path>` outlines. Reading the actual path data
(`frontend/packages/ui/src/brand/Wordmark.tsx`), every letterform in "ACTRONE" is built **only**
from straight line segments: there is not a single curve command anywhere in the path. The "A" in
the brandmark is the same shape, in isolation.

That is a specific, deliberate design language: faceted, cut from metal, architectural, closer to
things like Bank Gothic, Eurostile, or a CNC-milled control-panel plate than to any conventional
rounded geometric sans. This is the actual DNA a matching display face needs to echo. It also lines
up exactly with `docs/branding.md`'s own language for the brand ("architectural resilience,"
"hyper-premium engineering," "1px crisp border," "no gradients"): the logo's geometry and the
written brand philosophy were clearly built to agree with each other. A font pick that ignores the
logo's actual angularity (a soft humanist face, say) would fight the mark instead of extending it.

### 1.2 The current type system, exactly as shipped today

- `frontend/apps/control-tower/src/app/layout.tsx` (and the other two apps identically) load
  Vercel's `geist` npm package, `GeistSans` plus `GeistMono`, via `next/font`, self-hosted,
  variable-weight files.
- Every app's `globals.css` defines:
  ```css
  --font-sans:    var(--font-geist-sans), system-ui, sans-serif;
  --font-mono:    var(--font-geist-mono), 'JetBrains Mono', monospace;
  --font-display: var(--font-geist-sans), system-ui, sans-serif;  /* identical to --font-sans */
  --font-body:    var(--font-geist-sans), system-ui, sans-serif;  /* identical to --font-sans */
  ```
  There is **no distinct display face today**: `--font-display` is a plain alias for the same
  family used for body copy and UI chrome. Nothing currently distinguishes a headline from a
  button label except size and (within limits) weight.
- `docs/design prompt.md` section 3 states the weight rule explicitly: "Display / marketing
  headings: Geist, weight 500 to 600 ... [do not use] Font weight 700 or 800 anywhere." `CLAUDE.md`
  section 8.1.1 repeats it: "Weights 400/500/600 only (never 700/800, never <=300)."
- I checked whether this rule has already quietly drifted, a common way brand rules erode. It
  hasn't. A repo-wide search for `font-weight: 700|800`, `fontWeight: 700|800`, and Tailwind's
  `font-bold` utility across every app and the shared UI package returned **zero matches**. The
  ceiling is genuinely, currently honored everywhere.
- One useful, existing precedent for a narrow, monochrome exception: `.gradient-text-silver` (all
  three apps' `globals.css`) was a `background-clip: text` gradient from white through silver back
  to white, technically a "gradient," which `CLAUDE.md` section 8.1.1 also forbids ("No
  gradients"), but achromatic (no hue, stays inside the silver/white ramp) and used in exactly two
  places (the two marketing hero headlines). This is the brand's own existing model for how a
  special-occasion typographic flourish gets allowed in: through a narrow, explicitly-scoped,
  monochrome-only door rather than a blanket rule change. Section 7's proposal follows the same
  shape, and section 8 replaces this exact utility with the new `<Emphasis>` primitive on those
  same two headlines as the P0 pilot.

### 1.3 The actual conflict

"A bold letter or word with a cool style, matching the logo" cannot be built by turning Geist up to
700/800 in place, because:

- That is explicitly, twice-over forbidden by the current locked brand.
- Even if it weren't forbidden, Geist at 700 is still just Geist: a heavier cut of the same quiet,
  neutral grotesk used for every button label and body sentence. It would not read as distinctive
  or "cool," and it would not visually relate to the logo's faceted geometry at all (Geist's
  letterforms are a conventional rounded-terminal, humanist-influenced sans; the logo has no curves
  whatsoever).

So this genuinely needed a decision, not just a style pick. See section 9.

---

## 2. What 2026 research says this should actually look like

A few findings from current (2026) type-design and brand-strategy sources materially shaped the
recommendation below, because they directly bear on Actrone's specific situation (locked
monochrome palette, an already-distinctive logo, an enterprise/regulated buyer):

- **When a brand strips out color, typography becomes the primary expressive channel.** Current
  commentary puts it directly: a strict black-and-white palette is the premium signal in deep tech,
  and when you remove color, type becomes the voice. That is precisely Actrone's palette decision
  (`branding.md` section 1: "colour is a status vector, never decoration"), so investing real design
  effort in typography rather than color is the correct place to spend the "premium" budget, not a
  nice-to-have.
- **Avoid the generic "sci-fi/gamer" display-font cliche.** Fonts like Orbitron are explicitly
  called out in current design commentary as the overused default for "futuristic tech" branding,
  exactly the look a governed, enterprise-grade platform should not reach for. This ruled out an
  entire category of free, geometric-looking display fonts that would otherwise seem like an easy
  match for "cool and futuristic."
- **In premium monochrome branding, "bold" impact more often comes from restraint, scale, and
  letter-spacing than from raw font-weight.** Luxury and enterprise monochrome logotypes typically
  use generous tracking, all-caps or small-caps, and restrained weight; the distinctiveness comes
  from the letterform's character and its deliberate rarity, not from thickness. This directly
  supports scoping any new display face to rare, deliberate emphasis rather than making it the
  default headline treatment everywhere.
- **Variable fonts are now treated as brand-token systems**, not just a performance optimization. A
  brand defines specific axis values (weight, width, sometimes grade) as named tokens the same way
  it defines a color palette. That maps cleanly onto Actrone's existing design-token discipline
  (`--space-*`, `--duration-*`, etc. per `CLAUDE.md` section 8.4) and gives a concrete
  implementation shape: a small number of named "accent" tokens, not free-form weight choices.
- **`next/font`, self-hosted, variable-font files remain the right technical default for 2026**:
  zero third-party network requests at runtime, no layout shift via automatic `size-adjust`, and it
  mirrors exactly how Geist is already loaded in this codebase (`geist/font/sans` under the hood is
  the same `next/font` machinery). Adding a second self-hosted family is a same-shape change, not a
  new pattern. This applies whether the font is loaded via `next/font/local` (a purchased font
  file) or `next/font/google` (a Google Fonts entry); both self-host at build time.

---

## 3. The logo's DNA, described precisely (for typeface selection)

Distilled from actually reading the path data, this is the specific character a matching face
needs:

- **Zero curves.** Every stroke is a straight line; junctions are cut, not filleted.
- **Monolinear-leaning, geometric construction** (not a stroke-contrast/serif logic).
- **Slightly condensed proportions** relative to a standard grotesk: the letters sit close together.
- **Squared or cut terminals**, not rounded ones (visible in the "A"'s apex and the "O"'s
  construction, which is a hexagonal, faceted approximation of a circle, not an actual curve).
- **Monochrome-only application**: the mark itself carries no color information; all distinction is
  structural.

A matching display face should share as many of these as possible: rectilinear or faceted
construction, squared terminals, a geometric (not humanist) skeleton, and enough presence to stand
in for the "cool/bold" ask without needing to break the weight ceiling on its own.

---

## 4. Categories to rule out up front

- **Generic "sci-fi"/gaming display fonts** (Orbitron, Chakra Petch, Aldrich, Rajdhani, and similar
  free geometric-futuristic faces). These are the exact cliche current design commentary calls out
  as the tell for an unconsidered, templated "AI brand." They would actively undercut the "chosen,
  not copied" positioning `branding.md` is going for.
- **Space Grotesk** and anything in its family. `CLAUDE.md` section 8.1.1 already retired this from
  the brand by name ("Space Grotesk is removed") as part of the 2026-06-30 monochrome rebrand.
  Bringing it back in through a display-font side door would contradict a decision already
  consciously made and documented.
- **Humanist/soft display faces** (Klim's Sohne is a good example, flagged in current sources as
  "the premium standard for serious brand identity work in 2026" for general SaaS contexts). Sohne
  is a genuinely excellent typeface, but it is a rounded, humanist-leaning grotesk; it would read as
  warm and approachable, the opposite of the logo's cut, faceted, architectural character. Good
  option for a different brand; wrong fit for this one.
- **Turning Geist itself up to 700/800.** Covered in section 1.3: forbidden today, and wouldn't
  achieve the visual goal even if allowed.

---

## 5. Candidate display faces (researched, matched against section 3)

### Paid options (professional foundry releases; none licensed or downloaded yet)

**Option A: PP Neue Machina (Pangram Pangram).** Explicitly designed around "technology, machines,
and robots"; ships in two cuts, **Inktrap** (visible notches at stroke junctions, a direct visual
cousin to the cut, faceted joints in the Actrone wordmark) and **Plain** (cleaner, still
geometric). Full variable weight range plus italics. Best fit for hero headline emphasis words and
Studio/wizard step titles; the Inktrap cut is the closest single-image echo of the logo's cut-metal
character found in this research pass.

**Option B: Halvar Mono (TypeMates).** "Industrial charm and mechanical design," monospaced (every
character the same width), nine weights, built explicitly for "data, tables, and technical
systems." Would create a natural bridge to the existing `--font-mono` (Geist Mono) usage for
timestamps and hashes. Best fit for stat/metric emphasis specifically; less suited to long headline
phrases (monospace at display size gets wide fast).

**Option C: Unifora (Yep! Type Foundry).** Explicitly derived from DIN's "constructed logic of
technical lettering," described by its own foundry as industrial and architectural, "without
softening the edges." Ships in 5 widths times 9 weights with matching italics, flexible enough to
cover several emphasis contexts from one family.

**Licensing check on all three (confirmed 2026-07-24, important):** PP Neue Machina's free tier is
personal-use only; a commercial/webfont license must be purchased from Pangram Pangram before it
can ship on the actual product. Halvar Mono and Unifora are standard paid commercial licenses too.
None of these three can be acquired autonomously; a human has to complete the purchase and hand
over the resulting font files.

### Option D: free (SIL Open Font License) alternatives, no purchase required

Two Google Fonts entries share meaningful structural DNA with the logo and are fully free for
commercial use, self-hostable via `next/font/google` (the same self-hosting principle as Geist, per
section 2), with zero licensing step:

- **Big Shoulders** (XO Type Co): a tall, condensed variable font in the American Gothic/industrial
  tradition, built for Chicago's civic design system and drawing on railway and industrial signage
  heritage. The same family tree as Bank Gothic, one of section 1.1's own reference points.
  Straight-edged, minimal-curve construction typical of condensed gothic faces. Ships with weight
  and width axes plus genuine **Stencil** and **Inline** sibling cuts. **This is the face chosen for
  the P0 pilot** (section 8), both for its structural lineage and its condensed proportions, which
  echo the wordmark's tight letter-spacing.
- **Unbounded** (Florian Runge): variable, uses chevron-shaped angular stems on selected glyphs for
  a distinctive geometric edge over an otherwise grotesque/humanist skeleton. Less purely
  rectilinear than Big Shoulders, but still angular and fully free. Kept as a second free candidate
  if Big Shoulders doesn't look right once seen live.

Confirmed present in this repo's actual Next.js font bundle (`next/dist/compiled/@next/font/dist/
google/font-data.json`, Next.js 16.2.6): both "Big Shoulders" and "Unbounded" are real, loadable
entries, not just described in research.

**Recommendation ranking:** Big Shoulders (Option D) is the pilot face: free, unblocked, and the
closest lineage match among everything researched. PP Neue Machina Inktrap (Option A) remains the
strongest single-image match overall and is the recommended paid upgrade path if, once the free
pilot is actually seen live, it doesn't look distinctive enough.

---

## 6. What "a bold letter or word with cool style" concretely looks like here

Not "make headlines bold." Specifically:

- A new, small primitive, `<Emphasis>` (`frontend/packages/ui/src/brand/Emphasis.tsx`), that
  renders its children in the chosen accent face via a `--font-accent` CSS variable, at whatever
  weight the accent face's own variable axis defaults to (not Geist's, so the section 1.2 ceiling on
  Geist is never touched), reserved for **one emphasized word or short phrase per usage**, never a
  full sentence.
- Applied only in: marketing hero headlines (one phrase each), Studio/wizard step titles,
  dashboard hero stat callouts, and nowhere else: never inside body copy, form labels, buttons, nav,
  table cells, or any recurring UI chrome.
- Still monochrome: the accent face's color still comes from the existing token ramp
  (`--color-text-primary` / `--color-accent`) via inherited `color`, never a new hue. "Cool" comes
  from the letterform and restrained placement, not from color or motion.
- Everything else, 99%+ of all UI text, is completely untouched: Geist stays exactly as locked, at
  exactly its current weight ceiling, everywhere else in the product.

---

## 7. Proposed governance change (a conscious amendment, not drift; not yet applied)

Per `CLAUDE.md` Appendix B, a project-level brand override must be a conscious decision with a
stated rationale. Proposed exact wording to add to `docs/branding.md` and `CLAUDE.md` section 8.1.1
once the pilot is reviewed and approved (per section 8's P3, not yet written into either file):

> **Display accent exception (added 2026-XX-XX):** one additional self-hosted display typeface
> (`--font-accent`) may be used, strictly limited to single-word/short-phrase emphasis inside hero
> headlines, Studio step titles, and dashboard stat callouts, never body text, never UI chrome,
> never buttons, never table/list content. It may use its own variable-weight range (including
> weights above Geist's 600 ceiling) because it is a structurally distinct face, not a heavier cut
> of Geist. Geist's own weight ceiling (400 to 600, never 700/800) is unchanged and still applies
> everywhere else, including all other display/marketing headings not using this exception.

This keeps the existing rule's intent (no chunky, generic-bold UI anywhere) fully intact while
answering the actual request through a new, narrow, named exception rather than a blanket repeal.

---

## 8. Implementation: what has actually been built (P0 through P3, complete)

Status as of 2026-07-25: every phase is implemented, using the free Big Shoulders face
(Option D). `docs/branding.md` and `CLAUDE.md` have both been edited (P3, see below); the
exception is now a real, documented rule, not an undocumented pilot.

1. **`<Emphasis>` component** built in `frontend/packages/ui/src/brand/Emphasis.tsx`, exported from
   the package's `index.ts`. Presentational only: it references `var(--font-accent)` and inherits
   color, with no dependency on `next` (font loading stays app-side, matching how Geist itself is
   loaded independently per app).
2. **Big Shoulders loaded via `next/font/google`** in `control-tower` and `marketing`'s
   `layout.tsx` (`marketplace` has the token wired in `globals.css` from the original P0 pass but
   has no live `<Emphasis>` usage yet, there is no marketplace surface that calls for one today).
   Exposed as `--font-big-shoulders`, `display: 'swap'` so a slow font request never blocks render.
3. **`--font-accent` token** in each app's `globals.css`, defined as
   `var(--font-big-shoulders), var(--font-geist-sans), system-ui, sans-serif`, so a failed or slow
   accent-font load falls back to Geist rather than breaking layout or leaving text invisible. Not
   referenced by `--font-display`/`--font-body`, which stay aliased to Geist exactly as before.
4. **P0, marketing hero headlines** (`frontend/apps/marketing/src/app/(marketing)/page.tsx`,
   both `OssHero` and `HeroSection`): the emphasized phrase in each hero ("don't forget." and "put
   in production.") renders through `<Emphasis>` instead of the old `.gradient-text-silver`
   utility, which those two spans were the only real users of. Both heroes are also genuinely
   full-width/edge-to-edge now (the card border/rounding was dropped for these two sections only;
   see the note below on the 3D detour for why an interim 3D backdrop there was tried and reverted,
   independent of this typography work, which the full-width layout change survived).
5. **P1, Agent Studio wizard step titles** (`frontend/apps/control-tower/src/components/
   features/agent-studio/AgentStudioWizard.tsx`): a step title heading was added above each step's
   content (none existed before this), sized to match this app's own page-title scale (`text-xl`,
   matching `PageHeader`'s `h1`) rather than a marketing hero size, since control-tower's own
   density-first philosophy (`branding.md` section 4.2) rules out a large display headline in a
   dense wizard. The step label itself (`STUDIO_STEPS[step]`, already a short phrase like "Persona"
   or "Actions & Connections") is the one emphasized phrase.
6. **P2, dashboard hero greeting, not the numeric metrics**
   (`frontend/apps/control-tower/src/components/features/DashboardHero.tsx`): the user's own name
   in the "Good morning, {name}" greeting is wrapped in `<Emphasis>`. Deliberately **not** applied
   to `DashboardMetrics`' numeric values (active agents, tasks, success rate, spend): those use
   `.nums` (`font-variant-numeric: tabular-nums`) for precise, live-updating alignment, and
   `CLAUDE.md` already locks operational data in Control Tower as functional, not decorative (no
   animated counters, Muted Mercury/monospace for metadata). A display accent face fighting
   tabular-nums on a number that changes every request would be the wrong trade for the wrong
   reason; a name shown once per visit is the rare, deliberate moment the plan actually calls for.
7. **P3, the governance amendment**, written into both authoritative locations rather than left as
   a planning-doc proposal: `docs/branding.md` new section 4.2.1 ("Display accent exception") holds
   the full rule and rationale; `CLAUDE.md`'s typography bullet (§8.1.1) gets a condensed version
   plus a pointer to branding.md. `docs/design prompt.md`'s "absolute prohibitions" list (section
   10, "Font weight 700 or 800 anywhere") is also amended in place to name the exception rather
   than silently having an undocumented carve-out contradict a still-literal prohibition.

**A separate, unrelated experiment that touched the same two hero sections and was reverted:** a
3D WebGL "glass and metal monolith" hero backdrop (`@react-three/fiber`/`three`) was built,
debugged through several real issues (a washout from `transmission` + no environment map, a
hardcoded dark-only background breaking light mode, a theme-switch glitch from context not
crossing the R3F reconciler boundary), and then fully removed at the user's request after it
caused a genuine scroll-performance regression (a continuously-rendering WebGL canvas competing
with the compositor thread even when scrolled off-screen). `CursorSpotlight` + `BeamScan` are back
as the hero ambience. The full-width/edge-to-edge layout change survived the revert; only the 3D
effect itself and its three dependencies were removed. This is not part of the typography plan and
is recorded here only because it shared the same two files.

---

## 9. Decisions made (all resolved)

1. **Preferred long-term face:** PP Neue Machina, Inktrap cut, was the aspirational target, but
   its free tier is personal-use only (section 5). The free Big Shoulders face (Option D) was used
   for the full P0 through P2 rollout rather than purchasing a license; nothing in this rollout is
   blocked on a paid font.
2. **Scope:** anywhere emphasis is legitimately used, including Control Tower, confirmed by P1/P2
   actually landing there, not marketing-only.
3. **Governance:** the section 7 wording was carried into `branding.md`/`CLAUDE.md` essentially as
   drafted (P3), scoped to hero headlines, Studio/wizard step titles, and a dashboard hero greeting,
   with an explicit carve-out excluding live/numeric data that the P2 implementation surfaced as a
   real, necessary boundary (not anticipated in the original section 7 draft, added during P3).

No open decisions remain in this document. Future extensions (a fourth surface, a paid font
upgrade, extending to `marketplace`) are new proposals, not open items here.
