// api/disposal-sites.js
import { getDisposalSites } from '../scrape.mjs';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get query parameters
    const { zipCode, radius } = req.query;

    // Validate required parameters
    if (!zipCode) {
      return res.status(400).json({ error: 'zipCode is required' });
    }

    // Default radius to 20 if not provided
    const searchRadius = radius || '20';

    // Validate radius options
    const validRadii = ['5', '10', '20', '50'];
    if (!validRadii.includes(searchRadius)) {
      return res.status(400).json({ 
        error: 'Invalid radius. Must be one of: 5, 10, 20, 50' 
      });
    }

    console.log(`Searching for disposal sites near ${zipCode} within ${searchRadius} miles...`);

    // Call your scraping function
    const sites = await getDisposalSites(zipCode, searchRadius);

    // Return results
    res.status(200).json({
      success: true,
      zipCode,
      radius: searchRadius,
      count: sites.length,
      sites: sites
    });

  } catch (error) {
    console.error('Error in disposal-sites API:', error);
    
    // Return different error messages based on error type
    if (error.message.includes('timeout')) {
      return res.status(504).json({ 
        error: 'Request timed out. Please try again.' 
      });
    }
    
    if (error.message.includes('No results')) {
      return res.status(200).json({
        success: true,
        zipCode: req.query.zipCode,
        radius: searchRadius,
        count: 0,
        sites: [],
        message: 'No disposal sites found in this area'
      });
    }

    res.status(500).json({ 
      error: 'Failed to fetch disposal sites',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}