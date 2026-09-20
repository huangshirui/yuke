const { resolveEntry } = require('./onboarding')

function routeToEntry(wxApi, user) {
  const entry = resolveEntry(user)
  const url = entry.reason === 'space-selection-required'
    ? `${entry.route}?selectSpace=1`
    : entry.route

  wxApi.reLaunch({ url })
  return entry
}

module.exports = {
  routeToEntry
}
