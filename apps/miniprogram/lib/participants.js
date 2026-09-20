const BIRTH_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

function isBirthMonth(value) {
  return BIRTH_MONTH_PATTERN.test(String(value || ''))
}

function normalizeParticipantInput(input) {
  const name = String(input?.name || '').trim()
  const birthMonth = String(input?.birthMonth || '').trim()
  const note = String(input?.note || '').trim()

  if (!name) {
    const error = new Error('请填写参与人名称')
    error.code = 'VALIDATION_ERROR'
    throw error
  }

  if (!isBirthMonth(birthMonth)) {
    const error = new Error('请选择有效的出生年月')
    error.code = 'VALIDATION_ERROR'
    throw error
  }

  return {
    name,
    birthMonth,
    note: note || null
  }
}

function bookableParticipants(participants) {
  return Array.isArray(participants)
    ? participants.filter((participant) => participant?.status === 'active')
    : []
}

function sortParticipants(participants) {
  return [...(Array.isArray(participants) ? participants : [])].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'active' ? -1 : 1
    }
    return String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN')
  })
}

module.exports = {
  isBirthMonth,
  normalizeParticipantInput,
  bookableParticipants,
  sortParticipants
}
