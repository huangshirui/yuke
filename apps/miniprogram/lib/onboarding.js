const ROUTES = Object.freeze({
  profileSetup: '/pages/profile/setup',
  invite: '/pages/invite/index',
  schedule: '/pages/schedule/index',
  spaces: '/pages/spaces/index'
})

const TAB_ROUTES = Object.freeze({
  schedule: '/pages/schedule/index',
  me: '/pages/me/index'
})

const CURRENT_TAB_KEY = 'yuke.currentTab'

function isTabRoute(route) {
  return Object.values(TAB_ROUTES).includes(route)
}

function markTab(wxApi, route) {
  try {
    wxApi.setStorageSync(CURRENT_TAB_KEY, route)
  } catch {
    // ignore storage failures
  }
}

function readTab(wxApi) {
  try {
    return wxApi.getStorageSync(CURRENT_TAB_KEY) || ''
  } catch {
    return ''
  }
}

function activeSpaces(user) {
  if (!user || !Array.isArray(user.spaces)) {
    return []
  }

  return user.spaces.filter((space) => space && space.status === 'active')
}

function resolveEntry(user) {
  if (!user || user.profileInitialized !== true) {
    return {
      route: ROUTES.profileSetup,
      reason: 'profile-required'
    }
  }

  const spaces = activeSpaces(user)
  if (spaces.length === 0) {
    return {
      route: ROUTES.invite,
      reason: 'space-required'
    }
  }

  const currentSpace = spaces.find((space) => space.id === user.currentSpaceId) || null
  if (!currentSpace && spaces.length > 1) {
    return {
      route: ROUTES.spaces,
      reason: 'space-selection-required',
      currentSpace: null,
      spaces
    }
  }

  return {
    route: ROUTES.schedule,
    tab: 'schedule',
    reason: currentSpace ? 'ready' : 'single-space-auto-selection-required',
    currentSpace,
    spaces
  }
}

module.exports = {
  ROUTES,
  TAB_ROUTES,
  CURRENT_TAB_KEY,
  activeSpaces,
  resolveEntry,
  isTabRoute,
  markTab,
  readTab
}
