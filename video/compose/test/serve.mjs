/* A static file server for the test pages. file:// would do for the markup,
   but a canvas that reads hero.png back (the harness measures what it drew)
   is tainted on file://, so everything is served from one http origin. */
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }

export async function serve(root) {
  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const file = path.join(root, url.replace(/\/$/, '/index.html'))
    if (!file.startsWith(path.resolve(root))) return res.writeHead(403).end()
    try {
      const data = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
      res.end(data)
    } catch {
      res.writeHead(404).end('not found: ' + url)
    }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${server.address().port}`
  return { url, close: () => new Promise((r) => server.close(r)) }
}
