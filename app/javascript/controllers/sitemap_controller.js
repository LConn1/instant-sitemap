import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["form", "results", "error", "loading", "submitButton", "overlay", "panel", "panelTitle", "panelUrl", "panelContent"]

  STATUS_PRIORITY = {
    broken: 0,
    redirect: 1,
    healthy: 2,
    checking: 3
  }

  connect() {
    this.items = []
    this.activeFilter = "all"
    this.currentSitemap = []
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
    
    // Store sitemap for page detail requests
    this.currentSitemap = sitemap

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
        <li class="sitemap-item clickable-url"
            data-url-index="${index}"
            data-status-category="checking"
            data-action="click->sitemap#showPageDetails"
            data-url="${this.escapeHtml(item.url)}">
          <span class="status-indicator status-checking" data-status-index="${index}">
            <span class="spinner"></span>
          </span>
          <div class="link-content">
            <div class="sitemap-url">
              ${this.escapeHtml(item.url)}
            </div>
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
  
  // Page Detail Panel Methods
  async showPageDetails(event) {
    console.log('showPageDetails called', event.currentTarget)
    const url = event.currentTarget.dataset.url
    console.log('URL:', url)
    if (!url) return
    
    this.openPanel()
    this.panelUrlTarget.textContent = url
    this.panelTitleTarget.textContent = "Page Details"
    this.panelContentTarget.innerHTML = '<div class="panel-loading">Loading page details...</div>'
    
    try {
      console.log('Making request to /page_details')
      const response = await fetch("/page_details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
        },
        body: JSON.stringify({ 
          url: url,
          sitemap_urls: this.currentSitemap.map(item => item.url)
        })
      })
      
      console.log('Response:', response)
      const data = await response.json()
      console.log('Data:', data)
      
      if (data.error) {
        this.panelContentTarget.innerHTML = `<div class="panel-error">${data.error}</div>`
        return
      }
      
      this.renderPageDetails(data.details)
    } catch (error) {
      console.error('Error:', error)
      this.panelContentTarget.innerHTML = `<div class="panel-error">Failed to load page details: ${error.message}</div>`
    }
  }
  
  renderPageDetails(details) {
    const statusBadge = this.getStatusBadge(details.status, details.redirect_info)
    const indexabilityBadge = details.indexability === 'noindex' ? 
      '<span class="status-badge noindex">No Index</span>' : 
      '<span class="status-badge index">Index</span>'
    
    let html = `
      <div class="detail-section">
        <h3>Page Information</h3>
        <div class="detail-item">
          <span class="detail-label">Status:</span>
          <span class="detail-value">${statusBadge}</span>
        </div>
        ${details.redirect_info ? `
          <div class="detail-item">
            <span class="detail-label">Redirects to:</span>
            <span class="detail-value">${this.escapeHtml(details.redirect_info.to)}</span>
          </div>
        ` : ''}
        <div class="detail-item">
          <span class="detail-label">Title:</span>
          <span class="detail-value">${details.title ? this.escapeHtml(details.title) : 'No title found'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Meta Description:</span>
          <span class="detail-value">${details.meta_description ? this.escapeHtml(details.meta_description) : 'No meta description'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Word Count:</span>
          <span class="detail-value">${details.word_count || 0}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Indexability:</span>
          <span class="detail-value">${indexabilityBadge}</span>
        </div>
        ${details.canonical_url ? `
          <div class="detail-item">
            <span class="detail-label">Canonical URL:</span>
            <span class="detail-value">${this.escapeHtml(details.canonical_url)}</span>
          </div>
        ` : ''}
      </div>
      
      <div class="detail-section">
        <h3>Inbound Links (${details.inbound_links.length})</h3>
        ${this.renderLinkList(details.inbound_links, 'inbound')}
      </div>
      
      <div class="detail-section">
        <h3>Outbound Links (${details.outbound_links.length})</h3>
        ${this.renderLinkList(details.outbound_links, 'outbound')}
      </div>
    `
    
    this.panelContentTarget.innerHTML = html
  }
  
  renderLinkList(links, type) {
    if (links.length === 0) {
      return '<div class="empty-state">No links found</div>'
    }
    
    let html = '<ul class="link-list">'
    
    links.forEach(link => {
      const url = type === 'inbound' ? link.from_url : link.to_url
      const title = type === 'inbound' ? link.from_title : link.to_title
      const anchorText = link.anchor_text
      
      html += `
        <li class="link-item">
          <div class="link-url" data-action="click->sitemap#navigateToPage" data-url="${this.escapeHtml(url)}">
            ${this.escapeHtml(url)}
          </div>
          ${title && title !== url ? `<div class="link-anchor">Title: ${this.escapeHtml(title)}</div>` : ''}
          <div class="link-anchor">Anchor: "${this.escapeHtml(anchorText)}"</div>
          ${type === 'outbound' && !link.in_sitemap ? '<div class="link-anchor" style="color: #999;">External link</div>' : ''}
        </li>
      `
    })
    
    html += '</ul>'
    return html
  }
  
  getStatusBadge(status, redirectInfo) {
    if (status === 200) {
      return '<span class="status-badge ok">OK (200)</span>'
    } else if (status >= 300 && status < 400) {
      return `<span class="status-badge redirect">Redirect (${status})</span>`
    } else {
      return `<span class="status-badge broken">Error (${status})</span>`
    }
  }
  
  navigateToPage(event) {
    const url = event.currentTarget.dataset.url
    if (!url) return
    
    // Check if this URL is in our current sitemap
    const sitemapItem = this.currentSitemap.find(item => item.url === url)
    if (sitemapItem) {
      // Navigate to this page's details within the same panel
      this.showPageDetailsForUrl(url)
    } else {
      // External link - open in new tab
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }
  
  async showPageDetailsForUrl(url) {
    this.panelUrlTarget.textContent = url
    this.panelContentTarget.innerHTML = '<div class="panel-loading">Loading page details...</div>'
    
    try {
      const response = await fetch("/page_details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
        },
        body: JSON.stringify({ 
          url: url,
          sitemap_urls: this.currentSitemap.map(item => item.url)
        })
      })
      
      const data = await response.json()
      
      if (data.error) {
        this.panelContentTarget.innerHTML = `<div class="panel-error">${data.error}</div>`
        return
      }
      
      this.renderPageDetails(data.details)
    } catch (error) {
      this.panelContentTarget.innerHTML = `<div class="panel-error">Failed to load page details: ${error.message}</div>`
    }
  }
  
  openPanel() {
    console.log('Opening panel')
    console.log('Overlay target:', this.overlayTarget)
    console.log('Panel target:', this.panelTarget)
    this.overlayTarget.style.display = 'block'
    this.panelTarget.classList.add('open')
    document.body.classList.add('panel-open')
  }
  
  closePanel() {
    this.overlayTarget.style.display = 'none'
    this.panelTarget.classList.remove('open')
    document.body.classList.remove('panel-open')
  }
}
