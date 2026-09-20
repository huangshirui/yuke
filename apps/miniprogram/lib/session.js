const { saveSession, saveUser } = require('./storage')

function wxLogin(wxApi) {
  return new Promise((resolve, reject) => {
    wxApi.login({
      success(result) {
        if (!result.code) {
          reject(new Error('wx.login did not return a code'))
          return
        }
        resolve(result.code)
      },
      fail(error) {
        reject(error)
      }
    })
  })
}

async function bootstrapSession({ wxApi, api, storage }) {
  const code = await wxLogin(wxApi)
  const session = await api.createWeChatSession(code)
  saveSession(storage, session)
  return session.user
}

async function refreshCurrentUser({ api, storage }) {
  const user = await api.getMe()
  saveUser(storage, user)
  return user
}

function compressAvatar(wxApi, src) {
  return new Promise((resolve, reject) => {
    wxApi.compressImage({
      src,
      quality: 75,
      compressedWidth: 512,
      compressedHeight: 512,
      success(result) {
        resolve(result.tempFilePath)
      },
      fail(error) {
        reject(error)
      }
    })
  })
}

module.exports = {
  wxLogin,
  bootstrapSession,
  refreshCurrentUser,
  compressAvatar
}
