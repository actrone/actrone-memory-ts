CLAUDE CODE DESIGN SYSTEM PROMPT
Actrone Frontend Ecosystem — v1.0
=====================================

STATUS REFRESHED 2026-07-13 (code-verified): this is the v1.0 predecessor of
docs/claude-code-design-prompt.md (v1.3), which is the current canonical prompt — v1.3 already
corrects the STACK line below to WorkOS AuthKit and adds a scoped exception for diagram colour
(its §"REFERENCE-INFORMED PATTERNS"). Clerk was fully removed from the codebase in the WorkOS auth
switch (docs/Actrone_WorkOS_Auth_Switch_Plan.md) — the STACK line below is corrected inline but this
whole file is otherwise kept as-is for historical trail; treat claude-code-design-prompt.md as
authoritative where the two differ. The rest of this file (design tokens, component specs, layout
rules) was verified live in frontend/apps/{control-tower,marketing,marketplace}/src/app/globals.css
and packages/ui as part of this pass — see docs/Actrone_Frontend_Rebrand_Plan.md's refreshed status
note for what was spot-checked.

SCOPE: Marketing site (actrone.com), Docs (actrone.com/docs), 
       Control Tower (app.actrone.com), Marketplace (marketplace.actrone.com)
STACK: Next.js 16.2.6, React 19, Tailwind CSS v4, WorkOS AuthKit (auth already installed) — corrected
       2026-07-13, was "Clerk (auth already installed)"
AESTHETIC: Vercel / Linear / Apple — premium minimalist developer tool


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — LIBRARY STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Install and use these exact packages. Do not substitute alternatives.

  "tailwindcss": "^4.0.0"
  "radix-ui": latest primitives (no pre-styled components)
  "lucide-react": latest
  "framer-motion": "^11.0.0"
  "geist": latest          ← Vercel's typeface, self-hostable
  "shiki": "^1.0.0"        ← syntax highlighting for docs + code blocks

Do NOT install:
  - shadcn/ui as a dependency (reference its structure only, implement manually)
  - @headlessui (use Radix)
  - react-icons (use lucide-react exclusively)
  - styled-components or emotion

Reference these design systems for structure and spatial logic:
  - Vercel Geist: https://vercel.com/geist/introduction
  - shadcn New York style: https://ui.shadcn.com (structure only, not theming)
  - Linear.app landing page: linear.app (grid alignment, frosted nav)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — DESIGN TOKENS (CSS CUSTOM PROPERTIES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Define these in globals.css as CSS custom properties. All components 
reference tokens ONLY — never hardcode hex values in component files.

:root {
  /* ── CANVAS SURFACES ─────────────────────────────── */
  --canvas-base:        #000000;   /* marketing site hero */
  --canvas-app:         #030303;   /* Control Tower / Marketplace */
  --surface-card:       #111111;   /* card / panel background */
  --surface-elevated:   #121214;   /* modals, dropdowns, popovers */
  --surface-input:      #0d0d0d;   /* input fields */

  /* marketing site section variation (depth without gradients) */
  --marketing-hero:     #000000;
  --marketing-section:  #0a0a0a;   /* alternating sections */
  --marketing-footer:   #030303;

  /* ── BORDERS ─────────────────────────────────────── */
  --border-base:        #262629;   /* default 1px border */
  --border-hover:       #3a3a3e;   /* interactive hover state */
  --border-focus:       #525255;   /* focused input ring */
  --border-strong:      #404044;   /* emphasized dividers */

  /* ── TYPOGRAPHY ──────────────────────────────────── */
  --text-primary:       #F5F5F7;   /* headings, labels, active */
  --text-secondary:     #E5E5E7;   /* body copy */
  --text-muted:         #A1A1AA;   /* supporting text */
  --text-dim:           #71717A;   /* timestamps, captions, metadata */
  --text-placeholder:   #52525B;   /* input placeholders */

  /* ── SEMANTIC ─────────────────────────────────────── */
  --color-error:        #EF4444;   /* errors and destructive ONLY */
  --color-success:      #22C55E;   /* success states ONLY */
  --color-warning:      #F59E0B;   /* warnings ONLY */
  --color-info:         #3B82F6;   /* links and info ONLY */

  /* ── INTERACTIVE ─────────────────────────────────── */
  --btn-primary-bg:     #F5F5F7;   /* primary button background */
  --btn-primary-text:   #000000;   /* primary button text */
  --btn-ghost-border:   #262629;   /* ghost button border */
  --btn-ghost-hover-bg: rgba(255,255,255,0.04); /* ghost hover */

  /* ── INNER GLOW (Vercel signature) ───────────────── */
  --glow-interactive:   0 0 0 1px rgba(255,255,255,0.08);
  --glow-focused:       0 0 0 1px rgba(255,255,255,0.14);

  /* ── SPACING SCALE ───────────────────────────────── */
  --pad-xs:   8px;
  --pad-sm:   12px;
  --pad-md:   16px;
  --pad-lg:   24px;
  --pad-xl:   48px;

  --radius-sm:  4px;    /* tags, badges */
  --radius-md:  6px;    /* buttons, inputs, cards */
  --radius-lg:  8px;    /* panels, modals */
  /* Never use rounded-full on non-avatar elements */

  /* ── TYPOGRAPHY SCALE ────────────────────────────── */
  --font-sans:  'Geist', 'Inter', system-ui, sans-serif;
  --font-mono:  'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace;

  --text-xs:    11px;
  --text-sm:    13px;
  --text-base:  14px;
  --text-md:    15px;
  --text-lg:    16px;
  --text-xl:    18px;
  --text-2xl:   24px;
  --text-3xl:   32px;
  --text-4xl:   48px;
  --text-hero:  64px;   /* marketing hero headline only */

  /* ── MOTION ──────────────────────────────────────── */
  --duration-instant:  100ms;
  --duration-fast:     150ms;   /* hover states */
  --duration-base:     200ms;   /* panel transitions */
  --duration-slow:     300ms;   /* page transitions */
  --duration-data:     120ms;   /* log entry slide-in */
  --ease-linear:       linear;
  --ease-out:          cubic-bezier(0.16, 1, 0.3, 1);

  /* page max widths */
  --max-marketing:  1200px;
  --max-app:        1440px;
  --max-docs:       880px;
}


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — TYPOGRAPHY RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Font families:
  Display / marketing headings:  Geist, weight 500–600
  UI labels and body:            Geist, weight 400–500
  Data, hashes, timestamps:      Geist Mono, weight 400
  Code blocks:                   Geist Mono, weight 400

Weight rules (STRICT):
  - Use 400 (regular) for body copy
  - Use 500 (medium) for labels, UI text, subheadings
  - Use 600 (semibold) for headings — marketing and section titles only
  - NEVER use 700 or 800 — too heavy against dark surfaces
  - NEVER use 300 or lighter — illegible at small sizes

Heading weights: 600
Body weights:    400
Label weights:   500
Code weights:    400

Sentence case everywhere. Never Title Case for UI labels.
Never ALL CAPS for anything.

Marketing hero headline:    var(--text-hero) = 64px, weight 600
Marketing section titles:   var(--text-4xl) = 48px, weight 600
App page headings:          var(--text-3xl) = 32px, weight 600
Section headings:           var(--text-2xl) = 24px, weight 500
Card titles:                var(--text-lg)  = 16px, weight 500
Body copy:                  var(--text-base)= 14px, weight 400
Labels / metadata:          var(--text-sm)  = 13px, weight 400 or 500
Captions / timestamps:      var(--text-xs)  = 11px, weight 400, font-mono

Line heights:
  Display/hero:   1.1
  Headings:       1.2
  Body:           1.6
  Code:           1.5


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — LAYOUT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Panel separation:
  - Use 1px border ONLY: border: 1px solid var(--border-base)
  - NEVER use box-shadow to separate panels
  - NEVER use gradients or glows for decorative panel separation
  - Divide tables/lists with border-bottom, not individual card shadows

Spacing constraints:
  - Component internal padding: 12–16px maximum
  - Card padding: 16px (--pad-md)
  - Section gaps on marketing site: 96px–128px vertical
  - App view internal gaps: 24px
  - Table/list row height: 40px (dense data), 48px (comfortable)
  - Never exceed 24px padding inside any card or panel

Borders:
  - 1px crisp border only. Never 2px unless highlighting a selected item.
  - Border color: var(--border-base) default, var(--border-hover) on hover
  - Selected/active item: border-color: var(--border-focus)
  - No rounded-full on panels, inputs, or non-avatar elements
  - Cards and inputs: border-radius: var(--radius-md) = 6px
  - Page-level panels: border-radius: var(--radius-lg) = 8px

Marketing site page layout:
  - max-width: var(--max-marketing) = 1200px, centered
  - Navigation: transparent, frosted glass (backdrop-filter: blur(12px))
  - Grid: 12-column, 24px gap
  - Section padding: 128px top/bottom

Control Tower / app layout:
  - max-width: var(--max-app) = 1440px
  - Left sidebar: 220px fixed, border-right: 1px solid var(--border-base)
  - Content area: grid-cols-12, 1px dividers between panels
  - Use CSS grid-cols-12 with gap: 0 and 1px border separators — NOT gap-based spacing


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — COMPONENT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BUTTONS:
  Primary:   bg var(--btn-primary-bg) = #F5F5F7, text black, radius 6px
             NOT blue. NOT a colored fill. White on dark.
             box-shadow on hover: var(--glow-interactive)
             
  Secondary: bg transparent, border 1px var(--border-base)
             hover: bg var(--btn-ghost-hover-bg), border var(--border-hover)
             box-shadow on hover: var(--glow-interactive)
             
  Destructive: bg #EF4444, text white — only for confirm-delete actions
  
  Text/Link:   no border, no bg, color var(--text-muted) → var(--text-primary) on hover
  
  All buttons: height 36px, padding 0 14px, font-size 14px, font-weight 500
               border-radius: var(--radius-md) = 6px
               transition: all var(--duration-fast) var(--ease-linear)
               NEVER rounded-full

INPUTS:
  bg: var(--surface-input) = #0d0d0d
  border: 1px solid var(--border-base)
  border-radius: var(--radius-md) = 6px
  height: 36px, padding: 0 12px
  color: var(--text-primary)
  placeholder: var(--text-placeholder)
  focus: border-color var(--border-focus), box-shadow var(--glow-focused)
  transition: var(--duration-fast)

CARDS / PANELS:
  bg: var(--surface-card) = #111111
  border: 1px solid var(--border-base)
  border-radius: var(--radius-lg) = 8px
  padding: var(--pad-md) = 16px
  hover: border-color var(--border-hover), box-shadow var(--glow-interactive)
  transition: border-color var(--duration-fast)

NAVIGATION (app sidebar):
  bg: var(--canvas-app) = #030303
  border-right: 1px solid var(--border-base)
  Active item: bg rgba(255,255,255,0.06), border-radius var(--radius-md)
               text: var(--text-primary)
  Inactive item: text var(--text-dim)
  Hover: bg rgba(255,255,255,0.03)
  Sliding tab indicator: use Framer Motion layoutId for active tab underline

NAVIGATION (marketing top bar):
  bg: rgba(0,0,0,0.7), backdrop-filter: blur(12px)
  border-bottom: 1px solid rgba(255,255,255,0.06)
  position: sticky top-0
  height: 60px

BADGES / TAGS:
  height: 22px, padding: 0 8px, font-size: 11px, font-weight: 500
  border-radius: var(--radius-sm) = 4px
  bg: rgba(255,255,255,0.06), color: var(--text-muted)
  border: 1px solid var(--border-base)
  Semantic variants use transparent tints:
    success:  bg rgba(34,197,94,0.1),  color #22C55E
    warning:  bg rgba(245,158,11,0.1), color #F59E0B
    error:    bg rgba(239,68,68,0.1),  color #EF4444
    info:     bg rgba(59,130,246,0.1), color #3B82F6

ICONS:
  Library: lucide-react ONLY. No other icon library.
  strokeWidth: 1.5 (always — never the default 2)
  Size in nav/sidebar: 16px
  Size inline with text: 14px  
  Size decorative/feature: 20px
  Color: inherit from parent (currentColor)

DIVIDERS:
  Horizontal: border-top: 1px solid var(--border-base)
  Vertical:   border-left: 1px solid var(--border-base)
  NEVER use <hr> with styles — use a div with border


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6 — MOTION (FRAMER MOTION)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

General principles:
  - Hover: instant, linear, 150ms. No elastic. No spring.
  - Data updates: NO animation. Instant value change. Jarring = authentic.
  - Use motion only where it aids spatial understanding, never decoratively.

Hover states (all interactive elements):
  transition={{ duration: 0.15, ease: "linear" }}

Active/selected tab indicator (Vercel-style sliding pill):
  Use Framer Motion layoutId. The highlight slides behind text on hover/select.
  Example:
    <motion.div layoutId="tab-indicator" 
      style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.06)', borderRadius: 6 }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
    />

Log entry appearance (Control Tower):
  initial={{ opacity: 0, y: 4 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.12, ease: "linear" }}
  Apply to each new log line ONLY on mount. Never re-animate existing lines.

Alert/error state (border flash):
  Animate border-color only, NOT background.
  transition={{ duration: 0.15 }}
  From var(--border-base) to var(--color-error)
  NEVER use a flash/pulse animation on alerts. Instant, held state.

Page transitions:
  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
  transition={{ duration: 0.2 }}

Panel/modal enter:
  initial={{ opacity: 0, scale: 0.97 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}

Status indicator (running agent):
  A 6px dot, border-radius 50%, bg var(--text-primary)
  animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
  NEVER use a large glowing pulse ring.

Live counters and metrics:
  NO animation on value changes. Update instantly.
  Rationale: animated number counting looks impressive in demos,
             looks unreliable in production dashboards.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7 — NOISE TEXTURE (Material Depth)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Apply a 2–3% opacity SVG noise overlay on the marketing site canvas only.
This is the technique that gives Linear and Vercel material depth on flat
black without gradients. Do NOT apply to the Control Tower or Marketplace.

In globals.css:
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
    opacity: 0.025;
    pointer-events: none;
    z-index: 9999;
    mix-blend-mode: overlay;
  }

Marketing site only — add class="marketing-noise" to <body> on marketing app
and scope the ::before to body.marketing-noise::before


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 8 — CODE BLOCKS & SYNTAX HIGHLIGHTING (SHIKI)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use Shiki with a custom theme. No rainbow syntax highlighting.
Vercel/Linear style: brightness variation only, zero hue changes.

Custom Shiki theme (add to shiki config):
  {
    name: 'actrone-dark',
    type: 'dark',
    colors: {
      'editor.background': '#111111',
      'editor.foreground': '#E5E5E7',
    },
    tokenColors: [
      { scope: ['keyword', 'storage.type', 'storage.modifier'],
        settings: { foreground: '#F5F5F7', fontStyle: '' } },
      { scope: ['string', 'string.quoted'],
        settings: { foreground: '#9E9E9E' } },
      { scope: ['comment'],
        settings: { foreground: '#555558' } },
      { scope: ['constant.numeric', 'constant.language'],
        settings: { foreground: '#E5E5E7' } },
      { scope: ['entity.name.function', 'support.function'],
        settings: { foreground: '#F5F5F7' } },
      { scope: ['variable', 'variable.other'],
        settings: { foreground: '#CCCCCC' } },
      { scope: ['entity.name.type', 'entity.name.class'],
        settings: { foreground: '#E5E5E7' } },
      { scope: ['keyword.operator'],
        settings: { foreground: '#8E8E93' } },
      { scope: ['punctuation'],
        settings: { foreground: '#666668' } },
    ]
  }

NO blue. NO purple. NO green. NO orange in code syntax.
Only brightness variation: #F5F5F7 (bright) → #555558 (dim).

Code block wrapper:
  bg: var(--surface-card) = #111111
  border: 1px solid var(--border-base)
  border-radius: var(--radius-lg) = 8px
  padding: 20px 24px
  font-family: var(--font-mono)
  font-size: 13px
  line-height: 1.6
  overflow-x: auto
  
Code block header (filename / language badge):
  bg: var(--surface-elevated) = #121214
  border-bottom: 1px solid var(--border-base)
  padding: 10px 16px
  font-size: 12px, color: var(--text-dim)
  font-family: var(--font-mono)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 9 — PER-SURFACE INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── MARKETING SITE (actrone.com) ──────────────────

Hero section:
  "Build a responsive hero on var(--marketing-hero) = #000000.
  Headline: var(--text-hero) 64px weight 600, color var(--text-primary).
  Subheadline: var(--text-xl) 18px weight 400, color var(--text-muted), max-width 560px.
  CTA primary: bg var(--btn-primary-bg) #F5F5F7, text black, no radius above 6px.
  CTA secondary: transparent bg, 1px border var(--border-base), 
                 color var(--text-secondary), hover: glow var(--glow-interactive).
  NO blue primary button. NO colored gradient buttons.
  Below the hero, alternate section backgrounds between #000000 and #0a0a0a
  to create depth without gradients."

Navigation:
  "Frosted glass nav: bg rgba(0,0,0,0.7), backdrop-filter blur(12px),
  border-bottom 1px solid rgba(255,255,255,0.06), height 60px.
  Logo left, links center (or right), CTA right.
  Nav links: var(--text-dim), hover: var(--text-primary), transition 150ms linear.
  Active link: sliding underline pill using Framer Motion layoutId."

Feature sections:
  "Grid layout: 12 columns, feature cards with 1px border var(--border-base),
  bg var(--surface-card), radius 8px.
  Feature icon: lucide-react, 20px, strokeWidth 1.5, color var(--text-muted).
  Feature title: 15px weight 500, color var(--text-primary).
  Feature body: 14px weight 400, color var(--text-muted), line-height 1.6.
  Hover: border-color var(--border-hover), box-shadow var(--glow-interactive)."


── DOCUMENTATION (actrone.com/docs/marketplace) ──

"Docs layout: left sidebar 240px fixed, main content max-width 680px, 
right TOC 180px. All in the existing marketing site monorepo.
Sidebar: tree navigation, 1px border-right var(--border-base),
         active item bg rgba(255,255,255,0.06), radius 6px, indent 16px per level.
Content area: font-size 14px, line-height 1.7, color var(--text-secondary).
Headings in docs: color var(--text-primary), weight 600.
Code blocks: Shiki custom theme (Section 8 above). NEVER use generic pre/code tags.
Inline code: bg rgba(255,255,255,0.06), border 1px solid var(--border-base),
             border-radius 4px, padding 1px 6px, font-family var(--font-mono),
             font-size 13px.
Search bar: top of sidebar, height 32px, bg var(--surface-input),
            border var(--border-base), radius 6px, placeholder 'Search docs…'"


── CONTROL TOWER (app.actrone.com) ────────────────

"Build a high-density streaming telemetry dashboard.

Layout: 
  Sidebar 220px, fixed left, bg var(--canvas-app), border-right 1px var(--border-base).
  Main area: CSS grid-cols-12 with gap: 0. Panels separated by 1px borders only.
  Panel padding: 16px internally.

Telemetry log panel:
  bg var(--surface-card), border 1px var(--border-base).
  Each log row: height 36px, display flex, align-items center.
  Timestamp: right-aligned, font-family var(--font-mono), font-size 11px,
             color var(--text-dim), min-width 140px.
  Log level badge: 8px dot, rounded-full, 
                   INFO=rgba(255,255,255,0.3), 
                   WARN=#F59E0B, 
                   ERROR=#EF4444.
  New log line animation: opacity 0→1, translateY 4→0, duration 120ms linear.
  Hover row: bg rgba(255,255,255,0.02).
  Divider: border-bottom 1px solid var(--border-base) on each row.

Metrics / stat cards:
  Display metric value: font-family var(--font-mono), font-size 24px, weight 500.
  Metric label: font-size 11px, weight 400, color var(--text-dim), text-transform none.
  bg var(--surface-card), border 1px var(--border-base), padding 16px.
  NEVER animate live number changes. Update value instantly.

Running agent status:
  6px dot, bg var(--text-primary), border-radius 50%.
  Framer Motion: animate opacity 1→0.3→1, repeat Infinity, duration 1.5s.
  Label: 'Running' in var(--text-dim), font-size 12px, font-mono.

Alert/error state:
  Transition border-color of the affected panel container to var(--color-error).
  Duration: 150ms. No flash. No background color change. Border only.

Sidebar nav items:
  Height 32px, padding 0 12px, display flex, align items center, gap 8px.
  Icon: lucide-react 16px strokeWidth 1.5.
  Active: bg rgba(255,255,255,0.06), border-radius 6px, color var(--text-primary).
  Inactive: color var(--text-dim).
  Hover: bg rgba(255,255,255,0.03), color var(--text-muted).
  Active indicator: Framer Motion layoutId sliding bg pill."


── MARKETPLACE (marketplace.actrone.com) ──────────

"Marketplace is the same visual language as Control Tower but with
more card-based layout for agent listings.

Agent Card:
  bg var(--surface-card), border 1px var(--border-base), radius 8px, padding 16px.
  Publisher handle: 11px font-mono, color var(--text-dim).
  Agent name: 15px weight 500, color var(--text-primary).
  Description: 13px weight 400, color var(--text-muted), max 2 lines, line-clamp-2.
  Stars: lucide Star icon 14px, color #F59E0B, strokeWidth 1.5. Count in font-mono.
  Trust badge: OFFICIAL=#F5F5F7, VERIFIED=#22C55E, COMMUNITY=var(--text-dim).
               All: 10px, font-weight 500, uppercase tracking-wide.
  Compliance score bar: height 4px, bg var(--border-base), 
                        fill with width% matching score, bg var(--text-secondary).
  Hover: border-color var(--border-hover), box-shadow var(--glow-interactive).

Search bar:
  Full width, height 48px, bg var(--surface-input), border 1px var(--border-base),
  radius 8px, font-size 14px. Icon: lucide Search 16px left.
  focus: border-color var(--border-focus), box-shadow var(--glow-focused).

Category pills:
  Horizontal scroll row, gap 8px.
  bg rgba(255,255,255,0.04), border 1px var(--border-base), radius 6px.
  Active: bg rgba(255,255,255,0.1), border var(--border-hover), 
          color var(--text-primary).
  Inactive: color var(--text-dim).
  height 32px, padding 0 14px, font-size 13px."


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 10 — ABSOLUTE PROHIBITIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEVER do any of the following. If you are about to, stop and reconsider.

  ✗ Gradient backgrounds of any kind (linear-gradient, radial-gradient)
  ✗ Box-shadow on panels for separation (1px border only)
  ✗ Blue primary buttons (primary CTA is white/light on dark)
  ✗ rounded-full on any element that is not an avatar or status dot
  ✗ Font weight 700 or 800 anywhere in Geist. (One narrow, named exception exists:
    the `<Emphasis>` accent typeface, `docs/Actrone_Display_Typography_Plan.md` and
    `branding.md` section "Display accent exception." It is a structurally distinct
    face, not a heavier Geist cut, and it may only wrap a single emphasized word or
    short phrase inside a hero headline, a Studio/wizard step title, or a dashboard
    hero greeting, never body text, never buttons, never nav, never live/numeric
    data. This rule still applies, unmodified, to every other heading and to Geist
    itself everywhere.)
  ✗ Colored accent decorations (no purple sidebar, no blue glow, no teal rings)
  ✗ Multiple icon libraries (lucide-react only, strokeWidth 1.5 only)
  ✗ Animate live counter values (update instantly)
  ✗ Flash/strobe animations on alerts (border color change only, held state)
  ✗ ALL CAPS text anywhere in the UI
  ✗ Title Case for UI labels (sentence case only)
  ✗ Padding above 24px inside any card or component
  ✗ Installing shadcn/ui as a dependency
  ✗ Generic pre/code tags for code blocks (use Shiki)
  ✗ Colorful syntax highlighting (brightness variation only in code blocks)
  ✗ Noise texture on Control Tower or app surfaces (marketing only)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 11 — REFERENCE SOURCES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Reference these for spatial density and component structure patterns.
Do not copy code — reference visual logic and spatial rhythm only.

  Vercel Geist Design System:  https://vercel.com/geist/introduction
  Linear marketing site:       https://linear.app
  shadcn New York style:       https://ui.shadcn.com (structure, not theming)
  Vercel dashboard:            https://vercel.com/dashboard (app chrome)
  Apple developer site:        https://developer.apple.com (typography density)
  Geist font:                  https://vercel.com/font



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 12 — SCROLL-DRIVEN NARRATIVE (Pinned Sections)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is the technique used by Vercel, Linear, Apple, Stripe, and Loom on
their marketing sites. A section occupies 100vh, stays PINNED (position
sticky) while the user scrolls through 3–5 "scroll steps" of content
inside it. The section only releases and scrolls away when all internal
steps are exhausted. The user feels like they are "scrolling through one
scene" rather than jumping between pages.

The technical name: SCROLL-DRIVEN PINNED SECTION with PROGRESS-BASED
CONTENT TRANSITIONS. Do not use scroll-jacking (overriding native scroll).
Use Framer Motion's useScroll + useTransform with position: sticky.


IMPLEMENTATION PATTERN — use this exact structure:

  // Each pinned section gets a tall scroll container
  // height = 100vh × (number of steps + 1)
  // The inner sticky panel = 100vh, stays fixed while parent scrolls

  // Example: 4-step pinned section = 500vh container

  const sectionRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"]
  })

  // Map scroll progress 0→1 to step index 0→3
  // Step 0: 0.00–0.25, Step 1: 0.25–0.50, etc.
  const step = useTransform(scrollYProgress, [0, 0.25, 0.5, 0.75, 1], [0, 1, 2, 3, 3])

  return (
    <section ref={sectionRef} style={{ height: '500vh' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh',
                    overflow: 'hidden', display: 'flex', alignItems: 'center' }}>

        {/* Left: text steps that change */}
        <div style={{ flex: 1 }}>
          {steps.map((s, i) => (
            <StepContent key={i} index={i} activeStep={step} content={s} />
          ))}
        </div>

        {/* Right: visual panel that morphs */}
        <div style={{ flex: 1 }}>
          <ScrollVisual progress={scrollYProgress} />
        </div>

      </div>
    </section>
  )


STEP CONTENT TRANSITION — text fades and slides between steps:

  function StepContent({ index, activeStep, content }) {
    const isActive = useTransform(activeStep, v => Math.round(v) === index)
    return (
      <motion.div
        style={{ position: 'absolute' }}
        animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)',
                    color: 'var(--text-dim)', letterSpacing: '0.1em',
                    textTransform: 'uppercase', marginBottom: 12 }}>
          {String(index + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
        </p>
        <h2 style={{ fontSize: 32, fontWeight: 600, color: 'var(--text-primary)',
                     lineHeight: 1.2, marginBottom: 16 }}>
          {content.headline}
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {content.body}
        </p>
      </motion.div>
    )
  }


SCROLL PROGRESS INDICATOR — a thin vertical line on the left edge showing
which step the user is on. Like a chapter marker:

  <div style={{ position: 'fixed', left: 32, top: '50%',
                transform: 'translateY(-50%)', display: 'flex',
                flexDirection: 'column', gap: 8 }}>
    {steps.map((_, i) => (
      <motion.div key={i}
        style={{ width: 2, height: 32, borderRadius: 1,
                 backgroundColor: Math.round(currentStep) === i
                   ? 'var(--text-primary)' : 'var(--border-base)' }}
        animate={{ scaleY: Math.round(currentStep) === i ? 1 : 0.5 }}
        transition={{ duration: 0.2 }}
      />
    ))}
  </div>


WHEN TO USE:
  - Feature explanation sections (show 3–4 product features one at a time)
  - How it works (step 1 → step 2 → step 3 with visual)
  - Before/after comparison sequences
  - Problem → Solution narrative
  LIMIT: max 2 pinned sections per page. More = exhausting.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 13 — SCROLL-TRIGGERED VIEWPORT ANIMATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Elements that animate INTO the viewport as the user scrolls down.
These should feel inevitable, not bouncy. Gravity-in, not spring-pop.

USE: Framer Motion's whileInView — simpler than useScroll for per-element
reveals. Set viewport.once: true so they never re-animate on scroll up.


STANDARD REVEAL — for most content blocks:

  <motion.div
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-80px" }}
    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
  >


STAGGERED CHILDREN — for feature grids, card rows, stat blocks:

  // Parent: triggers stagger
  <motion.div
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, margin: "-60px" }}
    variants={{
      hidden: {},
      visible: { transition: { staggerChildren: 0.08 } }
    }}
  >
    // Each child:
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0,
                   transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }
      }}
    />


COUNTER ANIMATION — for stat numbers (e.g. "10,000+ agents deployed"):
  // Only animate once on viewport enter. Use useMotionValue + useSpring.
  
  function AnimatedStat({ target, suffix }) {
    const count = useMotionValue(0)
    const rounded = useTransform(count, v => Math.round(v).toLocaleString())
    const ref = useRef(null)
    const isInView = useInView(ref, { once: true })

    useEffect(() => {
      if (isInView) {
        animate(count, target, { duration: 1.2, ease: "easeOut" })
      }
    }, [isInView])

    return (
      <span ref={ref}>
        <motion.span>{rounded}</motion.span>{suffix}
      </span>
    )
  }


LINE REVEAL — a horizontal rule that draws itself left→right on scroll:

  <motion.div
    initial={{ scaleX: 0, originX: 0 }}
    whileInView={{ scaleX: 1 }}
    viewport={{ once: true }}
    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    style={{ height: 1, background: 'var(--border-base)',
             borderRadius: 0, transformOrigin: 'left' }}
  />


WORD-BY-WORD HEADLINE REVEAL — for hero or section headings:
Split headline into words. Each word animates in with a 0.04s stagger.
Feels like the text is "typed by thought" not typed by keyboard.

  function RevealHeadline({ text }) {
    const words = text.split(' ')
    return (
      <motion.h1
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
        style={{ fontSize: 'var(--text-hero)', fontWeight: 600,
                 color: 'var(--text-primary)', lineHeight: 1.1 }}
      >
        {words.map((word, i) => (
          <motion.span key={i}
            variants={{
              hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
              visible: { opacity: 1, y: 0, filter: 'blur(0px)',
                         transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }
            }}
            style={{ display: 'inline-block', marginRight: '0.25em' }}
          />
        ))}
      </motion.h1>
    )
  }


STAGGER TIMING GUIDE:
  Feature cards grid:     staggerChildren: 0.08
  List items:             staggerChildren: 0.05
  Headline words:         staggerChildren: 0.04
  Headline characters:    staggerChildren: 0.02  (use sparingly — short words only)
  Stat blocks:            staggerChildren: 0.12


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 14 — PARALLAX & DEPTH LAYERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Parallax creates perceived depth — foreground elements move faster than
background elements. Used carefully on the marketing site hero and feature
sections. NEVER use in the Control Tower or Marketplace UI.

RULE: Maximum 3 depth layers. More = disorienting.
RULE: Parallax distance max 60px. More = motion sickness.
RULE: Disable for users with prefers-reduced-motion.


HERO PARALLAX — background moves slower than foreground:

  const { scrollY } = useScroll()
  
  // Background grid/noise: moves UP slowly (0.3x scroll speed)
  const bgY = useTransform(scrollY, [0, 800], [0, -240])
  
  // Hero headline: moves UP at normal speed (stays fixed relative to viewport)
  const headlineY = useTransform(scrollY, [0, 800], [0, -80])
  
  // CTA button: moves UP slightly faster (0.15x extra)
  const ctaY = useTransform(scrollY, [0, 800], [0, -120])

  <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
    <motion.div style={{ y: bgY, position: 'absolute', inset: 0 }}>
      {/* Background: grid lines, noise texture, decorative elements */}
    </motion.div>
    <motion.div style={{ y: headlineY, position: 'relative', zIndex: 2 }}>
      {/* Headline */}
    </motion.div>
    <motion.div style={{ y: ctaY, position: 'relative', zIndex: 3 }}>
      {/* CTA buttons */}
    </motion.div>
  </div>


FLOATING ORBS / AMBIENT GLOWS (Actrone original — see Section 16):
  Use parallax on 2-3 diffuse ambient elements behind the hero.
  These are NOT decorative gradients — they are pure blur layers.


DEPTH CARD TILT — cards that respond to mouse position with 3D tilt:
  Gives product screenshot cards a subtle floating depth feel.
  Use on feature cards and product mockup cards ONLY.

  function TiltCard({ children }) {
    const x = useMotionValue(0)
    const y = useMotionValue(0)
    const rotateX = useTransform(y, [-0.5, 0.5], [4, -4])
    const rotateY = useTransform(x, [-0.5, 0.5], [-4, 4])

    function handleMouse(e) {
      const rect = e.currentTarget.getBoundingClientRect()
      x.set((e.clientX - rect.left) / rect.width - 0.5)
      y.set((e.clientY - rect.top) / rect.height - 0.5)
    }
    function resetTilt() { x.set(0); y.set(0) }

    return (
      <motion.div
        onMouseMove={handleMouse}
        onMouseLeave={resetTilt}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d',
                 transformPerspective: 800 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Inner content lifts slightly above card surface */}
        <div style={{ transform: 'translateZ(20px)' }}>
          {children}
        </div>
      </motion.div>
    )
  }

  MAX tilt: 4 degrees. More = toy, not tool.
  Apply to: product screenshots, feature UI mockups, pricing cards.
  NEVER apply to: navigation, data tables, Control Tower panels.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 15 — NATIVE CSS SCROLL-DRIVEN ANIMATIONS (2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The CSS Scroll-Driven Animations API is now baseline in all modern
browsers (2025). It is GPU-accelerated, requires zero JavaScript, and
runs on the compositor thread — no jank, no scroll listener overhead.
Use this ALONGSIDE Framer Motion, not instead of it.
  - Framer Motion: for interactive, state-driven, complex sequences
  - CSS Scroll-Driven: for simple, always-on, performance-critical reveals


PROGRESS BAR — a reading progress indicator at the top of docs pages:

  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0,
    height: '2px',
    background: 'var(--text-secondary)',
    transformOrigin: 'left',
    animationName: 'progress',
    animationTimeline: 'scroll(root)',
    animationFillMode: 'both',
  }} />

  @keyframes progress {
    from { transform: scaleX(0); }
    to   { transform: scaleX(1); }
  }


FADE-IN-UP ON SCROLL — zero JS, GPU accelerated:

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .reveal {
    animation: fadeUp linear both;
    animation-timeline: view();
    animation-range: entry 0% entry 30%;
  }

  Apply class="reveal" to any element. It animates in as it enters the
  viewport. No IntersectionObserver. No JavaScript.


HORIZONTAL SCROLL TRACK — a timeline or feature list that scrolls
horizontally as the user scrolls vertically. Uses scroll-snap + CSS:

  .horizontal-track {
    display: flex;
    overflow-x: scroll;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }
  .horizontal-track::-webkit-scrollbar { display: none; }

  .track-item {
    min-width: 100vw;
    scroll-snap-align: start;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Drive horizontal scroll position from vertical scroll */
  /* Wrap in a tall container and use ScrollTimeline JS bridge */


SCROLL-LINKED OPACITY GRADIENT — text or elements that fade in from
the bottom and fade out at the top as you scroll past them:

  .scroll-fade {
    animation: scrollFade linear both;
    animation-timeline: view();
    animation-range: entry 10% exit 90%;
  }

  @keyframes scrollFade {
    0%   { opacity: 0; }
    15%  { opacity: 1; }
    85%  { opacity: 1; }
    100% { opacity: 0; }
  }


ALWAYS ADD:
  @media (prefers-reduced-motion: reduce) {
    .reveal, .scroll-fade, [style*="animationTimeline"] {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }
  }


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 16 — ACTRONE SIGNATURE EFFECTS (Original)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

These are effects designed specifically for Actrone that do not exist
verbatim on Vercel or Linear. They should feel like Actrone's signature.
Use them consistently to build brand recognition.


── EFFECT 1: COGNITIVE GRID ────────────────────────

The hero background is a subtle SVG grid with a radial "focus point"
that tracks the user's mouse position. As the mouse moves, the grid
lines nearest to the cursor brighten slightly. Feels like an intelligent
surface responding to attention.

  function CognitiveGrid() {
    const mouseX = useMotionValue(0.5)
    const mouseY = useMotionValue(0.5)

    function handleMouse(e) {
      mouseX.set(e.clientX / window.innerWidth)
      mouseY.set(e.clientY / window.innerHeight)
    }

    // Animate a radial gradient mask over the grid
    // as mouse moves, the gradient center moves with it
    const gradientX = useTransform(mouseX, v => `${v * 100}%`)
    const gradientY = useTransform(mouseY, v => `${v * 100}%`)

    return (
      <motion.div
        onMouseMove={handleMouse}
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `
            linear-gradient(var(--border-base) 1px, transparent 1px),
            linear-gradient(90deg, var(--border-base) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          maskImage: `radial-gradient(ellipse 60% 50% at ${gradientX} ${gradientY},
                       rgba(0,0,0,0.6) 0%, transparent 100%)`,
          opacity: 0.4,
        }}
      />
    )
  }

  The grid is always visible at low opacity.
  The mouse creates a "window of clarity" in the grid.
  On mobile (no mouse): show the grid with a slow automatic center pulse.


── EFFECT 2: TERMINAL TYPEWRITER (Hero subtext) ─────

The hero subheadline types itself character by character, then pauses,
then rewrites to the next phrase. Cycles through 3 Actrone value props.
Uses a monospace font to reinforce the developer-tool aesthetic.

  const phrases = [
    "Build agents that never forget.",
    "Govern every decision, automatically.",
    "Ship production AI in hours, not months.",
  ]

  function TerminalTypewriter() {
    const [phraseIndex, setPhraseIndex] = useState(0)
    const [displayed, setDisplayed] = useState('')
    const [typing, setTyping] = useState(true)

    useEffect(() => {
      const phrase = phrases[phraseIndex]
      if (typing) {
        if (displayed.length < phrase.length) {
          const t = setTimeout(() =>
            setDisplayed(phrase.slice(0, displayed.length + 1)), 38)
          return () => clearTimeout(t)
        } else {
          setTimeout(() => setTyping(false), 1800)
        }
      } else {
        if (displayed.length > 0) {
          const t = setTimeout(() =>
            setDisplayed(displayed.slice(0, -1)), 18)
          return () => clearTimeout(t)
        } else {
          setPhraseIndex(i => (i + 1) % phrases.length)
          setTyping(true)
        }
      }
    }, [displayed, typing, phraseIndex])

    return (
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16,
                  color: 'var(--text-muted)', letterSpacing: '-0.01em',
                  minHeight: '1.5em' }}>
        {displayed}
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ repeat: Infinity, duration: 0.5, ease: 'linear' }}
          style={{ display: 'inline-block', width: 2, height: '1em',
                   background: 'var(--text-muted)', marginLeft: 2,
                   verticalAlign: 'middle' }}
        />
      </p>
    )
  }


── EFFECT 3: AGENT TRACE VISUALISER (Feature section) ──

A live-updating "thought trace" animation that shows a simulated agent
reasoning chain forming in real time. Appears in the feature section
as a product preview. Pure CSS + JS — not a real API call.

Visually: a vertical column of steps appearing one by one, each with a
small pulsing dot while "processing", then a checkmark when "done".
Mimics the Control Tower trace viewer but as a marketing animation.

  const steps = [
    { label: 'Loading context from memory', ms: 800 },
    { label: 'Routing to gpt-4o via Abstraction Layer', ms: 600 },
    { label: 'Executing web_search: "NVDA Q3 2026"', ms: 1200 },
    { label: 'Supervisor validated — 0 violations', ms: 400 },
    { label: 'Governance check: RULE_001 passed', ms: 300 },
    { label: 'Response committed to memory', ms: 200 },
  ]

  Each step:
  - appears with opacity 0→1, translateX -8→0, duration 200ms
  - shows a 6px pulsing dot while active
  - dot transitions to a checkmark (lucide Check, 10px) when done
  - font: var(--font-mono), size 12px, color var(--text-dim)
  - completed steps: color var(--text-muted)

  The whole sequence loops with a 2s pause at completion.
  Loop restart: all steps fade out together, then replay.


── EFFECT 4: GOVERNANCE SCORE RING (Feature reveal) ──

A circular progress ring that draws itself on viewport enter, revealing
a compliance score. Like a speedometer that fills in. Sits in the
governance feature section.

  function ScoreRing({ score }) {  // score = 0–100
    const circumference = 2 * Math.PI * 54  // radius 54
    const isInView = useInView(ref, { once: true })
    const progress = useMotionValue(0)
    const strokeDashoffset = useTransform(progress,
      v => circumference - (v / 100) * circumference)

    useEffect(() => {
      if (isInView) animate(progress, score, { duration: 1.4, ease: 'easeOut' })
    }, [isInView])

    return (
      <svg width="128" height="128" viewBox="0 0 128 128">
        {/* Background ring */}
        <circle cx="64" cy="64" r="54"
          fill="none" stroke="var(--border-base)" strokeWidth="4" />
        {/* Progress ring */}
        <motion.circle cx="64" cy="64" r="54"
          fill="none" stroke="var(--text-primary)" strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset, rotate: -90, transformOrigin: 'center' }}
        />
        {/* Score label */}
        <text x="64" y="60" textAnchor="middle"
          style={{ fill: 'var(--text-primary)', fontSize: 24, fontWeight: 600,
                   fontFamily: 'var(--font-mono)' }}>
          <motion.tspan>{useTransform(progress, v => Math.round(v))}</motion.tspan>
        </text>
        <text x="64" y="80" textAnchor="middle"
          style={{ fill: 'var(--text-dim)', fontSize: 11,
                   fontFamily: 'var(--font-mono)' }}>
          /100
        </text>
      </svg>
    )
  }


── EFFECT 5: BEAM SCAN (Actrone original, subtle) ────

A single horizontal beam of light (1px height, 100% width) that scans
slowly DOWN across the hero section from top to bottom, once, on page
load. Feels like a system initialising. References the "scanning" theme
of AI reading and understanding.

  <motion.div
    initial={{ top: '0%', opacity: 0 }}
    animate={{ top: '100%', opacity: [0, 0.15, 0.15, 0] }}
    transition={{ duration: 2.4, ease: 'linear', delay: 0.3 }}
    style={{
      position: 'absolute', left: 0, right: 0, height: '1px',
      background: 'linear-gradient(90deg, transparent, var(--text-primary), transparent)',
      pointerEvents: 'none',
    }}
  />

  Runs ONCE on page load. Does not repeat. Does not loop.
  Apply only to the hero section. Very subtle — opacity max 0.15.


── EFFECT 6: MAGNETIC BUTTONS (CTA hover) ────────────

Primary CTA buttons have a subtle magnetic effect — the button drifts
slightly toward the cursor as it approaches within 80px. Feels physical.
Used on Apple.com. Signature Actrone touch on hero CTAs only.

  function MagneticButton({ children }) {
    const ref = useRef(null)
    const x = useMotionValue(0)
    const y = useMotionValue(0)
    const springX = useSpring(x, { stiffness: 200, damping: 20 })
    const springY = useSpring(y, { stiffness: 200, damping: 20 })

    function handleMouse(e) {
      const rect = ref.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const distX = e.clientX - centerX
      const distY = e.clientY - centerY
      const dist = Math.sqrt(distX ** 2 + distY ** 2)
      if (dist < 80) {
        x.set(distX * 0.25)
        y.set(distY * 0.25)
      }
    }
    function reset() { x.set(0); y.set(0) }

    return (
      <motion.button
        ref={ref}
        onMouseMove={handleMouse}
        onMouseLeave={reset}
        style={{ x: springX, y: springY }}
      >
        {children}
      </motion.button>
    )
  }

  Apply to: hero primary CTA only.
  Max drift: 0.25× cursor distance from center, capped at 80px radius.
  NEVER apply to nav links, sidebar items, or form buttons.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 17 — PREFERS-REDUCED-MOTION (REQUIRED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every animation, scroll effect, parallax layer, and visual effect MUST
respect the user's reduced-motion preference. This is not optional.
Users with vestibular disorders, epilepsy, or motion sensitivity depend on it.

ADD THIS HOOK to your animation utilities file:

  import { useReducedMotion } from 'framer-motion'

  export function useSafeMotion() {
    const shouldReduce = useReducedMotion()
    return {
      // Returns safe variants: instant if reduced-motion, animated if not
      variants: (animated, instant = {}) =>
        shouldReduce ? instant : animated,
      transition: (animated, instant = { duration: 0 }) =>
        shouldReduce ? instant : animated,
      shouldAnimate: !shouldReduce,
    }
  }


GLOBAL CSS RULE — add to globals.css:

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }

    /* Specific overrides for Framer Motion */
    [data-framer-motion] {
      transform: none !important;
      opacity: 1 !important;
    }

    /* Disable noise texture animation */
    body.marketing-noise::before {
      display: none;
    }

    /* Disable beam scan */
    .beam-scan {
      display: none;
    }

    /* Disable typewriter — show full text immediately */
    .typewriter-cursor {
      display: none;
    }
  }


PINNED SCROLL SECTIONS with reduced-motion:
  When prefers-reduced-motion is active, convert pinned sections to
  a simple vertical stack. Each "step" shows as a normal static section.
  Use CSS: @supports (animation-timeline: scroll()) to detect support
  and provide a non-scroll fallback.

  if (shouldReduce) {
    // Render steps as static vertical sections, not pinned scroll
    return steps.map(step => <StaticSection key={step.id} {...step} />)
  }


COGNITIVE GRID with reduced-motion:
  Show the grid at fixed opacity 0.15 with no mouse tracking.
  Remove all motion listeners.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 18 — PERFORMANCE RULES FOR ANIMATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All animations must hit 60fps on mid-tier hardware (2021 MacBook Air M1,
or equivalent). These rules ensure compositor-thread animations only.


ONLY ANIMATE THESE PROPERTIES (compositor-safe, no layout reflow):
  transform: translateX, translateY, translateZ, rotate, scale
  opacity
  filter: blur() — use sparingly, GPU-intensive
  
DO NOT ANIMATE (triggers layout reflow, causes jank):
  width, height, top, left, right, bottom
  padding, margin
  border-width
  font-size

If you need to animate position: use transform: translate() not top/left.
If you need to animate size: use transform: scale() not width/height.


WILL-CHANGE — use only on elements actively animating:

  // Apply before animation starts, remove after it ends
  style={{ willChange: 'transform, opacity' }}

  DO NOT apply will-change globally or to static elements.
  Overuse causes GPU memory pressure.


FRAMER MOTION PERFORMANCE SETTINGS:

  // For continuous scroll-driven animations (parallax, pinned sections)
  const { scrollYProgress } = useScroll({
    layoutEffect: false  // Use useEffect not useLayoutEffect to avoid SSR issues
  })

  // Use useTransform instead of inline calculations:
  // BAD: style={{ y: scrollY * 0.3 }}  ← recalculates every render
  // GOOD: style={{ y: useTransform(scrollY, [0, 1000], [0, 300]) }}


LAZY LOAD BELOW-FOLD ANIMATIONS:
  Components below the initial viewport fold should lazy-load their
  animation libraries. Use React.lazy() + Suspense for heavy animation
  sections (pinned scroll, 3D tilt sections).

  const PinnedSection = React.lazy(() => import('./PinnedSection'))


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 19 — ANIMATION USAGE MAP (WHAT GOES WHERE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Quick reference: which effects apply to which surface.

MARKETING SITE (actrone.com) — Full effects allowed:
  ✓ Cognitive Grid (hero background)
  ✓ Beam Scan (hero, page load once)
  ✓ Terminal Typewriter (hero subheadline)
  ✓ Noise texture (body::before)
  ✓ Magnetic buttons (hero CTA only)
  ✓ Pinned scroll sections (max 2 per page)
  ✓ Staggered viewport reveals (all sections)
  ✓ Word-by-word headline reveal (hero, 1 section heading)
  ✓ Parallax depth layers (hero only)
  ✓ Depth card tilt (feature cards, product mockups)
  ✓ Counter animation (stat numbers)
  ✓ Line draw on scroll (section dividers)
  ✓ Agent Trace Visualiser (feature section)
  ✓ Governance Score Ring (governance section)
  ✓ CSS Scroll-Driven progress bar (top of page)
  ✓ CSS fade-up reveals (.reveal class)
  ✓ Scroll-linked opacity (.scroll-fade class)

DOCUMENTATION (actrone.com/docs) — Minimal effects only:
  ✓ CSS Scroll-Driven progress bar (reading progress)
  ✓ Standard viewport reveals (stagger: 0.05, y: 12)
  ✗ NO noise texture
  ✗ NO parallax
  ✗ NO pinned scroll
  ✗ NO typewriter
  ✗ NO magnetic buttons
  ✗ NO beam scan

CONTROL TOWER (app.actrone.com) — Functional only:
  ✓ Log entry slide-in (new entries: y: 4→0, opacity 0→1, 120ms)
  ✓ Status dot pulse (6px, opacity 1→0.3→1, 1.5s loop)
  ✓ Alert border transition (border-color, 150ms)
  ✓ Panel enter (scale 0.97→1, opacity 0→1, 150ms)
  ✓ Sidebar active tab sliding pill (Framer layoutId)
  ✗ NO pinned scroll
  ✗ NO parallax
  ✗ NO typewriter
  ✗ NO magnetic buttons
  ✗ NO noise texture
  ✗ NO stagger reveals on data tables

MARKETPLACE (marketplace.actrone.com) — Light effects:
  ✓ Staggered card grid reveal on browse/search
  ✓ Sidebar active tab sliding pill
  ✓ Card hover glow (var(--glow-interactive))
  ✓ Panel enter animation
  ✓ Counter animation (deployment counts, star counts — on first view)
  ✗ NO pinned scroll
  ✗ NO parallax
  ✗ NO beam scan
  ✗ NO typewriter
  ✗ NO noise texture


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF DESIGN SYSTEM PROMPT
Actrone Frontend Ecosystem v1.1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━