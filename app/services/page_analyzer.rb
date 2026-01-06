class PageAnalyzer
  TIMEOUT = 10
  
  def initialize(url, sitemap_urls = [])
    @url = url
    @sitemap_urls = sitemap_urls
  end
  
  def analyze
    begin
      # Fetch the page
      page_data = fetch_page(@url)
      return { error: page_data[:error] } if page_data[:error]
      
      doc = page_data[:doc]
      final_url = page_data[:final_url]
      status_code = page_data[:status_code]
      redirect_info = page_data[:redirect_info]
      
      # Extract page details
      details = {
        url: @url,
        final_url: final_url,
        status: status_code,
        redirect_info: redirect_info,
        title: extract_title(doc),
        meta_description: extract_meta_description(doc),
        word_count: extract_word_count(doc),
        indexability: extract_indexability(doc),
        canonical_url: extract_canonical_url(doc),
        inbound_links: find_inbound_links,
        outbound_links: extract_outbound_links(doc, final_url)
      }
      
      details
    rescue => e
      { error: "Failed to analyze page: #{e.message}" }
    end
  end
  
  private
  
  def fetch_page(url)
    require 'net/http'
    require 'uri'
    require 'nokogiri'
    
    # Ensure URL has a protocol
    url = "https://#{url}" unless url.match?(/^https?:\/\//)
    
    uri = URI.parse(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == 'https')
    http.read_timeout = TIMEOUT
    
    request = Net::HTTP::Get.new(uri.path.empty? ? '/' : uri.path)
    request['User-Agent'] = 'Mozilla/5.0 (compatible; PageAnalyzer/1.0)'
    
    response = http.request(request)
    redirect_info = nil
    
    # Handle redirects
    if response.is_a?(Net::HTTPRedirection)
      redirect_url = response['location']
      redirect_url = URI.join(uri, redirect_url).to_s if redirect_url.start_with?('/')
      redirect_info = {
        from: url,
        to: redirect_url,
        status: response.code.to_i
      }
      
      uri = URI.parse(redirect_url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == 'https')
      request = Net::HTTP::Get.new(uri.path.empty? ? '/' : uri.path)
      request['User-Agent'] = 'Mozilla/5.0 (compatible; PageAnalyzer/1.0)'
      response = http.request(request)
    end
    
    final_url = "#{uri.scheme}://#{uri.host}#{uri.port != 80 && uri.port != 443 ? ":#{uri.port}" : ''}#{uri.path}"
    
    if response.code != "200"
      return { error: "HTTP #{response.code}: #{response.message}" }
    end
    
    doc = Nokogiri::HTML(response.body)
    
    {
      doc: doc,
      final_url: final_url,
      status_code: response.code.to_i,
      redirect_info: redirect_info
    }
  rescue => e
    { error: e.message }
  end
  
  def extract_title(doc)
    title_tag = doc.at_css('title')
    title_tag ? title_tag.text.strip : nil
  end
  
  def extract_meta_description(doc)
    meta_desc = doc.at_css('meta[name="description"]')
    meta_desc ? meta_desc['content']&.strip : nil
  end
  
  def extract_word_count(doc)
    # Remove script and style elements
    doc.css('script, style').remove
    
    # Get text content and count words
    text = doc.text
    words = text.scan(/\b\w+\b/)
    words.length
  end
  
  def extract_indexability(doc)
    robots_meta = doc.at_css('meta[name="robots"]')
    return 'index' unless robots_meta
    
    content = robots_meta['content']&.downcase || ''
    content.include?('noindex') ? 'noindex' : 'index'
  end
  
  def extract_canonical_url(doc)
    canonical_link = doc.at_css('link[rel="canonical"]')
    canonical_link ? canonical_link['href'] : nil
  end
  
  def find_inbound_links
    return [] if @sitemap_urls.empty?
    
    inbound_links = []
    
    # Check up to 20 pages to find inbound links (balance between completeness and performance)
    pages_to_check = @sitemap_urls.first(20)
    
    pages_to_check.each do |sitemap_url|
      next if sitemap_url == @url
      
      # Fetch the page and look for links to our target URL
      page_data = fetch_page(sitemap_url)
      next if page_data[:error]
      
      doc = page_data[:doc]
      doc.css('a[href]').each do |link|
        href = link['href']
        next if href.blank?
        
        # Convert relative URLs to absolute
        begin
          base_uri = URI.parse(sitemap_url)
          absolute_url = URI.join("#{base_uri.scheme}://#{base_uri.host}", href).to_s
          
          if absolute_url == @url
            inbound_links << {
              from_url: sitemap_url,
              from_title: sitemap_url,
              anchor_text: link.text.strip.presence || href
            }
          end
        rescue URI::InvalidURIError
          # Skip invalid URLs
        end
      end
    end
    
    inbound_links
  end
  
  def extract_outbound_links(doc, base_url)
    outbound_links = []
    base_uri = URI.parse(base_url)
    
    doc.css('a[href]').each do |link|
      href = link['href']
      next if href.blank?
      next if href.match?(/^(javascript|mailto|tel|#):/i)
      
      begin
        absolute_url = URI.join("#{base_uri.scheme}://#{base_uri.host}", href).to_s
        anchor_text = link.text.strip.presence || href
        
        # Check if this URL is in our sitemap
        in_sitemap = @sitemap_urls.include?(absolute_url)
        
        outbound_links << {
          to_url: absolute_url,
          anchor_text: anchor_text,
          in_sitemap: in_sitemap,
          to_title: in_sitemap ? absolute_url : nil
        }
      rescue URI::InvalidURIError
        # Skip invalid URLs
      end
    end
    
    # Remove duplicates and sort
    outbound_links.uniq { |link| link[:to_url] }.sort_by { |link| link[:to_url] }
  end
end