/** Server-only configuration. Never place credentials in an upstream URL. */
export function apiUpstreamOrigin(environment = {}) {
  const value = environment.API_UPSTREAM_ORIGIN || environment.API_PROXY_ORIGIN || 'https://pjl.ituiot.com'
  let url
  try { url = new URL(value) } catch { throw new Error('API_UPSTREAM_ORIGIN must be an HTTP(S) origin') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('API_UPSTREAM_ORIGIN must be an HTTP(S) origin without credentials, paths or query parameters')
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (environment.NODE_ENV === 'production' && url.protocol !== 'https:' && !loopback) {
    throw new Error('Production API upstream requires HTTPS; plain HTTP is allowed only on loopback')
  }
  return url.origin
}
