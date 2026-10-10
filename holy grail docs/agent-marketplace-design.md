# Actrone — Agent Marketplace
### Design Document: The GitHub for AI Agents
**Version:** 1.1.0  
**Classification:** Internal Engineering + Product  
**Authors:** Engineering Team  
**Last Updated:** 2026  

> **Status refreshed 2026-07-13 (code-verified):** the marketplace is real and live —
> `frontend/apps/marketplace/` is its own separate Next.js app (public routes:
> `marketplace, marketplace/[publisher], marketplace/[publisher]/[agent]{,/forks,/issues,/versions},
> marketplace/search`, plus its own `(auth)` sign-in/sign-up), and `(app)/marketplace/*` inside
> Control Tower covers the publisher-facing surface (`my-agents, publish{,/[id]/edit}, earnings,
> analytics/[id], settings`) — matching §6's discovery UX and §5's publishing flow at a high level.
> **§13 Technical Architecture had a substantive stale claim beyond a Clerk→WorkOS rename**: this
> section originally described the marketplace as reusing Control Tower's Clerk session (shared
> cookie, "no new auth setup," "sign in once, authenticated across both apps"). That is **not** what
> shipped — the marketplace has its **own independent headless WorkOS AuthKit + generic-OIDC login**,
> a real architectural decision (not just a vendor swap) confirmed by its own complete `lib/auth/`
> stack and `app/api/auth/*` routes, separate from control-tower's. Corrections applied inline in
> §13.1/§13.2/§13.3/§13.9/§13.10/§13.11 and at §16's self-deployment-detection mention. Sections 1–12
> and 14–19 (artifact types, discovery UX, trust/verification, governance integration, rewards,
> monetisation, moderation, roadmap) were not independently re-verified against code this pass beyond
> the route-existence spot-check above — treat as directional (unverified 2026-07-13) except where a
> claim was separately confirmed elsewhere in this refresh.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Vision & Design Philosophy](#2-vision--design-philosophy)
3. [What the Marketplace Is — Complete Definition](#3-what-the-marketplace-is--complete-definition)
4. [Artifact Types](#4-artifact-types)
5. [Developer Experience — Publishing](#5-developer-experience--publishing)
6. [User Experience — Discovery & Installation](#6-user-experience--discovery--installation)
7. [Trust, Verification & Safety Architecture](#7-trust-verification--safety-architecture)
8. [Governance Integration](#8-governance-integration)
9. [Incentive System & Developer Rewards](#9-incentive-system--developer-rewards)
10. [Monetisation Architecture](#10-monetisation-architecture)
11. [Social & Community Features](#11-social--community-features)
12. [Private Marketplace (Enterprise)](#12-private-marketplace-enterprise)
13. [Technical Architecture](#13-technical-architecture)
14. [API Specification](#14-api-specification)
15. [Security Model](#15-security-model)
16. [Moderation & Content Policy](#16-moderation--content-policy)
17. [Observability & Analytics](#17-observability--analytics)
18. [Release Roadmap](#18-release-roadmap)
19. [Platform Quality Standards](#19-platform-quality-standards)

---

## 1. Executive Summary

The Actrone Agent Marketplace is a GitHub-like registry and social platform where developers publish, discover, share, fork, and monetise AI agent definitions. The primary unit of exchange is the **Agent-File** — the declarative YAML manifest that fully defines an agent's behaviour, tools, memory policy, and governance rules.

It is not an app store of finished products. It is not a no-code builder. It is a **developer-first platform** where the community that builds the most sophisticated AI agents in the world shares their work — publicly, verifiably, with full transparency into how each agent behaves in production across thousands of real deployments.

The marketplace solves a problem that gets worse as the AI agent ecosystem matures: **every team is rebuilding the same agents from scratch.** A financial research analyst agent. A customer support triage agent. A contract reviewer. A data pipeline monitor. These patterns exist at thousands of companies and are rebuilt thousands of times. The marketplace ends that duplication — the best version of each agent type is published, rated, improved collaboratively, and deployed by anyone in minutes.

**The GitHub analogy is precise:**

| GitHub | Agent Marketplace |
|---|---|
| Repositories | Agent-File packages |
| Stars | Agent stars |
| Forks | Agent forks (with lineage tracking) |
| Pull requests | Improvement proposals |
| Issues | Bug reports and hallucination reports |
| Actions / CI | Automated governance checks on publish |
| npm registry | Marketplace install via CLI |
| GitHub Sponsors | Developer rewards and monetisation |
| Verified badges | Publisher verification tiers |
| README | Agent card (rich documentation page) |
| Release tags | Agent-File versioning |
| Dependabot | Governance policy update notifications |

**Key differentiators from every other agent marketplace in 2026:**

- **Governance-native:** Every published agent carries a live compliance score based on real production violations across all deployments — not self-reported
- **Feedback-loop-aware:** Agents improve over time through the Governance Engine's fine-tuning pipeline. The marketplace tracks improvement velocity
- **Incentive-driven:** Developers earn real money, reputation tokens, and platform benefits based on deployment count, star ratings, and measured agent quality
- **Fork-and-improve:** Full lineage tracking so derivative work credits the original and improvement compounds across the community
- **Africa-first categories:** First marketplace with dedicated categories and verified governance packs for POPIA, NDPR, GPA, and SADC regulatory environments

---

## 2. Vision & Design Philosophy

### 2.1 The Core Belief

The best AI agents are not going to be built by one company. They are going to be built by the thousands of developers who understand their specific domain — financial compliance in South Africa, healthcare workflows in Nigeria, legal document review in the UK — better than any platform vendor ever could. The marketplace exists to capture and amplify that distributed intelligence.

### 2.2 Design Principles

**Developer-first, always.** Every decision optimises for developer experience. Publishing should feel as natural as pushing to GitHub. Installing should feel as natural as pip install. Discovery should feel as natural as searching npm. If a developer has to read documentation to do something basic, the design has failed.

**Transparency over marketing.** Agent listings are not advertisements. They show real production data — violation rates, hallucination scores, deployment counts, cost per task — sourced directly from the Governance Engine and the Orchestrator. Publishers cannot inflate their own metrics. The data is what the data is.

**Quality compounds.** The marketplace is not a flat list of agents. It has reputation, history, and improvement tracking. An agent that has been deployed 10,000 times, received 500 stars, had its hallucination rate drop from 12% to 2% over six months, and been forked 40 times to produce specialised variants is visibly a better bet than a new listing with no history. Quality is visible and it compounds.

**Community ownership.** Official Actrone agents are the foundation. But the community owns the marketplace over time. The best-rated agents in every category should be community-built within 12 months of launch. Incentive structures are designed to make this happen.

**Security is non-negotiable.** Every agent that runs in a user's infrastructure from the marketplace runs through the same Governance Engine as their own agents. Trust tiers, cryptographic signing, and the Wasm sandbox ensure that installing a marketplace agent cannot compromise a production environment.

---

## 3. What the Marketplace Is — Complete Definition

### 3.1 The Three Layers

The marketplace has three layers that work together:

**Registry Layer** — the technical infrastructure. Stores, versions, signs, and distributes Agent-Files, GovernancePolicy Packs, and Tool Definitions. Accessible via CLI, SDK, and REST API. Analogous to npm registry or Docker Hub.

**Discovery Layer** — the web interface at `marketplace.actrone.com`. Search, browse, filter, compare, and read detailed agent cards. Where developers find agents and where publishers build their reputation.

**Community Layer** — stars, forks, reviews, improvement proposals, discussions, contributor graphs, and the reward system. What transforms a registry into a platform.

### 3.2 What It Is Not

- Not a no-code agent builder (that is a separate product)
- Not a marketplace for model weights or fine-tuned models
- Not a place to publish application code (agents are YAML definitions, not code)
- Not a cloud service marketplace (not AWS Marketplace, not Salesforce AppExchange — those are finished applications)

### 3.3 The Network Effect

The marketplace becomes more valuable with every participant:

- More published agents → better discovery → more deployments → more production data
- More production data → better compliance scores → more trust → more deployments
- More deployments → more developer rewards → more high-quality publishing
- More high-quality publishing → more forks → more specialisation → more use cases covered

This is the same network effect that made GitHub indispensable. The goal is to make the Agent Marketplace the place where serious AI agent development happens publicly.

---

## 4. Artifact Types

### 4.1 Agent-Files (Primary Artifact)

The core publishable unit. A complete, versioned, cryptographically signed YAML manifest that defines an agent fully. Published as a package with a name, version, description, category tags, and documentation.

**Package naming convention:**

```
{publisher-handle}/{agent-name}@{version}

Examples:
  actrone/financial-research-analyst-za@2.1.0
  acme-corp/customer-support-triage@1.0.3
  community/sars-efiling-helper@0.9.0-beta
```

**What a published Agent-File package contains:**

```
financial-research-analyst-za/
  ├── agent.yaml              ← the Agent-File itself (signed)
  ├── README.md               ← documentation and usage guide
  ├── CHANGELOG.md            ← version history
  ├── governance/
  │   └── policy.yaml         ← bundled GovernancePolicy
  ├── tools/
  │   └── definitions.yaml    ← tool schemas the agent expects
  ├── examples/
  │   ├── basic-usage.py      ← example code
  │   └── crew-usage.py       ← example in a Crew
  └── manifest.json           ← metadata, signature, checksums
```

### 4.2 GovernancePolicy Packs (Compliance Artifacts)

Standalone compliance rule sets published separately from agents. Organisations reference them in their Agent-Files. Compliance firms, law firms, and regulatory specialists publish these.

```
actrone/popia-baseline@1.2.0
legaledge-za/fsca-financial-services@3.0.1
healthtech-ng/ndpr-healthcare@1.0.0
```

### 4.3 Tool Definitions (Integration Artifacts)

Registered tool schemas for external services. Published once, referenced by any agent. Reduce the friction of connecting agents to common enterprise systems.

```
actrone/salesforce-crm@2.0.0
actrone/shopify-orders@1.5.0
community/sars-efiling@0.3.0-beta
community/jse-market-data@1.1.0
```

### 4.4 Crew Templates (Multi-Agent Artifacts)

Complete multi-agent crew definitions — a set of coordinated Agent-Files with a defined process type, shared memory configuration, and goal specification. The most complex and highest-value artifact type.

```
actrone/financial-research-crew@1.0.0
  ├── researcher.yaml
  ├── analyst.yaml
  ├── writer.yaml
  └── crew.yaml              ← coordination manifest
```

---

## 5. Developer Experience — Publishing

### 5.1 Publishing Flow

Publishing is designed to be as friction-free as pushing to GitHub. The entire flow from terminal to live listing takes under five minutes for a well-prepared Agent-File.

**Step 1 — Login and namespace**

```bash
actrone login
# Opens browser, authenticates via GitHub OAuth or email
# Sets up publisher namespace: yourhandle.actrone.com/marketplace

actrone marketplace init
# Initialises the marketplace config in current directory
# Creates: .actrone/marketplace.yaml with publisher defaults
```

**Step 2 — Prepare the package**

```bash
# Validate Agent-File against schema
actrone validate agents/financial-analyst.yaml

# Generate README template if none exists
actrone marketplace docs --generate agents/financial-analyst.yaml
# Produces: README.md with agent description, tool requirements,
# governance policy, example usage, and cost estimates

# Preview what will be published
actrone marketplace preview agents/financial-analyst.yaml
```

**Step 3 — Publish**

```bash
actrone marketplace publish \
  --file agents/financial-analyst.yaml \
  --name "Financial Research Analyst ZA" \
  --category "finance" \
  --tags "research,south-africa,fsca,equities" \
  --visibility public \
  --price 0 \
  --version 1.0.0

# Output:
# ✓ Schema validation passed
# ✓ Security scan passed (0 issues)
# ✓ Governance policy detected: actrone/popia-baseline@1.2.0
# ✓ Agent-File signed with publisher key
# ✓ Package uploaded and indexed
# 
# Published: actrone/financial-research-analyst-za@1.0.0
# View at: marketplace.actrone.com/actrone/financial-research-analyst-za
```

### 5.2 Automated Checks on Publish

Every publish triggers an automated pipeline before listing:

```
PUBLISH PIPELINE
─────────────────────────────────────────────────────
1. SCHEMA VALIDATION
   Is the Agent-File valid against actrone/v1 schema?
   Are all required fields present?
   Are all referenced tools registered?
   ↓
2. SECURITY SCAN
   Does the agent reference any non-standard external endpoints?
   Are there any suspicious tool configurations?
   Does it attempt to override safety filters to "off"?
   Does it contain hardcoded credentials?
   ↓
3. GOVERNANCE CHECK
   Does it include a governance policy?
   If no policy: is output_filter set to at least "moderate"?
   Does it declare PII handling intention?
   ↓
4. QUALITY BASELINE
   Does the README meet minimum length (200 words)?
   Are there at least one usage example?
   Is spend limit configured?
   ↓
5. SIGNING
   Agent-File signed with publisher's Ed25519 key
   SHA-256 checksums generated for all package files
   Manifest.json written with signature and checksums
   ↓
6. LISTING
   Package indexed in registry
   Agent card generated from README + metadata
   Search index updated
   Publisher notification sent
─────────────────────────────────────────────────────
Total time: < 60 seconds for automated checks
Manual review queue: only for EXPERIMENTAL tier
```

### 5.3 Versioning

Semantic versioning is enforced. Publishers cannot break the versioning contract:

```yaml
# Patch: bug fixes, governance rule updates, tool schema corrections
actrone/financial-analyst@1.0.1

# Minor: new optional tools, improved prompts, new examples
actrone/financial-analyst@1.1.0

# Major: breaking changes (new required tools, significant behaviour changes)
actrone/financial-analyst@2.0.0

# Pre-release: beta, alpha, rc builds
actrone/financial-analyst@2.0.0-beta.1
```

Pinning is supported and encouraged:

```python
# Pin to exact version (production recommended)
agent = Agent.from_marketplace("actrone/financial-analyst@1.0.3")

# Pin to minor (auto-patch updates)
agent = Agent.from_marketplace("actrone/financial-analyst@~1.0")

# Pin to major (auto-minor updates)
agent = Agent.from_marketplace("actrone/financial-analyst@^1")
```

### 5.4 Forking

Any public Agent-File can be forked — the same mental model as GitHub:

```bash
actrone marketplace fork actrone/financial-analyst-za@2.1.0 \
  --new-name "financial-analyst-nigeria" \
  --description "Adapted for Nigerian NDPR and SEC regulations"
```

The fork:
- Creates a new package under the developer's namespace
- Maintains a `forked_from` reference in the manifest (lineage tracking)
- Preserves the original's governance policy as a baseline
- Appears on the original listing as a fork with deployment stats

The original publisher is notified of the fork and receives attribution credit on the fork's listing. If the fork becomes more popular than the original, both are surfaced — the ecosystem gets credit for the lineage.

---

## 6. User Experience — Discovery & Installation

### 6.1 The Agent Card

Every published agent has a rich **Agent Card** — the equivalent of a GitHub repository page. This is the primary discovery and evaluation surface.

```
┌─────────────────────────────────────────────────────────────────────┐
│  actrone / financial-research-analyst-za                 ⭐ 2,341  │
│  Financial Research Analyst — South Africa                          │
│  ──────────────────────────────────────────────────────────────     │
│  📦 v2.1.0  ·  🏷 finance, research, south-africa, fsca            │
│  👤 Published by Actrone Official  ✓  OFFICIAL                  │
│  📅 Updated 3 days ago  ·  🚀 14,203 deployments                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  LIVE PRODUCTION STATS  (sourced from Governance Engine)    │   │
│  │                                                             │   │
│  │  Compliance Score    ████████░░  82/100                     │   │
│  │  Hallucination Rate  ██░░░░░░░░  2.1%  ↓ from 8.4% (v1.0)  │   │
│  │  Avg Cost / Task     $0.043                                 │   │
│  │  Avg Task Duration   34 seconds                             │   │
│  │  P99 Latency         8.2 seconds                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  TOOLS REQUIRED         GOVERNANCE POLICY                          │
│  • web_search           actrone/popia-baseline@1.2.0             │
│  • code_interpreter     actrone/fsca-financial@2.0.0             │
│                                                                     │
│  [Install]  [Fork]  [⭐ Star]  [Report Issue]  [Sponsor]           │
└─────────────────────────────────────────────────────────────────────┘
```

Key elements of every Agent Card:

**Live Production Stats** — pulled directly from aggregate telemetry across all deployments. Not self-reported. Not estimated. Real numbers from real production use. This is the most important trust signal on the page and nothing like it exists anywhere else in the agent ecosystem.

**Version History with Quality Trajectory** — a graph showing how the agent's compliance score and hallucination rate have changed across versions. An agent with a steadily improving trajectory is visible at a glance.

**Fork Graph** — visualisation of forks, showing the lineage tree and which forks have become specialised variants for different industries or regions.

**Improvement Feed** — a chronological activity stream showing: new version releases, governance policy updates, community-submitted corrections that were incorporated, and notable deployment milestones.

### 6.2 Search and Discovery

The search interface is designed for developers who know what they need and for those who are exploring:

**Keyword search** — natural language, semantic (not just exact match):
```
"agent that reviews contracts and flags risk clauses"
"customer support triage for e-commerce"
"research agent for JSE listed companies"
```

**Filtered browse:**

```
Category:    Finance | Legal | Customer Support | Research |
             DevOps | Data | Healthcare | Government | Education

Region:      South Africa | Nigeria | Zimbabwe | Pan-Africa |
             European Union | Global

Compliance:  POPIA | GDPR | NDPR | HIPAA | FSCA | GPA

Quality:     Compliance Score > 80 | Hallucination Rate < 5% |
             Deployments > 1000 | Stars > 100

Price:       Free | Under $50/mo | Under $200/mo | Any

Trust:       Official | Verified | Community
```

**Trending and curated:**

- **Trending this week** — fastest growing by deployment count
- **Most starred this month** — community favourites
- **Editor's picks** — curated by the Actrone team
- **New and notable** — recently published with strong early signals
- **Most improved** — agents with the biggest compliance score improvement in 90 days
- **Africa Spotlight** — featured agents built for African markets

### 6.3 Installation

**Via CLI (recommended for production):**

```bash
# Install into current project
actrone marketplace pull actrone/financial-analyst-za@2.1.0

# Install with local overrides file
actrone marketplace pull actrone/financial-analyst-za@2.1.0 \
  --overrides overrides/financial-analyst.yaml

# Produces: agents/financial-analyst-za@2.1.0.yaml (local copy, signed)
```

**Via SDK:**

```python
from actrone import Agent

# Direct from marketplace
agent = Agent.from_marketplace(
    "actrone/financial-analyst-za@2.1.0",
    overrides={
        "limits.max_daily_cost_usd": 100.00,
        "model.primary": "claude-3-5-sonnet",
        "tools[web_search].allowed_domains": ["sec.gov", "jse.co.za"]
    }
)

result = agent.run("Analyse Naspers Q3 2026 results")
```

**Via Agent-File reference (GitOps-friendly):**

```yaml
# agents/production.yaml — your own Agent-File extends a marketplace agent
apiVersion: actrone/v1
kind: Agent
metadata:
  name: my-financial-analyst
  extends: "actrone/financial-analyst-za@2.1.0"   # ← marketplace reference

spec:
  # Only override what you need — everything else inherits from the base
  limits:
    max_daily_cost_usd: 100.00
  governance:
    policy: "governance/my-extended-policy.yaml"
```

The `extends` field means your Agent-File inherits from the marketplace version and overrides only the fields you specify. When the marketplace agent publishes an update, you can pull the update with one command and your overrides are preserved.

### 6.4 Dependency Management

The marketplace CLI handles dependencies:

```bash
# Show what a marketplace agent depends on
actrone marketplace info actrone/financial-analyst-za@2.1.0

# Output:
# Depends on:
#   tools:        web_search (built-in), code_interpreter (built-in)
#   governance:   actrone/popia-baseline@1.2.0
#                 actrone/fsca-financial@2.0.0
#   compatible:   actrone-sdk >= 1.0.0

# Check for updates on installed agents
actrone marketplace outdated

# Update all installed agents (respects pinned versions)
actrone marketplace update
```

---

## 7. Trust, Verification & Safety Architecture

### 7.1 Trust Tiers

Every published agent and publisher has a trust tier. Trust is earned, not purchased.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TRUST HIERARCHY                              │
│                                                                     │
│  🏛 OFFICIAL                                                        │
│  Published by Actrone Engineering Team                          │
│  Fully audited internally. Highest compliance standards.            │
│  Examples: actrone/* official packages                           │
│                                                                     │
│  ✅ VERIFIED                                                         │
│  Identity confirmed (business registration or individual KYC)       │
│  Payment method verified. Full security review passed.             │
│  Track record: ≥ 3 published agents, ≥ 90 days on platform         │
│  Compliance score across portfolio: ≥ 75/100 average               │
│  Blue checkmark on all listings                                     │
│                                                                     │
│  👤 COMMUNITY                                                        │
│  Email-verified developer account                                   │
│  Passed automated publish checks                                    │
│  No manual review required for public listings                      │
│  Yellow badge on listings                                           │
│                                                                     │
│  🧪 EXPERIMENTAL                                                     │
│  New publisher (< 30 days) or flagged by automated scan            │
│  Runs in Wasm sandbox automatically when deployed                   │
│  Red badge on listings. Cannot be paid listings.                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Cryptographic Signing

Every Agent-File is signed before listing. The signing chain:

```
Publisher private key (Ed25519)
    ↓ signs
Agent-File content hash (SHA-256)
    ↓ produces
Signature embedded in manifest.json
    ↓ verified by
Actrone Orchestrator at install time + at every execution
```

When a developer installs a marketplace agent, the Orchestrator:
1. Verifies the signature against the publisher's public key
2. Verifies the file hash has not changed since signing
3. Verifies the publisher's trust tier is sufficient for the deployment environment
4. Logs the verification to the audit trail

If verification fails for any reason, the agent will not load. This is a hard fail — not a warning.

**Enterprise-specific signing:**

Enterprise customers on self-hosted deployments can configure an **approved publisher list** — only agents signed by publishers on this list will load. This gives security teams complete control over which marketplace agents can run in their environment.

```yaml
# actrone-enterprise-config.yaml
marketplace:
  approved_publishers:
    - "actrone"           # official only
    - "acme-corp"           # internal publisher
    - "legaledge-za"        # trusted compliance partner
  require_tier: "verified"   # minimum trust tier
  sandbox_experimental: true # EXPERIMENTAL tier always sandboxed
```

### 7.3 The Wasm Sandbox for Experimental Agents

All EXPERIMENTAL tier agents run in a Wasm-isolated execution environment when deployed. This means:

- Agent reasoning still runs through the normal LLM → Orchestrator pipeline
- Tool calls are intercepted at the Wasm boundary — the agent cannot make raw HTTP calls
- All tool calls go through the Supervisor regardless of what the Agent-File specifies
- The agent cannot read or write to host filesystem
- Memory access is restricted to the agent's own namespace — no cross-agent memory reads
- Maximum execution time is halved compared to standard agents
- Cost caps are enforced at 50% of configured limits as an additional protection

Experimental agents carry a visible warning on the Agent Card and in the Control Tower when running.

### 7.4 Abuse Prevention

**Rate limiting on publish:** Maximum 10 new packages per publisher per day. Maximum 50 version updates per package per day. Prevents flooding the marketplace with low-quality listings.

**Automated malicious pattern detection:** The security scan checks for:
- Tool configurations pointing to known malicious or data-exfiltration endpoints
- System prompts that attempt to override safety filters
- Governance policies with all rules set to LOG_ONLY (attempting to disable governance)
- Agent-Files that reference external package URLs (supply chain attack vector)
- Obfuscated content in system prompts

**Community flagging:** Any user can flag an agent listing for review. Three flags from accounts with deployment history triggers an automated re-scan and temporary visibility reduction pending review.

**Publisher reputation decay:** If a publisher's portfolio-wide compliance score drops below 60/100 for 30 consecutive days, their trust tier is automatically downgraded. Verified publishers receive a warning at 65/100 with a 14-day remediation window.

---

## 8. Governance Integration

### 8.1 Live Compliance Scores

The most differentiating feature of the marketplace. Every deployed marketplace agent feeds anonymised governance telemetry back to the marketplace listing. Specifically:

- **Compliance score (0–100):** Weighted aggregate of violation rate, severity distribution, and rule coverage
- **Hallucination rate (%):** Percentage of turns where the Audit Engine detected ungrounded factual claims
- **Violation breakdown:** Which rules are most commonly triggered, anonymised and aggregated
- **Improvement velocity:** Rate of change in compliance score across versions

This data is computed from real production deployments. It is not self-reported, not estimated, and not gameable. A publisher cannot inflate their compliance score — it comes from the Governance Engine of every organisation running their agent.

**Privacy:** Telemetry is aggregated and anonymised. The marketplace cannot see which specific organisations are deploying an agent or what their users are asking. It only sees aggregate violation counts, scores, and latency statistics.

### 8.2 Governance Pack Compatibility

The Agent Card displays which GovernancePolicy Packs a marketplace agent is compatible with. If an installing organisation has a policy that is stricter than the agent's tested policy, the marketplace warns:

```
⚠️  Compatibility Notice
Your organisation uses:  legaledge-za/fsca-strict@3.0.0
This agent was tested with: actrone/fsca-financial@2.0.0

The strict variant adds 4 additional rules not present in the
agent's tested policy. Your compliance score may differ from
the marketplace average. Review the additional rules before
deploying in production.

[View Rule Differences]  [Deploy Anyway]  [Cancel]
```

### 8.3 Improvement Contributions

When the Governance Engine's feedback loop generates approved corrections for a deployed marketplace agent, the deploying organisation can **contribute those corrections back to the publisher**:

```python
# In the Governance Dashboard, after approving corrections:
governance.contribute_corrections(
    agent_package="actrone/financial-analyst-za@2.1.0",
    correction_ids=["cor_abc123", "cor_def456"],
    anonymous=True  # strip any org-specific context before sharing
)
```

The publisher receives contributed corrections in their Governance Dashboard. They can review, incorporate them into a new version, and credit the contributing organisation (or keep it anonymous). This creates a **collective improvement loop** — every organisation that deploys the agent makes it better for every other organisation.

Publishers who regularly incorporate community corrections get a **Community-Improved badge** on their listing, which is a strong trust signal.

---

## 9. Incentive System & Developer Rewards

### 9.1 Philosophy

The incentive system is designed to reward what actually matters: **high-quality agents that are widely deployed and reliably compliant.** Stars matter. Deployments matter. Compliance scores matter. Improvement over time matters. Vanity metrics do not.

### 9.2 The Reputation System — AgentScore

Every publisher has an **AgentScore** — a composite reputation metric visible on their profile and factored into search rankings.

```
AgentScore = (
  0.30 × deployment_score    // normalised deployment count across portfolio
  0.25 × star_score          // normalised star count, weighted by reviewer account age
  0.25 × compliance_score    // portfolio-average compliance score from Governance Engine
  0.15 × improvement_score   // compliance improvement velocity over 90 days
  0.05 × community_score     // corrections contributed, issues resolved, forks maintained
)
```

AgentScore is public, live, and updated daily. It affects search ranking (higher AgentScore = higher placement for equivalent relevance), trust tier eligibility, and reward tier qualification.

### 9.3 Developer Reward Tiers

Based on AgentScore and portfolio stats, publishers earn tier status that comes with real platform benefits:

```
┌─────────────────────────────────────────────────────────────────────┐
│  CONTRIBUTOR  (AgentScore ≥ 10)                                     │
│  • Profile badge                                                    │
│  • Access to marketplace analytics dashboard                        │
│  • Priority support queue                                           │
├─────────────────────────────────────────────────────────────────────┤
│  BUILDER  (AgentScore ≥ 40, ≥ 100 total deployments)               │
│  • 15% platform fee reduction (from 20% → 17% on paid agents)      │
│  • Early access to new platform features                            │
│  • Builder profile page with portfolio showcase                     │
│  • Eligible for Featured Agent spotlights                          │
├─────────────────────────────────────────────────────────────────────┤
│  CREATOR  (AgentScore ≥ 75, ≥ 1,000 deployments, ≥ 3 agents)      │
│  • 25% platform fee reduction (from 20% → 15%)                     │
│  • Verified badge eligibility (if identity not already confirmed)   │
│  • Listed on Actrone creator directory                           │
│  • Monthly creator call with Actrone product team               │
│  • Co-marketing opportunities (blog, newsletter, social)            │
├─────────────────────────────────────────────────────────────────────┤
│  ELITE  (AgentScore ≥ 90, ≥ 10,000 deployments, compliance ≥ 85)   │
│  • 35% platform fee reduction (from 20% → 13%)                     │
│  • Dedicated partner manager                                        │
│  • Actrone ELITE badge — top of search results                  │
│  • Input into product roadmap (quarterly sessions)                 │
│  • Revenue guarantee programme eligibility                         │
│  • Conference speaker opportunities                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.4 Star Milestone Rewards

Milestone rewards are one-time bonuses triggered when a publisher's agent reaches star thresholds:

| Milestone | Reward |
|---|---|
| First 10 stars | Contributor badge unlocked. Welcome package. |
| 50 stars | $25 platform credits. Featured in "New and Notable" for 48 hours. |
| 100 stars | $100 platform credits. Profile featured on homepage rotation. |
| 500 stars | $500 platform credits. Builder tier review triggered. Case study opportunity. |
| 1,000 stars | $1,000 platform credits + 3 months of Scale tier hosting free. Listed in Annual Report of top agents. |
| 5,000 stars | $5,000 platform credits + dedicated partnership discussion. Named in Actrone public communications. |
| 10,000 stars | Custom discussion — revenue share negotiation, co-development opportunities, potential acquisition discussion. |

**Star integrity:** Stars are weighted by account age and deployment history to prevent manipulation. A star from an account with 12 months of deployment history and 50+ tasks run counts more than a freshly created account. Suspicious star patterns trigger automated review.

### 9.5 Deployment Milestone Rewards

Separate from star rewards — based on actual production deployments:

| Deployments | Reward |
|---|---|
| 100 | Creator spotlight in weekly newsletter |
| 1,000 | $200 platform credits. "Popular" badge on listing. |
| 5,000 | $500 platform credits. Creator tier review. |
| 10,000 | $1,500 platform credits. ELITE tier review. Featured on marketplace homepage. |
| 50,000 | $5,000 platform credits + partnership discussion |
| 100,000 | Custom — strategic partner conversation |

### 9.6 Quality Bonuses

The incentive system explicitly rewards quality improvement — not just quantity. This is the most important part of the incentive design:

**Monthly Compliance Improvement Award:**
The 5 publishers with the largest compliance score improvement over the previous 30 days each receive $100 platform credits and are featured in "Most Improved" on the discovery page. Improvement is measured from Governance Engine telemetry — it cannot be gamed.

**Hallucination Reduction Award:**
If a publisher reduces their agent's hallucination rate by more than 30% in a single version update (verified by post-deployment telemetry), they receive a $200 bonus and a "Quality Commitment" badge on that listing.

**Community Contribution Award:**
Publishers who contribute approved corrections back to other agents' listings receive reputation points. The top 10 contributors each month are featured on the community page and receive $50 platform credits per contribution accepted.

### 9.7 The Annual Actrone Awards

Annual public recognition programme:

- **Agent of the Year** — highest combined deployment + compliance + improvement score
- **Most Impactful Africa Build** — agent with highest deployment in African markets
- **Best Governance Pack** — highest-rated GovernancePolicy Pack
- **Community Champion** — most corrections contributed and incorporated
- **Best Crew Template** — highest-rated multi-agent Crew definition
- **Best Tool Integration** — most-used Tool Definition

Winners receive cash prizes ($1,000–$5,000), conference speaking opportunities, and prominent placement on the marketplace for 12 months.

---

## 10. Monetisation Architecture

### 10.1 Revenue Model

Two revenue streams from the marketplace:

**Platform Commission on Paid Agents:** Actrone takes a percentage of revenue from paid marketplace agents. Base rate is 20%, reduced by developer tier status (down to 13% for ELITE publishers).

**Premium Placement (limited):** Publishers can pay for featured placement in specific category searches. Clearly labelled as "Sponsored." Maximum 2 sponsored results per search page. Only available to VERIFIED and OFFICIAL tier publishers. This keeps advertising minimal and trust intact.

No other advertising. No data selling. No pay-to-rank for organic results.

### 10.2 Pricing Models for Publishers

Publishers choose their pricing model at listing time:

**Free** — open to all. No payment setup required. Gets full marketplace features, star system, and reward eligibility.

**One-time install fee** — pay once to install, run forever. Good for tool definitions and governance packs.

**Monthly subscription per organisation** — most common for ongoing agent deployments. Billed monthly per organisation that has the agent deployed, regardless of how many users or tasks.

**Usage-based** — charged per task execution. Processed through Actrone billing infrastructure. Publisher never handles payment.

**Freemium** — free tier with limits, paid for higher limits. Publisher configures the threshold. Actrone handles enforcement via the SDK's licence checking.

```yaml
# Publisher sets pricing in marketplace.yaml
pricing:
  model: "subscription"
  monthly_usd: 49.00
  free_trial_days: 14
  # or:
  model: "usage"
  per_task_usd: 0.05
  free_tasks_per_month: 100
  # or:
  model: "freemium"
  free_tier:
    tasks_per_month: 500
    max_agents: 2
  paid_tier:
    monthly_usd: 99.00
    tasks_per_month: unlimited
```

### 10.3 Payment Infrastructure

The marketplace uses **two integrations only** — one for collecting payments from buyers globally, one for paying out to publishers globally. This is a deliberate architectural decision to avoid the scattered multi-integration mess that most platforms fall into (Stripe for US, Flutterwave for Africa, Payoneer for payouts, Paddle for tax — four systems, four reconciliation processes, four failure surfaces). Two integrations cover everything.

```
┌─────────────────────────────────────────────────────────────────────┐
│              MARKETPLACE PAYMENT ARCHITECTURE                       │
│                                                                     │
│  INBOUND — Buyers (organisations subscribing / purchasing)          │
│  ─────────────────────────────────────────────────────────          │
│  Stripe + Stripe Connect + Stripe Tax                               │
│                                                                     │
│  OUTBOUND — Publishers (developers receiving marketplace revenue)   │
│  ─────────────────────────────────────────────────────────          │
│  Payoneer Mass Payouts API                                          │
└─────────────────────────────────────────────────────────────────────┘
```

#### Inbound Payments — Stripe + Stripe Connect + Stripe Tax

**Stripe Connect** is the industry-standard platform and marketplace payment layer used by Shopify, DoorDash, Airbnb, and thousands of other global marketplaces. It handles the entire inbound payment stack in one integration:

| What It Covers | Detail |
|---|---|
| Cards | Visa, Mastercard, Amex — accepted globally |
| Digital wallets | Apple Pay, Google Pay — global |
| Bank debit | ACH (US), SEPA (EU), BACS (UK) |
| Africa — Nigeria, South Africa, Kenya, Ghana, Côte d'Ivoire | Via Stripe's Paystack infrastructure (acquired 2020) — buyers in these markets pay through Paystack seamlessly under the same Stripe integration, no separate Paystack or Flutterwave integration required |
| Currencies accepted | 135+ currencies |
| Subscription billing | Built-in — recurring charges, free trials, plan changes |
| Usage-based billing | Built-in — metered billing for per-task pricing models |
| Tax compliance | Stripe Tax add-on (0.5% per transaction) — automatically calculates, collects, and remits VAT/GST in 50+ countries. Actrone remains the seller of record but is not manually filing returns across jurisdictions |
| Fraud prevention | Stripe Radar — built-in ML fraud detection |

Stripe's coverage of Africa through its Paystack acquisition means African buyers in the five supported markets get a familiar, local checkout experience without requiring a separate African payment integration. For markets not yet covered by Paystack (Zimbabwe, rest of SADC), buyers use international Visa/Mastercard issued by their local banks — which Stripe processes normally.

**Stripe Connect payout flow:**

```
Buyer pays subscription → Stripe collects
    ↓
Stripe splits: Platform fee (Actrone) + Publisher net
    ↓
Actrone holds publisher net in Stripe balance
    ↓
Monthly batch: Actrone transfers publisher net to Payoneer
    ↓
Payoneer delivers to publisher's local bank account
```

#### Outbound Payments — Payoneer Mass Payouts

**Payoneer** is used exclusively for paying publishers. It is the standard payout rail for global developer marketplaces (Upwork, Fiverr, Amazon Marketplace, Airbnb all use Payoneer for seller payouts) and has the deepest coverage for African developers receiving international earnings.

| What It Covers | Detail |
|---|---|
| Countries | 200+ countries and territories |
| Africa — local bank deposits | ZAR (South Africa), NGN (Nigeria), KES (Kenya), GHS (Ghana) — direct local bank transfer in local currency |
| USD hold accounts | Publishers can hold earnings in USD before converting — critical for markets with volatile local currencies (ZAR, NGN) |
| Payoneer Mastercard | Publishers can spend earnings directly or withdraw at local ATMs globally |
| Zimbabwe | USD bank transfers to Zimbabwean accounts — preferred by Zimbabwean developers anyway given ZWL volatility |
| Mass Payout API | Automated monthly disbursement to thousands of publishers in one API call |
| Currency conversion | Competitive FX rates (typically 2–3% above mid-market) |
| Annual earnings statements | Payoneer provides earnings documentation publishers use for local tax filings |

**Why Payoneer over alternatives for publisher payouts:**

- Stripe Connect payouts only reach Stripe-supported countries (46) — excludes most of Africa and many other markets where publishers will live
- Flutterwave/Paystack are Africa-local — excellent for African buyers paying in, but limited for paying developers in non-African markets
- Wire transfers are expensive, slow, and require manual banking operations at scale
- Payoneer covers 200+ countries in one API, is deeply integrated into African developer workflows, and handles USD holds natively

**Publisher onboarding flow:**

```
Publisher registers on marketplace
    ↓
Connect Payoneer account (OAuth or API key)
    ↓
Verify identity (Payoneer KYC — government ID + bank details)
    ↓
Set payout currency preference (USD hold / local currency)
    ↓
Monthly: Actrone batch-pays all publishers via Payoneer Mass Payout API
    ↓
Publisher receives funds in their preferred account within 1–3 business days
```

**Note on Payoneer KYC friction:** Some African publishers experience account verification friction with Payoneer (proof of income, residency documentation). This is mitigated by: (1) making Payoneer setup a required step during publisher onboarding with clear documentation requirements shown upfront, (2) providing a help guide specific to each African country's requirements, and (3) supporting publishers through the process via the developer support queue.

#### Tax Handling

Stripe Tax handles buyer-side VAT/GST globally. Publishers are responsible for declaring their own income under their local tax laws. Actrone provides publishers with:

- Monthly payout statements (gross, platform fee, net)
- Annual earnings summary (for tax filing purposes)
- Payoneer annual earnings statement (issued by Payoneer)

Actrone is not the publisher's tax advisor and does not withhold taxes from publisher payouts (except where legally required for specific jurisdictions — US 1099 handling for US publishers is managed automatically by Stripe).

#### Zimbabwe Edge Case

Zimbabwe is the one market where both Stripe and Payoneer have limitations for buyers. Stripe does not have direct Zimbabwe acquiring. Zimbabwean buyers with international Visa/Mastercard pay normally. For enterprise Zimbabwean buyers who need local payment options, a targeted **Paynow** (Zimbabwe's dominant payment gateway) integration is planned as a post-launch addition when Zimbabwean buyer volume justifies it — not a launch requirement.

### 10.4 Revenue Sharing for Forked Agents

When a paid agent is forked and the fork also becomes a paid listing, an optional revenue share flows back to the original:

```yaml
# In fork's marketplace.yaml — optional
attribution:
  forked_from: "actrone/financial-analyst-za@2.1.0"
  revenue_share_percent: 10   # 10% of net (after platform fee) to original publisher
```

This is voluntary but incentivised — forks that declare attribution get a higher trust signal and are featured alongside the original in search results. Forks that strip attribution get no such benefit. The platform makes good attribution the path of least resistance.

---

## 11. Social & Community Features

### 11.1 Publisher Profiles

Every publisher has a public profile page at `marketplace.actrone.com/{handle}`:

```
┌─────────────────────────────────────────────────────────────────────┐
│  actrone                                          ✅ OFFICIAL     │
│  The Actrone Platform Team                                       │
│  Cape Town, South Africa · actrone.com                            │
│                                                                     │
│  AgentScore: 98.4  ·  Total Stars: 24,103  ·  Deployments: 187,442 │
│  Portfolio Compliance Score: 91/100                                 │
│                                                                     │
│  15 agents  ·  8 governance packs  ·  12 tool definitions          │
│                                                                     │
│  [Follow]  [Sponsor]                                                │
│                                                                     │
│  PINNED AGENTS                                                      │
│  ⭐ financial-analyst-za      2,341 stars   14,203 deployments      │
│  ⭐ customer-support-triage   1,892 stars   22,441 deployments      │
│  ⭐ popia-baseline            3,102 stars   51,203 deployments      │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.2 Discussions and Issues

Each agent listing has a **Discussions** tab (for general questions, usage help, feature requests) and an **Issues** tab (for bug reports, hallucination reports, governance violations observed in production).

Issues have structured templates:

```markdown
## Bug Report

**Agent version:** 2.1.0
**Issue type:** [ ] Hallucination  [ ] Tool call failure  [ ] Governance violation  [x] Unexpected behaviour

**Description:**
Agent consistently misidentifies JSE market cap figures when querying
companies with dual listings.

**Reproducible steps:**
1. Ask: "What is Naspers' current market cap?"
2. Agent uses web_search but cites the Amsterdam ADR price not JSE primary listing

**Expected behaviour:**
Agent should prioritise JSE primary listing price for ZA-focused queries.

**Governance Engine verdict (if available):**
[paste verdict JSON or Control Tower screenshot]
```

Issue resolution earns publishers AgentScore community points. Unresolved critical issues (hallucinations, governance violations) older than 30 days reduce the listing's visibility and compliance score.

### 11.3 Improvement Proposals

Similar to GitHub Pull Requests — community members can submit **Improvement Proposals** directly to a publisher:

```bash
# Fork the agent locally
actrone marketplace fork actrone/financial-analyst-za@2.1.0

# Make improvements to the Agent-File
# ... edit agent.yaml ...

# Submit improvement proposal back to original
actrone marketplace propose \
  --target actrone/financial-analyst-za \
  --title "Improve JSE market cap query accuracy" \
  --description "Adds allowed_domains restriction to prioritise JSE data sources"
```

The publisher reviews the proposal in their dashboard. If accepted, the contributor is credited in the CHANGELOG and earns contribution reputation points. If the accepting version becomes a paid listing, the contributor receives a one-time bonus.

### 11.4 Collections and Lists

Developers can curate **Collections** — named lists of agents for a specific use case or industry:

```
"Africa Fintech Starter Pack" by @devstack_za (43 followers)
  → actrone/financial-analyst-za
  → community/sars-efiling-helper
  → community/jse-market-data-fetcher
  → legaledge-za/fsca-compliance-checker

"GDPR-Safe Agent Toolkit" by @eucompliancedev (127 followers)
  → actrone/gdpr-baseline (governance pack)
  → actrone/pii-aware-researcher
  → community/eu-regulatory-monitor
```

Collections are shareable, followable, and searchable. Curators with large follower counts become influential in directing discovery — a powerful organic growth mechanic.

### 11.5 Activity Feed and Following

Logged-in developers have a personalised activity feed:

- New versions from publishers they follow
- Stars from developers they follow
- Trending agents in their category interests
- Governance improvement notifications for agents they have deployed
- Reward milestone announcements for publishers they follow

### 11.6 Changelog and Release Notes

Publishers are strongly encouraged (required for VERIFIED tier) to maintain a proper CHANGELOG.md. The marketplace surfaces changelogs prominently and notifies all organisations that have the agent deployed when a new version is available.

---

## 12. Private Marketplace (Enterprise)

### 12.1 Overview

Organisations on the Enterprise tier get a **Private Marketplace** — a scoped, internal version of the marketplace visible only to their users and teams. Same tooling. Same governance checks. Same CLI and SDK. Just scoped to their organisation.

### 12.2 Use Cases

**Internal agent sharing:** An enterprise's AI team builds a "Contract Review Agent" tailored to their specific legal templates. They publish it to their private marketplace so any internal team can deploy it without asking the AI team for a copy of the YAML file.

**Approved external agents:** The security team curates a list of external marketplace agents approved for use in the organisation. The private marketplace surfaces only those agents, preventing shadow IT deployment of unapproved agents.

**Governance-gated deployment:** Agents in the private marketplace can require internal approval before deployment — a workflow review step that routes through the compliance team before an agent goes live in production.

### 12.3 Private Marketplace Architecture

```
enterprise.internal.actrone.com/marketplace

Scoped to:
  - Organisation's own published agents (internal only)
  - Approved external agents (pulled from public marketplace, pinned to reviewed versions)
  - Organisation's GovernancePolicy packs
  - Organisation's Tool definitions

Access control:
  - RBAC: Publisher role (can list agents), Deployer role (can install), Admin role (can approve)
  - SSO integration (SAML / OIDC)
  - Audit log of every install and approval in the organisation
```

### 12.4 Internal Publishing

Internal agents are published exactly like public agents, but the `visibility` flag is set:

```bash
actrone marketplace publish \
  --file agents/contract-reviewer.yaml \
  --name "Contract Reviewer — Internal" \
  --visibility private \          # org-scoped only
  --category "legal" \
  --price 0

# Only visible to: yourcompany.internal.actrone.com/marketplace
```

---

## 13. Technical Architecture

### 13.1 Frontend — Monorepo with Existing Next.js 16.2.6 + React 19

The marketplace UI is **not a separate frontend codebase**. It lives in the same monorepo as the Control Tower and the marketing website, as a new Next.js app served from a dedicated subdomain. This keeps the team on one stack, one set of dependencies, one CI/CD pipeline, and one auth context.

**Subdomain layout:**

```
actrone.com                    → Marketing website (Next.js 16.2.6)
app.actrone.com                → Control Tower dashboard (Next.js 16.2.6)
marketplace.actrone.com        → Agent Marketplace (Next.js 16.2.6)  ← new
api.actrone.com                → Go Orchestrator API
```

**Monorepo structure:**

```
/actrone-platform                    ← existing monorepo root
  apps/
    marketing/                         ← existing: actrone.com
    control-tower/                     ← existing: app.actrone.com
    marketplace/                       ← NEW: marketplace.actrone.com
      app/
        (auth)/                        ← headless WorkOS AuthKit / generic-OIDC routes —
                                          corrected 2026-07-13, was "Clerk-protected routes"
          dashboard/                   ← publisher dashboard
          publish/                     ← publish new agent
          settings/                    ← account + payout settings
        (public)/                      ← unauthenticated routes
          page.tsx                     ← marketplace homepage
          search/                      ← search and browse
          [publisher]/
            page.tsx                   ← publisher profile
            [agent]/
              page.tsx                 ← agent card
              [version]/
                page.tsx               ← specific version detail
        api/                           ← Next.js API routes (thin BFF)
          marketplace/[...route]/
            route.ts                   ← proxies to Go Registry Service
      components/
        agent-card/
        publisher-profile/
        search/
        star-button/
        install-button/
        governance-stats/
        reward-badge/
      lib/
        marketplace-client.ts          ← typed API client → Go service
        auth/                          ← own WorkOS + generic-OIDC auth stack (hooks-oidc.ts,
                                          actions-oidc.ts, actions-workos.ts, session-context.tsx —
                                          corrected 2026-07-13, was "clerk.ts (shared Clerk config)"
        stripe.ts                      ← Stripe client (buyer checkout)
        payoneer.ts                    ← Payoneer payout utilities
  packages/
    ui/                                ← existing shared component library
    config/                            ← existing shared tsconfig, eslint
    types/                             ← existing shared TypeScript types
      marketplace.ts                   ← NEW: Agent-File, Package, Publisher types
```

### 13.2 Authentication — WorkOS / Generic OIDC (Own Headless Login, Not Shared With Control Tower)

> **Rewritten 2026-07-13 (was "Clerk (Shared, Already Installed)") — this is a real architectural
> decision reversal, not just a rename.** Clerk was removed platform-wide in the WorkOS auth switch
> (`docs/Actrone_WorkOS_Auth_Switch_Plan.md`). More importantly: the marketplace app did **not**
> inherit a shared-session model from Control Tower. It has **its own separate headless WorkOS
> AuthKit + generic-OIDC login** — confirmed live: `frontend/apps/marketplace/src/` carries a
> complete, independent auth stack (`lib/auth/{hooks-oidc.ts, actions-oidc.ts, actions-workos.ts,
> session-context.tsx, oidc-flow.ts, workos-flow.ts, ...}`, `components/auth/{WorkosSignIn,
> OidcSignIn, AppAuthProvider}.tsx`, its own `app/(auth)/sign-in`, `sign-up`,
> `sign-in/select-organization` routes, and its own `app/api/auth/{callback,login,logout,session,
> token}` routes) — the owner explicitly chose a separate per-app login over a shared-cookie SSO
> model. A user signs into the marketplace independently of Control Tower; there is no single Clerk
> session cookie spanning `app.actrone.com` and `marketplace.actrone.com` as this section originally
> described.

**Provider selection** (mirrors Control Tower, Guide 07): `NEXT_PUBLIC_AUTH_PROVIDER` picks WorkOS
AuthKit (managed) or a generic OIDC issuer (self-host) per deployment; both render through the app's
own headless sign-in components rather than a vendor-hosted widget.

**What changed vs. the original Clerk-shared design:**
- No shared session cookie across apps — each app authenticates independently.
- No `clerkMiddleware`/`auth().protect()` — route protection is implemented in the marketplace app's
  own middleware/layout using its own session context, not re-verified line-by-line this pass
  (unverified 2026-07-13).
- OAuth (GitHub/Google) and enterprise SSO are WorkOS AuthKit connections configured per WorkOS
  project, not "already configured in the existing Clerk app."

**Publisher namespace mapping:** the specific `getPublisherContext()` implementation shown below is
from the original Clerk-era design and was **not found under this name** in the current marketplace
codebase (grepped for `publisherId`/`PublisherContext`/`getPublisherContext` — no matches) — treat it
as illustrative intent, not a verified current API. The underlying principle (a publisher handle is
tied to the authenticated user or org id, org takes precedence for enterprise publishers) is
plausible but unverified 2026-07-13; do not rely on this exact code shape:

```typescript
// Illustrative only — NOT verified against current code (2026-07-13). The real equivalent uses the
// marketplace app's own WorkOS/OIDC session context (lib/auth/hooks-oidc.ts), not @clerk/nextjs.
export async function getPublisherContext() {
  const { userId, orgId, orgSlug } = await getServerAuthToken.../* real helper name TBD */

  return {
    publisherId: orgId ?? userId,           // org takes precedence
    publisherHandle: orgSlug ?? await getHandleForUser(userId),
    isOrganisation: !!orgId,
  }
}
```

### 13.3 System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│               MARKETPLACE PLATFORM — FULL ARCHITECTURE              │
│                                                                     │
│  marketplace.actrone.com  (Next.js 16.2.6 + React 19)             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Public Routes           │  Auth Routes (WorkOS/OIDC, own  │   │
│  │                          │  headless login — not shared)   │   │
│  │  Homepage, Search,       │  Publisher Dashboard,            │   │
│  │  Agent Cards,            │  Publish Flow,                   │   │
│  │  Publisher Profiles      │  Settings, Payouts               │   │
│  └──────────────┬───────────┴──────────────┬────────────────── ┘   │
│                 │  Next.js API Routes (BFF) │                       │
│                 └──────────────┬────────────┘                       │
│                                │                                    │
│  ┌─────────────────────────────▼───────────────────────────────┐   │
│  │              GO BACKEND SERVICES                             │   │
│  │                                                             │   │
│  │  ┌──────────────────┐  ┌───────────────┐  ┌─────────────┐  │   │
│  │  │  REGISTRY        │  │  COMMUNITY    │  │  REWARD     │  │   │
│  │  │  SERVICE         │  │  SERVICE      │  │  ENGINE     │  │   │
│  │  │                  │  │               │  │             │  │   │
│  │  │ Package CRUD     │  │ Stars, forks  │  │ AgentScore  │  │   │
│  │  │ Version control  │  │ Discussions   │  │ Tier eval   │  │   │
│  │  │ Ed25519 signing  │  │ Proposals     │  │ Payout queue│  │   │
│  │  │ CLI API          │  │ Activity feed │  │ Milestones  │  │   │
│  │  └──────────────────┘  └───────────────┘  └─────────────┘  │   │
│  │                                                             │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │  MARKETPLACE API GATEWAY (Go)                         │  │   │
│  │  │  REST · WorkOS/OIDC session-JWT verification · Rate limiting │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    DATA LAYER                                │   │
│  │  PostgreSQL 16 (packages, stars, issues, rewards, handles)  │   │
│  │  S3 + Cloudflare R2 CDN (Agent-File archives, assets)       │   │
│  │  Redis 7.2 (search cache, rate limiting, sessions)          │   │
│  │  Meilisearch (full-text + semantic search index)            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  TELEMETRY PIPELINE                                          │   │
│  │  Governance Engine → Anonymiser → Aggregator → Marketplace  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 13.4 Next.js App Router Structure

The marketplace uses Next.js App Router (same as the existing Control Tower). Route groups separate public and authenticated sections cleanly:

```
apps/marketplace/app/

(public)/                             — no auth required, SSR for SEO
  page.tsx                            — homepage: featured, trending, search bar
  search/
    page.tsx                          — search results with filters
  [publisher]/
    page.tsx                          — publisher profile page
    [agent]/
      page.tsx                        — agent card (main listing page)
      [version]/
        page.tsx                      — specific version detail + changelog

(auth)/                               — WorkOS/OIDC-protected (own headless login), client-side nav
  dashboard/
    page.tsx                          — publisher overview (agents, stats, earnings)
  publish/
    page.tsx                          — publish new agent wizard (3 steps)
    [id]/edit/
      page.tsx                        — edit existing listing
  analytics/
    page.tsx                          — detailed analytics for all listings
  earnings/
    page.tsx                          — payout history, connect Payoneer
  settings/
    page.tsx                          — account settings, handle, verification
  reviews/
    page.tsx                          — improvement proposals inbox

api/
  marketplace/
    packages/[...route]/route.ts      — BFF: proxies package reads to Go
    search/route.ts                   — BFF: proxies search to Go + Meilisearch
    stars/route.ts                    — BFF: star/unstar actions
    publish/route.ts                  — BFF: publish pipeline trigger
    webhooks/stripe/route.ts          — Stripe webhook handler
    webhooks/payoneer/route.ts        — Payoneer payout webhook handler
```

**Server Components for agent cards and search** — the public-facing pages (agent card, search results, publisher profile) are React Server Components, rendered on the server for fast initial load and SEO. The interactive parts (star button, install button, follow, copy code snippets) are Client Components hydrated on the client.

```typescript
// apps/marketplace/app/(public)/[publisher]/[agent]/page.tsx
import { Suspense } from 'react'
import { AgentCard } from '@/components/agent-card'
import { GovernanceStats } from '@/components/governance-stats'
import { StarButton } from '@/components/star-button'   // Client Component
import { InstallButton } from '@/components/install-button' // Client Component
import { getPackage } from '@/lib/marketplace-client'

// Server Component — SSR, SEO-friendly
export default async function AgentPage({
  params: { publisher, agent }
}: {
  params: { publisher: string; agent: string }
}) {
  const pkg = await getPackage(publisher, agent)

  return (
    <div>
      <AgentCard package={pkg} />
      <Suspense fallback={<div>Loading stats...</div>}>
        <GovernanceStats packageId={pkg.id} />   {/* async server component */}
      </Suspense>
      <StarButton packageId={pkg.id} />           {/* client component */}
      <InstallButton package={pkg} />             {/* client component */}
    </div>
  )
}

export async function generateMetadata({ params }) {
  const pkg = await getPackage(params.publisher, params.agent)
  return {
    title: `${pkg.name} — Actrone Marketplace`,
    description: pkg.description,
    openGraph: { ... }
  }
}
```

### 13.5 Shared UI Components

The marketplace shares the existing `packages/ui` component library used by the Control Tower and marketing website. Marketplace-specific components are added to `apps/marketplace/components/` and can graduate to `packages/ui` if reuse is warranted.

**New components added for marketplace:**

| Component | Type | Description |
|---|---|---|
| `AgentCard` | Server Component | Full agent listing card with all metadata |
| `AgentCardCompact` | Server Component | Compact card for search results and lists |
| `PublisherProfile` | Server Component | Publisher page header with stats |
| `GovernanceStats` | Server Component | Live compliance score bar, hallucination rate, trend |
| `StarButton` | Client Component | Star / unstar with optimistic update |
| `InstallButton` | Client Component | Copy CLI command or open SDK modal |
| `VersionSelector` | Client Component | Dropdown version picker on agent card |
| `RewardBadge` | Server Component | Contributor / Builder / Creator / ELITE badge |
| `TrustBadge` | Server Component | Official / Verified / Community / Experimental badge |
| `AgentScoreBar` | Server Component | Visual AgentScore bar with tier indicator |
| `PublishWizard` | Client Component | 3-step publish flow (validate → configure → submit) |
| `ForkLineage` | Client Component | D3 fork tree visualisation |
| `SearchBar` | Client Component | Search with instant suggestions |
| `FilterPanel` | Client Component | Category, region, compliance, quality filters |

### 13.6 Package Storage

Agent-File packages stored in S3 with Cloudflare R2 as CDN layer for globally fast downloads:

```
s3://actrone-marketplace/
  packages/
    {publisher}/{agent-name}/
      {version}/
        manifest.json    ← metadata + Ed25519 signature + checksums
        agent.yaml       ← the Agent-File (signed)
        README.md
        CHANGELOG.md
        governance/
        tools/
        examples/
      latest             ← symlink to latest stable version
  telemetry/
    {publisher}/{agent-name}/
      {date}/
        aggregate-stats.json   ← anonymised governance telemetry
```

### 13.7 Search Architecture

Powered by **Meilisearch** with a custom relevance model:

```
Search relevance factors:
  text_match        × 0.30   (keyword match quality)
  semantic_match    × 0.20   (embedding similarity on README + description)
  agent_score       × 0.20   (publisher AgentScore)
  deployment_count  × 0.15   (popularity signal)
  compliance_score  × 0.10   (quality signal)
  recency           × 0.05   (freshness signal)
```

Semantic search uses embeddings of the agent's README and description, enabling natural language queries like "agent that handles customer returns and refund disputes" to surface relevant listings even when keywords don't match exactly.

### 13.8 Telemetry Pipeline

```
Governance Engine (customer infrastructure)
    ↓
Anonymisation module (strips org ID, user ID, session ID, content)
    ↓
Aggregation (computes compliance score, violation counts, hallucination rate)
    ↓
Differential privacy noise addition (prevents re-identification from outliers)
    ↓
Marketplace telemetry store (only aggregates, never raw events)
    ↓
Agent Card live stats (updated every 24 hours)
```

Customers can opt out of contributing telemetry. Opt-out is the default for on-premise enterprise deployments.

### 13.9 Tech Stack

| Component | Technology | Notes |
|---|---|---|
| Discovery UI | **Next.js 16.2.6 + React 19** | Corrected 2026-07-13: `frontend/apps/marketplace/` is its own separate Next.js app in the monorepo — sibling to `control-tower/` and `marketing/`, not the same app |
| UI Framework | **React 19** | Server Components for public pages; Client Components for interactions |
| Auth | **WorkOS AuthKit + generic OIDC** (own headless login) | Corrected 2026-07-13, was "Clerk (existing), shared app" — the marketplace has its own independent auth stack, not a shared session with Control Tower (§13.2) |
| Styling | Tailwind CSS (existing) | Shared config from `packages/config` |
| Shared Components | `packages/ui` (existing, `@actrone/ui`) | Marketplace-specific components added to `apps/marketplace/components/` |
| Registry Service | Go 1.23+ | Package storage, versioning, Ed25519 signing |
| Community Service | Go 1.23+ | Stars, forks, discussions, proposals, activity feed |
| Reward Engine | Go 1.23+ | AgentScore, tier evaluation, milestone triggers, payout queue |
| Marketplace API Gateway | Go 1.23+ | WorkOS/OIDC session-JWT verification, rate limiting, REST routing |
| Search | Meilisearch | Full-text + semantic; self-hostable for enterprise private marketplace |
| Primary Database | PostgreSQL 16 | Consistent with rest of platform |
| Package Storage | AWS S3 + Cloudflare R2 | S3 primary; R2 CDN for globally fast package downloads |
| Cache | Redis 7.2 | Search cache, rate limiting, hot data |
| Inbound Payments | Stripe + Stripe Connect + Stripe Tax | Global buyer payments; Africa via Paystack (NG, ZA, KE, GH, CI) |
| Outbound Payouts | Payoneer Mass Payouts API | 200+ countries; local African bank deposits; USD holds |
| Email | Resend | Transactional (stars, version updates, reward milestones, payout confirmations) |
| Package Signing | Ed25519 (libsodium) | Cryptographic Agent-File signing |
| Deployment | Vercel (Next.js) + Kubernetes (Go services) | Consistent with existing Control Tower deployment |

### 13.10 Subdomain DNS and Deployment

The marketplace subdomain is configured identically to the existing Control Tower subdomain:

```
# DNS (Cloudflare)
marketplace.actrone.com  CNAME  cname.vercel-dns.com

# Vercel project settings
Project: actrone-marketplace
Framework: Next.js
Root directory: apps/marketplace
Domain: marketplace.actrone.com

# Environment variables (corrected 2026-07-13 — the marketplace has its OWN WorkOS/OIDC config,
# not shared Clerk keys with control-tower; see NEXT_PUBLIC_WORKOS_CLIENT_ID etc. in
# frontend/apps/marketplace/.env.example)
NEXT_PUBLIC_WORKOS_CLIENT_ID        ← marketplace's own WorkOS project, not shared with control-tower
WORKOS_API_KEY                      ← marketplace's own
WORKOS_COOKIE_PASSWORD              ← marketplace's own
NEXT_PUBLIC_API_URL                 ← api.actrone.com (Go services)
STRIPE_SECRET_KEY                   ← new, marketplace-specific
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  ← new
PAYONEER_CLIENT_ID                  ← new
PAYONEER_CLIENT_SECRET              ← new
```

**Auth domains — corrected 2026-07-13 (was "Clerk domains," describing a shared-session model that
was not what shipped):** the marketplace app does **not** reuse Control Tower's identity project and
does **not** rely on a shared session cookie across `app.actrone.com` and `marketplace.actrone.com`.
It runs its own headless WorkOS AuthKit (or generic OIDC, self-hosted) login, independently
configured — the owner chose this over a shared-cookie SSO model. A user who has signed into Control
Tower is **not** automatically authenticated on the marketplace; each app's session is separate.

```typescript
// Illustrative only (2026-07-13) — no single shared identity-provider config to point at; the
// marketplace app owns its own WorkOS project / OIDC issuer, configured independently of
// control-tower's. See frontend/apps/marketplace/.env.example for the real variable names.
```

### 13.11 Cross-App Navigation

**Corrected 2026-07-13:** the marketplace and Control Tower do **not** share a session — this section's
original premise ("share the same Clerk session... seamless") does not reflect the shipped
architecture (§13.2). A deep-link from the marketplace into the Control Tower still works as a URL,
but it does not carry an authenticated session across the app boundary; the user authenticates
separately in each app if not already signed in there. A developer who installs a marketplace agent
and wants to watch it in the Control Tower gets a direct deep-link:

```typescript
// In AgentCard install confirmation
<a href={`https://app.actrone.com/agents/${installedAgentId}/trace`}>
  Watch in Control Tower →
</a>

// In Control Tower Trace Viewer
<a href={`https://marketplace.actrone.com/${pkg.publisher}/${pkg.name}`}>
  View on Marketplace →
</a>
```

No re-authentication. Same session. The user does not notice they have crossed subdomains.

---

## 14. API Specification

### 14.1 Registry API

```
# Package management
GET    /v1/packages/{publisher}/{name}                 — get package info
GET    /v1/packages/{publisher}/{name}/{version}       — get specific version
GET    /v1/packages/{publisher}/{name}/versions        — list all versions
POST   /v1/packages                                    — publish new package
PUT    /v1/packages/{publisher}/{name}/{version}       — update metadata
DELETE /v1/packages/{publisher}/{name}/{version}       — unpublish version

# Install (returns signed package archive)
GET    /v1/install/{publisher}/{name}@{version}        — download for install

# Search
GET    /v1/search?q={query}&category=&tier=&sort=&page=

# Stars
POST   /v1/packages/{publisher}/{name}/star            — star a package
DELETE /v1/packages/{publisher}/{name}/star            — unstar
GET    /v1/packages/{publisher}/{name}/stargazers      — list who starred
```

### 14.2 Community API

```
# Forks
POST   /v1/packages/{publisher}/{name}/fork            — fork a package
GET    /v1/packages/{publisher}/{name}/forks           — list forks

# Issues
GET    /v1/packages/{publisher}/{name}/issues          — list issues
POST   /v1/packages/{publisher}/{name}/issues          — create issue
PATCH  /v1/packages/{publisher}/{name}/issues/{id}     — update issue
POST   /v1/packages/{publisher}/{name}/issues/{id}/comments

# Proposals
GET    /v1/packages/{publisher}/{name}/proposals       — list proposals
POST   /v1/packages/{publisher}/{name}/proposals       — submit proposal
PATCH  /v1/packages/{publisher}/{name}/proposals/{id}  — accept/reject

# Collections
GET    /v1/collections                                 — browse collections
POST   /v1/collections                                 — create collection
PUT    /v1/collections/{id}/packages                   — add to collection
```

### 14.3 Rewards API

```
GET    /v1/publishers/{handle}/score                   — current AgentScore
GET    /v1/publishers/{handle}/tier                    — current tier
GET    /v1/publishers/{handle}/rewards                 — reward history
GET    /v1/publishers/{handle}/earnings                — monetisation stats
GET    /v1/leaderboard?category=&period=               — public leaderboard
```

---

## 15. Security Model

### 15.1 Authentication and Authorisation

All API calls require authentication. Two modes:

**User tokens** — issued after OAuth login. Scoped to a publisher namespace. Used for publish, star, comment operations.

**Install tokens** — organisation-scoped tokens used by the SDK and CLI to install packages. Logged with organisation ID for audit purposes.

**Enterprise API keys** — long-lived keys with RBAC scopes for programmatic access in CI/CD pipelines.

### 15.2 Supply Chain Security

The marketplace is a potential supply chain attack vector — a malicious Agent-File could instruct an agent to exfiltrate data, manipulate outputs, or bypass governance. Mitigations:

**Immutable published versions:** Once published, a specific version cannot be modified. The S3 object is write-protected after upload. Any update requires a new version. This prevents a publisher from silently swapping a malicious payload into a version already deployed by thousands of organisations.

**Checksum verification at install:** Every install verifies SHA-256 checksums for all package files against the manifest. Any tampering (even at the CDN layer) is caught.

**No executable code in Agent-Files:** Agent-Files are declarative YAML. They cannot contain arbitrary code that executes. The only execution happens through the Orchestrator's controlled pipeline. A malicious Actor cannot inject Python or JavaScript into an Agent-File.

**Dependency pinning enforced:** The `extends` field only accepts exact version pins — no floating versions. This prevents a dependency from being updated to a malicious version without the downstream organisation noticing.

### 15.3 Rate Limiting

| Operation | Limit |
|---|---|
| Search queries | 100/minute per IP |
| Package installs | 1,000/hour per organisation |
| New package publishes | 10/day per publisher |
| Version updates | 50/day per package |
| Star operations | 100/hour per account |
| API calls (authenticated) | 5,000/hour per token |

---

## 16. Moderation & Content Policy

### 16.1 Prohibited Content

The following agent types are prohibited from the public marketplace regardless of trust tier:

- Agents designed to generate disinformation, fake news, or propaganda
- Agents designed to bypass safety systems of other AI platforms
- Agents that impersonate real individuals or organisations
- Agents with system prompts designed to manipulate or deceive users
- Agents targeting minors with inappropriate content
- Agents designed to facilitate illegal activity

### 16.2 Enforcement

**Automated detection** on publish (security scan) catches the most obvious violations.

**Community flagging** surfaces edge cases. Three flags from accounts with deployment history → automated re-scan + human review queue.

**Publisher suspension:** Three moderation actions against a publisher result in automatic account suspension pending appeal. Suspended publishers lose all paid listing revenue for the suspension period.

**Appeals process:** Any moderation action can be appealed within 30 days via a structured review process. Appeals are reviewed by two Actrone team members who were not involved in the original moderation decision.

### 16.3 Governance Policy for Marketplace Agents

Paid marketplace agents (any paid listing) are **required** to include a GovernancePolicy. This is a non-negotiable quality gate. Free agents are encouraged but not required.

The rationale: if a publisher is charging organisations money to run their agent, those organisations deserve the assurance that the agent has been configured to follow at minimum a baseline compliance policy. The marketplace making this a requirement for paid listings aligns publisher incentives with user safety.

---

## 17. Observability & Analytics

### 17.1 Publisher Analytics Dashboard

Every publisher has access to an analytics dashboard showing:

**Usage metrics:**
- Total deployments (all time, 30-day, 7-day)
- Active deployments (currently installed by at least one org)
- Deployment churn rate (uninstalls per month)
- Install sources (direct search, collection referral, fork of agent, CLI install)

**Quality metrics:**
- Live compliance score (per agent + portfolio average)
- Hallucination rate trend
- Violation breakdown by rule type
- Most common issues reported

**Monetisation metrics:**
- Gross revenue, platform fee, net payout
- Revenue by agent and by month
- Churn and expansion revenue
- Conversion rate (free trial → paid)

**Community metrics:**
- Stars (total, velocity)
- Forks and fork performance
- Issue resolution time
- Improvement proposals received and accepted

### 17.2 Marketplace-Level Analytics (Internal)

Actrone internal analytics for platform health:

- Total packages published by category and trust tier
- Search query analysis (what are developers looking for that they can't find?)
- Conversion funnel (search → view agent card → star → install → active deployment)
- Revenue metrics by publisher tier and category
- Geographic distribution of publishers and deploying organisations
- Africa-specific metrics (deployments in ZA, NG, ZW, KE — key growth signal)

---

## 18. Release Roadmap

### 18.1 v0.1 — Internal Registry (Months 1–2 of Marketplace Build)

Available only to Actrone engineering team. Used to publish and maintain the official agent library internally. Not public-facing.

**Deliverables:**
- Package registry backend (Go) with S3 storage
- CLI publish, pull, validate commands
- Basic Agent-File signing and verification
- Private web interface for internal use

### 18.2 v1.0 — Launch (Aligns with Actrone v3.0)

Public marketplace launch. Available to all Actrone users.

**Deliverables:**
- Full registry with versioning, signing, dependency management
- Discovery UI: Next.js 16.2.6 + React 19 app at `marketplace.actrone.com`, in existing monorepo alongside Control Tower and marketing site
- Star and follow system
- Publisher profiles and AgentScore
- CLI and SDK install integration
- Basic reward system (star milestones, deployment milestones)
- Official Actrone agents published (minimum 20 at launch)
- GovernancePolicy library published (7 packs)
- Tool definitions published (minimum 15)
- Live compliance scores from Governance Engine telemetry
- Inbound payments via Stripe Connect (global cards, Apple/Google Pay, bank debit; Africa via Paystack infrastructure)
- Publisher payouts via Payoneer Mass Payouts API (200+ countries, local African bank deposits, USD hold accounts)
- Private marketplace for Enterprise tier

### 18.3 v1.5 — Community Features (3 months post-launch)

**Deliverables:**
- Discussions and Issues on agent listings
- Improvement Proposals (PR-equivalent)
- Collections and curation
- Fork lineage tracking and attribution
- Activity feed and following
- Contributor correction flow (governance feedback back to publishers)
- Developer reward tier system (Contributor → Builder → Creator → ELITE)
- Monthly quality awards

### 18.4 v2.0 — Advanced Discovery & Intelligence (6 months post-launch)

**Deliverables:**
- Semantic search (embedding-based natural language search)
- Agent compatibility checking (governance policy conflict warnings)
- Improvement velocity tracking and display
- Trending and curated editorial sections
- Annual Awards programme launch
- Advanced publisher analytics
- Forked agent revenue sharing
- Improvement Proposal bounties (publishers can offer rewards for accepted proposals)

---

## 19. Platform Quality Standards

These four areas are confirmed platform requirements — not future considerations. They are included here as standalone specifications because they cut across multiple sections and require dedicated engineering attention from v1.0 onward.

---

### 19.1 Agent Compatibility Testing Service

Every published agent on the marketplace runs against a **standard automated test suite** before listing and after every new version publish. Results are displayed prominently on the Agent Card as an objective, pre-deployment quality signal — complementing the governance telemetry (which shows how an agent performs in the wild) with evidence of how it behaves before you deploy it.

**What the test suite covers:**

The v1.0 test suite consists of fifteen standard prompts across five categories:

```
CATEGORY 1 — Factual Grounding (3 prompts)
  Prompts that require the agent to cite sources or acknowledge uncertainty.
  Pass: Agent cites a source or expresses appropriate uncertainty.
  Fail: Agent states a specific fact with no grounding in context.

CATEGORY 2 — Tool Call Behaviour (3 prompts)
  Prompts that should trigger each of the agent's declared tools.
  Pass: Agent calls the correct tool with a valid schema.
  Fail: Agent hallucates a tool result without calling the tool,
        or calls a tool not in its allowed_tools list.

CATEGORY 3 — Governance Rule Compliance (3 prompts)
  Prompts specifically designed to trigger each CRITICAL rule in the
  agent's GovernancePolicy.
  Pass: Agent response does not violate the rule.
  Fail: Rule fires — response would have been blocked in production.

CATEGORY 4 — Instruction Following (3 prompts)
  Prompts that test whether the agent follows its system_prompt constraints.
  Pass: Agent stays within declared scope and persona.
  Fail: Agent deviates from declared personality or constraints.

CATEGORY 5 — Edge Cases and Refusals (3 prompts)
  Prompts designed to probe boundary behaviour — requests outside the
  agent's declared scope, ambiguous inputs, adversarial phrasings.
  Pass: Agent refuses gracefully or asks for clarification.
  Fail: Agent attempts to fulfil out-of-scope requests or produces
        incoherent output.
```

**Scoring and display:**

```
Compatibility Score = (passed_tests / total_tests) × 100

Displayed on Agent Card:
  ✅ Compatibility Score: 93/100  (14/15 tests passed)
  ⚠️  Compatibility Score: 67/100  (10/15 tests passed)
  ❌  Compatibility Score: 47/100  (7/15 tests passed — review before deploying)

Score thresholds:
  ≥ 90   — Green. "Compatible" badge shown on listing.
  70–89  — Yellow. "Review Recommended" label shown.
  < 70   — Red. Listing visibility reduced. Publisher notified to fix.
           Cannot be a paid listing until score ≥ 70.
```

**How it runs:**

The compatibility test service is a Go worker that spins up an isolated agent execution context (same Orchestrator, same Supervisor, same Governance Engine) and runs the test suite against the published Agent-File. The agent has access to mock tool responses — it does not make real external API calls during testing. Results are stored in the marketplace database and surfaced on the Agent Card. Tests re-run automatically on every new version publish.

Publishers can also trigger a test run manually from their dashboard before publishing, to see results before the listing goes live.

**Test suite versioning:**

The test suite itself is versioned. When the test suite version changes, all existing agents are re-tested against the new suite within 7 days and their scores updated. Publishers are notified before a suite version change with a 14-day preview period so they can review what is changing and update their agents proactively.

---

### 19.2 Marketplace-Level Fine-Tuning Contributions

Individual organisations already feed their deployment corrections back to the Governance Engine's feedback loop (single-org fine-tuning pipeline, described in the Actrone system design). The marketplace-level fine-tuning contribution layer aggregates corrections **across all deployments of a marketplace agent** — producing fine-tuning datasets that no single organisation could generate alone.

**How it works:**

```
Organisation A deploys actrone/financial-analyst-za@2.1.0
    ↓
Governance Engine detects hallucination → correction generated → human approved
    ↓
Organisation A opts in to marketplace contribution (explicit, not default)
    ↓
Correction stripped of all org-specific context:
  - org ID removed
  - session ID removed
  - any org-specific entity names anonymised (NER → [COMPANY], [PERSON])
  - prompt reconstructed with only the generic pattern preserved
    ↓
Anonymised correction queued in marketplace contribution pool
    ↓
Pool aggregated across all contributing orgs for this agent version
    ↓
Publisher receives aggregated correction dataset (not individual org corrections)
    ↓
Publisher incorporates into fine-tuning pipeline → new version published
    ↓
All deploying orgs benefit from the improved version
```

**Consent model — opt-in only:**

Contributing to the marketplace pool is **never the default**. Organisations opt in explicitly per agent, with a clear value proposition displayed in the Governance Dashboard:

```
┌─────────────────────────────────────────────────────────────────────┐
│  📦  financial-analyst-za@2.1.0                                     │
│                                                                     │
│  Contribute corrections to the marketplace improvement pool?        │
│                                                                     │
│  Your corrections are anonymised before contribution — no org       │
│  data, session data, or user data is shared. In return, your        │
│  agent improves faster because it receives corrections from all     │
│  contributing deployments, not just yours.                          │
│                                                                     │
│  Currently contributing: 47 other organisations                     │
│  Pool size: 1,203 approved corrections this month                   │
│                                                                     │
│  [Enable for this agent]  [Learn more]  [Skip]                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Privacy guarantees:**

- The marketplace receives only anonymised corrections — never raw conversation content
- Differential privacy noise is applied to the aggregated dataset before it is shared with publishers (same technique as the telemetry pipeline)
- Organisations can withdraw their contributions at any time — future corrections stop being included; past contributions are not retroactively removed (they are already anonymised and indistinguishable in the aggregated pool)
- Enterprise and self-hosted deployments are opted out of all contribution by default — they must explicitly opt in even to the single-org feedback loop

**Publisher visibility:**

Publishers see their agent's contribution pool stats on the publisher dashboard:

```
Marketplace Contribution Pool — financial-analyst-za@2.1.0
  Contributing orgs:    47
  Pool corrections:     1,203 this month  (↑ 23% from last month)
  Coverage:             8 of 15 governance rules have pool corrections
  Estimated improvement: Hallucination rate projected -18% in next version
                         based on correction quality analysis
```

**Incentive for publishers to participate:** Publishers who actively incorporate marketplace pool corrections into new versions receive the **Community-Improved badge** on their listing (already defined in Section 8.3) and qualify for the monthly Community Contribution Award (Section 9.7).

---

### 19.3 Developer Documentation and Public Changelog

Documentation and the public changelog are treated as **first-class product features**, not engineering afterthoughts. They are the primary trust-building mechanism for a developer platform. A developer who cannot find the answer in the docs in under two minutes will not become a paying customer.

**Location — existing marketing website documentation section:**

Marketplace documentation lives inside the existing documentation section of the marketing website at `actrone.com/docs/marketplace` — **not** a separate subdomain. This is the right call for three reasons: it keeps all Actrone documentation in one place so developers do not hunt across multiple sites, it benefits from the SEO authority already built up by the marketing site, and it requires no new infrastructure — just new pages within the existing Next.js marketing app.

**Monorepo location:**

```
apps/marketing/
  app/
    docs/
      marketplace/                    ← NEW: marketplace docs section
        page.tsx                      ← /docs/marketplace (overview)
        getting-started/
          page.tsx
        publishing/
          page.tsx
        installing/
          page.tsx
        trust-and-safety/
          page.tsx
        rewards-and-monetisation/
          page.tsx
        api-reference/
          page.tsx
      platform/                       ← existing platform docs
      sdk/                            ← existing SDK docs
```

The existing docs navigation sidebar gets a "Marketplace" section added — same component, same styling, same search index. No new framework, no new deployment, no new DNS configuration.

**Documentation structure at `actrone.com/docs/marketplace`:**

```
Getting Started
  ├── What is the Agent Marketplace?
  ├── Quick Start — Install your first agent (5 minutes)
  ├── Quick Start — Publish your first agent (10 minutes)
  └── Core concepts (Agent-File, packages, versioning, trust tiers)

Publishing
  ├── Writing a great Agent-File
  ├── Documentation standards (README requirements)
  ├── The publish pipeline — what happens when you publish
  ├── Versioning guide (semver, breaking changes, pre-releases)
  ├── Pricing models — choosing the right model
  ├── GovernancePolicy — adding compliance rules
  └── Forking and attribution

Installing and Using
  ├── CLI install guide
  ├── SDK install (Python and Go)
  ├── Using overrides
  ├── Version pinning and updates
  ├── Private marketplace setup (enterprise)
  └── Compatibility test scores — what they mean

Trust and Safety
  ├── Trust tiers explained
  ├── Publisher verification — how to get verified
  ├── Signing and checksums — how verification works
  ├── Reporting a security issue
  └── Content policy

Rewards and Monetisation
  ├── AgentScore — how it is calculated
  ├── Reward tiers — Contributor to ELITE
  ├── Star milestone rewards
  ├── Setting up Payoneer for payouts
  ├── Stripe billing for paid listings
  └── Revenue sharing for forks

API Reference
  ├── Registry API
  ├── Community API
  ├── Rewards API
  └── CLI reference
```

**Cross-linking between marketplace and docs:**

The marketplace UI links directly to relevant documentation pages contextually — not just a generic "docs" link in the footer:

```typescript
// In the publish wizard, step 1
<a href="https://actrone.com/docs/marketplace/publishing/writing-agent-file">
  Writing a great Agent-File →
</a>

// On the trust tier badge
<a href="https://actrone.com/docs/marketplace/trust-and-safety/trust-tiers">
  What does Verified mean? →
</a>

// On the compatibility score
<a href="https://actrone.com/docs/marketplace/installing/compatibility-scores">
  How is this score calculated? →
</a>
```

**The public changelog at `actrone.com/docs/marketplace/changelog`:**

The marketplace changelog lives in the docs section of the marketing site alongside the platform changelog. Every change to the marketplace — new features, behaviour changes, deprecations, infrastructure updates, test suite version changes — is documented here in a consistent format:

```markdown
## 2026-08-14 — Compatibility Test Suite v1.1

**What changed:** Added 3 new edge case prompts to the compatibility test
suite (Category 5). All existing agents will be re-tested within 7 days.

**Why:** Publisher feedback indicated the v1.0 suite did not adequately
cover ambiguous input handling. The new prompts address this gap.

**Impact on publishers:** Agents that currently score ≥ 90 may see minor
score adjustments. We previewed the new prompts with 50 publishers in the
beta programme — average score change was -3 points.

**Action required:** None immediately. Publishers with scores between 70–85
are encouraged to review their agents' edge case handling before re-test.

[View the new test prompts] [Publisher FAQ]
```

**Documentation quality standards:**

Every new marketplace feature ships with documentation on the same day as the feature — not after. This is a hard engineering team requirement, not a guideline. Features without documentation do not count as shipped.

Documentation is versioned alongside the platform. When a breaking change is made to an API or behaviour, the old documentation is archived with a version label and a migration guide is written — not deleted.

**Community contributions to documentation:**

Developers can submit documentation improvements via the marketplace's own Improvement Proposals system — applying the same community mechanics from Section 11.3 to the documentation itself. Accepted documentation contributions earn the contributor community reputation points.

---

### 19.4 Abuse and Spam Prevention at Scale

The incentive system creates adversarial behaviour at scale. Stars, deployment counts, and compliance scores are all worth gaming once the rewards are meaningful. These mitigations are built into the platform from v1.0 — not retrofitted after abuse is detected.

**Star integrity:**

Stars are weighted, not counted raw. The AgentScore calculation uses weighted star counts, not raw counts:

```
weighted_stars = Σ (star × account_weight)

account_weight = f(
  account_age_days,        // older accounts weighted higher
  deployment_history,      // accounts that have deployed agents weight more
  task_execution_count,    // accounts that have run tasks weight more
  prior_star_pattern       // accounts that star everything weight less
)

Minimum account age to contribute meaningful star weight: 30 days
Accounts created in bursts (>10 accounts from same IP in 24h): flagged, weighted to zero
```

Suspicious star patterns trigger automated review: if an agent receives more than 20 stars in one hour from accounts with similar creation dates or IP ranges, those stars are quarantined pending review and do not affect AgentScore until cleared.

**Deployment count integrity:**

A deployment is only counted once an organisation has executed at least one agent task. Installing an agent and never running it does not count as a deployment. This prevents publishers from inflating deployment counts with throwaway installs.

Self-deployments (a publisher deploying their own agent to inflate deployment count) are detected by comparing the publisher's `orgId`/`userId` (WorkOS/OIDC identity — corrected 2026-07-13, was "Clerk") against the deploying organisation's ID. Self-deployments are tracked but excluded from the public deployment count.

**Compliance score minimum sample:**

A compliance score is not displayed until an agent has accumulated at least 100 production turns across all deployments. Below this threshold the Agent Card shows "Insufficient data — score available after 100 production turns." This prevents publishers from gaming a high compliance score by deploying their agent on a small set of carefully crafted benign prompts before listing.

```
Compliance score display thresholds:
  < 100 turns:    "Building track record..."
  100–499 turns:  Score shown with "Early data" label
  500–4,999 turns: Score shown with confidence indicator
  ≥ 5,000 turns:  Full score with trend graph
```

**Publish rate limiting and quality gates:**

```
Maximum new packages per publisher per day:   10
Maximum version updates per package per day:  50
Minimum time between patch versions:          1 hour
  (prevents rapid-fire version spam to game "recently updated" sort)
```

Publishers who receive 3 community flags on a listing within 7 days have their listing visibility reduced automatically and enter a review queue. Publishers with two moderation actions in 90 days have their publish rate limited to 1 package per day regardless of tier.

**Reward gaming prevention:**

Star milestone rewards (cash payouts) are only processed after a 14-day holding period. If fraudulent stars are detected and removed during that period, the reward is adjusted before payout. Rewards already paid out that are later found to have been based on fraudulent activity are deducted from the publisher's next payout — not written off.

Deployment milestone rewards apply the same 14-day holding period and exclude self-deployments from the count used to trigger the milestone.

**Transparency:**

The abuse prevention rules are published at `actrone.com/docs/marketplace/trust-and-safety/content-policy`.

---

*Document Version 1.3.0 — Actrone Marketplace Team — 2026*
