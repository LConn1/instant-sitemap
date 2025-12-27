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

## Deployment to Render

This app is configured for easy deployment to Render.

### Prerequisites

1. A [Render account](https://render.com)
2. Your code pushed to GitHub

### Deployment Steps

1. **Get your Rails Master Key:**

   ```bash
   # In your local project directory
   cat config/master.key
   ```

   Copy this value - you'll need it for Render.

2. **Connect to Render:**

   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the `instant-sitemap` repository

3. **Configure the Service:**

   - **Name:** `instant-sitemap` (or any name you prefer)
   - **Region:** Choose closest to you (Oregon recommended)
   - **Branch:** `main`
   - **Root Directory:** (leave empty)
   - **Environment:** `Ruby`
   - **Build Command:** `bundle install && bundle exec rails assets:precompile && bundle exec rails db:prepare`
   - **Start Command:** `bundle exec rails server -p $PORT -e production`

4. **Add Environment Variables:**

   - `RAILS_ENV` = `production`
   - `RAILS_MASTER_KEY` = (paste your master key from step 1)
   - `RAILS_LOG_TO_STDOUT` = `true`
   - `RAILS_SERVE_STATIC_FILES` = `true`

5. **Deploy:**

   - Click "Create Web Service"
   - Render will automatically build and deploy your app
   - Wait for the build to complete (usually 5-10 minutes)

6. **Access Your App:**
   - Once deployed, Render will provide a URL like: `https://instant-sitemap.onrender.com`
   - Your app is now live!

### Using render.yaml (Alternative Method)

If you prefer, you can use the included `render.yaml` file:

1. Go to Render Dashboard → "New +" → "Blueprint"
2. Connect your GitHub repository
3. Render will automatically detect `render.yaml` and configure everything
4. You'll still need to add the `RAILS_MASTER_KEY` environment variable manually

### Notes

- The free tier on Render spins down after 15 minutes of inactivity
- First request after spin-down may take 30-60 seconds
- For production use, consider upgrading to a paid plan

## License

MIT
