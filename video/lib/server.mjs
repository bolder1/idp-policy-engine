/* A static server for the compositor: the page itself, the captured pictures
   and timelines, and the app's own public folder (logos, the wordmark). One
   origin, so the page can fetch timelines and draw pictures onto a canvas
   without tainting it. */
import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
}

/* `virtual` serves fixed bodies from memory by path. The edit is served this way
   so a render never reads edl.json while another process is rewriting it — a
   half-written file arrives shorter than its content-length and the page's
   fetch fails outright. */
export function serve(mounts, virtual = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      if (virtual[url] !== undefined) {
        const body = Buffer.from(virtual[url])
        res.writeHead(200, {
          'content-type': TYPES[path.extname(url).toLowerCase()] ?? 'application/octet-stream',
          'content-length': body.length,
          'cache-control': 'no-store',
        })
        res.end(body)
        return
      }
      const mount = Object.keys(mounts)
        .sort((a, b) => b.length - a.length)
        .find((m) => url === m || url.startsWith(m.endsWith('/') ? m : m + '/'))
      if (!mount) {
        res.writeHead(404).end()
        return
      }
      const rel = url.slice(mount.length).replace(/^\/+/, '')
      const root = mounts[mount]
      const file = path.join(root, rel || 'index.html')
      if (!file.startsWith(root)) {
        res.writeHead(403).end()
        return
      }
      const s = await stat(file)
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-length': s.size,
        'cache-control': rel.startsWith('img/') ? 'max-age=31536000, immutable' : 'no-store',
      })
      createReadStream(file).pipe(res)
    } catch {
      res.writeHead(404).end()
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) })
    })
  })
}
