import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

describe('D1 migration gate', () => {
  it('applies the migration set to an empty isolated D1 database', async () => {
    const tables = await env.DB.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*'
      ORDER BY name
    `).all()

    expect(tables.results.map(({ name }) => name)).toEqual([
      'admin_users',
      'booking_history',
      'booking_messages',
      'booking_reconciliations',
      'bookings',
      'd1_migrations',
      'invite_codes',
      'participants',
      'resources',
      'slot_series',
      'slot_series_weekdays',
      'slot_types',
      'slots',
      'space_admins',
      'space_memberships',
      'space_settings',
      'spaces',
      'users'
    ])

    const migration = await env.DB.prepare(
      "SELECT name FROM d1_migrations WHERE name = '0001_initial.sql'"
    ).first()

    expect(migration?.name).toBe('0001_initial.sql')

    const adminIdentityMigration = await env.DB.prepare(
      "SELECT name FROM d1_migrations WHERE name = '0002_admin_identity_binding.sql'"
    ).first()
    expect(adminIdentityMigration?.name).toBe('0002_admin_identity_binding.sql')

    const adminColumns = await env.DB.prepare(
      "SELECT name FROM pragma_table_info('admin_users') WHERE name = 'identity_status'"
    ).all()
    expect(adminColumns.results).toEqual([{ name: 'identity_status' }])

    const displayNameMigration = await env.DB.prepare(
      "SELECT name FROM d1_migrations WHERE name = '0005_admin_user_display_name.sql'"
    ).first()
    expect(displayNameMigration?.name).toBe('0005_admin_user_display_name.sql')

    const displayNameColumns = await env.DB.prepare(
      "SELECT name FROM pragma_table_info('admin_users') WHERE name = 'display_name'"
    ).all()
    expect(displayNameColumns.results).toEqual([{ name: 'display_name' }])

    const reconciliationMigration = await env.DB.prepare(
      "SELECT name FROM d1_migrations WHERE name = '0004_booking_fulfillment_reconciliation.sql'"
    ).first()
    expect(reconciliationMigration?.name).toBe('0004_booking_fulfillment_reconciliation.sql')

    const bookingCompletionColumns = await env.DB.prepare(`
      SELECT name
      FROM pragma_table_info('bookings')
      WHERE name IN (
        'completion_source',
        'completion_external_reference',
        'completion_batch_id'
      )
      ORDER BY name
    `).all()
    expect(bookingCompletionColumns.results).toEqual([
      { name: 'completion_batch_id' },
      { name: 'completion_external_reference' },
      { name: 'completion_source' }
    ])
  })

  it('creates the critical capacity index and overlap trigger', async () => {
    const objects = await env.DB.prepare(`
      SELECT type, name
      FROM sqlite_master
      WHERE name IN ('ux_bookings_slot_occupancy', 'trg_slots_no_overlap_insert')
      ORDER BY name
    `).all()

    expect(objects.results).toEqual([
      { type: 'trigger', name: 'trg_slots_no_overlap_insert' },
      { type: 'index', name: 'ux_bookings_slot_occupancy' }
    ])
  })
})
