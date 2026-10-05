/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://187.77.112.247/api/:path*',
      },
    ]
  },
}

export default nextConfig
