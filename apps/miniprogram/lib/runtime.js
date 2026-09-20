const config = require('../config')
const { createApiClient } = require('./api')
const { createMockApi } = require('./mock-api')
const { loadToken } = require('./storage')

function getApi(wxApi) {
  if (config.apiMode === 'mock') {
    return createMockApi(wxApi)
  }

  return createApiClient({
    baseUrl: config.apiBaseUrl,
    request: wxApi.request.bind(wxApi),
    uploadFile: wxApi.uploadFile.bind(wxApi),
    downloadFile: wxApi.downloadFile.bind(wxApi),
    getToken: () => loadToken(wxApi)
  })
}

module.exports = {
  getApi
}
