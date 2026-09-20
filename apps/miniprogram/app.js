const { getApi } = require('./lib/runtime')

App({
  globalData: {
    api: null
  },

  onLaunch() {
    this.globalData.api = getApi(wx)
  }
})
