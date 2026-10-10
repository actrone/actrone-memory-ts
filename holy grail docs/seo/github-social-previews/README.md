# GitHub social preview images

One 1280×640 card per public repository, uploaded under each repository's **Settings**, **General**, **Social preview**. Steps are in [the discoverability guide](../guides/github-pypi-npm-discoverability.md#social-preview-image).

| File | Repository | Headline | Detail |
| --- | --- | --- | --- |
| `actrone-memory-py.png` | `actrone/actrone-memory-py` | Persistent memory for AI agents. | `pip install actrone-memory` |
| `actrone-memory-ts.png` | `actrone/actrone-memory-ts` | Persistent memory for AI agents. | `npm install actrone-memory` |
| `create-actrone-app.png` | `actrone/create-actrone-app` | An agent that remembers, in one command. | `npm create actrone-app@latest` |

They were rendered on 2026-09-25 with the same tokens, Geist weights and layout as the site's share cards (`frontend/apps/marketing/src/lib/seo/og-image.tsx`), at GitHub's recommended size instead of 1200×630. To change the wording, reuse that renderer's layout with `ImageResponse` from `next/og` at `{ width: 1280, height: 640 }`, keep sentence case and no dashes in the copy, and replace the PNG here.
