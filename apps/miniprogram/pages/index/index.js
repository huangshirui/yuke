const { bootstrapSession } = require('../../lib/session')
const { routeToEntry } = require('../../lib/navigation')

Page({
  data: {
    loading: true,
    errorMessage: ''
  },

  async onLoad() {
    await this.bootstrap()
  },

  async bootstrap() {
    this.setData({ loading: true, errorMessage: '' })

    try {
      const app = getApp()
      const user = await bootstrapSession({
        wxApi: wx,
        api: app.globalData.api,
        storage: wx
      })
      await routeToEntry(wx, user, { api: app.globalData.api, storage: wx })
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: '暂时无法进入，请检查网络后重试'
      })
    }
  }
})
