// Quote every field and neutralize spreadsheet formulas from untrusted page content.
export function csvCell(value) {
  let text = String(value ?? "")
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) {
    text = "'" + text
  }
  return `"${text.replaceAll('"', '""')}"`
}

export function buildLinkReport(items) {
  const rows = [["URL", "Anchor text", "Check status", "HTTP status", "Redirect URL", "Error"]]
  for (const item of items) {
    const result = item.checkResult
    const status = !result ? "Unchecked" : result.error || !result.status ? "Error" :
      result.redirected_to || (result.status >= 300 && result.status < 400) ? "Redirected" :
      result.status >= 200 && result.status < 300 ? "Working" : "Broken"
    rows.push([item.url, item.text, status, result?.status ?? "", result?.redirected_to, result?.error])
  }
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
}
