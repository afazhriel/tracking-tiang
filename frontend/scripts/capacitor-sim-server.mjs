/**
 * Simulasi server lokal Capacitor (WebViewLocalServer) untuk audit.
 *
 * Meniru perilaku `html5mode: true` pada capacitor.config.json:
 *   - path "/"                          -> index.html
 *   - path tanpa titik (mis. /login)    -> index.html (BUKAN login.html!)
 *   - path ber-ekstensi                 -> file apa adanya
 *
 * BUKAN bagian dari aplikasi — hanya alat audit.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../out', import.meta.url))
const port = Number(process.argv[2] || 4173)

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  const lastSegment = path.split('/').pop() || ''

  let file = null

  if (path === '/' || (!lastSegment.includes('.') )) {
    file = join(root, 'index.html') // html5mode: selalu index.html
  } else {
    file = join(root, normalize(path))
    try {
      await stat(file)
    } catch {
      res.writeHead(404)
      res.end('not found')
      return
    }
  }

  try {
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(body)
    console.log(`${path} -> ${file.endsWith('index.html') && path !== '/' ? 'INDEX.HTML (fallback)' : file}`)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
}).listen(port, () => console.log(`sim server on http://localhost:${port}`))
