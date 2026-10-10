# Blog and changelog in OSS mode, design spec

`blog-changelog-spec.html` is the design spec for turning on `/blog` and `/changelog` in OSS launch mode
(`NEXT_PUBLIC_LAUNCH_MODE=oss`). Open it in a browser: it renders both pages at full fidelity, in both
themes and at phone width, using the same tokens as `../oss-site/oss-site-redesign.html` and the site.

**Status, 2026-10-01: approved and built.** Decisions D1 to D8 and the design were approved the same
day. One implementation change is recorded in D1: posts are Markdown rendered with `react-markdown`
and `remark-gfm`, which the app already depended on, instead of `@next/mdx`. The byline is "Matthew
Nyirenda, Founder and CEO, Apocalypse Technologies", linked to LinkedIn. The new post never names or
links the internal demo repository.

The owner reviews it as a private claude.ai artifact published from this file. Republish to the same
artifact after every revision, so the link stays the same.

## What it covers

| Part | Contents |
| --- | --- |
| 01 | What exists today: both routes are built but hidden in OSS mode, and what is wrong with each |
| 02 | Blog content audit: every claim in the three existing posts, checked against the repos, with a decision per post |
| 03 | Blog index, rendered |
| 04 | Blog post, rendered (byline, correction notice, prose, code, table, table of contents) |
| 05 | Changelog, rendered (package filter, releases generated from each `CHANGELOG.md`) |
| 06 | Phone width (375 px) for the post and the changelog |
| 07 | Data, build, SEO and accessibility: where content comes from, the sync and its CI gate, feeds, sitemap |
| 08 | Decisions for the owner, each with a recommendation |
| 09 | File-level change list |

## Non-negotiables it inherits

Everything in `CLAUDE.md` §8.1.1 and `docs/branding.md`: Black and Apple Silver, Geist only, weights
400/500/600, sentence case, 1px borders rather than shadows, no gradients, chroma only for status,
`lucide-react` at `strokeWidth={1.5}`, no status dots, `rounded-full` only on avatars, no em or en dashes.
Every published claim must be traceable to a repo, a registry or a test run.

## Keeping it current

Once approved, this file is the spec. If the implementation deviates from it, update this file.
