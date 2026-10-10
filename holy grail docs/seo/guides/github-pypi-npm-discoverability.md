# GitHub, PyPI and npm discoverability

For a library, the repository and package pages often rank above the website for the library's own name, because GitHub, PyPI and npm are high-authority domains. Treat them as landing pages: their metadata decides what search results and registry searches show, and every link from them back to actrone.com builds the site's authority.

## Status

As of 2026-09-25 all three repositories (`actrone-memory-py`, `actrone-memory-ts`, `create-actrone-app`) are public, and all three packages are published (`actrone-memory` on PyPI and npm, `create-actrone-app` on npm). Each repository's description, website and topics are set. The only item left on GitHub is the social preview image, below.

## GitHub repositories

Set these in each repository's settings and **About** panel. GitHub uses them in its own search, in topic pages, and in the preview card when the repository link is shared.

### About panel

- **Description**: one sentence, under 120 characters, leading with the problem. For example, "Two-tier memory for AI agents in Python: local-first, Redis and Qdrant for production. MIT." Mirror it on the TypeScript repository with "TypeScript" and "Node.js 22+".
- **Website**: `https://actrone.com/docs/getting-started/quickstart`. This link to your own domain is the most valuable one on the page.
- **Topics**: up to 20. Each topic lists the repository on GitHub's topic page for that term. Recommended:

  ```text
  ai-agents  agent-memory  llm  llm-memory  long-term-memory  memory
  rag  redis  qdrant  langchain  langgraph  crewai  llamaindex
  python  (or typescript, vercel-ai-sdk, mastra)
  ```

### Social preview image

Without one, a shared repository link shows a generic GitHub card. The images are ready in [`github-social-previews/`](../github-social-previews/): 1280×640 PNGs that match the site's share cards (Geist, monochrome, the brandmark, 1px borders), one per repository.

| Repository | Image |
| --- | --- |
| `actrone/actrone-memory-py` | `actrone-memory-py.png` |
| `actrone/actrone-memory-ts` | `actrone-memory-ts.png` |
| `actrone/create-actrone-app` | `create-actrone-app.png` |

For each repository:

1. Open the repository on GitHub, then **Settings** (you need admin access). Stay on **General**.
2. Scroll to **Social preview** and choose **Edit**, then **Upload an image...**, and pick that repository's PNG.
3. The preview updates on the settings page. To check it, paste the repository URL into a Slack or X draft; X may show an older card for a while because it caches previews.

GitHub accepts PNG, JPG or GIF under 1 MB, at least 640×320; 1280×640 is the recommended size. To change the wording, see `github-social-previews/README.md`.

### README

GitHub and search engines read the README as the page's content:

- The `<h1>` names the library and what it does in plain words, not only the brand.
- The first paragraph states the problem, the languages and the license.
- Link to the docs site within the first screen, using the quickstart URL.
- Keep a working install command and a complete runnable example near the top.
- Use descriptive image alt text on diagrams and the demo GIF.

### Releases

Publish a GitHub release for each version with human-written notes. Release pages get indexed and give each launch or feature a link people can share.

## PyPI (`actrone-memory`)

PyPI builds the project page from `actrone-memory-py/pyproject.toml`, and each release freezes its metadata, so a change only shows after the next release.

- **`description`**: the one-line summary shown in PyPI search results. Keep it free of em dashes, per the brand rules.
- **`readme`**: `README.md`, so the full README renders as the project description.
- **`keywords`** and **`classifiers`**: updated for 0.2.1 (prepared 2026-09-25, a metadata-only release): 20 keywords including `agent-memory`, `long-term-memory`, `semantic-search`, `rag` and `llm`, and classifiers for OS independence, typing, asyncio, Pydantic 2 and Python 3 only. The license comes from the SPDX `license` field, so no license classifier is needed.
- **`[project.urls]`**: `Documentation` points at `https://actrone.com/docs/memory/overview`, `Homepage` at `https://actrone.com`.

Check the rendering before uploading:

```bash
uv build
uvx twine check dist/*
```

`twine check` fails if the README won't render on PyPI.

## npm (`actrone-memory`, `create-actrone-app`)

npm builds each package page from its `package.json` and README.

- **`description`**: shown in npm search results. Keep it to what the package does today: 0.1.1 (prepared 2026-09-25) removed a line pitching the hosted product, which isn't available yet.
- **`keywords`**: 0.1.1 adds `agent-memory`, `long-term-memory`, `semantic-search`, `vercel-ai-sdk`, `langchain`, `mastra`, `qdrant`, `redis`, `pgvector` and `typescript` to `actrone-memory`, and `starter`, `template`, `cli`, `ai-agents`, `local-first` and `typescript` to `create-actrone-app`.
- **`homepage`**: 0.1.1 points `actrone-memory` at the memory docs and `create-actrone-app` at the quickstart, matching each repository's website link.
- **`repository`** and **`bugs`**: correct.

npm renders the README as published, so relative image links break on the package page. Use absolute URLs for images in the README.

## Backlinks from the ecosystem

After launch, these earn relevant links and direct traffic:

- **Framework integration listings**: open pull requests to add actrone-memory to the integrations or community pages of the frameworks it supports, starting with those that maintain a memory or integrations directory
- **Awesome lists**: curated lists for AI agents, LLM tooling and RAG. Follow each list's contribution rules.
- **Examples in framework discussions**: answer "how do I persist memory" questions with a working snippet and a link to the specific docs section, not the homepage

## Routine

- **Pre-launch**: set every field above, run `twine check`, and preview the npm README with `npm pack --dry-run`
- **Each release**: release notes on GitHub, and a metadata review in `pyproject.toml` and `package.json`
- **Quarterly**: refresh topics and keywords against new integrations
