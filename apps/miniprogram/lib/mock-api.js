const STORAGE_KEY = 'yuke.mockUser'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function initialUser() {
  return {
    id: 'usr_synthetic',
    nickname: '',
    avatarUrl: null,
    profileInitialized: false,
    currentSpaceId: null,
    spaces: []
  }
}

function createMockApi(storage) {
  function load() {
    return storage.getStorageSync(STORAGE_KEY) || initialUser()
  }

  function save(user) {
    storage.setStorageSync(STORAGE_KEY, user)
    return clone(user)
  }

  function recompute(user) {
    user.profileInitialized = Boolean(user.nickname && user.avatarUrl)
    return user
  }

  return {
    async createWeChatSession() {
      const user = load()
      return {
        tokenType: 'Bearer',
        accessToken: 'synthetic-local-token',
        expiresAt: '2099-01-01T00:00:00.000Z',
        user: clone(user)
      }
    },

    async getMe() {
      return clone(load())
    },

    async updateProfile(nickname) {
      const user = load()
      user.nickname = String(nickname || '').trim()
      return save(recompute(user))
    },

    async uploadAvatar(filePath) {
      const user = load()
      user.avatarUrl = filePath || '/assets/avatar-placeholder.png'
      return save(recompute(user))
    },

    async downloadAvatar() {
      const user = load()
      if (!user.avatarUrl) {
        const error = new Error('Avatar not found')
        error.code = 'NOT_FOUND'
        throw error
      }
      return user.avatarUrl
    },

    async joinSpace(inviteCode) {
      const code = String(inviteCode || '').trim()
      if (!code) {
        const error = new Error('请输入邀请码')
        error.code = 'VALIDATION_ERROR'
        throw error
      }

      const user = load()
      const suffix = code.slice(-4).toUpperCase().padStart(4, '0')
      const id = `sp_synthetic_${suffix.toLowerCase()}`
      if (!user.spaces.some((space) => space.id === id)) {
        user.spaces.push({
          id,
          name: `示例空间 ${suffix}`,
          timezone: 'Asia/Shanghai',
          status: 'active'
        })
      }
      user.currentSpaceId = id
      save(user)
      return { spaceId: id }
    },

    async listSpaces() {
      return clone(load().spaces)
    },

    async switchSpace(spaceId) {
      const user = load()
      const target = user.spaces.find((space) => space.id === spaceId && space.status === 'active')
      if (!target) {
        const error = new Error('该空间当前不可用')
        error.code = 'SPACE_ACCESS_DENIED'
        throw error
      }
      user.currentSpaceId = target.id
      save(user)
      return { currentSpaceId: target.id }
    }
  }
}

module.exports = {
  createMockApi
}
