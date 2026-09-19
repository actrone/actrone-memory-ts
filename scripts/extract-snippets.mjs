// Run with `node scripts/extract-snippets.mjs` (see package.json). No `#!` shebang: this module is
// also imported by the test suite, and a shebang makes Node's ESM loader reject it.
/**
 * extract-snippets: pull the `#region`-marked blocks out of the type-checked example files into a
 * `snippets.json` map (rendered in the docs by id). The docs render these by id
 * instead of hand-typing code, so a documented snippet is always real, compiled code from the current
 * SDK: an example that stops compiling fails CI before it can be published stale.
 *
 * Markers (matching TypeDoc/VS Code region syntax):
 *   // #region <id>
 *   ...code...
 *   // #endregion <id>
 *
 * `--check` verifies snippets.json is in sync with the sources (CI gate) instead of writing it.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXAMPLES_DIR = resolve(__dirname, '../examples')
const OUT = join(EXAMPLES_DIR, 'snippets.json')

const REGION = /\/\/\s*#region\s+(\S+)\s*\n([\s\S]*?)\n\s*\/\/\s*#endregion(?:\s+\S+)?/g

/** Collect .ts files at the top level and one level down (e.g. examples/frameworks/). */
function tsFiles() {
  /** @type {string[]} */
  const out = []
  for (const entry of readdirSync(EXAMPLES_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(join(EXAMPLES_DIR, entry.name))
    } else if (entry.isDirectory()) {
      const sub = join(EXAMPLES_DIR, entry.name)
      for (const f of readdirSync(sub).filter((f) => f.endsWith('.ts'))) out.push(join(sub, f))
    }
  }
  return out
}

/** @returns {Record<string,string>} */
function extract() {
  /** @type {Record<string,string>} */
  const snippets = {}
  for (const file of tsFiles()) {
    // Normalise CRLF so the output does not depend on the checkout's line endings.
    // Without this, regenerating on Windows embeds \r\n in every snippet string and the
    // `--check` gate then fails on Linux CI (and vice versa) with no real change.
    const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    let m
    while ((m = REGION.exec(src)) !== null) {
      const [, id, body] = m
      if (snippets[id]) throw new Error(`duplicate snippet id "${id}" (in ${file})`)
      // Trim a single trailing newline but keep internal blank lines / indentation.
      snippets[id] = body.replace(/\s+$/, '') + '\n'
    }
  }
  return snippets
}

const snippets = extract()
const ids = Object.keys(snippets)
if (ids.length === 0) {
  console.error('[extract-snippets] no #region snippets found under examples/')
  process.exit(1)
}
const serialized = JSON.stringify(snippets, null, 2) + '\n'

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  if (current !== serialized) {
    console.error('[extract-snippets] DRIFT: examples/snippets.json is stale. Run `npm run snippets` and commit.')
    process.exit(1)
  }
  console.log(`[extract-snippets] snippets.json in sync (${ids.length}: ${ids.join(', ')}) ✓`)
} else {
  writeFileSync(OUT, serialized)
  console.log(`[extract-snippets] wrote ${ids.length} snippet(s) → examples/snippets.json (${ids.join(', ')})`)
}
