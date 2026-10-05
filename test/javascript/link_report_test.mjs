import { test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const reportSource = await readFile(new URL("../../app/javascript/link_report.js", import.meta.url), "utf8")
const reportUrl = `data:text/javascript;base64,${Buffer.from(reportSource).toString("base64")}`
const { buildLinkReport, csvCell } = await import(reportUrl)
const controllerSource = (await readFile(new URL("../../app/javascript/controllers/sitemap_controller.js", import.meta.url), "utf8"))
  .replace('import { Controller } from "@hotwired/stimulus"', "class Controller {}")
  .replace('from "link_report"', `from "${reportUrl}"`)
const { default: SitemapController } = await import(`data:text/javascript;base64,${Buffer.from(controllerSource).toString("base64")}`)

test("CSV quotes commas, quotes, newlines, Unicode, and missing values", () => {
  assert.equal(csvCell('Café, "hello"\nworld'), '"Café, ""hello""\nworld"')
  assert.equal(csvCell(null), '""')
  assert.equal(csvCell(404), '"404"')
})

test("CSV neutralizes spreadsheet formulas, including leading whitespace", () => {
  for (const value of ["=1+1", "+SUM(A1)", "-1+2", "@SUM(A1)", "  =1+1", "\t=1+1", "\r=1+1", "\n=1+1", "\uFEFF=1+1"]) {
    assert.equal(csvCell(value), `"'${value}"`)
  }
  assert.equal(csvCell("https://example.com/?q=1+1"), '"https://example.com/?q=1+1"')
})

test("report includes unchecked, working, redirected, broken, and error results", () => {
  const report = buildLinkReport([
    { url: "https://example.com", text: "Home" },
    { url: "https://example.com/ok", checkResult: { status: 200 } },
    { url: "https://example.com/new", checkResult: { status: 204 } },
    { url: "https://example.com/old", checkResult: { status: 200, redirected_to: "https://example.com/new" } },
    { url: "https://example.com/redirect", checkResult: { status: 301 } },
    { url: "https://example.com/missing", checkResult: { status: 404 } },
    { url: "https://example.com/timeout", checkResult: { status: 0, error: "Request timeout" } }
  ])
  const lines = report.slice(1).trimEnd().split("\r\n")
  assert.ok(report.startsWith("\uFEFF"))
  assert.equal(lines.length, 8)
  assert.equal(lines[0], '"URL","Anchor text","Check status","HTTP status","Redirect URL","Error"')
  assert.equal(lines[1], '"https://example.com","Home","Unchecked","","",""')
  assert.ok(lines[2].includes('"Working","200"'))
  assert.ok(lines[3].includes('"Working","204"'))
  assert.ok(lines[4].includes('"Redirected","200","https://example.com/new"'))
  assert.ok(lines[5].includes('"Redirected","301"'))
  assert.ok(lines[6].includes('"Broken","404"'))
  assert.ok(lines[7].includes('"Error","0","","Request timeout"'))
})

test("download uses all items even when a filter is active and releases resources", async () => {
  const controller = new SitemapController()
  controller.items = [{ url: "https://example.com", text: "Home" }, { url: "https://example.com/broken", checkResult: { status: 404 } }]
  controller.activeFilter = "broken"
  let blob, clicked = false, removed = false, revoked
  const link = { click() { clicked = true }, remove() { removed = true } }
  const originals = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, timeout: globalThis.setTimeout }
  try {
    globalThis.document = { createElement: () => link, body: { appendChild(element) { assert.equal(element, link) } } }
    URL.createObjectURL = value => { blob = value; return "blob:report" }
    URL.revokeObjectURL = value => { revoked = value }
    globalThis.setTimeout = callback => callback()
    controller.downloadReport()
    assert.equal(blob.type, "text/csv;charset=utf-8")
    assert.equal(Buffer.from(await blob.arrayBuffer()).toString("utf8"), buildLinkReport(controller.items))
    assert.equal(link.download, "sitemap-link-report.csv")
    assert.equal(link.href, "blob:report")
    assert.ok(clicked && removed)
    assert.equal(revoked, "blob:report")
    controller.items = []
    clicked = false
    controller.downloadReport()
    assert.equal(clicked, false)
  } finally {
    globalThis.document = originals.document
    URL.createObjectURL = originals.create
    URL.revokeObjectURL = originals.revoke
    globalThis.setTimeout = originals.timeout
  }
})

test("check results are saved even when their DOM elements are absent", () => {
  const controller = new SitemapController()
  controller.items = [{ url: "https://example.com" }]
  const original = globalThis.document
  try {
    globalThis.document = { querySelector: () => null }
    controller.updateLinkStatus(0, { status: 200 })
    assert.deepEqual(controller.items[0].checkResult, { status: 200 })
    controller.updateLinkStatus(5, { status: 404 })
  } finally {
    globalThis.document = original
  }
})
