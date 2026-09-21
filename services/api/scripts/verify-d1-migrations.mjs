import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const wrangler = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler'
const database = 'yuke-local'
const serviceRoot = new URL('..', import.meta.url)
const migrationsDir = new URL('../migrations/', import.meta.url)
const persistTo = mkdtempSync(join(tmpdir(), 'yuke-d1-verify-'))

function verifyRemoteParserSafety() {
  const sqlFiles = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()

  for (const name of sqlFiles) {
    const content = readFileSync(new URL(name, migrationsDir), 'utf8')
    const lineComment = content
      .split(/\r?\n/)
      .findIndex((line) => /^\s*--/.test(line))

    if (lineComment >= 0) {
      throw new Error(
        `D1 migration ${name} contains a -- line comment at line ${lineComment + 1}. ` +
        'Remote D1 migration statement splitting has known parser hazards around SQL line comments; ' +
        'keep migration SQL comment-free and document intent outside the migration file.'
      )
    }
  }
}

function run(args, { expectFailure = false, mustInclude = [] } = {}) {
  const result = spawnSync(wrangler, args, {
    cwd: serviceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
    },
    input: 'y\n',
  })

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n')

  if (expectFailure) {
    if (result.status === 0) {
      throw new Error(`Expected command to fail: wrangler ${args.join(' ')}\n${output}`)
    }
  } else if (result.status !== 0) {
    throw new Error(`Command failed: wrangler ${args.join(' ')}\n${output}`)
  }

  for (const expected of mustInclude) {
    if (!output.includes(expected)) {
      throw new Error(
        `Expected output to include "${expected}" for: wrangler ${args.join(' ')}\n${output}`,
      )
    }
  }

  return output
}

function localArgs(commandArgs) {
  return [
    ...commandArgs,
    '--local',
    '--persist-to',
    persistTo,
  ]
}

try {
  verifyRemoteParserSafety()

  // Fresh local database: apply every migration.
  run(localArgs(['d1', 'migrations', 'apply', database]))

  // Re-applying migrations must be safe and leave the schema unchanged.
  run(localArgs(['d1', 'migrations', 'apply', database]))

  // Verify that Wrangler tracked the migration and created representative
  // tables, indexes, and triggers from the canonical migration.
  run(
    localArgs([
      'd1',
      'execute',
      database,
      '--command',
      [
        "SELECT name FROM d1_migrations WHERE name = '0001_initial.sql';",
        "SELECT name FROM d1_migrations WHERE name = '0002_admin_identity_binding.sql';",
        "SELECT name FROM pragma_table_info('admin_users') WHERE name = 'identity_status';",
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bookings';",
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'ux_bookings_slot_occupancy';",
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_slots_no_overlap_insert';",
      ].join(' '),
    ]),
    {
      mustInclude: [
        '0001_initial.sql',
        '0002_admin_identity_binding.sql',
        'identity_status',
        'bookings',
        'ux_bookings_slot_occupancy',
        'trg_slots_no_overlap_insert',
      ],
    },
  )

  // D1 enforces foreign keys by default. A child row without its Space must fail.
  run(
    localArgs([
      'd1',
      'execute',
      database,
      '--command',
      "INSERT INTO space_settings(space_id, updated_at) VALUES ('sp_missing', 1);",
    ]),
    {
      expectFailure: true,
      mustInclude: ['FOREIGN KEY constraint failed'],
    },
  )

  // Synthetic-only setup for behavioral constraint verification.
  run(
    localArgs([
      'd1',
      'execute',
      database,
      '--command',
      [
        "INSERT INTO admin_users(id, access_subject, email, platform_role, status, created_at, updated_at) VALUES ('adm_synthetic', 'cf-synthetic-subject', 'admin@example.invalid', 'super_admin', 'active', 1, 1);",
        "INSERT INTO spaces(id, name, timezone, status, created_at, updated_at) VALUES ('sp_synthetic', 'Synthetic Space', 'Asia/Shanghai', 'active', 1, 1);",
        "INSERT INTO users(id, wechat_openid, nickname, last_space_id, status, created_at, updated_at) VALUES ('usr_synthetic', 'openid-synthetic', 'Synthetic User', 'sp_synthetic', 'active', 1, 1);",
        "INSERT INTO invite_codes(id, space_id, created_by_admin_id, code, expires_at, status, created_at) VALUES ('inv_synthetic', 'sp_synthetic', 'adm_synthetic', 'synthetic-invite-code', 4102444800000, 'active', 1);",
        "INSERT INTO space_memberships(id, space_id, user_id, invited_by_admin_id, invite_code_id, status, joined_at, updated_at) VALUES ('mem_synthetic', 'sp_synthetic', 'usr_synthetic', 'adm_synthetic', 'inv_synthetic', 'active', 1, 1);",
        "INSERT INTO participants(id, space_id, membership_id, name, birth_month, status, created_at, updated_at) VALUES ('par_synthetic', 'sp_synthetic', 'mem_synthetic', 'Synthetic Participant', '2012-09', 'active', 1, 1);",
        "INSERT INTO slot_types(id, space_id, name, status, created_at, updated_at) VALUES ('sty_synthetic', 'sp_synthetic', 'Synthetic Type', 'active', 1, 1);",
        "INSERT INTO resources(id, space_id, name, status, created_at, updated_at) VALUES ('res_synthetic', 'sp_synthetic', 'Synthetic Resource', 'active', 1, 1);",
        "INSERT INTO slots(id, space_id, resource_id, slot_type_id, start_at, end_at, local_date, status, created_by_admin_id, created_at, updated_at) VALUES ('slot_primary', 'sp_synthetic', 'res_synthetic', 'sty_synthetic', 10000, 20000, '2026-09-21', 'open', 'adm_synthetic', 1, 1);",
        "INSERT INTO bookings(id, space_id, slot_id, membership_id, participant_id, status, created_at, updated_at) VALUES ('booking_primary', 'sp_synthetic', 'slot_primary', 'mem_synthetic', 'par_synthetic', 'booked', 1, 1);",
      ].join(' '),
    ]),
  )

  // The overlap trigger must be active.
  run(
    localArgs([
      'd1',
      'execute',
      database,
      '--command',
      "INSERT INTO slots(id, space_id, resource_id, slot_type_id, start_at, end_at, local_date, status, created_by_admin_id, created_at, updated_at) VALUES ('slot_overlap', 'sp_synthetic', 'res_synthetic', 'sty_synthetic', 15000, 18000, '2026-09-21', 'open', 'adm_synthetic', 1, 1);",
    ]),
    {
      expectFailure: true,
      mustInclude: ['SLOT_OVERLAP'],
    },
  )

  // The partial unique index must enforce capacity=1.
  run(
    localArgs([
      'd1',
      'execute',
      database,
      '--command',
      "INSERT INTO bookings(id, space_id, slot_id, membership_id, participant_id, status, created_at, updated_at) VALUES ('booking_conflict', 'sp_synthetic', 'slot_primary', 'mem_synthetic', 'par_synthetic', 'booked', 2, 2);",
    ]),
    {
      expectFailure: true,
      mustInclude: ['UNIQUE constraint failed: bookings.slot_id'],
    },
  )

  console.log('D1 local migration verification passed.')
} finally {
  rmSync(persistTo, { recursive: true, force: true })
}
