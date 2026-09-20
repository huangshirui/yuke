module.exports = {
  // #18 uses mock mode until the Phase 1 membership APIs are merged and deployed.
  // Remote mode must use a production HTTPS domain configured in WeChat's request domain list.
  apiMode: 'mock',
  apiBaseUrl: ''
}
