const mode = process.env.VITE_ADMIN_DATA_MODE?.trim()
const apiBaseUrl = process.env.VITE_API_BASE_URL?.trim()

if (mode !== 'api') {
  throw new Error('VITE_ADMIN_DATA_MODE must be "api" for a production Admin build')
}

let url
try {
  url = new URL(apiBaseUrl)
} catch {
  throw new Error('VITE_API_BASE_URL must be an absolute HTTPS URL')
}

if (url.protocol !== 'https:' || url.origin !== apiBaseUrl || url.pathname !== '/') {
  throw new Error('VITE_API_BASE_URL must be an HTTPS origin without path')
}

console.log(`Production Admin API: ${apiBaseUrl}`)
