/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${(process.env.API_UPSTREAM_ORIGIN || 'http://187.77.112.247').replace(/\/+$/, '')}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
