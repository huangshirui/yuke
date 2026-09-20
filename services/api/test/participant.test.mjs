import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { issueUserToken } from '../src/domains/identity/token'
import { findActiveParticipantForMembership } from '../src/domains/reservation/participant/repository'
import { seedBookingFixture, NOW } from './helpers/d1-fixture.mjs'

async function tokenFor(userId) {
  const issued = await issueUserToken(userId, env.USER_TOKEN_SECRET)
  return issued.accessToken
}

function userRequest(path, token, init = {}) {
  const headers = new Headers(init.headers)
  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }

  return exports.default.fetch(
    new Request(`https://example.invalid${path}`, {
      ...init,
      headers
    })
  )
}

async function createSecondMember(ids, suffix) {
  const userId = `usr_participant_second_${suffix}`
  const membershipId = `mem_participant_second_${suffix}`

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (
        id, wechat_openid, nickname, last_space_id, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      userId,
      `openid-participant-second-${suffix}`,
      'Synthetic Second User',
      ids.space,
      NOW,
      NOW
    ),
    env.DB.prepare(`
      INSERT INTO space_memberships (
        id, space_id, user_id, invited_by_admin_id, invite_code_id,
        status, joined_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      membershipId,
      ids.space,
      userId,
      ids.admin,
      ids.invite,
      NOW,
      NOW
    )
  ])

  return {
    userId,
    membershipId,
    token: await tokenFor(userId)
  }
}

describe('Participant backend', () => {
  it('requires an active SpaceMembership', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`participant-access-${suffix}`)
    const token = await tokenFor(ids.user)

    const unauthenticated = await userRequest(
      `/v1/spaces/${ids.space}/participants`,
      null
    )
    expect(unauthenticated.status).toBe(401)

    const otherIds = await seedBookingFixture(`participant-other-space-${suffix}`)
    const forbidden = await userRequest(
      `/v1/spaces/${otherIds.space}/participants`,
      token
    )
    expect(forbidden.status).toBe(403)
    await expect(forbidden.json()).resolves.toMatchObject({
      error: { code: 'SPACE_ACCESS_DENIED' }
    })
  })

  it('creates, lists, updates and toggles only the current member participants', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`participant-crud-${suffix}`)
    const token = await tokenFor(ids.user)

    const create = await userRequest(
      `/v1/spaces/${ids.space}/participants`,
      token,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: '  Synthetic Child  ',
          birthMonth: '2011-08',
          note: '  Synthetic visible note  '
        })
      }
    )

    expect(create.status).toBe(201)
    const created = (await create.json()).data
    expect(created).toMatchObject({
      spaceId: ids.space,
      name: 'Synthetic Child',
      birthMonth: '2011-08',
      note: 'Synthetic visible note',
      status: 'active'
    })
    expect(created.adminNote).toBeUndefined()

    await env.DB.prepare(
      'UPDATE participants SET admin_note = ? WHERE id = ?'
    ).bind('Synthetic private admin note', created.id).run()

    const list = await userRequest(
      `/v1/spaces/${ids.space}/participants`,
      token
    )
    expect(list.status).toBe(200)
    const listed = (await list.json()).data
    const listedCreated = listed.find((participant) => participant.id === created.id)
    expect(listedCreated).toMatchObject({
      note: 'Synthetic visible note',
      status: 'active'
    })
    expect(listedCreated.adminNote).toBeUndefined()
    expect(JSON.stringify(listedCreated)).not.toContain('private admin note')

    const patch = await userRequest(
      `/v1/spaces/${ids.space}/participants/${created.id}`,
      token,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Synthetic Renamed Child',
          note: null
        })
      }
    )
    expect(patch.status).toBe(200)
    await expect(patch.json()).resolves.toMatchObject({
      data: {
        id: created.id,
        name: 'Synthetic Renamed Child',
        birthMonth: '2011-08',
        note: null,
        status: 'active'
      }
    })

    const deactivate = await userRequest(
      `/v1/spaces/${ids.space}/participants/${created.id}/deactivate`,
      token,
      { method: 'POST' }
    )
    expect(deactivate.status).toBe(200)
    await expect(deactivate.json()).resolves.toMatchObject({
      data: { id: created.id, status: 'inactive' }
    })

    expect(
      await findActiveParticipantForMembership(env.DB, {
        spaceId: ids.space,
        membershipId: ids.membership,
        participantId: created.id
      })
    ).toBeNull()

    const activate = await userRequest(
      `/v1/spaces/${ids.space}/participants/${created.id}/activate`,
      token,
      { method: 'POST' }
    )
    expect(activate.status).toBe(200)
    await expect(activate.json()).resolves.toMatchObject({
      data: { id: created.id, status: 'active' }
    })
  })

  it('enforces strict YYYY-MM validation and non-empty updates', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`participant-validation-${suffix}`)
    const token = await tokenFor(ids.user)

    for (const birthMonth of ['2012-9', '2012-00', '2012-13', 'abcd-09']) {
      const response = await userRequest(
        `/v1/spaces/${ids.space}/participants`,
        token,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'Synthetic Invalid Participant',
            birthMonth
          })
        }
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'VALIDATION_ERROR' }
      })
    }

    const emptyPatch = await userRequest(
      `/v1/spaces/${ids.space}/participants/${ids.participant}`,
      token,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      }
    )
    expect(emptyPatch.status).toBe(400)
  })

  it('does not reveal or mutate another member participant in the same Space', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`participant-owner-${suffix}`)
    const ownerToken = await tokenFor(ids.user)
    const second = await createSecondMember(ids, suffix)

    const ownerList = await userRequest(
      `/v1/spaces/${ids.space}/participants`,
      ownerToken
    )
    expect((await ownerList.json()).data.map((item) => item.id)).toContain(
      ids.participant
    )

    const secondList = await userRequest(
      `/v1/spaces/${ids.space}/participants`,
      second.token
    )
    expect(secondList.status).toBe(200)
    expect((await secondList.json()).data).toEqual([])

    const patch = await userRequest(
      `/v1/spaces/${ids.space}/participants/${ids.participant}`,
      second.token,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Synthetic Unauthorized Rename' })
      }
    )
    expect(patch.status).toBe(404)
    await expect(patch.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' }
    })

    const deactivate = await userRequest(
      `/v1/spaces/${ids.space}/participants/${ids.participant}/deactivate`,
      second.token,
      { method: 'POST' }
    )
    expect(deactivate.status).toBe(404)

    const row = await env.DB.prepare(
      'SELECT name, status FROM participants WHERE id = ?'
    ).bind(ids.participant).first()
    expect(row).toEqual({
      name: `Synthetic Participant participant-owner-${suffix}`,
      status: 'active'
    })
  })
})
