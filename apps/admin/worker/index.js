const ADMIN_GATEWAY_PREFIX = '/api/v1/admin'

function jsonError(status, code, message) {
  return new Response(
    JSON.stringify({ error: { code, message } }),
    {
      status,
      headers: { 'content-type': 'application/json; charset=UTF-8' }
    }
  )
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const isAdminApi =
      url.pathname === ADMIN_GATEWAY_PREFIX ||
      url.pathname.startsWith(ADMIN_GATEWAY_PREFIX + '/')

    if (!isAdminApi) {
      return jsonError(404, 'NOT_FOUND', 'Admin gateway route not found')
    }

    if (!request.headers.get('cf-access-jwt-assertion')) {
      return jsonError(401, 'UNAUTHENTICATED', 'Missing Cloudflare Access token')
    }

    const upstreamUrl = new URL(request.url)
    upstreamUrl.pathname = url.pathname.slice('/api'.length)

    const headers = new Headers(request.headers)
    headers.delete('cookie')
    headers.delete('origin')
    headers.delete('referer')

    const upstreamRequest = new Request(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : request.body,
      redirect: 'manual'
    })

    return env.API.fetch(upstreamRequest)
  }
}
