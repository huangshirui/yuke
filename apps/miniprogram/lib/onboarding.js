const ROUTES = Object.freeze({
  profileSetup: '/pages/profile/setup',
  invite: '/pages/invite/index',
  me: '/pages/me/index'
})

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
  return {
    route: ROUTES.me,
    reason: currentSpace ? 'ready' : 'space-selection-required',
    currentSpace,
    spaces
  }
}

module.exports = {
  ROUTES,
  activeSpaces,
  resolveEntry
}
