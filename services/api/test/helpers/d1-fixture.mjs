import { env } from 'cloudflare:workers'

const NOW = 1_700_000_000_000

function id(prefix, suffix) {
  return `${prefix}_${suffix}`
}

export async function seedBookingFixture(suffix) {
  const ids = {
    admin: id('adm', suffix),
    space: id('spc', suffix),
    user: id('usr', suffix),
    invite: id('inv', suffix),
    membership: id('mem', suffix),
    participant: id('par', suffix),
    slotType: id('sty', suffix),
    resource: id('res', suffix)
  }

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO admin_users
        (id, access_subject, email, display_name, platform_role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      ids.admin,
      `access-${suffix}`,
      `${suffix}@example.invalid`,
      `Synthetic Operator ${suffix}`,
      'super_admin',
      'active',
      NOW,
      NOW
    ),
    env.DB.prepare(`
      INSERT INTO spaces (id, name, timezone, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(ids.space, `Synthetic Space ${suffix}`, 'Asia/Shanghai', 'active', NOW, NOW),
    env.DB.prepare(`
      INSERT INTO space_settings
        (space_id, cancellation_cutoff_minutes, booking_cutoff_minutes, updated_at)
      VALUES (?, ?, ?, ?)
    `).bind(ids.space, 60, 60, NOW),
    env.DB.prepare(`
      INSERT INTO users
        (id, wechat_openid, nickname, last_space_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      ids.user,
      `openid-${suffix}`,
      `Synthetic User ${suffix}`,
      ids.space,
      'active',
      NOW,
      NOW
    ),
    env.DB.prepare(`
      INSERT INTO space_admins (space_id, admin_user_id, created_at)
      VALUES (?, ?, ?)
    `).bind(ids.space, ids.admin, NOW),
    env.DB.prepare(`
      INSERT INTO invite_codes
        (id, space_id, created_by_admin_id, code, label, expires_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      ids.invite,
      ids.space,
      ids.admin,
      `SYNTHETIC-INVITE-${suffix}`,
      'Synthetic fixture',
      NOW + 86_400_000,
      'active',
      NOW
    ),
    env.DB.prepare(`
      INSERT INTO space_memberships
        (id, space_id, user_id, invited_by_admin_id, invite_code_id, status, joined_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      ids.membership,
      ids.space,
      ids.user,
      ids.admin,
      ids.invite,
      'active',
      NOW,
      NOW
    ),
    env.DB.prepare(`
      INSERT INTO participants
        (id, space_id, membership_id, name, birth_month, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      ids.participant,
      ids.space,
      ids.membership,
      `Synthetic Participant ${suffix}`,
      '2012-09',
      'active',
      NOW,
      NOW
    ),
    env.DB.prepare(`
      INSERT INTO slot_types (id, space_id, name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(ids.slotType, ids.space, `Synthetic Type ${suffix}`, 'active', NOW, NOW),
    env.DB.prepare(`
      INSERT INTO resources (id, space_id, name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(ids.resource, ids.space, `Synthetic Resource ${suffix}`, 'active', NOW, NOW)
  ])

  return ids
}

export async function insertSlot(ids, {
  id: slotId,
  startAt,
  endAt,
  status = 'open',
  localDate = '2026-09-21'
}) {
  return env.DB.prepare(`
    INSERT INTO slots
      (id, space_id, resource_id, slot_type_id, start_at, end_at, local_date, status,
       created_by_admin_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    slotId,
    ids.space,
    ids.resource,
    ids.slotType,
    startAt,
    endAt,
    localDate,
    status,
    ids.admin,
    NOW,
    NOW
  ).run()
}

export async function insertBooking(ids, {
  id: bookingId,
  slotId,
  status = 'booked'
}) {
  return env.DB.prepare(`
    INSERT INTO bookings
      (id, space_id, slot_id, membership_id, participant_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    bookingId,
    ids.space,
    slotId,
    ids.membership,
    ids.participant,
    status,
    NOW,
    NOW
  ).run()
}

export { NOW }
