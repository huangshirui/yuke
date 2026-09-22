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
