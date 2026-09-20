import type {
  CreateInviteInput as SharedCreateInviteInput,
  CutoffMinutes,
  EntityStatus,
  InviteMemberSummary as SharedInviteMemberSummary,
  InviteSummary as SharedInviteSummary,
  Resource,
  SlotType,
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

export type AdminResource = Resource
export type AdminSlotType = SlotType

export type ResourceInput = {
  name: string
  note: string | null
}

export type SlotTypeInput = {
  name: string
}

export type MemberFilters = {
  invitedByAdminId?: string
  inviteCodeId?: string
}

export type AdminMemberSummary = {
  membershipId: string
  nickname: string
  joinedAt: string
  participantCount: number
  invitedByAdminId: string
  inviteCodeId: string
  status: EntityStatus
  adminNote: string | null
}

export type AdminParticipantDetail = {
  id: string
  name: string
  birthMonth: string
  status: EntityStatus
  userNote: string | null
  adminNote: string | null
}

export type AdminMemberDetail = AdminMemberSummary & {
  participants: AdminParticipantDetail[]
  bookingCount: number
}
