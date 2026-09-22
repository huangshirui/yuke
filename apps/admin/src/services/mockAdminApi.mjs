const KEY = 'yuke.admin.mock.v3'

const seed = {
  currentAdmin: {
    id: 'adm_demo_super',
    email: 'super-admin@example.invalid',
    platformRole: 'super_admin',
  },
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
        nickname: '示例客户 A',
        joinedAt: '2026-09-18T03:20:00.000Z',
        participantCount: 2,
        invitedByAdminId: 'adm_demo_owner',
        inviteCodeId: 'inv_demo_open',
      },
      {
        membershipId: 'mem_demo_02',
        nickname: '示例客户 B',
        joinedAt: '2026-09-19T08:10:00.000Z',
        participantCount: 1,
        invitedByAdminId: 'adm_demo_owner',
        inviteCodeId: 'inv_demo_open',
      },
    ],
    inv_demo_old: [
      {
        membershipId: 'mem_demo_03',
        nickname: '示例客户 C',
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
  slots: {
    sp_demo_alpha: [
      {
        id: 'slot_demo_single', spaceId: 'sp_demo_alpha', resourceId: 'res_demo_aurora',
        slotTypeId: 'sty_demo_standard', slotTypeName: '标准时段', seriesId: null,
        startAt: '2026-09-22T01:00:00.000Z', endAt: '2026-09-22T04:00:00.000Z',
        localDate: '2026-09-22', status: 'open', bookable: false,
      },
      {
        id: 'slot_demo_alt', spaceId: 'sp_demo_alpha', resourceId: 'res_demo_aurora',
        slotTypeId: 'sty_demo_standard', slotTypeName: '标准时段', seriesId: null,
        startAt: '2026-09-26T01:00:00.000Z', endAt: '2026-09-26T03:00:00.000Z',
        localDate: '2026-09-26', status: 'open', bookable: true,
      },
      {
        id: 'slot_demo_series', spaceId: 'sp_demo_alpha', resourceId: 'res_demo_aurora',
        slotTypeId: 'sty_demo_standard', slotTypeName: '标准时段', seriesId: 'series_demo',
        startAt: '2026-09-24T01:00:00.000Z', endAt: '2026-09-24T04:00:00.000Z',
        localDate: '2026-09-24', status: 'frozen', bookable: false,
      },
    ],
    sp_demo_beta: [],
  },
  series: { sp_demo_alpha: [], sp_demo_beta: [] },
  bookings: {
    sp_demo_alpha: [
      {
        id: 'bkg_demo_01',
        spaceId: 'sp_demo_alpha',
        membershipId: 'mem_demo_01',
        slotId: 'slot_demo_single',
        participantId: 'par_demo_01',
        status: 'booked',
        completion: null,
        reconciliation: null,
        createdAt: '2026-09-18T03:30:00.000Z',
        updatedAt: '2026-09-18T03:30:00.000Z',
        participant: {
          id: 'par_demo_01',
          name: '参与人甲',
          birthMonth: '2014-03',
          status: 'active',
        },
        resource: {
          id: 'res_demo_aurora',
          name: '预约对象 A',
          status: 'active',
        },
        slotType: {
          id: 'sty_demo_standard',
          name: '标准时段',
          status: 'active',
        },
        slot: {
          id: 'slot_demo_single',
          startAt: '2026-09-22T01:00:00.000Z',
          endAt: '2026-09-22T04:00:00.000Z',
          localDate: '2026-09-22',
          status: 'open',
        },
      },
    ],
    sp_demo_beta: [],
  },
  members: {
    sp_demo_alpha: [
      {
        membershipId: 'mem_demo_01',
        nickname: '示例客户 A',
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
        nickname: '示例客户 B',
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
        nickname: '示例客户 C',
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

  const requireSlot = (spaceId, slotId) => {
    requireSpace(spaceId)
    const item = (state.slots[spaceId] ?? []).find((slot) => slot.id === slotId)
    if (!item) throw new Error('找不到这个时段。')
    return item
  }

  const assertNoOverlap = (spaceId, candidate, ignoreId = null) => {
    const start = Date.parse(candidate.startAt)
    const end = Date.parse(candidate.endAt)
    if (!(end > start)) throw new Error('结束时间必须晚于开始时间。')
    const overlap = (state.slots[spaceId] ?? []).some((slot) =>
      slot.id !== ignoreId &&
      slot.resourceId === candidate.resourceId &&
      slot.status !== 'cancelled' &&
      Date.parse(slot.startAt) < end &&
      Date.parse(slot.endAt) > start
    )
    if (overlap) throw new Error('这个预约对象在该时间已经存在时段。')
  }

  const requireMember = (spaceId, membershipId) => {
    requireSpace(spaceId)
    const item = (state.members[spaceId] ?? []).find((member) => member.membershipId === membershipId)
    if (!item) throw new Error('找不到这个用户。')
    return item
  }

  const requireBooking = (spaceId, bookingId) => {
    requireSpace(spaceId)
    const item = (state.bookings[spaceId] ?? []).find((booking) => booking.id === bookingId)
    if (!item) throw new Error('找不到这个预约。')
    return item
  }

  const bookingError = (code, message) => {
    const error = new Error(message)
    error.code = code
    return error
  }

  const hydrateBooking = (spaceId, booking) => {
    const slot = requireSlot(spaceId, booking.slotId)
    const resource = requireResource(spaceId, slot.resourceId)
    const slotType = requireSlotType(spaceId, slot.slotTypeId)
    const member = requireMember(spaceId, booking.membershipId)
    const participant = member.participants.find((item) => item.id === booking.participantId)
    if (!participant) throw new Error('找不到这个参与人。')
    const invitedByAdmin = (state.admins[spaceId] ?? []).find(
      (item) => item.id === member.invitedByAdminId,
    )

    booking.userNickname = member.nickname
    booking.invitedByAdminEmail = invitedByAdmin?.email || '未知用户'
    booking.resource = {
      id: resource.id,
      name: resource.name,
      status: resource.status,
    }
    booking.slotType = {
      id: slotType.id,
      name: slotType.name,
      status: slotType.status,
    }
    booking.participant = {
      id: participant.id,
      name: participant.name,
      birthMonth: participant.birthMonth,
      status: participant.status,
    }
    booking.slot = {
      id: slot.id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      localDate: slot.localDate,
      status: slot.status,
    }
    return booking
  }

  save()

  return {
    async getCurrentAdmin() { return clone(state.currentAdmin) },

    async listSpaces() { return clone(state.spaces) },

    async createSpace(input) {
      const space = { id: makeId('sp'), name: input.name.trim(), timezone: input.timezone, status: 'active' }
      state.spaces.push(space)
      state.settings[space.id] = clone(input.settings)
      state.admins[space.id] = []
      state.invites[space.id] = []
      state.resources[space.id] = []
      state.slotTypes[space.id] = []
      state.slots[space.id] = []
      state.series[space.id] = []
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
      if (!id) throw new Error('请选择用户。')
      const list = state.admins[spaceId] ?? (state.admins[spaceId] = [])
      const current = list.find((item) => item.id === id)
      if (current) return clone(current)
      const admin = { id, email: 'assigned-admin@example.invalid', platformRole: 'none', status: 'active' }
      list.push(admin)
      save()
      return clone(admin)
    },

    async assignAdminByEmail(spaceId, emailInput) {
      requireSpace(spaceId)
      const email = String(emailInput || '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('请输入有效的用户邮箱。')
      }
      const list = state.admins[spaceId] ?? (state.admins[spaceId] = [])
      const current = list.find((item) => item.email.toLowerCase() === email)
      if (current) return clone(current)
      const admin = { id: makeId('adm'), email, platformRole: 'none', status: 'active' }
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

    async listScheduleSlots(spaceId, resourceId, from, to) {
      requireResource(spaceId, resourceId)
      const slots = (state.slots[spaceId] ?? [])
        .filter((slot) =>
          slot.resourceId === resourceId && slot.localDate >= from && slot.localDate <= to
        )
        .map((slot) => {
          const booking = (state.bookings[spaceId] ?? []).find(
            (item) => item.slotId === slot.id && ['booked', 'completed'].includes(item.status),
          )
          if (!booking) return { ...slot, booking: null }
          const hydrated = hydrateBooking(spaceId, booking)
          const member = requireMember(spaceId, booking.membershipId)
          return {
            ...slot,
            booking: {
              id: booking.id,
              status: booking.status,
              membershipId: booking.membershipId,
              userNickname: member.nickname,
              participantId: hydrated.participant.id,
              participantName: hydrated.participant.name,
              reconciliationStatus: hydrated.reconciliation?.status ?? null,
            },
          }
        })
      return clone(slots)
    },

    async createScheduleSlot(spaceId, input) {
      requireResource(spaceId, input.resourceId)
      requireSlotType(spaceId, input.slotTypeId)
      const slot = {
        id: makeId('slot'), spaceId, resourceId: input.resourceId, slotTypeId: input.slotTypeId,
        seriesId: null, startAt: new Date(input.startAt).toISOString(), endAt: new Date(input.endAt).toISOString(),
        localDate: new Date(input.startAt).toISOString().slice(0, 10), status: 'open', bookable: true,
      }
      assertNoOverlap(spaceId, slot)
      ;(state.slots[spaceId] ?? (state.slots[spaceId] = [])).push(slot)
      save()
      return clone(slot)
    },

    async createSlotSeries(spaceId, input) {
      requireResource(spaceId, input.resourceId)
      requireSlotType(spaceId, input.slotTypeId)
      const series = { id: makeId('series'), spaceId, ...clone(input) }
      ;(state.series[spaceId] ?? (state.series[spaceId] = [])).push(series)
      let date = input.startsOn
      const hardEnd = input.endsOn || new Date(Date.parse(input.startsOn + 'T00:00:00Z') + 56 * 86400000).toISOString().slice(0, 10)
      while (date <= hardEnd) {
        const weekday = new Date(date + 'T12:00:00Z').getUTCDay() || 7
        if (input.weekdays.includes(weekday)) {
          const slot = {
            id: makeId('slot'), spaceId, resourceId: input.resourceId, slotTypeId: input.slotTypeId,
            seriesId: series.id, startAt: new Date(date + 'T' + input.localStartTime + ':00Z').toISOString(),
            endAt: new Date(date + 'T' + input.localEndTime + ':00Z').toISOString(),
            localDate: date, status: 'open', bookable: true,
          }
          assertNoOverlap(spaceId, slot)
          ;(state.slots[spaceId] ?? (state.slots[spaceId] = [])).push(slot)
        }
        date = new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
      }
      save()
      return clone(series)
    },

    async updateScheduleSlot(spaceId, slotId, input) {
      const anchor = requireSlot(spaceId, slotId)
      const targets = input.scope === 'single' || !anchor.seriesId
        ? [anchor]
        : (state.slots[spaceId] ?? []).filter((slot) =>
            slot.seriesId === anchor.seriesId &&
            (input.scope === 'entire_series' || slot.localDate >= anchor.localDate)
          )
      for (const slot of targets) {
        const next = { ...slot }
        if (input.slotTypeId) next.slotTypeId = input.slotTypeId
        if (input.scope === 'single') {
          if (input.startAt) next.startAt = new Date(input.startAt).toISOString()
          if (input.endAt) next.endAt = new Date(input.endAt).toISOString()
        }
        assertNoOverlap(spaceId, next, slot.id)
        Object.assign(slot, next)
      }
      save()
      return clone(anchor)
    },

    async setScheduleSlotFrozen(spaceId, slotId, frozen) {
      const slot = requireSlot(spaceId, slotId)
      slot.status = frozen ? 'frozen' : 'open'
      const occupied = (state.bookings[spaceId] ?? []).some(
        (item) => item.slotId === slot.id && ['booked', 'completed'].includes(item.status),
      )
      slot.bookable = !frozen && !occupied
      save()
      return clone(slot)
    },

    async cancelScheduleSlot(spaceId, slotId) {
      const slot = requireSlot(spaceId, slotId)
      const occupied = (state.bookings[spaceId] ?? []).some(
        (item) => item.slotId === slot.id && ['booked', 'completed'].includes(item.status),
      )
      if (occupied) {
        throw bookingError('SLOT_NOT_BOOKABLE', '这个时段存在有效预约，请先取消预约。')
      }
      slot.status = 'cancelled'
      slot.bookable = false
      save()
      return clone(slot)
    },

    async listBookings(spaceId, filters = {}) {
      requireSpace(spaceId)
      const list = (state.bookings[spaceId] ?? []).filter((item) => {
        const booking = hydrateBooking(spaceId, item)
        if (filters.from && booking.slot.localDate < filters.from) return false
        if (filters.to && booking.slot.localDate > filters.to) return false
        if (filters.status && booking.status !== filters.status) return false
        if (filters.resourceId && booking.resource.id !== filters.resourceId) return false
        if (filters.participantId && booking.participant.id !== filters.participantId) return false
        if (filters.slotTypeId && booking.slotType.id !== filters.slotTypeId) return false
        if (filters.membershipId && booking.membershipId !== filters.membershipId) return false
        if (filters.reconciliationStatus && booking.reconciliation?.status !== filters.reconciliationStatus) return false
        return true
      })
      return clone(list)
    },

    async getBooking(spaceId, bookingId) {
      return clone(hydrateBooking(spaceId, requireBooking(spaceId, bookingId)))
    },

    async updateBooking(spaceId, bookingId, input) {
      const booking = requireBooking(spaceId, bookingId)
      if (booking.status !== 'booked') throw new Error('只有已预约状态可以修改。')

      if (input.participantId && input.participantId !== booking.participantId) {
        const member = requireMember(spaceId, booking.membershipId)
        const participant = member.participants.find(
          (item) => item.id === input.participantId && item.status === 'active',
        )
        if (!participant) throw new Error('参与人不可用于这个预约。')
        booking.participantId = participant.id
      }

      if (input.slotId && input.slotId !== booking.slotId) {
        const slot = requireSlot(spaceId, input.slotId)
        if (slot.status === 'frozen') {
          throw bookingError('SLOT_FROZEN', '这个时段已冻结，请选择其他时间。')
        }
        if (slot.status !== 'open') {
          throw bookingError('SLOT_NOT_BOOKABLE', '这个时段当前不可预约。')
        }
        const occupied = (state.bookings[spaceId] ?? []).some(
          (item) =>
            item.id !== booking.id &&
            item.slotId === slot.id &&
            ['booked', 'completed'].includes(item.status),
        )
        if (occupied) {
          throw bookingError('SLOT_ALREADY_BOOKED', '这个时间刚刚被预约了，请选择其他时间。')
        }
        booking.slotId = slot.id
      }

      booking.updatedAt = new Date().toISOString()
      hydrateBooking(spaceId, booking)
      save()
      return clone(booking)
    },

    async cancelBooking(spaceId, bookingId) {
      const booking = requireBooking(spaceId, bookingId)
      if (booking.status === 'completed') throw new Error('已完成预约不能取消。')
      if (booking.status === 'booked') {
        booking.status = 'cancelled'
        booking.updatedAt = new Date().toISOString()
      }
      save()
      return clone(hydrateBooking(spaceId, booking))
    },

    async completeBooking(spaceId, bookingId) {
      const booking = requireBooking(spaceId, bookingId)
      if (booking.status === 'cancelled') throw new Error('已取消预约不能完成。')
      if (booking.status === 'booked') {
        const now = new Date().toISOString()
        booking.status = 'completed'
        booking.completion = {
          completedAt: now,
          source: 'manual',
          externalReference: null,
          batchId: null,
        }
        booking.reconciliation = {
          status: 'pending',
          settledAt: null,
          source: null,
          settledByAdminId: null,
          batchId: null,
          note: null,
        }
        booking.updatedAt = now
      }
      save()
      return clone(hydrateBooking(spaceId, booking))
    },

    async reconcileBooking(spaceId, bookingId) {
      const booking = requireBooking(spaceId, bookingId)
      if (booking.status !== 'completed') throw new Error('只有已完成预约才能对账。')
      if (booking.reconciliation?.status !== 'settled') {
        const now = new Date().toISOString()
        booking.reconciliation = {
          status: 'settled',
          settledAt: now,
          source: 'manual',
          settledByAdminId: state.currentAdmin.id,
          batchId: null,
          note: null,
        }
        booking.updatedAt = now
      }
      save()
      return clone(hydrateBooking(spaceId, booking))
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
