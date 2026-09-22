const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const pagesRoot = path.resolve(__dirname, '..', 'pages')

function collectWxssFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectWxssFiles(target)
    return entry.isFile() && entry.name.endsWith('.wxss') ? [target] : []
  })
}

test('page styles consume global color tokens instead of declaring page color values', () => {
  const violations = collectWxssFiles(pagesRoot).flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8')
    const matches = [...source.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)]
    return matches.map((match) => `${path.relative(pagesRoot, file)}: ${match[0]}`)
  })

  assert.deepEqual(violations, [])
})

test('dense list rows do not use native button layout', () => {
  const schedule = fs.readFileSync(path.join(pagesRoot, 'schedule', 'index.wxml'), 'utf8')
  const booking = fs.readFileSync(path.join(pagesRoot, 'booking', 'index.wxml'), 'utf8')
  const overview = fs.readFileSync(path.join(pagesRoot, 'overview', 'index.wxml'), 'utf8')

  assert.doesNotMatch(schedule, /<button[^>]+class="booking-row"/)
  assert.doesNotMatch(booking, /<button[^>]+class="list-row slot-card"/)
  assert.doesNotMatch(overview, /<button[^>]+class="list-row booking-card/)
})

test('schedule navigation icons avoid native button layout across iOS and Android', () => {
  const scheduleMarkup = fs.readFileSync(path.join(pagesRoot, 'schedule', 'index.wxml'), 'utf8')
  const scheduleStyles = fs.readFileSync(path.join(pagesRoot, 'schedule', 'index.wxss'), 'utf8')

  assert.doesNotMatch(scheduleMarkup, /<button[^>]+class="icon-btn"/)
  assert.equal((scheduleMarkup.match(/<view[^>]+class="icon-btn"/g) || []).length, 2)
  assert.match(scheduleStyles, /\.schedule-head__actions \{[\s\S]*?justify-content: flex-start;[\s\S]*?width: 152rpx;/)
  assert.match(scheduleStyles, /\.icon-btn \{[\s\S]*?flex: 0 0 var\(--schedule-control-size\);[\s\S]*?min-width: var\(--schedule-control-size\);[\s\S]*?max-width: var\(--schedule-control-size\);/)
})

test('profile page exposes secondary booking people and service provider entries', () => {
  const profilePage = fs.readFileSync(path.join(pagesRoot, 'me', 'index.wxml'), 'utf8')

  assert.doesNotMatch(profilePage, /bindtap="(?:browseAvailability|viewBookings)"/)
  assert.match(profilePage, /bindtap="manageParticipants"/)
  assert.match(profilePage, /bindtap="manageSpaces"/)
})

test('collection pages place actions according to task hierarchy', () => {
  const participants = fs.readFileSync(path.join(pagesRoot, 'participants', 'index.wxml'), 'utf8')
  const overview = fs.readFileSync(path.join(pagesRoot, 'overview', 'index.wxml'), 'utf8')
  const spaces = fs.readFileSync(path.join(pagesRoot, 'spaces', 'index.wxml'), 'utf8')

  assert.match(participants, /class="page-header page-header--action"/)
  assert.match(participants, /class="header-action"[^>]*>新增<\/button>/)
  assert.match(overview, /class="header-action"[^>]*>发起预约<\/button>/)
  assert.match(spaces, /class="list-row list-action-row"[^>]*>[\s\S]*?加入其他服务方[\s\S]*?<\/button>/)
  assert.doesNotMatch(spaces, /class="text-button add-provider-action"/)
})

test('booking flow keeps unavailable slots visible and preloads participants', () => {
  const markup = fs.readFileSync(path.join(pagesRoot, 'booking', 'index.wxml'), 'utf8')
  const logic = fs.readFileSync(path.join(pagesRoot, 'booking', 'index.js'), 'utf8')
  const config = fs.readFileSync(path.join(pagesRoot, 'booking', 'index.json'), 'utf8')

  assert.match(markup, /slot-card--unavailable/)
  assert.match(markup, /slot\.availabilityLabel/)
  assert.doesNotMatch(markup, /slotTypeName \|\| '时段'/)
  assert.doesNotMatch(markup, /正在加载预约人/)
  assert.match(logic, /Promise\.all\(\[/)
  assert.match(logic, /requestVersion !== this\.slotsRequestVersion/)
  assert.doesNotMatch(logic, /slots\.filter\(\(item\) => item\.bookable\)/)
  assert.match(config, /"navigationBarTitleText":"发起预约"/)
})

test('avatar and status controls have explicit compact geometry', () => {
  const profileStyles = fs.readFileSync(path.join(pagesRoot, 'profile', 'setup.wxss'), 'utf8')
  const globalStyles = fs.readFileSync(path.resolve(pagesRoot, '..', 'app.wxss'), 'utf8')

  assert.match(profileStyles, /\.avatar-button \{[\s\S]*?min-width: 152rpx;[\s\S]*?max-width: 152rpx;[\s\S]*?border-radius: var\(--radius-round\);/)
  assert.match(globalStyles, /\.header-action \{[\s\S]*?width: 152rpx;[\s\S]*?max-width: 152rpx;/)
  assert.match(globalStyles, /\.status-badge \{[\s\S]*?align-items: center;[\s\S]*?height: 44rpx;[\s\S]*?line-height: 1;/)
  assert.match(globalStyles, /\.status-badge__label \{[\s\S]*?transform: translateY\(-1rpx\);/)

  const participants = fs.readFileSync(path.join(pagesRoot, 'participants', 'index.wxml'), 'utf8')
  assert.match(participants, /<view class="status-badge[^"]*">[\s\S]*?<text class="status-badge__label">/)
  assert.doesNotMatch(participants, /<text class="status-badge /)
})

test('schedule summaries keep slot type in detail and show participants in both views', () => {
  const schedule = fs.readFileSync(path.join(pagesRoot, 'schedule', 'index.wxml'), 'utf8')

  assert.match(schedule, /booking-row__meta">\{\{booking\.participant\.name\}\}/)
  assert.doesNotMatch(schedule, /booking-row__meta">[^<]*slotType/)
  assert.match(schedule, /slot-block__meta">\{\{slot\.resource\.name\}\} · \{\{slot\.participant\.name\}\}/)
})

test('booking detail hides internal metadata and shows creation audit times', () => {
  const detail = fs.readFileSync(path.join(pagesRoot, 'schedule', 'detail.wxml'), 'utf8')

  assert.doesNotMatch(detail, /booking\.slotType\.name/)
  assert.doesNotMatch(detail, /预约编号|booking\.id/)
  assert.match(detail, /创建时间[\s\S]*booking\.displayCreatedAt/)
  assert.match(detail, /最后更新时间[\s\S]*booking\.displayUpdatedAt/)
})

test('three-day timeline uses the compact 07:00–24:00 range', () => {
  const scheduleLogic = fs.readFileSync(path.join(pagesRoot, 'schedule', 'index.js'), 'utf8')
  const scheduleStyles = fs.readFileSync(path.join(pagesRoot, 'schedule', 'index.wxss'), 'utf8')

  assert.match(scheduleLogic, /const HOUR_ROW_HEIGHT = 72/)
  assert.match(scheduleLogic, /const SLOT_MIN_HEIGHT = 32/)
  assert.match(scheduleLogic, /const DAY_START_HOUR = 7/)
  assert.match(scheduleLogic, /const DAY_HOURS = 17/)
  assert.match(scheduleLogic, /const hour = DAY_START_HOUR \+ index/)
  assert.match(scheduleStyles, /\.slot-block \{[\s\S]*?min-height: 32px;/)
})
