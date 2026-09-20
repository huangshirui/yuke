const mode = process.env.VITE_ADMIN_DATA_MODE?.trim()
const apiBaseUrl = process.env.VITE_API_BASE_URL?.trim()

if (mode !== 'api') {
  throw new Error('VITE_ADMIN_DATA_MODE must be "api" for a production Admin build')
}

if (apiBaseUrl !== '/api') {
  throw new Error('VITE_API_BASE_URL must be "/api" so production Admin uses the same-origin Service Binding gateway')
}

console.log('Production Admin API gateway: /api -> yuke-admin -> Service Binding -> yuke-api')
