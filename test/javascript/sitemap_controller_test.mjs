// Run with: node --test test/javascript/sitemap_controller_test.mjs
// No browser dependencies: exercise the real controller with a small DOM adapter.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../../app/javascript/controllers/sitemap_controller.js', import.meta.url), 'utf8')

function setup() {
  let rows = []
  const dropdown = { addEventListener: (_, handler) => { dropdown.change = handler } }
  const matchCount = { textContent: '' }
  const noMatches = { style: {} }
  const list = {
    appendChild(row) {
      rows.splice(rows.indexOf(row), 1)
      rows.push(row)
    }
  }
  const results = {
    markup: '',
    set innerHTML(value) {
      this.markup = value
      rows = Array.from(value.matchAll(/data-url-index="(\d+)"/g), ([, index]) => ({
        dataset: { urlIndex: index, statusCategory: 'checking' },
        style: {}, parentNode: list, indicator: {}, info: {}
      }))
    },
    get innerHTML() { return this.markup },
    querySelector: () => dropdown,
    querySelectorAll: () => rows
  }
  const context = vm.createContext({
    Controller: class {},
    FormData: class {},
    fetch: async () => ({ json: async () => ({ error: 'Fetch failed' }) }),
    document: {
      querySelector(selector) {
        if (selector.includes('csrf-token')) return { content: 'token' }
        const index = selector.match(/="(\d+)"/)?.[1]
        const row = rows.find(row => row.dataset.urlIndex === index)
        if (selector.includes('data-status-index')) return row?.indicator
        if (selector.includes('data-info-index')) return row?.info
        return row
      }
    }
  })
  const Controller = vm.runInContext(source
    .replace('import { Controller } from "@hotwired/stimulus"', '')
    .replace('export default class extends Controller', '(class extends Controller') + ')', context)
  const controller = new Controller()
  Object.assign(controller, {
    resultsTarget: results,
    matchCountTarget: matchCount,
    noMatchesTarget: noMatches,
    formTarget: { action: '/generate' },
    loadingTarget: { style: {} },
    errorTarget: { style: {} },
    submitButtonTarget: {}
  })
  // Escaping is existing behavior, not the subject of these controller tests.
  controller.escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  controller.connect()
  return {
    controller, results, matchCount, noMatches,
    rows: () => rows,
    visible: () => rows.filter(row => row.style.display !== 'none').map(row => Number(row.dataset.urlIndex)),
    query(value) { controller.search({ currentTarget: { value } }) },
    filter(value) { dropdown.change({ target: { value } }) }
  }
}

const sitemap = [
  { url: 'https://example.com/about', text: 'About Us' },
  { url: 'https://example.com/contact', text: 'Contact [Team]' },
  { url: 'https://example.com/help' },
  { url: 'https://other.com/about', text: 'Other' }
]

function render() {
  const harness = setup()
  harness.controller.renderResults(sitemap)
  return harness
}

test('result markup provides labelled live search, count and empty state without inserting query HTML', () => {
  const h = render()
  assert.equal(h.controller.searchQuery, '')
  assert.equal(h.controller.activeFilter, 'all')
  assert.match(h.results.markup, /label for="link-search"/)
  assert.match(h.results.markup, /input->sitemap#search/)
  assert.match(h.results.markup, /Showing 4 of 4 links/)
  assert.match(h.results.markup, /data-sitemap-target="noMatches"/)
  h.query('<img src=x>')
  assert.equal(h.noMatches.style.display, 'block')
  assert.doesNotMatch(h.results.markup, /<img src=x>/)
})

test('matches literal URL or text substrings case-insensitively, including missing text', () => {
  const h = render()
  h.query('ABOUT')
  assert.deepEqual(h.visible(), [0, 3])
  h.query('tEaM')
  assert.deepEqual(h.visible(), [1])
  h.query('HELP')
  assert.deepEqual(h.visible(), [2])
  h.query('[Team]')
  assert.deepEqual(h.visible(), [1])
  h.query('.*')
  assert.deepEqual(h.visible(), [])
  h.query(' About')
  assert.deepEqual(h.visible(), [])
  h.query(' ')
  assert.deepEqual(h.visible(), [0, 1])
})

test('combines filters, keeps the other selection, and updates counts and no-match state', () => {
  const h = render()
  h.controller.updateLinkStatus(0, { status: 200 })
  h.controller.updateLinkStatus(1, { status: 404 })
  h.query('about')
  h.filter('broken')
  assert.equal(h.controller.searchQuery, 'about')
  assert.deepEqual(h.visible(), [])
  assert.equal(h.matchCount.textContent, 'Showing 0 of 4 links')
  assert.equal(h.noMatches.style.display, 'block')
  h.query('contact')
  assert.equal(h.controller.activeFilter, 'broken')
  assert.deepEqual(h.visible(), [1])
  assert.equal(h.matchCount.textContent, 'Showing 1 of 4 links')
  assert.equal(h.noMatches.style.display, 'none')
  h.query('')
  assert.deepEqual(h.visible(), [1])
  h.filter('all')
  assert.equal(h.visible().length, 4)
})

test('late health updates use the current search without changing result data or row association', () => {
  const h = render()
  const original = JSON.stringify(h.controller.currentSitemap)
  h.query('about')
  h.filter('healthy')
  assert.deepEqual(h.visible(), [])
  h.controller.updateLinkStatus(3, { status: 200 })
  assert.deepEqual(h.visible(), [3])
  assert.equal(h.matchCount.textContent, 'Showing 1 of 4 links')
  h.controller.updateLinkStatus(0, { status: 200 })
  assert.deepEqual(h.visible(), [0, 3])
  h.controller.updateLinkStatus(3, { status: 500 })
  assert.deepEqual(h.visible(), [0])
  assert.equal(JSON.stringify(h.controller.currentSitemap), original)
  assert.deepEqual(h.rows().map(row => row.dataset.urlIndex), ['0', '1', '2', '3'])
})

test('retains existing status priority ordering and stable row identities', () => {
  const h = render()
  h.controller.updateLinkStatus(0, { status: 200 })
  h.controller.updateLinkStatus(1, { status: 404 })
  h.controller.updateLinkStatus(2, { status: 302 })
  const order = h.rows().map(row => row.dataset.urlIndex)
  assert.deepEqual(order, ['1', '2', '0', '3'])
  h.query('about')
  assert.deepEqual(h.visible(), [0, 3])
  assert.deepEqual(h.rows().map(row => row.dataset.urlIndex), order)
  h.query('')
  assert.deepEqual(h.visible(), [1, 2, 0, 3])
})

test('resets search when generation starts, even on failure, and on a fresh connection', async () => {
  const h = render()
  h.query('about')
  const pending = h.controller.submit({ preventDefault() {} })
  assert.equal(h.controller.searchQuery, '')
  assert.equal(h.results.innerHTML, '')
  await pending
  assert.equal(h.controller.searchQuery, '')
  h.controller.renderResults([{ url: 'https://new.com', text: '' }])
  h.query('')
  assert.equal(h.matchCount.textContent, 'Showing 1 of 1 link')
  h.query('new')
  h.controller.connect()
  assert.equal(h.controller.searchQuery, '')
})
