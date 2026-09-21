import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8')

test('admin reusable visual colors live in tokens.css', () => {
  assert.match(styles, /^@import "\.\/tokens\.css";/)
  assert.equal(styles.match(/#[0-9a-fA-F]{3,8}\b/g), null)
  assert.equal(styles.match(/rgba?\([^)]*\)/g), null)
})

test('admin token file defines shared visual primitives', () => {
  for (const token of ['--color-primary','--color-border','--space-16','--radius-10','--font-size-14','--control-height-md','--select-padding-right','--select-chevron-offset','--shadow-panel','--focus-ring']) {
    assert.ok(tokens.includes(token), `missing ${token}`)
  }
})

test('selects use a consistent custom chevron and right gutter', () => {
  assert.match(styles, /select \{[\s\S]*?appearance: none;/)
  assert.match(styles, /padding-right: var\(--select-padding-right\);/)
  assert.match(styles, /background-position:[\s\S]*?var\(--select-chevron-offset\)/)
  assert.match(styles, /background-size: var\(--select-chevron-size\)/)
})


test('view scoped styles consume shared tokens instead of forking visual primitives', () => {
  const viewsUrl = new URL('../src/views/', import.meta.url)
  for (const file of readdirSync(viewsUrl).filter((name) => name.endsWith('.vue'))) {
    const source = readFileSync(new URL(file, viewsUrl), 'utf8')
    const styleStart = source.indexOf('<style')
    if (styleStart < 0) continue
    const scopedStyle = source.slice(styleStart)
    assert.equal(scopedStyle.match(/#[0-9a-fA-F]{3,8}\b/g), null, `${file} has a raw color`)
    assert.equal(scopedStyle.match(/rgba?\([^)]*\)/g), null, `${file} has a raw rgba color`)
    assert.equal(scopedStyle.match(/var\(--(?:line|muted|accent|accent-soft|danger|ink)\)/g), null, `${file} uses a legacy token`)
    const spacingDeclarations = scopedStyle.match(/\b(?:padding(?:-(?:top|right|bottom|left|inline|block))?|margin(?:-(?:top|right|bottom|left|inline|block))?|gap|row-gap|column-gap)\s*:[^;}]+/g) || []
    for (const declaration of spacingDeclarations) {
      assert.equal(/-?\d+px\b/.test(declaration), false, `${file} has raw spacing: ${declaration}`)
    }
  }
})
