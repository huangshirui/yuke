const KEY = 'yuke.admin.mock.v2'

const seed = {
  spaces: [
    { id: 'sp_demo_alpha', name: '星河预约空间', timezone: 'Asia/Shanghai', status: 'active' },
    { id: 'sp_demo_beta', name: '远山工作室', timezone: 'Asia/Shanghai', status: 'disabled' },
  ],
  settings: {
    sp_demo_alpha: { bookingCutoffMinutes: 60, cancellationCutoffMinutes: 240 },
    sp_demo_beta: { bookingCutoffMinutes: 30, cancellationCutoffMinutes: null },
  },
  admins: {
    sp_demo_alpha: [
      { id: 'adm_demo_owner', email: 'admin-a@example.invalid', platformRole: 'none', status: 'active' },
      { id: 'adm_demo_ops', email: 'admin-b@example.invalid', platformRole: 'none', status: 'active' },
    ],
    sp_demo_beta: [
      { id: 'adm_demo_owner', email: 'admin-a@example.invalid', platformRole: 'none', status: 'active' },
    ],
  },
  invites: {
    sp_demo_alpha: [
      {
        id: 'inv_demo_open',
        spaceId: 'sp_demo_alpha',
        label: '示例渠道 A',
        code: '示例邀请码-A',
        expiresAt: '2026-10-31T15:59:59.000Z',
        status: 'active',
        createdByAdminId: 'adm_demo_owner',
        memberCount: 2,
      },
      {
        id: 'inv_demo_old',
        spaceId: 'sp_demo_alpha',
        label: '已停用示例',
        code: '示例邀请码-B',
        expiresAt: '2026-09-30T15:59:59.000Z',
        status: 'revoked',
        createdByAdminId: 'adm_demo_ops',
        memberCount: 1,
      },
    ],
    sp_demo_beta: [],
  },
  inviteMembers: {
    inv_demo_open: [
      {
        membershipId: 'mem_demo_01',
        nickname: '示例用户 A',
        joinedAt: '2026-09-18T03:20:00.000Z',
        participantCount: 2,
        invitedByAdminId: 'adm_demo_owner',
        inviteCodeId: 'inv_demo_open',
      },
      {
        membershipId: 'mem_demo_02',
        nickname: '示例用户 B',
        joinedAt: '2026-09-19T08:10:00.000Z',
        participantCount: 1,
        invitedByAdminId: 'adm_demo_owner',
        inviteCodeId: 'inv_demo_open',
      },
    ],
    inv_demo_old: [
      {
        membershipId: 'mem_demo_03',
        nickname: '示例用户 C',
        joinedAt: '2026-09-10T01:00:00.000Z',
        participantCount: 1,
        invitedByAdminId: 'adm_demo_ops',
        inviteCodeId: 'inv_demo_old',
      },
    ],
  },
  resources: {
    sp_demo_alpha: [
      { id: 'res_demo_aurora', spaceId: 'sp_demo_alpha', name: '预约对象 A', note: 'Synthetic resource note.', status: 'active' },
      { id: 'res_demo_cloud', spaceId: 'sp_demo_alpha', name: '预约对象 B', note: null, status: 'inactive' },
    ],
    sp_demo_beta: [],
  },
  slotTypes: {
    sp_demo_alpha: [
      { id: 'sty_demo_standard', spaceId: 'sp_demo_alpha', name: '标准时段', status: 'active' },
      { id: 'sty_demo_extended', spaceId: 'sp_demo_alpha', name: '延长时段', status: 'inactive' },
    ],
    sp_demo_beta: [],
  },
  members: {
    sp_demo_alpha: [
      {
        membershipId: 'mem_demo_01',
        nickname: '示例用户 A',
        joinedAt: '2026-09-18T03:20:00.000Z',
        participantCount: 2,
        invitedByAdminId: 'adm_demo_owner',
        inviteCodeId: 'inv_demo_open',
        status: 'active',
        adminNote: '仅用于演示的内部备注。',
        bookingCount: 3,
        participants: [
          {
            id: 'par_demo_01',
            name: '参与人甲',
            birthMonth: '2014-03',
            status: 'active',
            userNote: 'Synthetic user note.',
            adminNote: null,
          },
          {
            id: 'par_demo_02',
            name: '参与人乙',
            birthMonth: '2011-11',
            status: 'inactive',
            userNote: null,
            adminNote: 'Synthetic internal note.',
          },
        ],
      },
      {
        membershipId: 'mem_demo_02',
        nickname: '示例用户 B',
        joinedAt: '2026-09-19T08:10:00.000Z',
        participantCount: 1,
        invitedByAdminId: 'adm_demo_owner',
        inviteCodeId: 'inv_demo_open',
        status: 'active',
        adminNote: null,
        bookingCount: 1,
        participants: [
          {
            id: 'par_demo_03',
            name: '参与人丙',
            birthMonth: '2015-07',
            status: 'active',
            userNote: null,
            adminNote: null,
          },
        ],
      },
      {
        membershipId: 'mem_demo_03',
        nickname: '示例用户 C',
        joinedAt: '2026-09-10T01:00:00.000Z',
        participantCount: 1,
        invitedByAdminId: 'adm_demo_ops',
        inviteCodeId: 'inv_demo_old',
        status: 'active',
        adminNote: null,
        bookingCount: 0,
        participants: [
          {
            id: 'par_demo_04',
            name: '参与人丁',
            birthMonth: '2013-01',
            status: 'active',
            userNote: null,
            adminNote: null,
          },
        ],
      },
    ],
    sp_demo_beta: [],
  },
}

const clone = (value) => JSON.parse(JSON.stringify(value))

const memoryStorage = () => {
  let value = null
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next },
  }
}

const makeId = (prefix) => prefix + '_' + Math.random().toString(36).slice(2, 12)

export function createMockAdminApi(storage = globalThis.localStorage ?? memoryStorage()) {
  const raw = storage.getItem(KEY)
  const state = raw ? JSON.parse(raw) : clone(seed)
  const save = () => storage.setItem(KEY, JSON.stringify(state))

  const requireSpace = (id) => {
    const space = state.spaces.find((item) => item.id === id)
    if (!space) throw new Error('找不到这个空间。')
    return space
  }

  const requireResource = (spaceId, resourceId) => {
    requireSpace(spaceId)
    const item = (state.resources[spaceId] ?? []).find((resource) => resource.id === resourceId)
    if (!item) throw new Error('找不到这个预约对象。')
    return item
  }

  const requireSlotType = (spaceId, slotTypeId) => {
    requireSpace(spaceId)
    const item = (state.slotTypes[spaceId] ?? []).find((slotType) => slotType.id === slotTypeId)
    if (!item) throw new Error('找不到这个时段类型。')
    return item
  }

  const requireMember = (spaceId, membershipId) => {
    requireSpace(spaceId)
    const item = (state.members[spaceId] ?? []).find((member) => member.membershipId === membershipId)
    if (!item) throw new Error('找不到这个用户。')
    return item
  }

  save()

  return {
    async listSpaces() { return clone(state.spaces) },

    async createSpace(input) {
      const space = { id: makeId('sp'), name: input.name.trim(), timezone: input.timezone, status: 'active' }
      state.spaces.push(space)
      state.settings[space.id] = clone(input.settings)
      state.admins[space.id] = []
      state.invites[space.id] = []
      state.resources[space.id] = []
      state.slotTypes[space.id] = []
      state.members[space.id] = []
      save()
      return clone(space)
    },

    async updateSpace(spaceId, input) {
      const space = requireSpace(spaceId)
      if (input.name !== undefined) space.name = input.name.trim()
      if (input.timezone !== undefined) space.timezone = input.timezone
      save()
      return clone(space)
    },

    async setSpaceStatus(spaceId, status) {
      const space = requireSpace(spaceId)
      space.status = status
      save()
      return clone(space)
    },

    async getSettings(spaceId) {
      requireSpace(spaceId)
      return clone(state.settings[spaceId])
    },

    async updateSettings(spaceId, input) {
      requireSpace(spaceId)
      state.settings[spaceId] = clone(input)
      save()
      return clone(state.settings[spaceId])
    },

    async listAdmins(spaceId) {
      requireSpace(spaceId)
      return clone(state.admins[spaceId] ?? [])
    },

    async addAdmin(spaceId, adminUserId) {
      requireSpace(spaceId)
      const id = adminUserId.trim()
      if (!id) throw new Error('请输入管理员 ID。')
      const list = state.admins[spaceId] ?? (state.admins[spaceId] = [])
      const current = list.find((item) => item.id === id)
      if (current) return clone(current)
      const admin = { id, email: 'assigned-admin@example.invalid', platformRole: 'none', status: 'active' }
      list.push(admin)
      save()
      return clone(admin)
    },

    async removeAdmin(spaceId, adminUserId) {
      requireSpace(spaceId)
      state.admins[spaceId] = (state.admins[spaceId] ?? []).filter((item) => item.id !== adminUserId)
      save()
    },

    async listInvites(spaceId) {
      requireSpace(spaceId)
      return clone(state.invites[spaceId] ?? [])
    },

    async createInvite(spaceId, input) {
      requireSpace(spaceId)
      const invite = {
        id: makeId('inv'),
        spaceId,
        label: input.label?.trim() || null,
        code: '示例-' + makeId('invite'),
        expiresAt: input.expiresAt,
        status: 'active',
        createdByAdminId: 'adm_demo_owner',
        memberCount: 0,
      }
      const list = state.invites[spaceId] ?? (state.invites[spaceId] = [])
      list.unshift(invite)
      state.inviteMembers[invite.id] = []
      save()
      return clone(invite)
    },

    async revokeInvite(spaceId, inviteId) {
      requireSpace(spaceId)
      const invite = (state.invites[spaceId] ?? []).find((item) => item.id === inviteId)
      if (!invite) throw new Error('找不到这个邀请码。')
      invite.status = 'revoked'
      save()
      return clone(invite)
    },

    async listInviteMembers(spaceId, inviteId) {
      requireSpace(spaceId)
      if (!(state.invites[spaceId] ?? []).some((item) => item.id === inviteId)) {
        throw new Error('找不到这个邀请码。')
      }
      return clone(state.inviteMembers[inviteId] ?? [])
    },

    async listResources(spaceId) {
      requireSpace(spaceId)
      return clone(state.resources[spaceId] ?? [])
    },

    async createResource(spaceId, input) {
      requireSpace(spaceId)
      const name = input.name.trim()
      if (!name) throw new Error('请输入预约对象名称。')
      const item = {
        id: makeId('res'),
        spaceId,
        name,
        note: input.note?.trim() || null,
        status: 'active',
      }
      const list = state.resources[spaceId] ?? (state.resources[spaceId] = [])
      list.push(item)
      save()
      return clone(item)
    },

    async updateResource(spaceId, resourceId, input) {
      const item = requireResource(spaceId, resourceId)
      const name = input.name.trim()
      if (!name) throw new Error('请输入预约对象名称。')
      item.name = name
      item.note = input.note?.trim() || null
      save()
      return clone(item)
    },

    async setResourceStatus(spaceId, resourceId, status) {
      const item = requireResource(spaceId, resourceId)
      item.status = status
      save()
      return clone(item)
    },

    async listSlotTypes(spaceId) {
      requireSpace(spaceId)
      return clone(state.slotTypes[spaceId] ?? [])
    },

    async createSlotType(spaceId, input) {
      requireSpace(spaceId)
      const name = input.name.trim()
      if (!name) throw new Error('请输入时段类型名称。')
      const list = state.slotTypes[spaceId] ?? (state.slotTypes[spaceId] = [])
      if (list.some((item) => item.name === name)) throw new Error('同一空间内已存在同名时段类型。')
      const item = { id: makeId('sty'), spaceId, name, status: 'active' }
      list.push(item)
      save()
      return clone(item)
    },

    async updateSlotType(spaceId, slotTypeId, input) {
      const item = requireSlotType(spaceId, slotTypeId)
      const name = input.name.trim()
      if (!name) throw new Error('请输入时段类型名称。')
      const list = state.slotTypes[spaceId] ?? []
      if (list.some((candidate) => candidate.id !== slotTypeId && candidate.name === name)) {
        throw new Error('同一空间内已存在同名时段类型。')
      }
      item.name = name
      save()
      return clone(item)
    },

    async setSlotTypeStatus(spaceId, slotTypeId, status) {
      const item = requireSlotType(spaceId, slotTypeId)
      item.status = status
      save()
      return clone(item)
    },

    async listMembers(spaceId, filters = {}) {
      requireSpace(spaceId)
      let list = state.members[spaceId] ?? []
      if (filters.invitedByAdminId) {
        list = list.filter((item) => item.invitedByAdminId === filters.invitedByAdminId)
      }
      if (filters.inviteCodeId) {
        list = list.filter((item) => item.inviteCodeId === filters.inviteCodeId)
      }
      return clone(list.map(({ participants, bookingCount, ...summary }) => summary))
    },

    async getMember(spaceId, membershipId) {
      return clone(requireMember(spaceId, membershipId))
    },

    async updateMemberAdminNote(spaceId, membershipId, adminNote) {
      const item = requireMember(spaceId, membershipId)
      item.adminNote = adminNote?.trim() || null
      save()
    },

    async updateParticipantAdminNote(spaceId, participantId, adminNote) {
      requireSpace(spaceId)
      const member = (state.members[spaceId] ?? []).find((item) =>
        item.participants.some((participant) => participant.id === participantId),
      )
      if (!member) throw new Error('找不到这个参与人。')
      const participant = member.participants.find((item) => item.id === participantId)
      participant.adminNote = adminNote?.trim() || null
      save()
    },
  }
}
