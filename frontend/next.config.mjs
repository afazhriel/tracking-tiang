import { apiUpstreamOrigin } from './lib/upstream.mjs'

const upstream = apiUpstreamOrigin(process.env)

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${upstream}/api/:path*` }]
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }]
  },
}

export default nextConfig
