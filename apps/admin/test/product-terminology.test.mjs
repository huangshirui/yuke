import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('web admin exposes product terms instead of implementation terms', () => {
  const app = source('src/App.vue')
  const spaceDetail = source('src/views/SpaceDetailView.vue')
  const customerList = source('src/views/UsersView.vue')
  const customerDetail = source('src/views/UserDetailView.vue')

  assert.match(app, />客户管理<\/span>/)
  assert.match(app, />用户管理<\/span>/)
  assert.match(app, />退出登录<\/button>/)

  const spaceDetailTemplate = spaceDetail.split('<template>')[1] || ''
  assert.doesNotMatch(spaceDetailTemplate, /Cloudflare Access|AdminUser/)
  assert.doesNotMatch(spaceDetail, /<th>ID<\/th>|\{\{ admin\.id \}\}/)
  assert.doesNotMatch(customerList, /用户管理|邀请用户|未命名用户/)
  assert.doesNotMatch(customerDetail, /返回用户管理|用户详情|管理员内部备注/)
  assert.doesNotMatch(customerList, /已移除用户/)
  assert.doesNotMatch(customerDetail, /已移除用户/)
  assert.match(spaceDetail, />用户名称</)
  assert.match(spaceDetail, />登录邮箱</)
  assert.match(spaceDetail, /admin\.displayName \|\| admin\.email/)
  assert.match(customerList, /invitedByAdminDisplayName/)
  assert.match(customerDetail, /invitedByAdminDisplayName/)
})

test('operational pages do not render internal ids', () => {
  const pages = [
    'src/views/SpaceDetailView.vue',
    'src/views/SpaceOperationsView.vue',
    'src/views/SpacesView.vue',
  ]

  for (const path of pages) {
    const page = source(path)
    assert.doesNotMatch(page, /<th>ID<\/th>/, path)
    assert.doesNotMatch(page, /<code>\{\{\s*[^}]*\b(?:id|Id)\b[^}]*\}\}<\/code>/, path)
    assert.doesNotMatch(page, /class="mono"[^>]*>\{\{\s*[^}]*\b(?:id|Id)\b[^}]*\}\}/, path)
  }
})


test('unauthorized admin login uses a friendly auto-logout gate', () => {
  const app = source('src/App.vue')
  assert.match(app, /此账号没有后台访问权限/)
  assert.match(app, /正在自动退出/)
  assert.match(app, /SPACE_ACCESS_DENIED/)
  assert.match(app, /location\.replace\('\/cdn-cgi\/access\/logout'\)/)
  assert.doesNotMatch(app, />Admin access is not assigned</)
})


test('current space is the sidebar identity and switcher', () => {
  const app = source('src/App.vue')
  assert.match(app, /const spaceInitial = computed/)
  assert.match(app, /class="space-switcher space-switcher--brand"/)
  assert.match(app, /class="space-brand-mark"[^>]*>\{\{ spaceInitial \}\}/)
  assert.match(app, /<strong>\{\{ currentSpace\?\.name \|\| '选择空间' \}\}<\/strong>/)
  assert.match(app, /<small>运营后台<\/small>/)
  assert.doesNotMatch(app, /<strong>Yu言在线<\/strong>/)

  const sidebarBottom = app.split('<div class="sidebar-bottom">')[1] || ''
  assert.doesNotMatch(sidebarBottom, /class="space-switcher"/)
})
