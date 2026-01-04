class LinkChecker
  # Timeout for each HTTP request (in seconds)
  TIMEOUT = 10
  
  # Initialize with an array of URLs
  def initialize(urls)
    @urls = urls
  end
  
  # Check all URLs and return status information
  def check
    return [] if @urls.empty?
    
    require 'httpx'
    
    results = []
    
    # Create HTTPX session with configuration
    session = HTTPX.plugin(:follow_redirects)
                   .with(
                     timeout: { 
                       connect_timeout: TIMEOUT,
                       operation_timeout: TIMEOUT
                     },
                     headers: {
                       'User-Agent' => 'Mozilla/5.0 (compatible; LinkChecker/1.0)'
                     }
                   )
    
    # Make parallel requests for all URLs
    responses = session.get(*@urls)
    
    # Handle both single response and array of responses
    responses = [responses] unless responses.is_a?(Array)
    
    # Process each response
    @urls.zip(responses).each do |url, response|
      result = process_response(url, response)
      results << result
    end
    
    results
  rescue => e
    # If parallel checking fails, return error for all URLs
    @urls.map do |url|
      {
        url: url,
        status: 0,
        redirected_to: nil,
        error: "Failed to check: #{e.message}"
      }
    end
  end
  
  private
  
  def process_response(url, response)
    # Handle error responses
    if response.is_a?(HTTPX::ErrorResponse)
      return {
        url: url,
        status: 0,
        redirected_to: nil,
        error: response.error.message
      }
    end
    
    status = response.status
    redirected_to = nil
    
    # Check if this was a redirect by comparing the final URI with the original
    final_uri = response.uri.to_s
    redirected_to = final_uri if final_uri != url
    
    {
      url: url,
      status: status,
      redirected_to: redirected_to
    }
  rescue => e
    {
      url: url,
      status: 0,
      redirected_to: nil,
      error: e.message
    }
  end
end
