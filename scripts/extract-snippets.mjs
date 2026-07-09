#!/usr/bin/env node
/**
 * extract-snippets — pull the `#region`-marked blocks out of the type-checked example files into a
 * `snippets.json` map (Public-Domain Cutover Runbook Phase 6, item 5). The docs render these by id
 * instead of hand-typing code, so a documented snippet is always real, compiled code from the current
 * SDK — an example that stops compiling fails CI before it can be published stale.
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

/** @returns {Record<string,string>} */
function extract() {
  /** @type {Record<string,string>} */
  const snippets = {}
  const files = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.ts'))
  for (const file of files) {
    const src = readFileSync(join(EXAMPLES_DIR, file), 'utf8')
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
