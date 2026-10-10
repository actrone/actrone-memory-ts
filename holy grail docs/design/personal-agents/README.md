# Actronauts, design spec

`actronauts-spec.html` is the design spec for Actronauts, every agent built in Studio (Work and Personal), as described in `../../Actrone_Personal_Agents_Implementation_Plan.md` (v1.2). Open it in a browser: it renders the Actronaut crew, the presence states (2D and core forms), the Actronaut on the desktop and in the browser, the native phone apps, Studio and the enterprise console live, in both themes and at phone width, using the same tokens as `../blog-changelog/blog-changelog-spec.html`.

**Status, 2026-10-05: approved by the owner, revision 13.** Revision 13 (2026-10-10) folds in the approved device screens for decisions D25 and D26: the desktop and browser screens join part 04, the native phone screens lead part 05 with the web-app setup after them, five checks join part 14 and decisions N1 to N9 join part 15. Revision 12 (2026-10-09) folds in the approved D22 screens as parts 08 to 12 and renumbers motion, checks and decisions to 13, 14 and 15. Character art stays placeholder until the commissioned library (decision S4) replaces it. The owner chose the name Actronauts, asked for characters (not an orb) as the default form, rejected stock robots and animals as generic, then rejected logo-shaped figures as hard to relate to, and asked that Work agents be Actronauts too. Revision 3 makes the characters a crew of explorers with glass faces (Lander, Wilco, Atoll, Grotto, Lathe, Cairn) and records why real astronauts and inventors cannot be used. Revision 4 renames the crew after a screen against AI voice, model and assistant names (Sol and Marin are OpenAI voices) and changes the example owner name to Mabel. Revision 5 records the owner’s acceptance of every decision on 2026-10-04: characters are 2D only, and the phone app adds a required iPhone install step and a “Hey Siri” shortcut. Revision 6 adds decision D8: the character stays on screen by default and goes to the tray only by the owner’s choice, and Control Tower opens as a separate window of the same desktop app, for work accounts, from the first desktop build. It also adds decision D9: the character has its own intelligence (reflexes on the device and stage directions from the brain) and never reads faces or voices for emotion. Revision 8 adds D10 (the desktop character is drawn natively by the Rust host) and D11 (the desktop app is Control Tower, 100%, the same as the web app, with a richer home for Actronauts on top; Actronauts also work fully in Control Tower on the web; the phone app shows only Actronauts), plus a browser pop-out scene. Revision 9 adds D12: a browser extension keeps Actronauts on whenever the browser runs, with a browser extension scene. Revision 10 adds D13: Actronauts plans, chosen Work or Personal, with a getting-started render (plans and “Get Mabel everywhere”) in part 06. Revision 11 renames three characters after a US trademark register search (decision D21): Wilco, Grotto and Cairn become Biplane, Speleo and Binnacle. Nothing is built.

The owner reviews it as a private claude.ai artifact published from this file. Republish to the same artifact after every revision, so the link stays the same.

## What it covers

| Part | Contents |
| --- | --- |
| 01 | The Actronaut crew: anatomy (glass face, explorer outfit, lifeline, charter lights, mission patch, receipt stitches), six launch families (Lander the astronaut, Biplane the aviator, Atoll the aquanaut, Speleo the cave explorer, Lathe the inventor, Binnacle the navigator), the expression sheet, accessories including the organization patch, real astronauts and inventors considered, and directions ruled out |
| 02 | Presence states: nine states across the 2D character and the core form, interactive |
| 03 | Presence tiers and what they cost: 2D and core only, with runtime 3D dropped and server-rendered video avatars rejected |
| 04 | On the desktop and in the browser: idle, summoned, approval, driving the screen, file dropped, screen sharing, hidden in the tray (with the tray menu), Control Tower open, browser pop-out, browser extension; then the desktop app beside you (select and ask, working in the background, focus guard, notifications on Windows), watched folders, meeting notes without a bot, the computer’s own search, continue anywhere, show and tell, widgets; the extension’s guards and tools (checkout, scam, hidden instructions, site tools, forms from the vault, private pages), tab or cloud, research, address bar and right-click, drafts inside sites, meeting notes in a tab; their states; and how Actronauts differ on each device |
| 05 | The phone apps: native first launch, the crew, what Mabel can know (senses), home, approval sheet with passkey, mission log with undo, what the Actronaut knows, the web-app setup; the Lock Screen, Dynamic Island, Android bubble, widgets, StandBy and the watch; the keyboard, Mabel calling you, call screening, Siri and the Android assistant; sorted notifications, on-phone and in-cloud receipts, the work profile and cutting off a lost phone; their states |
| 06 | Studio: the Work or Personal choice, three steps of the personal path, and getting started (plans by edition, “Get Mabel everywhere”) |
| 07 | Employee Actronauts and managed machines: admin settings, device fleet, deployment flow |
| 08 | Rewind: undo an hour of an Actronaut’s work, with live unsend countdowns and partial-result states |
| 09 | Mission preview: the dry run, the options compared, what a mission touches and where it stops to ask |
| 10 | Shareable proof: sharing from the phone and the public verification page (action proof, Mandate, expired, altered) |
| 11 | Guardian mode: the family view, held payments, rules, and the parent’s own phone |
| 12 | Initiative cards: sourced nudges, the daily budget and “while you were away” |
| 13 | Motion tokens, the idle behaviour catalogue, and how the character thinks (reflexes on the device, stage directions from the brain, the four honesty rules) |
| 14 | Accessibility and brand checks |
| 15 | Decisions accepted 2026-10-04 (D7 colour, D8 on screen by default, D9 intelligence, D10 native character, D11 desktop app is Control Tower, D12 browser extension, D13 Actronauts plans, the D22 screen decisions R1 to I1, the device screen decisions N1 to N9, 2D only, Rive runtime, mission vocabulary, launch library) |

## Addendum: moat screens (draft for approval)

`actronauts-moat-screens.html` holds the screens for decision D22 (plan section 6.9): Rewind, mission preview, shareable proof with its public verification page, Guardian mode and initiative cards, plus the decisions to approve (R1 to I1). It reuses this spec's stylesheet and character code, built by copying them, so it renders identically. Status: approved by the owner on 2026-10-09 and folded into the main spec as parts 08 to 12. The addendum file stays as the record of what was approved.

## Addendum: device screens (approved)

`actronauts-device-screens.html` holds the screens for decisions D25 (native iPhone and Android apps, plan section 8.6) and D26 (the 22 new desktop and browser abilities, plan section 8.5). It covers the phone apps and their senses, the Lock Screen, Dynamic Island, Android bubble, widgets, StandBy and the watch, hands on the phone, on-phone and in-cloud receipts, work phones and cutting off a lost phone, the desktop and browser scenes, their states and checks, and the decisions to approve (N1 to N9). It is built the same way as the moat addendum, from this spec’s stylesheet and character code. Published as a [private artifact](https://claude.ai/artifact/UAcrrvkRnbTvTSTn2rcwm1). Status: approved by the owner on 2026-10-10 and folded into the main spec (parts 04, 05, 14 and 15). The addendum file stays as the record of what was approved.

## Non-negotiables it inherits

Everything in `CLAUDE.md` §8.1.1 and `docs/branding.md`: Black and Apple Silver, Geist only, weights 400/500/600, sentence case, 1px borders rather than shadows (shadows only on floating overlays), no gradients, chroma only for status, `lucide` icons at stroke 1.5, no status dots, no em or en dashes. Characters are drawn with flat two-tone shading for the same reason.

## Keeping it current

This file is the approved spec. If the implementation deviates from it, update this file and republish the artifact.
