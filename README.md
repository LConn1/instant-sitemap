# Instant Website Sitemap

A simple Rails web application that generates a sitemap (list of all links) from any website URL.

## Features

- Submit any website URL
- Automatically fetches and parses the webpage
- Extracts all links from the page
- Displays a clean, sorted list of unique links
- Handles redirects and HTTPS automatically
- Filters out non-HTTP links (javascript:, mailto:, tel:, etc.)

## Requirements

- Ruby 3.3+
- Rails 8.1.1+
- Docker (optional, for containerized development)

## Setup

### Using Docker (Recommended)

1. Start Docker container:
```bash
cd ~/Desktop/instant_sitemap
docker run --rm -it -v "$PWD":/app -w /app -p 3000:3000 ruby:3.3 bash
```

2. Install dependencies:
```bash
bundle install
```

3. Start the server:
```bash
bin/rails server -b 0.0.0.0 -p 3000
```

4. Open your browser:
```
http://localhost:3000
```

### Local Setup

1. Install dependencies:
```bash
bundle install
```

2. Start the server:
```bash
bin/rails server
```

3. Open your browser:
```
http://localhost:3000
```

## Usage

1. Enter a website URL in the form (e.g., `https://example.com`)
2. Click "Generate Sitemap"
3. View all links found on that page

## Technology Stack

- **Ruby on Rails 8.1.1** - Web framework
- **Nokogiri** - HTML parsing
- **Net::HTTP** - HTTP requests
- **SQLite3** - Database (minimal usage)

## Project Structure

- `app/controllers/sitemaps_controller.rb` - Main controller logic
- `app/views/sitemaps/index.html.erb` - User interface
- `config/routes.rb` - Application routes

## License

MIT
