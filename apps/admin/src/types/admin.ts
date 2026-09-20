import type { CutoffMinutes, SpaceAdminSummary, SpaceSettings, SpaceSummary } from '@yuke/shared'

export type AdminSpace = SpaceSummary

export type AdminUserSummary = SpaceAdminSummary

export type InviteSummary = {
  id: string
  spaceId: string
  label: string | null
  code: string
  expiresAt: string
  status: 'active' | 'revoked'
  createdByAdminId: string
  memberCount: number
}

export type InviteMemberSummary = {
  membershipId: string
  nickname: string
  joinedAt: string
  participantCount: number
}

export type CreateSpaceInput = {
  name: string
  timezone: string
  settings: SpaceSettings
}

export type UpdateSpaceInput = {
  name?: string
  timezone?: string
}

export type UpdateSpaceSettingsInput = {
  bookingCutoffMinutes: CutoffMinutes
  cancellationCutoffMinutes: CutoffMinutes
}

export type CreateInviteInput = {
  label: string | null
  expiresAt: string
}
