// api/scrape.js
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

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get data from request body
    const { zipCode, radius, radiusMiles } = req.body;

    // Validate required parameters
    if (!zipCode) {
      return res.status(400).json({ error: 'zipCode is required' });
    }

    // Use radius or radiusMiles, default to '5'
    const searchRadius = radius || radiusMiles || '5';

    console.log(`Scraping disposal sites for ${zipCode} within ${searchRadius} miles...`);

    // Call your scraping function
    const sites = await getDisposalSites(zipCode, String(searchRadius));

    // Return results
    res.status(200).json({
      success: true,
      zipCode,
      radius: searchRadius,
      sites: sites
    });

  } catch (error) {
    console.error('Error in scrape API:', error);
    res.status(500).json({ 
      error: 'Scrape failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}