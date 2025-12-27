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
        // Show results
        this.errorTarget.style.display = "none"
        this.renderResults(data.sitemap)
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
      <ul class="sitemap-list">
    `

    sitemap.forEach(item => {
      html += `
        <li class="sitemap-item">
          <a href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="sitemap-url">
            ${this.escapeHtml(item.url)}
          </a>
          ${item.text && item.text !== item.url ? `<div class="sitemap-text">${this.escapeHtml(item.text)}</div>` : ''}
        </li>
      `
    })

    html += `</ul>`
    this.resultsTarget.innerHTML = html
  }

  escapeHtml(text) {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }
}

