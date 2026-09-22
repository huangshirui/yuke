const { resolveEntry, isTabRoute, markTab, TAB_ROUTES } = require('./onboarding')
const { saveUser } = require('./storage')

async function routeToEntry(wxApi, user, options = {}) {
  let entry = resolveEntry(user)

  if (entry.reason === 'single-space-auto-selection-required') {
    const api = options.api
    if (!api) throw new Error('API is required to select the only active service provider')

    await api.switchSpace(entry.spaces[0].id)
    user = await api.getMe()
    saveUser(options.storage || wxApi, user)
    entry = resolveEntry(user)
  }

  if (entry.route === TAB_ROUTES.schedule) {
    markTab(wxApi, TAB_ROUTES.schedule)
    wxApi.switchTab({ url: entry.route })
    return entry
  }

  wxApi.reLaunch({
    url: entry.reason === 'space-selection-required'
      ? `${entry.route}?required=1`
      : entry.route
  })
  return entry
}

function switchTab(wxApi, route) {
  if (isTabRoute(route)) markTab(wxApi, route)
  wxApi.switchTab({ url: route })
}

module.exports = {
  routeToEntry,
  switchTab
}
