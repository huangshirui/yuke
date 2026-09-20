import type {
  CreateInviteInput as SharedCreateInviteInput,
  CutoffMinutes,
  InviteMemberSummary as SharedInviteMemberSummary,
  InviteSummary as SharedInviteSummary,
  SpaceAdminSummary,
  SpaceSettings,
  SpaceSummary
} from '@yuke/shared'

export type AdminSpace = SpaceSummary

export type AdminUserSummary = SpaceAdminSummary

export type InviteSummary = SharedInviteSummary
export type InviteMemberSummary = SharedInviteMemberSummary

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

export type CreateInviteInput = SharedCreateInviteInput
