Here is the complete, comprehensive master specification for the Actrone brand identity, visual style guide, and architectural user experience design in raw writing.

---

# ACTRONE: BRAND IDENTITY & ARCHITECTURAL UX SPECIFICATION

**Document Type:** System Design & Visual Standards Specification

> **Status refreshed 2026-07-13 (code-verified):** the Black & Apple-Silver palette, "colour is a
> status vector never decoration," monochrome/no-gradient/1px-border discipline, and CTA framework
> below are all confirmed live across `frontend/apps/{control-tower,marketing,marketplace}` and
> `frontend/packages/ui` (`docs/Actrone_Frontend_Rebrand_Plan.md` is SHIPPED, not a pending plan — see
> that doc's refreshed status note). **One correction: §3.1 and §4.4's "pulsing dot" status vectors
> are stale.** Status dots were **retired from the brand entirely on 2026-07-12** —
> `frontend/packages/ui/src/ui/Badge.tsx` states outright: "Text + semantic colour carry the state —
> no leading dot (status dots were retired from the brand, 2026-07-12)." Status is now conveyed by
> badge text + a held semantic colour (no dot, no pulse, no flash), consistent with CLAUDE.md
> §8.1.1's "alert = held border-colour change, never a flash/pulse." The one narrow exception is a
> single **static** (explicitly non-pulsing) green dot in the Control Tower dashboard hero
> (`DashboardHero.tsx`: "Static green status dot — operational reads calm, not an alarming pulse"),
> which is a decorative "all systems operational" affordance, not a per-item status vector. Read
> §3.1/§4.4 below as historical design intent that the pulsing-dot detail did not ship as specified.

---

## 1. Executive Branding Paradigm & Philosophy

Actrone is an enterprise-grade cognitive infrastructure platform built to safely deploy multi-agent orchestration frameworks within regulated, high-consequence corporate environments. The strategic shift from the previous high-friction palette (**Black & Red**) to an elite, monochromatic palette (**Black & Apple Silver**) removes visceral alert bias, projecting architectural resilience, structural predictability, and corporate maturity.

Red can work well for threat-hunting or terminal tools, but it carries deep cognitive associations: *danger, errors, alert fatigue, and financial loss*. By transitioning to a monochromatic, high-end metallic palette, Actrone leans directly into the design language of hyper-premium developer toolchains. It communicates absolute reliability, deterministic execution, and serious corporate stability.

The premium user experience leverages spatial layering, extreme typographic density hierarchies, and tactical, low-fatigue layout dividers. By executing a completely desaturated canvas, color is elevated from an aesthetic ornament to a strict, functional status vector.

---

## 2. Color Architecture Specification

The interface operates on a meticulous multi-tier slate-cool tone range. The core values prevent muddy dark mid-tones, using absolute black gradients to maximize readability and premium hardware-matched glass effects.

### 2.1 The Core Palette Matrix

* **Deep Space Base (`#030303` / `#0A0A0A`)**
* *Role:* Page body backdrop and canvas foundation.
* *UX Context:* Darker than standard corporate gray-blacks. It provides total canvas depth and makes silver typography and thin line borders pop with extreme crispness.


* **Obsidian Fill (`#121214`)**
* *Role:* Telemetry panels, data cards, telemetry streams, and inner container surfaces.
* *UX Context:* A premium, subtle metallic-cool slate gray that cleanly chunks out operational blocks on the screen.


* **Mercury Border (`#262629`)**
* *Role:* 1px layout wiregrids, panel separations, and component strokes.
* *UX Context:* The signature crisp layout border. It provides clean structural definition without needing heavy contrast dividers.


* **Satin Silver (`#E5E5E7`)**
* *Role:* Primary headers, active states, focus elements, and critical user typography.
* *UX Context:* Bright, reflective, clean, and highly legible against ink-black backdrops.


* **Alabaster White (`#F5F5F7`)**
* *Role:* High-intensity status readouts, functional glyphs, and interactive hover tooltips.
* *UX Context:* Reserved for elements that require maximum readability and focal priority.


* **Muted Mercury (`#8E8E93`)**
* *Role:* Secondary text, metadata logs, timestamps, system tracking tags, and disabled form fields.
* *UX Context:* Soft text contrast that drops secondary metadata into the background so the user's eye naturally locks onto active variables first.



---

## 3. Psychological Color & Status Gating

By anchoring the interface in monochromatic tones, the system establishes a clean, predictable rhythm. When errors or compliance gates do occur, a restricted palette of high-chroma system colors is applied with surgical precision. This approach avoids screen clutter and eliminates the user fatigue often caused by platforms filled with unorganized warning markers.

In an engineering system, if everything is colored, nothing is colored. When the platform is clean and monochrome, your status triggers become completely intuitive:

### 3.1 Status Vectors

> (unverified as shipped 2026-07-13 — status dots described in this section were retired from the
> brand 2026-07-12; see the status note at the top of this doc.)

* **Operational Activity**
* *Visual:* A 2px solid, softly pulsing dot.
* *Color:* **Satin Silver (`#E5E5E7`)**
* *UX Behavior:* Indicates an active, executing agent workflow thread inside the kernel. It is silent, calm, and completely non-distracting during multi-hour user monitoring sessions.


* **Policy Intervention**
* *Visual:* A clean, hollow static circle outline.
* *Color:* **Muted Mercury (`#8E8E93`)**
* *UX Behavior:* The Deterministic Policy Engine (DPE) has paused an execution path for standard, routine human approval or an operational checkpoint.


* **Security Breach / Operational Block**
* *Visual:* A solid, vibrant, high-chroma container block or notification alert.
* *Color:* **Neon Crimson (`#EF4444`)**
* *UX Behavior:* The Metadata Abstraction Layer (MAL) or DPE has actively intercepted a hard runtime policy violation, unauthorized state change, or sensitive token leak. Because the rest of your Next.js Control Tower layout is an understated, elegant monochrome environment, that single red error block will pop instantly off the screen, immediately drawing an engineer's attention without causing cognitive clutter on a normal day.



---

## 4. Control Tower Interactive Blueprint & Interface Layout

### 4.1 Spatial Layering & Container Rules

The Next.js Control Tower application organizes high-density log data across distinct depth planes:

1. **The Base Canvas (`#030303`):** Absolute matte black. The screen feels boundless, making your panels float cleanly in space.
2. **The Panel Containers (`#121214`):** Elevated blocks where live agent actions stream.
3. **The Separation Layer (`#262629`):** Every container is carved out using a strict 1px crisp border line. No dropshadows, no heavy background gradients.

### 4.2 Typographic Density Hierarchy

To present real-time tracing logs clearly, typography uses distinct sizing, weights, and opacity levels:

* **Primary System Headers, Node Names, and Active Hashes:** Rendered in bold **Alabaster White (`#F5F5F7`)** or **Satin Silver (`#E5E5E7`)**. Text has an absolute clarity that stands out perfectly.
* **System Parameters, JSON Trace Files, Routing Keys, and Timestamps:** Rendered in small, monospace **Muted Mercury (`#8E8E93`)**. This keeps secondary metadata from competing with active headers, allowing engineers to scan thousands of operational events seamlessly.

#### 4.2.1 Display accent exception (added 2026-07-25)

One additional self-hosted display typeface (`--font-accent`, currently Big Shoulders, a free
SIL Open Font License condensed industrial face; see
`docs/Actrone_Display_Typography_Plan.md` for the full research and rationale) may be used,
strictly limited to single-word or short-phrase emphasis inside hero headlines, Studio/wizard
step titles, and a dashboard hero greeting. Rendered through the shared `<Emphasis>` component
(`@actrone/ui`), never a raw font-family override, so the scope restriction travels with the
code, not just this document.

Never body text, never UI chrome, never buttons, never nav, never table or list content, and
never live or numeric data (dashboard metric values use `.nums`/`tabular-nums` for precise,
frequently-updating alignment; a display accent face fighting that feature for a number that
changes every request is exactly the kind of forced, undisciplined use this exception is not
for). It may use its own variable weight range, including weights above Geist's 600 ceiling,
because it is a structurally distinct face, not a heavier cut of Geist. Geist's own weight
ceiling (400 to 600, never 700/800) is unchanged and still applies everywhere else, including
every other display or marketing heading not using this exception.

The exception exists because the logo itself is a bespoke, entirely rectilinear mark (every
letterform in the wordmark is built from straight line segments, no curves at all), a
character Geist's own conventional rounded-terminal construction cannot echo at any weight.
Restraint is the point: this reads as premium specifically because it stays rare.

### 4.3 Interactive Guardrail Rule

> **System Integrity Assurance Rule:** All custom UI components built for the Actrone platform must restrict colored interactive elements to verified alerts. Functional navigation paths, sidebar links, active buttons, slider switches, tabs, and focus state highlights must stick strictly to monochromatic variations of the primary theme (silvers, whites, and charcoal grays). Color is a utility reserved for state categorization, never decoration.

This Master Specification is architected to apply globally across all digital real estate—establishing a unified, hyper-premium engineering aesthetic that bridges public marketing, technical documentation, developer ecosystems, and the core runtime console.

---

# GLOBAL ARCHITECTURAL STYLE GUIDE: MASTER SPECIFICATION

## 🌐 1. The Marketing Site (`actrone.com`)

The objective of the marketing site is to immediately signal high-consequence infrastructure, separating Actrone from casual, consumer-facing chatbot tools.

* **The Landing Page Canvas:** The background remains absolute ink-black (`#030303`), ensuring that text elements float seamlessly without hard grid boundaries.
* **Hero Visuals & Background Loops:** All background video assets and interactive motion graphics use cool, satin-brushed metallic rendering rather than high-contrast colored animations. 3D glass prisms, token tracks, and layer stacks pass light cleanly through dark frosted textures.
* **Typography:** Large, stark headers are set in bold **Alabaster White (`#F5F5F7`)**. Body copy and technical subheads default to **Satin Silver (`#E5E5E7`)**, maintaining a premium editorial feel.
* **Call-to-Action (CTA) Framework:** Primary action buttons use a solid Satin Silver background with deep obsidian text. Hover states utilize a subtle white glow effect. Secondary actions use clean, 1px Mercury borders (`#262629`) with zero fill.

---

## 📄 2. The Technical Documentation (`docs.actrone.com`)

*The documentation site prioritizes intense readability, structural density, and rapid scanning for developers and solution architects.*

* **Layout Grid:** A strict multi-column layout split by vertical 1px lines (`#262629`). The left navigation rail uses **Muted Mercury (`#8E8E93`)** text that shifts to sharp **Satin Silver (`#E5E5E7`)** on active selection.
* **Code Blocks & Monospace Copy:** Code blocks use a deep obsidian fill (`#121214`) surrounded by a thin border. Code carries full syntax highlighting (Shiki `github-dark-default` and `github-light-default`, shared through `CODE_THEMES`, every token at WCAG AA on the code surfaces), on blocks and on one-line commands alike. Owner decision, 2026-10-01: code is the one place hue appears outside status colours, because recognisable token colours make code faster to read. Inline code in prose stays monochrome.
* **Callout Boxes & Warnings:**
* *Standard Info / Note:* A subtle left-border using **Muted Mercury (`#8E8E93`)** with a light gray tint.
* *Security / Compliance Warnings:* A clean, solid border using **Neon Crimson (`#EF4444`)**. This color is reserved strictly for warning about insecure production setups, data training leakage, or unverified agent write-permissions.



---

## 🛒 3. The Agent Marketplace (`[actrone.com/marketplace](https://actrone.com/marketplace)`)

*The marketplace presents standardized enterprise agent templates, connector modules, and workflow pipelines built by verified contributors.*

* **Component Cards:** Every listed agent or integration is housed within a uniform Obsidian container (`#121214`) bounded by a clean 1px outline.
* **High-Density Metrics:** Marketplace listings bypass large marketing imagery. Instead, listings showcase functional data points directly on the card face using small monospace typography: deployment count, latencies, resource footprint, and compliance certifications (e.g., SOC2, GDPR compliant via the MAL layer).


* **Verified Badges:** Verified enterprise-grade components display a minimalist, hollow silver verification circle icon, maintaining visual alignment with the primary theme.

---

## 💻 4. The Control Tower Console (`app.actrone.com`)

The primary interactive application canvas where enterprise security operators and developers manage running multi-agent clusters.

* **The Log Streams:** Live-streaming execution code strings, cryptographic rationale tracks, and system parameters roll out in a dense, scannable format. Timestamps and trace addresses drop back using **Muted Mercury (`#8E8E93`)** text. Active variables and tool invocation methods highlight in crisp **Satin Silver (`#E5E5E7`)**.
* **System Status Indicators** *(corrected 2026-07-13: shipped as held badge text + colour, no dot/pulse — status dots retired 2026-07-12)*:
* **`[ Running ]`** — A single, pulsing 2px dot in Satin Silver.
* **`[ Policy Intercepted ]`** — A solid Neon Crimson layout indicator. Because the rest of the application runs in a calm, dark monochrome state, the visual impact of an active block instantly signals an alert to the operator without requiring intrusive popups or screen fatigue.

* **Navigation & Interactivity:** Sidebar elements, profile drop-downs, and workflow mapping panels use clean, mechanical hover highlights. The interaction model treats color as a premium data indicator, never an aesthetic decoration.