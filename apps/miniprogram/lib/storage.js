const TOKEN_KEY = 'yuke.userAccessToken'
const TOKEN_EXPIRES_AT_KEY = 'yuke.userAccessTokenExpiresAt'
const USER_KEY = 'yuke.currentUser'

function saveSession(storage, session) {
  storage.setStorageSync(TOKEN_KEY, session.accessToken)
  storage.setStorageSync(TOKEN_EXPIRES_AT_KEY, session.expiresAt)
  storage.setStorageSync(USER_KEY, session.user)
}

function loadToken(storage) {
  const token = storage.getStorageSync(TOKEN_KEY)
  const expiresAt = storage.getStorageSync(TOKEN_EXPIRES_AT_KEY)

  if (!token || !expiresAt) {
    return null
  }

  const expiresAtMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    clearSession(storage)
    return null
  }

  return token
}

function loadUser(storage) {
  return storage.getStorageSync(USER_KEY) || null
}

function saveUser(storage, user) {
  storage.setStorageSync(USER_KEY, user)
}

function clearSession(storage) {
  storage.removeStorageSync(TOKEN_KEY)
  storage.removeStorageSync(TOKEN_EXPIRES_AT_KEY)
  storage.removeStorageSync(USER_KEY)
}

module.exports = {
  TOKEN_KEY,
  TOKEN_EXPIRES_AT_KEY,
  USER_KEY,
  saveSession,
  loadToken,
  loadUser,
  saveUser,
  clearSession
}
