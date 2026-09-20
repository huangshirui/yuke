import type { ApiResponse, SpaceSettings } from '@yuke/shared'
import type {
  AdminSpace,
  AdminUserSummary,
  CreateInviteInput,
  CreateSpaceInput,
  InviteMemberSummary,
  InviteSummary,
  UpdateSpaceInput,
  UpdateSpaceSettingsInput,
} from '../types/admin'
import { createMockAdminApi } from './mockAdminApi.mjs'

export interface AdminApi {
  listSpaces(): Promise<AdminSpace[]>
  createSpace(input: CreateSpaceInput): Promise<AdminSpace>
  updateSpace(spaceId: string, input: UpdateSpaceInput): Promise<AdminSpace>
  setSpaceStatus(spaceId: string, status: 'active' | 'disabled'): Promise<AdminSpace>
  getSettings(spaceId: string): Promise<SpaceSettings>
  updateSettings(spaceId: string, input: UpdateSpaceSettingsInput): Promise<SpaceSettings>
  listAdmins(spaceId: string): Promise<AdminUserSummary[]>
  addAdmin(spaceId: string, adminUserId: string): Promise<AdminUserSummary>
  removeAdmin(spaceId: string, adminUserId: string): Promise<void>
  listInvites(spaceId: string): Promise<InviteSummary[]>
  createInvite(spaceId: string, input: CreateInviteInput): Promise<InviteSummary>
  revokeInvite(spaceId: string, inviteId: string): Promise<InviteSummary>
  listInviteMembers(spaceId: string, inviteId: string): Promise<InviteMemberSummary[]>
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
export const adminDataMode = import.meta.env.VITE_ADMIN_DATA_MODE === 'api' ? 'api' : 'mock'

class HttpAdminApi implements AdminApi {
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(baseUrl + '/v1' + path, {
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...init?.headers },
      ...init,
    })
    let payload: ApiResponse<T> | null = null
    try { payload = (await response.json()) as ApiResponse<T> } catch { payload = null }
    if (!response.ok || !payload || 'error' in payload) {
      throw new Error(payload && 'error' in payload ? payload.error.message : '请求失败，请稍后重试。')
    }
    return payload.data
  }

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
    return this.request<AdminSpace>('/admin/spaces/' + encodeURIComponent(spaceId), {
      method: 'PATCH', body: JSON.stringify(input),
    })
  }
  async setSpaceStatus(spaceId: string, status: 'active' | 'disabled') {
    await this.request<unknown>(
      '/admin/spaces/' + encodeURIComponent(spaceId) + '/' + (status === 'active' ? 'activate' : 'disable'),
      { method: 'POST' },
    )
    const space = (await this.listSpaces()).find((item) => item.id === spaceId)
    if (!space) throw new Error('空间状态已更新，但无法重新读取空间。')
    return space
  }
  getSettings(spaceId: string) {
    return this.request<SpaceSettings>('/admin/spaces/' + encodeURIComponent(spaceId) + '/settings')
  }
  updateSettings(spaceId: string, input: UpdateSpaceSettingsInput) {
    return this.request<SpaceSettings>('/admin/spaces/' + encodeURIComponent(spaceId) + '/settings', {
      method: 'PATCH', body: JSON.stringify(input),
    })
  }
  listAdmins(spaceId: string) {
    return this.request<AdminUserSummary[]>('/admin/spaces/' + encodeURIComponent(spaceId) + '/admins')
  }
  addAdmin(spaceId: string, adminUserId: string) {
    return this.request<AdminUserSummary>('/admin/spaces/' + encodeURIComponent(spaceId) + '/admins', {
      method: 'POST', body: JSON.stringify({ adminUserId }),
    })
  }
  async removeAdmin(spaceId: string, adminUserId: string) {
    await this.request<unknown>(
      '/admin/spaces/' + encodeURIComponent(spaceId) + '/admins/' + encodeURIComponent(adminUserId),
      { method: 'DELETE' },
    )
  }
  listInvites(spaceId: string) {
    return this.request<InviteSummary[]>('/admin/spaces/' + encodeURIComponent(spaceId) + '/invites')
  }
  createInvite(spaceId: string, input: CreateInviteInput) {
    return this.request<InviteSummary>('/admin/spaces/' + encodeURIComponent(spaceId) + '/invites', {
      method: 'POST', body: JSON.stringify(input),
    })
  }
  revokeInvite(spaceId: string, inviteId: string) {
    return this.request<InviteSummary>(
      '/admin/spaces/' + encodeURIComponent(spaceId) + '/invites/' + encodeURIComponent(inviteId) + '/revoke',
      { method: 'POST' },
    )
  }
  listInviteMembers(spaceId: string, inviteId: string) {
    return this.request<InviteMemberSummary[]>(
      '/admin/spaces/' + encodeURIComponent(spaceId) + '/invites/' + encodeURIComponent(inviteId) + '/members',
    )
  }
}

let singleton: AdminApi | null = null
export function getAdminApi(): AdminApi {
  if (!singleton) singleton = adminDataMode === 'api' ? new HttpAdminApi() : (createMockAdminApi() as AdminApi)
  return singleton
}
