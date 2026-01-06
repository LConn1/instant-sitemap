import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["form", "results", "error", "loading", "submitButton"]

  STATUS_PRIORITY = {
    broken: 0,
    redirect: 1,
    healthy: 2,
    checking: 3
  }

  connect() {
    this.items = []
    this.activeFilter = "all"
  }

  async submit(event) {
    event.preventDefault()

    this.loadingTarget.style.display = "block"
    this.resultsTarget.innerHTML = ""
    this.errorTarget.style.display = "none"
    this.submitButtonTarget.disabled = true
    this.submitButtonTarget.textContent = "Generating..."

    const formData = new FormData(this.formTarget)

    try {
      const response = await fetch(this.formTarget.action, {
        method: "POST",
        body: formData,
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
        }
      })

      const data = await response.json()

      this.loadingTarget.style.display = "none"
      this.submitButtonTarget.disabled = false
      this.submitButtonTarget.textContent = "Generate Sitemap"

      if (data.error) {
        this.errorTarget.textContent = data.error
        this.errorTarget.style.display = "block"
        return
      }

      if (!data.sitemap || data.sitemap.length === 0) {
        this.errorTarget.textContent = "No links found on this page"
        this.errorTarget.style.display = "block"
        return
      }

      this.renderResults(data.sitemap)
      this.checkLinkStatuses(data.sitemap)
    } catch (error) {
      this.loadingTarget.style.display = "none"
      this.submitButtonTarget.disabled = false
      this.submitButtonTarget.textContent = "Generate Sitemap"
      this.errorTarget.textContent = "An error occurred. Please try again."
      this.errorTarget.style.display = "block"
    }
  }

  renderResults(sitemap) {
    this.items = sitemap.map((item, index) => ({
      ...item,
      index,
      statusCategory: "checking"
    }))

    const count = sitemap.length
    const countText = count === 1 ? "link" : "links"

    let html = `
      <h2>Sitemap Results</h2>
      <div class="count">Found ${count} unique ${countText}</div>

      <div class="filters">
        <label for="status-filter">Filter links by:</label>
        <select id="status-filter" class="filter-dropdown">
          <option value="all">All</option>
          <option value="healthy">Working</option>
          <option value="redirect">Redirected</option>
          <option value="broken">Broken</option>
        </select>
      </div>

      <div class="status-legend">
        <span class="legend-item"><span class="status-dot status-checking"></span> Checking</span>
        <span class="legend-item"><span class="status-dot status-success"></span> Working</span>
        <span class="legend-item"><span class="status-dot status-redirect"></span> Redirect</span>
        <span class="legend-item"><span class="status-dot status-error"></span> Broken</span>
      </div>

      <ul class="sitemap-list">
    `

    sitemap.forEach((item, index) => {
      html += `
        <li class="sitemap-item"
            data-url-index="${index}"
            data-status-category="checking">
          <span class="status-indicator status-checking" data-status-index="${index}">
            <span class="spinner"></span>
          </span>
          <div class="link-content">
            <a href="${this.escapeHtml(item.url)}"
               target="_blank"
               rel="noopener noreferrer"
               class="sitemap-url">
              ${this.escapeHtml(item.url)}
            </a>
            ${
              item.text && item.text !== item.url
                ? `<div class="sitemap-text">${this.escapeHtml(item.text)}</div>`
                : ""
            }
            <div class="status-info" data-info-index="${index}"></div>
          </div>
        </li>
      `
    })

    html += "</ul>"
    this.resultsTarget.innerHTML = html

    this.bindDropdown()
  }

  bindDropdown() {
    const dropdown = this.resultsTarget.querySelector("#status-filter")
    if (!dropdown) return
    dropdown.addEventListener("change", (event) => {
      this.activeFilter = event.target.value
      this.applyFilter()
    })
  }

  applyFilter() {
    const items = Array.from(
      this.resultsTarget.querySelectorAll(".sitemap-item")
    )

    items.forEach(el => {
      const status = el.dataset.statusCategory
      const visible =
        this.activeFilter === "all" || status === this.activeFilter

      el.style.display = visible ? "flex" : "none"
    })

    if (this.activeFilter === "all") {
      this.sortByStatusPriority(items)
    }
  }

  sortByStatusPriority(items) {
    items
      .sort((a, b) => {
        const aPriority =
          this.STATUS_PRIORITY[a.dataset.statusCategory] ?? 99
        const bPriority =
          this.STATUS_PRIORITY[b.dataset.statusCategory] ?? 99

        return aPriority - bPriority
      })
      .forEach(el => el.parentNode.appendChild(el))
  }

  async checkLinkStatuses(sitemap) {
    const urls = sitemap.map(item => item.url)
    const concurrency = 8
    const timeout = 12000

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency)
      const batchIndices = batch.map((_, idx) => i + idx)

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        const response = await fetch("/check_links", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
          },
          body: JSON.stringify({ urls: batch }),
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        const data = await response.json()

        data.results?.forEach((result, batchIndex) => {
          this.updateLinkStatus(batchIndices[batchIndex], result)
        })
      } catch (error) {
        batchIndices.forEach(index => {
          this.updateLinkStatus(index, {
            status: 0,
            error: error.name === "AbortError" ? "Request timeout" : "Network error"
          })
        })
      }

      if (i + concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
  }

  updateLinkStatus(index, result) {
    const indicator = document.querySelector(`[data-status-index="${index}"]`)
    const info = document.querySelector(`[data-info-index="${index}"]`)
    const item = document.querySelector(`[data-url-index="${index}"]`)
    if (!indicator || !info || !item) return

    let statusClass = "status-error"
    let message = ""
    let category = "broken"

    if (result.status === 200) {
      statusClass = "status-success"
      message = "OK (200)"
      category = "healthy"
    } else if (result.status >= 300 && result.status < 400) {
      statusClass = "status-redirect"
      message = `Redirect (${result.status})`
      if (result.redirected_to) {
        message += ` → ${result.redirected_to}`
      }
      category = "redirect"
    } else {
      message = result.error || `Error (${result.status})`
      category = "broken"
    }

    indicator.className = `status-indicator ${statusClass}`
    indicator.innerHTML = ""
    info.textContent = message
    info.className = `status-info ${statusClass}`

    item.dataset.statusCategory = category
    this.items[index].statusCategory = category

    this.applyFilter()
  }

  escapeHtml(text) {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }
}
