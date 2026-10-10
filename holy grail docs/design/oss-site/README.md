# OSS site redesign, approved spec

`oss-site-redesign.html` is the **authoritative design spec** for actrone.com in OSS launch mode
(`NEXT_PUBLIC_LAUNCH_MODE=oss`). Open it in a browser; it renders the redesigned homepage and docs at
full fidelity, in both themes, using the same tokens the site ships.

Approved 2026-09-05. Supersedes nothing: it is the first committed design direction for this surface.

**Change, 2026-09-24 (owner decision):** the lifecycle bands no longer show the `01` to `06` numbers in
a left gutter. Each band opens with the same kicker chip as the Founding 500 section (`SectionKicker`:
1px border, radius 6, mono label), and its heading, intro and content align to the section's left
edge. The bands keep their lifecycle order. The mockup in `oss-site-redesign.html` still shows the
numbered version.

## What it covers

| Part | Contents |
| --- | --- |
| 01 | The read on what is wrong with the current OSS home and docs |
| 02 | Foundations: type scale, mono voice, structure rules, colour as status vector, the accessibility floor |
| 03 | The homepage, rendered top to bottom (nav, hero ledger, datasheet, four lifecycle bands, parity, honesty, Founding 500, footer) |
| 04 | The docs shell, rendered (header, sidebar, prose, callouts, parameter table, table of contents) |
| 05 | Components and the three required async states |
| 06 | File-level change list and the four design calls |

## Scope

The routes that survive the OSS allowlist in `frontend/apps/marketing/src/lib/flags.ts`:

- `/` (homepage)
- `/docs` and the six memory pages
- `/about`, `/contact`, `/founding-500`, `/legal/*`

The full-platform homepage below the `OSS_ONLY` branch is **out of scope** and must not regress.

## Non-negotiables it inherits

Everything in `CLAUDE.md` §8.1.1 and `docs/branding.md`: Black and Apple-Silver, Geist only, weights
400/500/600, sentence case, 1px borders rather than shadows, no gradients, chroma reserved for
status, `lucide-react` at `strokeWidth={1.5}`, no status dots, no em dashes.

## Known defect this spec fixes

Part 02 documents a live WCAG AA failure in `frontend/apps/marketing/src/app/globals.css`:
`--color-text-dim` measures 3.61:1 in the light theme, and `--color-text-placeholder` measures
2.67:1 (dark) and 2.36:1 (light). Replacement values are in the audit table. This affects every app
in the monorepo, not only marketing.

## Keeping it current

If the implementation deviates from this file, update this file. It is the spec, not a sketch.
