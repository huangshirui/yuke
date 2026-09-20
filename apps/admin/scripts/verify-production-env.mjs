const mode = process.env.VITE_ADMIN_DATA_MODE?.trim()

if (mode !== 'api') {
  throw new Error('VITE_ADMIN_DATA_MODE must be "api" for a production Admin build')
}

console.log('Production Admin API gateway: /api -> yuke-admin -> Service Binding -> yuke-api')
