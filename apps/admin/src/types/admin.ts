import type {
  AdminBookingDetail as SharedAdminBookingDetail,
  AdminMemberDetail as SharedAdminMemberDetail,
  AdminMemberSummary as SharedAdminMemberSummary,
  AdminParticipantDetail as SharedAdminParticipantDetail,
  AdminSlot as SharedAdminSlot,
  BookingStatus,
  CurrentAdmin as SharedCurrentAdmin,
  CreateInviteInput as SharedCreateInviteInput,
  CutoffMinutes,
  EntityStatus,
  InviteMemberSummary as SharedInviteMemberSummary,
  InviteSummary as SharedInviteSummary,
  Resource,
  SeriesEditResult,
  SlotType,
  SpaceAdminSummary,
  SpaceSettings,
  SpaceSummary
} from '@yuke/shared'

export type AdminSpace = SpaceSummary
export type CurrentAdmin = SharedCurrentAdmin

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

export type AdminMemberSummary = SharedAdminMemberSummary
export type AdminParticipantDetail = SharedAdminParticipantDetail
export type AdminMemberDetail = SharedAdminMemberDetail

export type AdminScheduleSlot = SharedAdminSlot & {
  slotTypeName?: string
}

export type CreateScheduleSlotInput = {
  resourceId: string
  slotTypeId: string
  startAt: string
  endAt: string
}

export type CreateSlotSeriesInput = {
  resourceId: string
  slotTypeId: string
  weekdays: number[]
  localStartTime: string
  localEndTime: string
  startsOn: string
  endsOn: string | null
}

export type UpdateScheduleSlotInput = {
  scope: 'single' | 'this_and_future' | 'entire_series'
  slotTypeId?: string
  startAt?: string
  endAt?: string
  weekdays?: number[]
  localStartTime?: string
  localEndTime?: string
  endsOn?: string | null
}

export type AdminSeriesEditResult = SeriesEditResult


export type AdminBooking = SharedAdminBookingDetail

export type BookingFilters = {
  from?: string
  to?: string
  status?: BookingStatus
  resourceId?: string
  participantId?: string
  slotTypeId?: string
  membershipId?: string
}
