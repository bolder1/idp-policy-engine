/* Builds the prototype as a claude.ai Artifact: one page, one script, one stylesheet, plus public/.
 *
 *   node <this file> [--root <checkout to build>] [--out <dir>]
 *
 * --root defaults to the current directory. Build the checkout whose state you want to share, normally the main
 * checkout on main (what was pushed). It writes <out>/index.html (the page, without doctype/html/head/body: the
 * Artifact wraps it) and <out>/files.json (published path -> source path) for the Artifact tool's `files`.
 * Republish to the same artifact URL to update it.
 *
 * Why a separate build:
 *  - an Artifact publish takes at most 255 files, and the normal build splits into ~370, so this one makes one chunk;
 *  - the page is served from an artifact path, not a site root, so `/logos/x.png` style paths become relative;
 *  - hashed names would pile up across republishes, so the script and stylesheet get fixed names.
 */
import { build } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const root = path.resolve(arg('--root') ?? process.cwd())
const out = path.resolve(arg('--out') ?? path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), 'out'))
const site = path.join(out, 'site')

const dirty = execSync('git status --porcelain -- src public index.html', { cwd: root }).toString().trim()
const sha = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim()
if (dirty) console.warn(`! ${root} has uncommitted changes under src/public; the artifact will include them.\n${dirty}`)

await build({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  base: './',
  logLevel: 'warn',
  build: {
    outDir: site,
    emptyOutDir: true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100000,
    rolldownOptions: { output: { codeSplitting: false } },
  },
})

const assets = path.join(site, 'assets')
const pick = (ext) => fs.readdirSync(assets).filter((f) => f.endsWith(ext))
const js = pick('.js')
const css = pick('.css')
if (js.length !== 1 || css.length !== 1) throw new Error(`expected one js and one css, got ${js} / ${css}`)

/* Public files the app names from the site root. */
const PUBLIC = fs.readdirSync(path.join(root, 'public')).filter((f) => !f.endsWith('.html'))
const names = PUBLIC.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
const inJs = new RegExp(`(["'\`])/(${names})(?=[/"'\`?#])`, 'g')
const inCss = new RegExp(`url\\((["']?)/(${names})(?=[/"')?#])`, 'g')

const jsText = fs.readFileSync(path.join(assets, js[0]), 'utf8').replace(inJs, '$1./$2')
const cssText = fs.readFileSync(path.join(assets, css[0]), 'utf8').replace(inCss, 'url($1../$2')
fs.rmSync(assets, { recursive: true })
fs.mkdirSync(assets)
fs.writeFileSync(path.join(assets, 'app.js'), jsText)
fs.writeFileSync(path.join(assets, 'app.css'), cssText)
for (const f of fs.readdirSync(site)) if (f.endsWith('.html')) fs.rmSync(path.join(site, f))

/* The page. The Artifact adds the doctype, html, head and body. */
const page = `<title>IdP Policy Engine</title>
<meta name="build" content="${sha}">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/app.css">
<div id="root"></div>
<script type="module" src="assets/app.js"></script>
`
fs.writeFileSync(path.join(out, 'index.html'), page)

/* published path -> source path, every file under site/ */
const files = {}
const walk = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name)
    if (f.isDirectory()) walk(p)
    else files[path.relative(site, p).split(path.sep).join('/')] = p.split(path.sep).join('/')
  }
}
walk(site)
fs.writeFileSync(path.join(out, 'files.json'), JSON.stringify(files, null, 1))
const mb = (n) => (n / 1048576).toFixed(1)
const total = Object.values(files).reduce((s, p) => s + fs.statSync(p).size, 0)
console.log(`built ${sha}: ${Object.keys(files).length} files, ${mb(total)} MB -> ${out}`)
