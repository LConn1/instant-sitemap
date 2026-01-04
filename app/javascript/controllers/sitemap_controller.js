import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["form", "results", "error", "loading", "submitButton"]

  connect() {
    // Controller is connected
  }

  async submit(event) {
    event.preventDefault()
    
    // Show loading state
    this.loadingTarget.style.display = "block"
    this.resultsTarget.innerHTML = ""
    this.errorTarget.style.display = "none"
    this.submitButtonTarget.disabled = true
    this.submitButtonTarget.textContent = "Generating..."

    const formData = new FormData(this.formTarget)
    const url = formData.get("url")

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

      // Hide loading
      this.loadingTarget.style.display = "none"
      this.submitButtonTarget.disabled = false
      this.submitButtonTarget.textContent = "Generate Sitemap"

      if (data.error) {
        // Show error
        this.errorTarget.textContent = data.error
        this.errorTarget.style.display = "block"
        this.resultsTarget.innerHTML = ""
      } else if (data.sitemap && data.sitemap.length > 0) {
        // Show results immediately with loading indicators
        this.errorTarget.style.display = "none"
        this.renderResults(data.sitemap)
        // Start checking link statuses in the background
        this.checkLinkStatuses(data.sitemap)
      } else {
        this.errorTarget.textContent = "No links found on this page"
        this.errorTarget.style.display = "block"
        this.resultsTarget.innerHTML = ""
      }
    } catch (error) {
      this.loadingTarget.style.display = "none"
      this.submitButtonTarget.disabled = false
      this.submitButtonTarget.textContent = "Generate Sitemap"
      this.errorTarget.textContent = "An error occurred. Please try again."
      this.errorTarget.style.display = "block"
    }
  }

  renderResults(sitemap) {
    const count = sitemap.length
    const countText = count === 1 ? "link" : "links"
    
    let html = `
      <h2>Sitemap Results</h2>
      <div class="count">Found ${count} unique ${countText}</div>
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
        <li class="sitemap-item" data-url-index="${index}">
          <span class="status-indicator status-checking" data-status-index="${index}">
            <span class="spinner"></span>
          </span>
          <div class="link-content">
            <a href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="sitemap-url">
              ${this.escapeHtml(item.url)}
            </a>
            ${item.text && item.text !== item.url ? `<div class="sitemap-text">${this.escapeHtml(item.text)}</div>` : ''}
            <div class="status-info" data-info-index="${index}"></div>
          </div>
        </li>
      `
    })

    html += `</ul>`
    this.resultsTarget.innerHTML = html
  }

  async checkLinkStatuses(sitemap) {
    const urls = sitemap.map(item => item.url)
    const concurrency = 8 // Check 8 URLs at a time
    const timeout = 12000 // 12 second timeout per batch request
    
    // Process URLs in batches to limit concurrent requests
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency)
      const batchIndices = Array.from({ length: batch.length }, (_, idx) => i + idx)
      
      try {
        // Make request with timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)
        
        const response = await fetch('/check_links', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
          },
          body: JSON.stringify({ urls: batch }),
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const data = await response.json()
        
        // Update UI for each result in the batch
        if (data.results) {
          data.results.forEach((result, batchIndex) => {
            const globalIndex = batchIndices[batchIndex]
            this.updateLinkStatus(globalIndex, result)
          })
        }
      } catch (error) {
        // Handle timeout or network errors for this batch
        batchIndices.forEach(index => {
          this.updateLinkStatus(index, {
            url: urls[index],
            status: 0,
            error: error.name === 'AbortError' ? 'Request timeout' : 'Network error'
          })
        })
      }
      
      // Small delay between batches to avoid overwhelming the server
      if (i + concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
  }

  updateLinkStatus(index, result) {
    const statusIndicator = document.querySelector(`[data-status-index="${index}"]`)
    const statusInfo = document.querySelector(`[data-info-index="${index}"]`)
    
    if (!statusIndicator || !statusInfo) return
    
    // Determine status class and message
    let statusClass = 'status-error'
    let statusMessage = ''
    
    if (result.error) {
      statusClass = 'status-error'
      statusMessage = `Error: ${result.error}`
    } else if (result.status === 200) {
      statusClass = 'status-success'
      statusMessage = 'OK (200)'
    } else if (result.status >= 300 && result.status < 400) {
      statusClass = 'status-redirect'
      statusMessage = `Redirect (${result.status})`
      if (result.redirected_to) {
        statusMessage += ` → ${result.redirected_to}`
      }
    } else if (result.status >= 400 && result.status < 600) {
      statusClass = 'status-error'
      statusMessage = `Error (${result.status})`
    } else if (result.status === 0) {
      statusClass = 'status-error'
      statusMessage = result.error || 'Unreachable'
    } else {
      statusClass = 'status-error'
      statusMessage = `Unknown (${result.status})`
    }
    
    // Update indicator
    statusIndicator.className = `status-indicator ${statusClass}`
    statusIndicator.innerHTML = '' // Remove spinner
    
    // Update info message
    statusInfo.textContent = statusMessage
    statusInfo.className = `status-info ${statusClass}`
  }

  escapeHtml(text) {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }
}
