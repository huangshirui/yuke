const hostname =
  process.env.YUKE_API_CUSTOM_DOMAIN?.trim() || 'api.yuke.verinasci.com'

if (
  hostname.includes('/') ||
  hostname.includes(':') ||
  !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(hostname)
) {
  throw new Error('YUKE_API_CUSTOM_DOMAIN must be a hostname without scheme or path')
}

const url = `https://${hostname}/health`
const response = await fetch(url, {
  headers: { accept: 'application/json' },
  redirect: 'error'
})

if (!response.ok) {
  throw new Error(`Health check failed: HTTP ${response.status}`)
}

const body = await response.json()
if (body?.data?.status !== 'ok' || body?.data?.service !== 'yuke-api') {
  throw new Error('Health check returned an unexpected payload')
}

console.log(`Production health check passed: ${url}`)
