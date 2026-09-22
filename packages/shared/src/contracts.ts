export type Id = string

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'SPACE_ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'SLOT_ALREADY_BOOKED'
  | 'SLOT_OVERLAP'
  | 'SLOT_FROZEN'
  | 'SLOT_NOT_BOOKABLE'
  | 'BOOKING_CUTOFF_REACHED'
  | 'CANCELLATION_CUTOFF_REACHED'
  | 'SERIES_BOOKING_CONFLICT'
  | 'INVITE_EXPIRED'
  | 'INVITE_REVOKED'
  | 'SPACE_DISABLED'
  | 'INTERNAL_ERROR'

export type ApiError = {
  code: ApiErrorCode
  message: string
  details?: unknown
}

export type ApiResponse<T> =
  | { data: T; error?: never }
  | { data?: never; error: ApiError }

export const CUTOFF_MINUTES = [15, 30, 60, 240, 1440] as const

export type CutoffMinutes = (typeof CUTOFF_MINUTES)[number] | null

export type SpaceStatus = 'active' | 'disabled'
export type EntityStatus = 'active' | 'inactive'
export type InviteStatus = 'active' | 'revoked'
export type SlotStatus = 'open' | 'frozen' | 'cancelled'
export type SlotSeriesStatus = 'active' | 'ended' | 'cancelled'
export type BookingStatus = 'booked' | 'cancelled' | 'completed'
export type BookingCompletionSource =
  | 'manual'
  | 'classin_import'
  | 'external_import'
  | 'external_api'
export type BookingReconciliationStatus = 'pending' | 'settled'
export type BookingReconciliationSource = 'manual' | 'import' | 'external_api'
export type SeriesEditScope = 'single' | 'this_and_future' | 'entire_series'
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type SpaceSettings = {
  bookingCutoffMinutes: CutoffMinutes
  cancellationCutoffMinutes: CutoffMinutes
}

export type SpaceSummary = {
  id: Id
  name: string
  timezone: string
  status: SpaceStatus
}

export type Participant = {
  id: Id
  spaceId: Id
  name: string
  birthMonth: string
  note: string | null
  status: EntityStatus
}

export type Resource = {
  id: Id
  spaceId: Id
  name: string
  note: string | null
  status: EntityStatus
}

export type SlotType = {
  id: Id
  spaceId: Id
  name: string
  status: EntityStatus
}

export type CreateResourceInput = {
  name: string
  note?: string | null
}

export type UpdateResourceInput = {
  name?: string
  note?: string | null
}

export type CreateSlotTypeInput = {
  name: string
}

export type UpdateSlotTypeInput = {
  name?: string
}

export type Slot = {
  id: Id
  spaceId: Id
  resourceId: Id
  slotTypeId: Id
  seriesId: Id | null
  startAt: string
  endAt: string
  localDate: string
  status: SlotStatus
  bookable: boolean
}

export type AdminSlotBookingProjection = {
  id: Id
  status: Extract<BookingStatus, 'booked' | 'completed'>
  membershipId: Id
  userNickname: string
  participantId: Id
  participantName: string
  reconciliationStatus: BookingReconciliationStatus | null
}

export type AdminSlot = Slot & {
  // Admin calendar list populates this projection. Mutation responses may omit it.
  booking?: AdminSlotBookingProjection | null
}

export type Booking = {
  id: Id
  spaceId: Id
  slotId: Id
  participantId: Id
  status: BookingStatus
  createdAt: string
  updatedAt: string
}

export type BookingDetail = Booking & {
  participant: {
    id: Id
    name: string
    birthMonth: string
    status: EntityStatus
  }
  resource: {
    id: Id
    name: string
    status: EntityStatus
  }
  slotType: {
    id: Id
    name: string
    status: EntityStatus
  }
  slot: {
    id: Id
    startAt: string
    endAt: string
    localDate: string
    status: SlotStatus
  }
}

export type BookingCompletion = {
  completedAt: string
  source: BookingCompletionSource | null
  externalReference: string | null
  batchId: string | null
}

export type BookingReconciliation = {
  status: BookingReconciliationStatus
  settledAt: string | null
  source: BookingReconciliationSource | null
  settledByAdminId: Id | null
  batchId: string | null
  note: string | null
}

export type AdminBookingDetail = BookingDetail & {
  membershipId: Id
  userNickname: string
  invitedByAdminDisplayName: string | null
  invitedByAdminEmail: string
  completion: BookingCompletion | null
  reconciliation: BookingReconciliation | null
}

export type BookingMessage = {
  id: Id
  bookingId: Id
  senderKind: 'user' | 'admin'
  body: string
  createdAt: string
}

export type JoinSpaceInput = {
  inviteCode: string
}

export type CreateParticipantInput = {
  name: string
  birthMonth: string
  note?: string | null
}

export type UpdateParticipantInput = Partial<CreateParticipantInput>

export type CreateBookingInput = {
  slotId: Id
  participantId: Id
}

export type CreateSlotInput = {
  resourceId: Id
  slotTypeId: Id
  startAt: string
  endAt: string
}

export type CreateSlotSeriesInput = {
  resourceId: Id
  slotTypeId: Id
  weekdays: IsoWeekday[]
  localStartTime: string
  localEndTime: string
  startsOn: string
  endsOn: string | null
}

export type UpdateSeriesSlotInput = {
  scope: SeriesEditScope
  slotTypeId?: Id
  weekdays?: IsoWeekday[]
  localStartTime?: string
  localEndTime?: string
  startsOn?: string
  endsOn?: string | null
}

export type SlotSeriesSummary = {
  id: Id
  spaceId: Id
  resourceId: Id
  slotTypeId: Id
  weekdays: IsoWeekday[]
  localStartTime: string
  localEndTime: string
  startsOn: string
  endsOn: string | null
  status: SlotSeriesStatus
  supersedesSeriesId: Id | null
}

export type SeriesEditResult = {
  scope: Exclude<SeriesEditScope, 'single'>
  series: SlotSeriesSummary
  retiredSlotIds: Id[]
  materializedCount: number
}

export type UpdateAdminBookingInput = {
  slotId?: Id
  participantId?: Id
}

// Compatibility alias for the initial repository stub.
export type ReservationStatus = BookingStatus


export type UserProfile = {
  id: Id
  nickname: string
  avatarUrl: string | null
  profileInitialized: boolean
  currentSpaceId: Id | null
  spaces: SpaceSummary[]
}

export type WeChatSessionInput = {
  code: string
}

export type WeChatSessionResponse = {
  tokenType: 'Bearer'
  accessToken: string
  expiresAt: string
  user: UserProfile
}

export type UpdateUserProfileInput = {
  nickname: string
}

export type SpaceDetail = SpaceSummary & {
  settings: SpaceSettings
}

export type SpaceAdminSummary = {
  id: Id
  displayName: string | null
  email: string
  platformRole: 'none' | 'super_admin'
  status: EntityStatus
}

export type AdminIdentityStatus = 'pending' | 'bound'

export type AdminUserSummary = {
  id: Id
  displayName: string | null
  email: string
  platformRole: 'none' | 'super_admin'
  status: EntityStatus
  identityStatus: AdminIdentityStatus
}

export type CurrentAdmin = {
  id: Id
  displayName: string | null
  email: string
  platformRole: 'none' | 'super_admin'
}

export type CreateAdminUserInput = {
  email: string
  displayName?: string
}

export type UpdateAdminUserInput = {
  displayName: string
}

export type CreateSpaceInput = {
  name: string
  timezone: string
  bookingCutoffMinutes: CutoffMinutes
  cancellationCutoffMinutes: CutoffMinutes
}

export type UpdateSpaceInput = {
  name?: string
  timezone?: string
}

export type UpdateSpaceSettingsInput = {
  bookingCutoffMinutes?: CutoffMinutes
  cancellationCutoffMinutes?: CutoffMinutes
}

export type AssignSpaceAdminInput = {
  adminUserId: Id
}

export type InviteSummary = {
  id: Id
  spaceId: Id
  label: string | null
  code: string
  expiresAt: string
  status: InviteStatus
  createdByAdminId: Id
  memberCount: number
}

export type InviteMemberSummary = {
  membershipId: Id
  nickname: string
  joinedAt: string
  participantCount: number
  invitedByAdminId: Id
  invitedByAdminDisplayName: string | null
  invitedByAdminEmail: string
  inviteCodeId: Id
}

export type AdminMemberSummary = {
  membershipId: Id
  nickname: string
  joinedAt: string
  participantCount: number
  invitedByAdminId: Id
  invitedByAdminDisplayName: string | null
  invitedByAdminEmail: string
  inviteCodeId: Id
  status: EntityStatus
  adminNote: string | null
}

export type AdminParticipantDetail = {
  id: Id
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

export type UpdateAdminNoteInput = {
  adminNote: string | null
}

export type CreateInviteInput = {
  label: string | null
  expiresAt: string
}

export type SpaceMembershipSummary = {
  id: Id
  spaceId: Id
  invitedByAdminId: Id
  inviteCodeId: Id
  status: EntityStatus
  joinedAt: string
}

export type JoinSpaceResponse = {
  membership: SpaceMembershipSummary
  space: SpaceSummary
  currentSpaceId: Id
}

export type UpdateCurrentSpaceInput = {
  spaceId: Id
}

export type CurrentSpaceResponse = {
  currentSpaceId: Id
}

