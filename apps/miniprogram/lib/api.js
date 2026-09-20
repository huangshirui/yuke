function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function createApiClient(options) {
  const baseUrl = trimTrailingSlash(options.baseUrl)
  const request = options.request
  const uploadFile = options.uploadFile
  const downloadFile = options.downloadFile
  const getToken = options.getToken

  if (!baseUrl) {
    throw new Error('Mini Program API base URL is not configured')
  }

  function authHeader() {
    const token = getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  function call(method, path, data, authenticated = true) {
    return new Promise((resolve, reject) => {
      request({
        url: `${baseUrl}${path}`,
        method,
        data,
        header: {
          'content-type': 'application/json',
          ...(authenticated ? authHeader() : {})
        },
        success(response) {
          const body = response.data || {}
          if (response.statusCode >= 200 && response.statusCode < 300 && !body.error) {
            resolve(body.data)
            return
          }

          const error = new Error(body.error?.message || `Request failed with HTTP ${response.statusCode}`)
          error.code = body.error?.code || 'HTTP_ERROR'
          error.details = body.error?.details
          error.statusCode = response.statusCode
          reject(error)
        },
        fail(error) {
          reject(error)
        }
      })
    })
  }

  function uploadAvatar(filePath) {
    if (typeof uploadFile !== 'function') {
      return Promise.reject(new Error('wx.uploadFile is not available'))
    }

    return new Promise((resolve, reject) => {
      uploadFile({
        url: `${baseUrl}/v1/me/avatar`,
        filePath,
        name: 'file',
        header: authHeader(),
        success(response) {
          let body
          try {
            body = JSON.parse(response.data || '{}')
          } catch {
            reject(new Error('Avatar upload returned invalid JSON'))
            return
          }

          if (response.statusCode >= 200 && response.statusCode < 300 && !body.error) {
            resolve(body.data)
            return
          }

          const error = new Error(body.error?.message || `Upload failed with HTTP ${response.statusCode}`)
          error.code = body.error?.code || 'HTTP_ERROR'
          error.details = body.error?.details
          error.statusCode = response.statusCode
          reject(error)
        },
        fail(error) {
          reject(error)
        }
      })
    })
  }

  function downloadAvatar() {
    if (typeof downloadFile !== 'function') {
      return Promise.reject(new Error('wx.downloadFile is not available'))
    }

    return new Promise((resolve, reject) => {
      downloadFile({
        url: `${baseUrl}/v1/me/avatar`,
        header: authHeader(),
        success(response) {
          if (response.statusCode >= 200 && response.statusCode < 300 && response.tempFilePath) {
            resolve(response.tempFilePath)
            return
          }

          const error = new Error(`Avatar download failed with HTTP ${response.statusCode}`)
          error.code = response.statusCode === 404 ? 'NOT_FOUND' : 'HTTP_ERROR'
          error.statusCode = response.statusCode
          reject(error)
        },
        fail(error) {
          reject(error)
        }
      })
    })
  }

  return {
    createWeChatSession(code) {
      return call('POST', '/v1/auth/wechat/session', { code }, false)
    },
    getMe() {
      return call('GET', '/v1/me')
    },
    updateProfile(nickname) {
      return call('PATCH', '/v1/me/profile', { nickname })
    },
    uploadAvatar,
    downloadAvatar,
    joinSpace(inviteCode) {
      return call('POST', '/v1/spaces/join', { inviteCode })
    },
    listSpaces() {
      return call('GET', '/v1/me/spaces')
    },
    switchSpace(spaceId) {
      return call('PUT', '/v1/me/current-space', { spaceId })
    },
    listParticipants(spaceId) {
      return call('GET', `/v1/spaces/${encodeURIComponent(spaceId)}/participants`)
    },
    createParticipant(spaceId, input) {
      return call('POST', `/v1/spaces/${encodeURIComponent(spaceId)}/participants`, input)
    },
    updateParticipant(spaceId, participantId, input) {
      return call(
        'PATCH',
        `/v1/spaces/${encodeURIComponent(spaceId)}/participants/${encodeURIComponent(participantId)}`,
        input
      )
    },
    deactivateParticipant(spaceId, participantId) {
      return call(
        'POST',
        `/v1/spaces/${encodeURIComponent(spaceId)}/participants/${encodeURIComponent(participantId)}/deactivate`
      )
    },
    activateParticipant(spaceId, participantId) {
      return call(
        'POST',
        `/v1/spaces/${encodeURIComponent(spaceId)}/participants/${encodeURIComponent(participantId)}/activate`
      )
    }
  }
}

module.exports = {
  createApiClient
}
