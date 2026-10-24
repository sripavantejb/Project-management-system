const fs = require('fs')
const http = require('http')
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

// OneDrive files are cloud reparse points. Node's Dirent.isSymbolicLink()
// reports them as symlinks, then Metro's readlink() throws EINVAL and the
// bundler never starts. lstat() classifies the same files correctly.
if (process.platform === 'win32') {
  const originalIsSymbolicLink = fs.Dirent.prototype.isSymbolicLink
  fs.Dirent.prototype.isSymbolicLink = function isSymbolicLink() {
    if (!originalIsSymbolicLink.call(this)) return false
    const parent = this.parentPath || this.path
    if (!parent) return false
    try {
      return fs.lstatSync(path.join(parent, this.name)).isSymbolicLink()
    } catch {
      return false
    }
  }
}

const config = getDefaultConfig(__dirname)

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
})

const API_PORT = Number(process.env.CLYRO_API_PORT || 5000)

function proxyToApi(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${API_PORT}` }
  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: API_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    },
  )
  proxyReq.on('error', () => {
    if (res.headersSent) return
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ success: false, message: 'The local API is not running.' }))
  })
  req.pipe(proxyReq)
}

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      const url = req.url || ''
      // /socket.io long-polling keeps chat live when the phone reaches the
      // machine through Cloudflare / Expo tunnels (WebSocket upgrades cannot).
      if (
        url.startsWith('/api') ||
        url.startsWith('/uploads') ||
        url.startsWith('/socket.io')
      ) {
        proxyToApi(req, res)
        return
      }
      return middleware(req, res, next)
    }
  },
}

module.exports = config
