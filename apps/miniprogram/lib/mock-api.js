const STORAGE_KEY = 'yuke.mockUser'
const PARTICIPANTS_KEY = 'yuke.mockParticipants'
const PARTICIPANT_SEQUENCE_KEY = 'yuke.mockParticipantSequence'
const { normalizeParticipantInput } = require('./participants')

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

  function assertSpaceAccess(spaceId) {
    const user = load()
    const space = user.spaces.find(
      (item) => item.id === spaceId && item.status === 'active'
    )
    if (!space) {
      const error = new Error('该空间当前不可用')
      error.code = 'SPACE_ACCESS_DENIED'
      throw error
    }
  }

  function loadParticipantMap() {
    return storage.getStorageSync(PARTICIPANTS_KEY) || {}
  }

  function saveParticipantMap(value) {
    storage.setStorageSync(PARTICIPANTS_KEY, value)
  }

  function nextParticipantId() {
    const current = Number(storage.getStorageSync(PARTICIPANT_SEQUENCE_KEY) || 0) + 1
    storage.setStorageSync(PARTICIPANT_SEQUENCE_KEY, current)
    return `par_synthetic_${String(current).padStart(3, '0')}`
  }

  function participantsForSpace(spaceId) {
    const map = loadParticipantMap()
    return Array.isArray(map[spaceId]) ? map[spaceId] : []
  }

  function mutateParticipant(spaceId, participantId, mutate) {
    assertSpaceAccess(spaceId)
    const map = loadParticipantMap()
    const participants = Array.isArray(map[spaceId]) ? map[spaceId] : []
    const index = participants.findIndex((item) => item.id === participantId)
    if (index < 0) {
      const error = new Error('参与人不存在')
      error.code = 'NOT_FOUND'
      throw error
    }
    participants[index] = mutate({ ...participants[index] })
    map[spaceId] = participants
    saveParticipantMap(map)
    return clone(participants[index])
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
    },

    async listResources(spaceId) {
      assertSpaceAccess(spaceId)
      return [
        { id: `res_${spaceId}_a`, spaceId, name: '预约对象 A', note: null, status: 'active' },
        { id: `res_${spaceId}_b`, spaceId, name: '预约对象 B', note: null, status: 'active' }
      ]
    },

    async listResourceSlots(spaceId, resourceId, from, to) {
      assertSpaceAccess(spaceId)
      const resources = await this.listResources(spaceId)
      if (!resources.some((item) => item.id === resourceId)) {
        const error = new Error('预约对象不存在')
        error.code = 'NOT_FOUND'
        throw error
      }
      const result = []
      let date = from
      let index = 0
      while (date <= to) {
        const weekday = new Date(date + 'T12:00:00Z').getUTCDay()
        if (weekday !== 0) {
          const hour = resourceId.endsWith('_a') ? 9 : 14
          result.push({
            id: `slot_${resourceId}_${date}`,
            spaceId,
            resourceId,
            slotTypeId: 'sty_synthetic_standard',
            slotTypeName: index % 2 ? '沟通时段' : '标准时段',
            seriesId: index % 3 === 0 ? 'series_synthetic' : null,
            startAt: `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`,
            endAt: `${date}T${String(hour + 1).padStart(2, '0')}:00:00.000Z`,
            localDate: date,
            status: index % 5 === 0 ? 'frozen' : 'open',
            bookable: index % 5 !== 0
          })
          index += 1
        }
        const next = new Date(date + 'T00:00:00Z')
        next.setUTCDate(next.getUTCDate() + 1)
        date = next.toISOString().slice(0, 10)
      }
      return clone(result.filter((slot) => slot.bookable))
    },

    async listParticipants(spaceId) {
      assertSpaceAccess(spaceId)
      return clone(participantsForSpace(spaceId))
    },

    async createParticipant(spaceId, input) {
      assertSpaceAccess(spaceId)
      const normalized = normalizeParticipantInput(input)
      const map = loadParticipantMap()
      const participant = {
        id: nextParticipantId(),
        spaceId,
        ...normalized,
        status: 'active'
      }
      map[spaceId] = [...participantsForSpace(spaceId), participant]
      saveParticipantMap(map)
      return clone(participant)
    },

    async updateParticipant(spaceId, participantId, input) {
      const normalized = normalizeParticipantInput(input)
      return mutateParticipant(spaceId, participantId, (participant) => ({
        ...participant,
        ...normalized
      }))
    },

    async deactivateParticipant(spaceId, participantId) {
      return mutateParticipant(spaceId, participantId, (participant) => ({
        ...participant,
        status: 'inactive'
      }))
    },

    async activateParticipant(spaceId, participantId) {
      return mutateParticipant(spaceId, participantId, (participant) => ({
        ...participant,
        status: 'active'
      }))
    }
  }
}

module.exports = {
  createMockApi
}
