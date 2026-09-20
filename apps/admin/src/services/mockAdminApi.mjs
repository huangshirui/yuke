const KEY = 'yuke.admin.mock.v1'
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
      { id: 'adm_demo_owner', displayName: '示例管理员 A', email: 'admin-a@example.invalid' },
      { id: 'adm_demo_ops', displayName: '示例管理员 B', email: 'admin-b@example.invalid' },
    ],
    sp_demo_beta: [
      { id: 'adm_demo_owner', displayName: '示例管理员 A', email: 'admin-a@example.invalid' },
    ],
  },
  invites: {
    sp_demo_alpha: [
      { id: 'inv_demo_open', spaceId: 'sp_demo_alpha', label: '示例渠道 A', code: '示例邀请码-A', expiresAt: '2026-10-31T15:59:59.000Z', status: 'active', createdByAdminId: 'adm_demo_owner', memberCount: 2 },
      { id: 'inv_demo_old', spaceId: 'sp_demo_alpha', label: '已停用示例', code: '示例邀请码-B', expiresAt: '2026-09-30T15:59:59.000Z', status: 'revoked', createdByAdminId: 'adm_demo_ops', memberCount: 1 },
    ],
    sp_demo_beta: [],
  },
  inviteMembers: {
    inv_demo_open: [
      { membershipId: 'mem_demo_01', nickname: '示例用户 A', joinedAt: '2026-09-18T03:20:00.000Z', participantCount: 2 },
      { membershipId: 'mem_demo_02', nickname: '示例用户 B', joinedAt: '2026-09-19T08:10:00.000Z', participantCount: 1 },
    ],
    inv_demo_old: [
      { membershipId: 'mem_demo_03', nickname: '示例用户 C', joinedAt: '2026-09-10T01:00:00.000Z', participantCount: 1 },
    ],
  },
}
const clone = (value) => JSON.parse(JSON.stringify(value))
const memoryStorage = () => {
  let value = null
  return { getItem: () => value, setItem: (_key, next) => { value = next } }
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
  save()

  return {
    async listSpaces() { return clone(state.spaces) },
    async createSpace(input) {
      const space = { id: makeId('sp'), name: input.name.trim(), timezone: input.timezone, status: 'active' }
      state.spaces.push(space)
      state.settings[space.id] = clone(input.settings)
      state.admins[space.id] = []
      state.invites[space.id] = []
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
      const admin = { id, displayName: '示例待分配管理员', email: 'assigned-admin@example.invalid' }
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
        id: makeId('inv'), spaceId, label: input.label?.trim() || null,
        code: '示例-' + makeId('invite'), expiresAt: input.expiresAt, status: 'active',
        createdByAdminId: 'adm_demo_owner', memberCount: 0,
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
      if (!(state.invites[spaceId] ?? []).some((item) => item.id === inviteId)) throw new Error('找不到这个邀请码。')
      return clone(state.inviteMembers[inviteId] ?? [])
    },
  }
}
