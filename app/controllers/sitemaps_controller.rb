class SitemapsController < ApplicationController
  def index
    # Display the form
  end

  def generate
    url = params[:url]
    
    if url.blank?
      render json: { sitemap: nil, error: "Please provide a URL" }, status: :unprocessable_entity
      return
    end

    begin
      # Ensure URL has a protocol
      url = "https://#{url}" unless url.match?(/^https?:\/\//)
      
      # Fetch the webpage
      require 'net/http'
      require 'uri'
      require 'nokogiri'
      
      uri = URI.parse(url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == 'https')
      http.read_timeout = 10
      
      request = Net::HTTP::Get.new(uri.path.empty? ? '/' : uri.path)
      request['User-Agent'] = 'Mozilla/5.0 (compatible; SitemapGenerator/1.0)'
      
      response = http.request(request)
      
      # Handle redirects
      if response.is_a?(Net::HTTPRedirection)
        redirect_url = response['location']
        redirect_url = URI.join(uri, redirect_url).to_s if redirect_url.start_with?('/')
        uri = URI.parse(redirect_url)
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = (uri.scheme == 'https')
        request = Net::HTTP::Get.new(uri.path.empty? ? '/' : uri.path)
        request['User-Agent'] = 'Mozilla/5.0 (compatible; SitemapGenerator/1.0)'
        response = http.request(request)
      end
      
      if response.code != "200"
        render json: { sitemap: nil, error: "Failed to fetch URL: #{response.code} #{response.message}" }, status: :unprocessable_entity
        return
      end
      
      # Parse HTML and extract links
      doc = Nokogiri::HTML(response.body)
      @sitemap = []
      
      # Use the final URL (after redirects) for resolving relative links
      base_url = "#{uri.scheme}://#{uri.host}#{uri.port != 80 && uri.port != 443 ? ":#{uri.port}" : ''}"
      
      # Extract all links (a tags with href)
      doc.css('a[href]').each do |link|
        href = link['href']
        next if href.blank?
        
        # Skip javascript:, mailto:, tel:, and other non-http links
        next if href.match?(/^(javascript|mailto|tel|#):/i)
        
        # Convert relative URLs to absolute
        absolute_url = URI.join(base_url, href).to_s
        text = link.text.strip
        
        @sitemap << {
          url: absolute_url,
          text: text.presence || absolute_url
        }
      end
      
      # Remove duplicates and sort
      @sitemap.uniq! { |item| item[:url] }
      @sitemap.sort_by! { |item| item[:url] }
      
      # Return JSON data (no page reload)
      render json: { sitemap: @sitemap, error: nil }
      
    rescue URI::InvalidURIError
      render json: { sitemap: nil, error: "Invalid URL format" }, status: :unprocessable_entity
    rescue => e
      render json: { sitemap: nil, error: "Error fetching URL: #{e.message}" }, status: :unprocessable_entity
    end
  end
  
  def check_links
    urls = params[:urls]
    
    if urls.blank? || !urls.is_a?(Array)
      render json: { error: "Please provide an array of URLs" }, status: :unprocessable_entity
      return
    end
    
    # Limit the number of URLs that can be checked at once
    if urls.length > 100
      render json: { error: "Maximum 100 URLs can be checked at once" }, status: :unprocessable_entity
      return
    end
    
    begin
      checker = LinkChecker.new(urls)
      results = checker.check
      
      render json: { results: results }
    rescue => e
      render json: { error: "Error checking links: #{e.message}" }, status: :unprocessable_entity
    end
  end
end

