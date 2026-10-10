# Actrone launch markets

> **What this is:** the single list of where Actrone launches, in what order, and which feature packs each market carries, for all of Actrone: the hosted platform, Control Tower, Actronauts and voice. The open-source libraries have no borders and are already available everywhere; this list governs the hosted products, where support, payments and law are local.
> **Status:** decided by the owner on 2026-10-09: one list for the whole platform, with Canada in wave 1, and pack 1 carrying everything except the marketplace. Every other document that mentions launch markets points here, so change markets here first. The feature packs themselves are defined in `Actrone_Phased_Launch_GTM_Plan.md`, section 0.1.
> **Owner:** Matthew Nyirenda · **Created:** 2026-10-09 · **Not legal advice:** every regulatory item needs counsel’s confirmation for the market before it opens.

---

## 1. The waves

| Wave | When | Markets | Why |
| --- | --- | --- | --- |
| **1** | At the hosted launch, planned for about Q1 2027 | United States, Canada, United Kingdom, Ireland, Netherlands, South Africa | The largest developer and consumer AI markets; Twilio and Stripe work in all six; the EU entry point where WhatsApp must admit assistants; the Africa plan’s lightest lift |
| **2** | About 3 to 6 months after launch | Germany, France, Spain, Italy; Sweden, Denmark, Finland; Australia, New Zealand; Kenya | The biggest EU markets once translated; the Nordics work in English; low-cost English-speaking additions; Kenya once registered |
| **3** | About 6 to 12 months after launch | Nigeria, Ghana, the rest of the EU, Brazil, India, UAE, Saudi Arabia | Large markets that each need a specific piece of work first: a local phone gateway, local pricing or local data law |
| **Later** | Pulled by demand | Egypt, Japan, South Korea, Southeast Asia | High demand, high effort: licensing, local representatives, other messaging ecosystems and languages |

---

## 2. Feature packs, and which markets carry them

| Pack | When | What it carries | Markets |
| --- | --- | --- | --- |
| **Open source** | Live since September 2026 | The memory libraries (TypeScript and Python), framework adapters, the memory CLI, `create-actrone-app` | Everywhere |
| **Pack 1** | The hosted launch, about Q1 2027 | Connected, hosted and native build modes; the Studio no-code builder with governed tools; **voice agents**; **Actronauts**, the whole Actronauts plan except its marketplaces: the **native iPhone and Android apps**, the **desktop app and browser extension**, **governed computer use**, **Actronaut payments**, **households, Guardian mode and the crew network**; governed writes with simulate, approve, signed receipts and undo; **cross-company actions** (the action fabric) and A2A; Control Tower with environments and promotion; the model gateway with BYOK and the **cost and model optimizers**; **MediaGuard’s image and screen redaction**; **assurance and attested autonomy**; premium memory for Pro; Teams, single sign-on and SCIM; the trust center; **data residency** (EU, Cape Town and Canada planes); **self-hosting** for enterprise; billing, including the Actronauts plans | Every wave 1 market |
| **Pack 2** | About 2 to 3 months after launch | The marketplace (agents, connectors, signed skills and Actronaut characters, with revenue share), plus anything from pack 1 that missed its gate | Every open market |

So every wave 1 market opens with pack 1 and receives pack 2 when it ships. A wave 2 or wave 3 market opens on whatever pack is current at that point. The owner moved everything except the marketplace into pack 1 on 2026-10-09, because it is all built before launch as one plan; the limits that still apply (timing, outside approvals, and the payment and age switches) are in the phased GTM plan, section 0.1.

**How packs and markets move together:**

1. **Packs ship when they pass their quality gates:** tests, load tests, a penetration test, accurate docs and a support runbook
2. **Markets open when they pass their market gates** (section 6)
3. **A pack reaches every open market at the same time,** so every customer runs the same product
4. **A new market opens on the current pack,** never an older one
5. **A pack release and a market opening are kept two to four weeks apart,** so a problem can be traced to one change

**Pack 1’s launch gates** (detail in the phased GTM plan, section 4.2): load tests on hosted execution, the native loop and voice; a penetration test; live voice tests proving latency and that a blocked sentence is never spoken; the EU, Cape Town and Canada data planes applied and tested; the self-hosting release published, with guided and air-gapped installs tested; trust center claims limited to what is proven; Actronauts and computer use through their own gates (rehearsal, prompt injection, desktop performance, screenshot recall); payments proven in each market where they switch on; and the outside approvals in hand (Cloudflare’s verified agent listing, browser store review, desktop code signing, the card issuing and EU payment partners). Anything that misses its gate moves to pack 2 rather than delaying the launch.

---

## 3. Wave 1, market by market

| Market | Why it is in wave 1 | Payments | Phone numbers | WhatsApp | Data and filings |
| --- | --- | --- | --- | --- | --- |
| United States | The largest developer and consumer AI market | USD through Stripe | Local numbers; texting needs A2P 10DLC registration | Drafts only | US data plane; SOC 2 as the enterprise gate; CCPA/CPRA; state chatbot laws such as California’s SB 243 and New York’s rules; TCPA consent for AI voices on calls |
| Canada | The closest neighbour to the US motion; English-speaking outside Quebec | CAD through Stripe | Local numbers | Drafts only | PIPEDA and Quebec Law 25; the Canada data plane in pack 1; French in the product and the agent’s voice before selling to consumers in Quebec |
| United Kingdom | English, mature payments and phone networks | GBP through Stripe | Local numbers with a regulatory bundle | Drafts only (the EU order does not cover the UK) | UK GDPR; data protection fee to the ICO; UK customers who want their data in Europe can use the EU plane |
| Ireland | English entry point to the EU | EUR through Stripe | Local numbers with a regulatory bundle | Full, under the European Commission’s interim order of 2026-06-09 | GDPR with an Article 27 representative; AI Act Article 50 labelling (since 2026-08-02); the EU data plane in pack 1 |
| Netherlands | Among the highest English proficiency in Europe, and heavy WhatsApp use | EUR, with iDEAL alongside cards | Local numbers with a regulatory bundle | Full, under the same order | As Ireland; Dutch translation comes in wave 2 |
| South Africa | The Africa plan’s anchor and lightest lift; the continent’s highest generative AI adoption | ZAR pricing; cards through Stripe, with Paystack for local methods if needed | Local numbers through Twilio with a regulatory bundle | Drafts only | POPIA, with an Information Officer registered with the Information Regulator; the Cape Town data plane in pack 1 keeps data in the country |

---

## 4. Waves 2 to 4: what each needs first

| Wave | Markets | What each needs before it opens |
| --- | --- | --- |
| 2 | Germany, France, Spain, Italy | German, French, Spanish and Italian in the product, the agent’s voice and speech recognition |
| 2 | Sweden, Denmark, Finland | Local payment methods; English works for launch |
| 2 | Australia, New Zealand | A check of Australia’s online safety codes for AI chatbots; local numbers |
| 2 | Kenya | Registration with the Office of the Data Protection Commissioner; local numbers with a regulatory bundle |
| 3 | Nigeria | The local carrier gateway (Twilio cannot give a real Nigerian caller ID); the NDPA 2023 and the central bank’s payment-data rules from 2027-01-01 |
| 3 | Ghana | Data protection registration; local carrier rules |
| 3 | The rest of the EU | Each member state’s language |
| 3 | Brazil, India | Local pricing; LGPD and the DPDP Act; WhatsApp allows assistants only drafts outside the EU |
| 3 | UAE, Saudi Arabia | Limits on internet calling; Arabic |
| Later | Egypt | The data-protection licensing regime and a mandatory local representative |
| Later | Japan, South Korea, Southeast Asia | LINE and KakaoTalk instead of WhatsApp; local languages |

---

## 5. One product everywhere, with a few country switches

Every market runs the same pack. A handful of features depend on the country and switch on only where they work:

| Feature | Where it works |
| --- | --- |
| Full WhatsApp for assistants | The EU only, under the Commission’s order; elsewhere the agent drafts and you send |
| Data residency | The EU plane (Ireland, the Netherlands, later EU markets, and UK customers who choose it), the Cape Town plane (South Africa) and the Canada plane, all in pack 1; the US plane elsewhere |
| Agent spending (pack 1) | Where Stripe’s agent cards are confirmed (decision D14), and in the EU through passkey approval with a scoped token; off elsewhere until confirmed |
| Households | Adult members only at launch (18+, decision D16); child accounts need their own decision and each market’s minors rules |
| The agent’s own phone number | Where local numbers can be issued; Nigeria waits for the carrier gateway |
| Languages | English at launch, plus French for Quebec; each wave 2 and 3 market opens with its language |

---

## 6. What every market passes before it opens

1. **Phones:** local numbers an AI agent may use, texting registration where required, and the market’s consent rules for AI voices on calls
2. **Payments:** local-currency pricing, the local payment methods people expect, and VAT or sales tax handled (Stripe Tax)
3. **Agent spending:** confirmed for the market before it is offered there (decision D14)
4. **Data protection:** the market’s data plane where residency is sold, a lawful transfer basis otherwise, and every registration the market requires before processing starts
5. **Business terms:** the DPA, the sub-processor list and the security documentation ready for the market
6. **AI rules:** AI disclosure at the start of every conversation and call, the market’s chatbot and minors rules, and 18+ age assurance where required (decision D16)
7. **Consumer law:** cancellation rights, automatic-renewal rules and clear prices
8. **Language:** the product, the agent’s voice, speech recognition and support in the market’s language
9. **Messaging:** WhatsApp’s status for the market stated in the product, plus the other channels that work there
10. **Crisis referral:** local crisis lines wired into the agent before launch
11. **Counsel sign-off:** a short written review for the market, kept with this document

---

## 7. What changed on 2026-10-09

The earlier plans listed four first-wave regions (the US, Canada, the EU and Africa), then Australia and Asia, then the rest of the world, and spread the hosted features across four phases. The owner’s decisions change that:

- **One list for all of Actrone,** replacing separate lists for the platform and Actronauts
- **Wave 1 is the US, Canada, the UK, Ireland, the Netherlands and South Africa.** The UK was missing from the earlier plans, and the EU opens through Ireland and the Netherlands, then by language
- **Africa opens by country:** South Africa in wave 1, Kenya in wave 2, Nigeria and Ghana in wave 3, Egypt later. This settles the earlier conflict between Africa at about month 5 in the distribution strategy and in phase 3 in the phased GTM plan
- **Australia and New Zealand move up to wave 2;** Asia splits, with India in wave 3 and Japan, South Korea and Southeast Asia later
- **Pack 1 now carries everything except the marketplace:** voice agents, all of Actronauts (including the desktop app, the browser extension, payments, households and Guardian mode), computer use, cross-company actions, the optimizers, image and screen redaction, assurance, data residency and self-hosting, which the earlier plans spread across three packs. The marketplace is pack 2

---

## 8. Open items

1. **Data planes:** apply and test the EU, Cape Town and Canada planes before launch (a pack 1 gate)
2. **Self-hosting release:** publish it and test guided and air-gapped installs before launch (a pack 1 gate)
3. **French for Quebec:** in the product and the agent’s voice before selling to consumers in Quebec
4. **Actronauts, computer use and payments:** most of it is not built yet and it is the largest timing risk in pack 1. The Actronauts plan estimates about 37 to 45 weeks along its longest chain with the phases in parallel, against about 25 weeks to the end of Q1 2027, so either the slip rule applies or the launch date moves (decision D24 in the Actronauts plan)
5. **Agent spending by market:** confirm where Stripe’s agent cards and the EU passkey payments work before launch (decision D14)
6. **Counsel reviews:** one per wave 1 market before launch

---

## 9. Documents that point here

- `Actrone_Phased_Launch_GTM_Plan.md`: section 0.1 (the packs), sections 4 to 8 and 12 to 13
- `Actrone_Distribution_And_GTM_Strategy.md`: the rollout backbone and section 5b
- `Actrone_Africa_Launch_Readiness_Plan.md`: the scope and section 1
- `Actrone_Marketing_Strategy_Hosted.md`, `Actrone_Sales_Strategy_Hosted.md` (section 8) and `Actrone_Ad_Campaign.md`
- `Actrone_Additions_Implementation_Plan.md`: workstream G
- `Actrone_Pitch_Deck_Draft.md`
- `Actrone_Personal_Agents_Implementation_Plan.md`: decisions D18 and D24

---

## 10. Sources

- WhatsApp in the EU: [Meta will allow rival AI chatbots on WhatsApp in Europe, but for a fee (TechCrunch)](https://techcrunch.com/2026/03/05/meta-will-allow-rival-ai-chatbots-on-whatsapp-in-europe-but-for-a-fee/), [EU orders Meta to stop blocking rival AI chatbots on WhatsApp (Engadget)](https://engadget.com/2191213/eu-orders-meta-to-stop-blocking-rival-ai-chatbots-on-whatsapp)
- Agent payments in Europe: [Revolut and Visa complete a passkey-authenticated agent payment in France](https://www.crowdfundinsider.com/2026/09/308247-digital-bank-revolut-and-visa-complete-passkey-authenticated-agentic-payment-in-france/), [Worldline, ING and Mastercard run Europe’s first agent payment in production](https://stellagent.ai/insights/worldline-ing-european-agentic-payment)
- US texting: [Twilio A2P 10DLC](https://twilio.com/a2p-10dlc)
- Chatbot and minors rules: [FPF on California SB 243 and beyond](https://fpf.org/blog/understanding-the-new-wave-of-chatbot-legislation-california-sb-243-and-beyond/)
- African markets, carriers and data laws: `Actrone_Africa_Launch_Readiness_Plan.md` (research of 2026-07)
