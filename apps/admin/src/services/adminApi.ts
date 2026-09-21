import type { ApiResponse, SpaceSettings, UpdateAdminBookingInput } from '@yuke/shared'
import type {
  AdminBooking,
  AdminMemberDetail,
  AdminMemberSummary,
  AdminResource,
  AdminSeriesEditResult,
  AdminSlotType,
  AdminSpace,
  AdminUserSummary,
  CreateInviteInput,
  CreateSpaceInput,
  InviteMemberSummary,
  InviteSummary,
  BookingFilters,
  CurrentAdmin,
  MemberFilters,
  ResourceInput,
  SlotTypeInput,
  UpdateSpaceInput,
  UpdateSpaceSettingsInput,
} from '../types/admin'
import { createMockAdminApi } from './mockAdminApi.mjs'

export interface AdminApi {
  getCurrentAdmin(): Promise<CurrentAdmin>
  listSpaces(): Promise<AdminSpace[]>
  createSpace(input: CreateSpaceInput): Promise<AdminSpace>
  updateSpace(spaceId: string, input: UpdateSpaceInput): Promise<AdminSpace>
  setSpaceStatus(spaceId: string, status: 'active' | 'disabled'): Promise<AdminSpace>
  getSettings(spaceId: string): Promise<SpaceSettings>
  updateSettings(spaceId: string, input: UpdateSpaceSettingsInput): Promise<SpaceSettings>
  listAdmins(spaceId: string): Promise<AdminUserSummary[]>
  addAdmin(spaceId: string, adminUserId: string): Promise<AdminUserSummary>
  assignAdminByEmail(spaceId: string, email: string): Promise<AdminUserSummary>
  removeAdmin(spaceId: string, adminUserId: string): Promise<void>
  listInvites(spaceId: string): Promise<InviteSummary[]>
  createInvite(spaceId: string, input: CreateInviteInput): Promise<InviteSummary>
  revokeInvite(spaceId: string, inviteId: string): Promise<InviteSummary>
  listInviteMembers(spaceId: string, inviteId: string): Promise<InviteMemberSummary[]>

  listResources(spaceId: string): Promise<AdminResource[]>
  createResource(spaceId: string, input: ResourceInput): Promise<AdminResource>
  updateResource(spaceId: string, resourceId: string, input: ResourceInput): Promise<AdminResource>
  setResourceStatus(spaceId: string, resourceId: string, status: 'active' | 'inactive'): Promise<AdminResource>

  listSlotTypes(spaceId: string): Promise<AdminSlotType[]>
  createSlotType(spaceId: string, input: SlotTypeInput): Promise<AdminSlotType>
  updateSlotType(spaceId: string, slotTypeId: string, input: SlotTypeInput): Promise<AdminSlotType>
  setSlotTypeStatus(spaceId: string, slotTypeId: string, status: 'active' | 'inactive'): Promise<AdminSlotType>

  listScheduleSlots(spaceId: string, resourceId: string, from: string, to: string): Promise<import('../types/admin').AdminScheduleSlot[]>
  createScheduleSlot(spaceId: string, input: import('../types/admin').CreateScheduleSlotInput): Promise<import('../types/admin').AdminScheduleSlot>
  createSlotSeries(spaceId: string, input: import('../types/admin').CreateSlotSeriesInput): Promise<unknown>
  updateScheduleSlot(spaceId: string, slotId: string, input: import('../types/admin').UpdateScheduleSlotInput): Promise<import('../types/admin').AdminScheduleSlot | AdminSeriesEditResult>
  setScheduleSlotFrozen(spaceId: string, slotId: string, frozen: boolean): Promise<import('../types/admin').AdminScheduleSlot>

  listBookings(spaceId: string, filters?: BookingFilters): Promise<AdminBooking[]>
  getBooking(spaceId: string, bookingId: string): Promise<AdminBooking>
  updateBooking(spaceId: string, bookingId: string, input: UpdateAdminBookingInput): Promise<AdminBooking>
  cancelBooking(spaceId: string, bookingId: string): Promise<AdminBooking>
  completeBooking(spaceId: string, bookingId: string): Promise<AdminBooking>

  listMembers(spaceId: string, filters?: MemberFilters): Promise<AdminMemberSummary[]>
  getMember(spaceId: string, membershipId: string): Promise<AdminMemberDetail>
  updateMemberAdminNote(spaceId: string, membershipId: string, adminNote: string | null): Promise<void>
  updateParticipantAdminNote(spaceId: string, participantId: string, adminNote: string | null): Promise<void>
}

const baseUrl = '/api'
export const adminDataMode = import.meta.env.VITE_ADMIN_DATA_MODE === 'api' ? 'api' : 'mock'

class HttpAdminApi implements AdminApi {
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers)
    if (init?.body && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }

    const response = await fetch(baseUrl + '/v1' + path, {
      ...init,
      credentials: 'same-origin',
      headers,
    })
    let payload: ApiResponse<T> | null = null
    try { payload = (await response.json()) as ApiResponse<T> } catch { payload = null }
    if (!response.ok || !payload || 'error' in payload) {
      const error = new Error(
        payload && 'error' in payload ? payload.error.message : '请求失败，请稍后重试。'
      ) as Error & { code?: string; details?: unknown; statusCode?: number }
      if (payload && 'error' in payload) {
        error.code = payload.error.code
        error.details = payload.error.details
      }
      error.statusCode = response.status
      throw error
    }
    return payload.data
  }

  private spacePath(spaceId: string) {
    return '/admin/spaces/' + encodeURIComponent(spaceId)
  }

  getCurrentAdmin() { return this.request<CurrentAdmin>('/admin/me') }
  listSpaces() { return this.request<AdminSpace[]>('/admin/spaces') }
  createSpace(input: CreateSpaceInput) {
    return this.request<AdminSpace>('/admin/spaces', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        timezone: input.timezone,
        bookingCutoffMinutes: input.settings.bookingCutoffMinutes,
        cancellationCutoffMinutes: input.settings.cancellationCutoffMinutes,
      }),
    })
  }
  updateSpace(spaceId: string, input: UpdateSpaceInput) {
    return this.request<AdminSpace>(this.spacePath(spaceId), {
      method: 'PATCH', body: JSON.stringify(input),
    })
  }
  async setSpaceStatus(spaceId: string, status: 'active' | 'disabled') {
    await this.request<unknown>(
      this.spacePath(spaceId) + '/' + (status === 'active' ? 'activate' : 'disable'),
      { method: 'POST' },
    )
    const space = (await this.listSpaces()).find((item) => item.id === spaceId)
    if (!space) throw new Error('空间状态已更新，但无法重新读取空间。')
    return space
  }
  getSettings(spaceId: string) {
    return this.request<SpaceSettings>(this.spacePath(spaceId) + '/settings')
  }
  updateSettings(spaceId: string, input: UpdateSpaceSettingsInput) {
    return this.request<SpaceSettings>(this.spacePath(spaceId) + '/settings', {
      method: 'PATCH', body: JSON.stringify(input),
    })
  }
  listAdmins(spaceId: string) {
    return this.request<AdminUserSummary[]>(this.spacePath(spaceId) + '/admins')
  }
  addAdmin(spaceId: string, adminUserId: string) {
    return this.request<AdminUserSummary>(this.spacePath(spaceId) + '/admins', {
      method: 'POST', body: JSON.stringify({ adminUserId }),
    })
  }
  async assignAdminByEmail(spaceId: string, email: string) {
    const admin = await this.request<{ id: string }>('/admin/admin-users', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
    return this.addAdmin(spaceId, admin.id)
  }
  async removeAdmin(spaceId: string, adminUserId: string) {
    await this.request<unknown>(
      this.spacePath(spaceId) + '/admins/' + encodeURIComponent(adminUserId),
      { method: 'DELETE' },
    )
  }
  listInvites(spaceId: string) {
    return this.request<InviteSummary[]>(this.spacePath(spaceId) + '/invites')
  }
  createInvite(spaceId: string, input: CreateInviteInput) {
    return this.request<InviteSummary>(this.spacePath(spaceId) + '/invites', {
      method: 'POST', body: JSON.stringify(input),
    })
  }
  revokeInvite(spaceId: string, inviteId: string) {
    return this.request<InviteSummary>(
      this.spacePath(spaceId) + '/invites/' + encodeURIComponent(inviteId) + '/revoke',
      { method: 'POST' },
    )
  }
  listInviteMembers(spaceId: string, inviteId: string) {
    return this.request<InviteMemberSummary[]>(
      this.spacePath(spaceId) + '/invites/' + encodeURIComponent(inviteId) + '/members',
    )
  }

  listResources(spaceId: string) {
    return this.request<AdminResource[]>(this.spacePath(spaceId) + '/resources')
  }
  createResource(spaceId: string, input: ResourceInput) {
    return this.request<AdminResource>(this.spacePath(spaceId) + '/resources', {
      method: 'POST', body: JSON.stringify(input),
    })
  }
  updateResource(spaceId: string, resourceId: string, input: ResourceInput) {
    return this.request<AdminResource>(
      this.spacePath(spaceId) + '/resources/' + encodeURIComponent(resourceId),
      { method: 'PATCH', body: JSON.stringify(input) },
    )
  }
  async setResourceStatus(spaceId: string, resourceId: string, status: 'active' | 'inactive') {
    await this.request<unknown>(
      this.spacePath(spaceId) + '/resources/' + encodeURIComponent(resourceId) + '/' + (status === 'active' ? 'activate' : 'deactivate'),
      { method: 'POST' },
    )
    const resource = (await this.listResources(spaceId)).find((item) => item.id === resourceId)
    if (!resource) throw new Error('预约对象状态已更新，但无法重新读取。')
    return resource
  }

  listSlotTypes(spaceId: string) {
    return this.request<AdminSlotType[]>(this.spacePath(spaceId) + '/slot-types')
  }
  createSlotType(spaceId: string, input: SlotTypeInput) {
    return this.request<AdminSlotType>(this.spacePath(spaceId) + '/slot-types', {
      method: 'POST', body: JSON.stringify(input),
    })
  }
  updateSlotType(spaceId: string, slotTypeId: string, input: SlotTypeInput) {
    return this.request<AdminSlotType>(
      this.spacePath(spaceId) + '/slot-types/' + encodeURIComponent(slotTypeId),
      { method: 'PATCH', body: JSON.stringify(input) },
    )
  }
  async setSlotTypeStatus(spaceId: string, slotTypeId: string, status: 'active' | 'inactive') {
    await this.request<unknown>(
      this.spacePath(spaceId) + '/slot-types/' + encodeURIComponent(slotTypeId) + '/' + (status === 'active' ? 'activate' : 'deactivate'),
      { method: 'POST' },
    )
    const slotType = (await this.listSlotTypes(spaceId)).find((item) => item.id === slotTypeId)
    if (!slotType) throw new Error('时段类型状态已更新，但无法重新读取。')
    return slotType
  }

  listScheduleSlots(spaceId: string, resourceId: string, from: string, to: string) {
    const query = new URLSearchParams({ from, to })
    return this.request<import('../types/admin').AdminScheduleSlot[]>(
      this.spacePath(spaceId) + '/resources/' + encodeURIComponent(resourceId) + '/slots?' + query.toString(),
    )
  }
  createScheduleSlot(spaceId: string, input: import('../types/admin').CreateScheduleSlotInput) {
    return this.request<import('../types/admin').AdminScheduleSlot>(this.spacePath(spaceId) + '/slots', {
      method: 'POST', body: JSON.stringify(input),
    })
  }
  createSlotSeries(spaceId: string, input: import('../types/admin').CreateSlotSeriesInput) {
    return this.request<unknown>(this.spacePath(spaceId) + '/slot-series', {
      method: 'POST', body: JSON.stringify(input),
    })
  }
  updateScheduleSlot(spaceId: string, slotId: string, input: import('../types/admin').UpdateScheduleSlotInput) {
    return this.request<import('../types/admin').AdminScheduleSlot | AdminSeriesEditResult>(
      this.spacePath(spaceId) + '/slots/' + encodeURIComponent(slotId),
      { method: 'PATCH', body: JSON.stringify(input) },
    )
  }
  setScheduleSlotFrozen(spaceId: string, slotId: string, frozen: boolean) {
    return this.request<import('../types/admin').AdminScheduleSlot>(
      this.spacePath(spaceId) + '/slots/' + encodeURIComponent(slotId) + '/' + (frozen ? 'freeze' : 'unfreeze'),
      { method: 'POST' },
    )
  }

  listBookings(spaceId: string, filters: BookingFilters = {}) {
    const query = new URLSearchParams()
    if (filters.from) query.set('from', filters.from)
    if (filters.to) query.set('to', filters.to)
    if (filters.status) query.set('status', filters.status)
    if (filters.resourceId) query.set('resourceId', filters.resourceId)
    if (filters.participantId) query.set('participantId', filters.participantId)
    if (filters.slotTypeId) query.set('slotTypeId', filters.slotTypeId)
    const suffix = query.size ? '?' + query.toString() : ''
    return this.request<AdminBooking[]>(this.spacePath(spaceId) + '/bookings' + suffix)
  }
  getBooking(spaceId: string, bookingId: string) {
    return this.request<AdminBooking>(
      this.spacePath(spaceId) + '/bookings/' + encodeURIComponent(bookingId),
    )
  }
  updateBooking(spaceId: string, bookingId: string, input: UpdateAdminBookingInput) {
    return this.request<AdminBooking>(
      this.spacePath(spaceId) + '/bookings/' + encodeURIComponent(bookingId),
      { method: 'PATCH', body: JSON.stringify(input) },
    )
  }
  cancelBooking(spaceId: string, bookingId: string) {
    return this.request<AdminBooking>(
      this.spacePath(spaceId) + '/bookings/' + encodeURIComponent(bookingId) + '/cancel',
      { method: 'POST' },
    )
  }
  completeBooking(spaceId: string, bookingId: string) {
    return this.request<AdminBooking>(
      this.spacePath(spaceId) + '/bookings/' + encodeURIComponent(bookingId) + '/complete',
      { method: 'POST' },
    )
  }

  listMembers(spaceId: string, filters: MemberFilters = {}) {
    const query = new URLSearchParams()
    if (filters.invitedByAdminId) query.set('invitedByAdminId', filters.invitedByAdminId)
    if (filters.inviteCodeId) query.set('inviteCodeId', filters.inviteCodeId)
    const suffix = query.size ? '?' + query.toString() : ''
    return this.request<AdminMemberSummary[]>(this.spacePath(spaceId) + '/members' + suffix)
  }
  getMember(spaceId: string, membershipId: string) {
    return this.request<AdminMemberDetail>(
      this.spacePath(spaceId) + '/members/' + encodeURIComponent(membershipId),
    )
  }
  async updateMemberAdminNote(spaceId: string, membershipId: string, adminNote: string | null) {
    await this.request<unknown>(
      this.spacePath(spaceId) + '/members/' + encodeURIComponent(membershipId),
      { method: 'PATCH', body: JSON.stringify({ adminNote }) },
    )
  }
  async updateParticipantAdminNote(spaceId: string, participantId: string, adminNote: string | null) {
    await this.request<unknown>(
      this.spacePath(spaceId) + '/participants/' + encodeURIComponent(participantId),
      { method: 'PATCH', body: JSON.stringify({ adminNote }) },
    )
  }
}

let singleton: AdminApi | null = null
export function getAdminApi(): AdminApi {
  if (!singleton) singleton = adminDataMode === 'api' ? new HttpAdminApi() : (createMockAdminApi() as AdminApi)
  return singleton
}
