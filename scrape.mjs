// scrape.mjs
import puppeteer from 'puppeteer';

/**
 * Extract disposal sites from alternative page structures (non-table format)
 */
async function extractFromAlternativeStructure(page) {
  console.log('Attempting to extract from alternative structure...');
  
  const results = await page.evaluate(() => {
    const data = [];
    
    // Get the full text content and look for the disposal data pattern
    const fullText = document.body.textContent;
    
    // Look for the pattern we see in the debug output
    // The data appears to be in a continuous string with this pattern:
    // "Bus NameCOMPANY NAMEAddr 1ADDRESSAddr 2City, State ZipCITY, STATE ZIPDistX miles"
    
    // First, try to find the section with disposal locations
    const disposalSectionMatch = fullText.match(/Public Controlled Substance Disposal Locations:(.+?)(?=\n\n|\n[A-Z][a-z]+:|\n\s*$|$)/s);
    
    if (disposalSectionMatch) {
      const disposalText = disposalSectionMatch[1];
      console.log('Found disposal section:', disposalText.substring(0, 200));
      
      // Split by "Bus Name" to get individual entries
      const entries = disposalText.split(/Bus Name/).filter(entry => entry.trim().length > 0);
      
      for (const entry of entries) {
        console.log('Processing entry:', entry.substring(0, 100));
        
        // Parse each entry using regex patterns
        const businessNameMatch = entry.match(/^([^A-Z]*[A-Z][A-Z\s&,.]+?)(?:Addr 1|$)/);
        const addr1Match = entry.match(/Addr 1([^A-Z]*[0-9]+[^A-Z]*?)(?:Addr 2|City, State Zip)/);
        const addr2Match = entry.match(/Addr 2([^A-Z]*?)(?:City, State Zip)/);
        const cityStateZipMatch = entry.match(/City, State Zip([A-Z\s,]+[0-9]{5})/);
        const distanceMatch = entry.match(/Dist([0-9.]+\s*miles?)/);
        
        const name = businessNameMatch ? businessNameMatch[1].trim() : '';
        const address1 = addr1Match ? addr1Match[1].trim() : '';
        const address2 = addr2Match ? addr2Match[1].trim() : '';
        const cityStateZip = cityStateZipMatch ? cityStateZipMatch[1].trim() : '';
        const distance = distanceMatch ? distanceMatch[1].trim() : '';
        
        if (name && name.length > 0) {
          data.push({
            name: name,
            address1: address1,
            address2: address2,
            cityStateZip: cityStateZip,
            distance: distance,
            mapUrl: ''
          });
          console.log('Added site:', name);
        }
      }
    }
    
    // If the above didn't work, try a different approach
    if (data.length === 0) {
      // Look for pharmacy patterns in the text
      const pharmacyMatches = fullText.match(/([A-Z\s&,.]+PHARMACY[A-Z\s&,.]*)/g);
      
      if (pharmacyMatches) {
        for (const match of pharmacyMatches) {
          // Try to extract address info around each pharmacy
          const pharmacyIndex = fullText.indexOf(match);
          const surrounding = fullText.substring(Math.max(0, pharmacyIndex - 100), pharmacyIndex + 200);
          
          const addressMatch = surrounding.match(/([0-9]+[A-Z\s]+(?:AVE|ST|RD|DR|BLVD|WAY|LN|CT))/);
          const cityMatch = surrounding.match(/([A-Z\s]+,\s*[A-Z]{2}\s*[0-9]{5})/);
          const distMatch = surrounding.match(/([0-9.]+\s*miles?)/);
          
          data.push({
            name: match.trim(),
            address1: addressMatch ? addressMatch[1].trim() : '',
            address2: '',
            cityStateZip: cityMatch ? cityMatch[1].trim() : '',
            distance: distMatch ? distMatch[1].trim() : '',
            mapUrl: ''
          });
        }
      }
    }
    
    return data;
  });
  
  console.log(`Extracted ${results.length} sites from alternative structure`);
  return results;
}

/**
 * Enhanced extraction function that handles the actual table structure better
 */
async function extractFromTable(page, rowSelector) {
  console.log('Extracting data from table rows...');
  
  const results = await page.evaluate((selector) => {
    const rows = document.querySelectorAll(selector);
    const data = [];
    
    console.log(`Processing ${rows.length} rows`);
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cells = row.querySelectorAll('td, th');
      
      // Skip empty rows
      if (cells.length === 0) {
        console.log(`Row ${i}: Skipping empty row`);
        continue;
      }
      
      // Get all cell text for debugging
      const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
      console.log(`Row ${i}: Found ${cells.length} cells:`, cellTexts);
      
      // Skip header row (contains "Bus Name", "Addr 1", etc.)
      const rowText = row.textContent.toLowerCase();
      if (rowText.includes('bus name') || 
          rowText.includes('addr 1') || 
          rowText.includes('public controlled substance') ||
          rowText.includes('map mapbus')) {
        console.log(`Row ${i}: Skipping header row`);
        continue;
      }
      
      // Different strategies based on number of cells
      let siteData = {
        name: '',
        address1: '',
        address2: '',
        cityStateZip: '',
        distance: '',
        mapUrl: ''
      };
      
      if (cells.length >= 6) {
        // Standard 6-column format: Bus Name | Addr 1 | Addr 2 | City, State Zip | Dist | Map
        siteData = {
          name: cellTexts[0] || '',
          address1: cellTexts[1] || '',
          address2: cellTexts[2] || '',
          cityStateZip: cellTexts[3] || '',
          distance: cellTexts[4] || '',
          mapUrl: cells[5]?.querySelector('a')?.href || ''
        };
      } else if (cells.length === 5) {
        // 5-column format (no separate Addr 2): Bus Name | Addr 1 | City, State Zip | Dist | Map
        siteData = {
          name: cellTexts[0] || '',
          address1: cellTexts[1] || '',
          address2: '',
          cityStateZip: cellTexts[2] || '',
          distance: cellTexts[3] || '',
          mapUrl: cells[4]?.querySelector('a')?.href || ''
        };
      } else if (cells.length === 4) {
        // 4-column format: Bus Name | Address | City, State Zip | Dist
        siteData = {
          name: cellTexts[0] || '',
          address1: cellTexts[1] || '',
          address2: '',
          cityStateZip: cellTexts[2] || '',
          distance: cellTexts[3] || '',
          mapUrl: ''
        };
      } else if (cells.length >= 2) {
        // Fallback for irregular formats
        siteData = {
          name: cellTexts[0] || '',
          address1: cellTexts[1] || '',
          address2: cellTexts[2] || '',
          cityStateZip: cellTexts[3] || '',
          distance: cellTexts[4] || '',
          mapUrl: ''
        };
      }
      
      // Clean up the data
      siteData.name = siteData.name.replace(/^\s*Bus Name\s*/i, '').trim();
      siteData.distance = siteData.distance.replace(/^\s*Dist\s*/i, '').trim();
      
      // Only add if we have a valid business name
      if (siteData.name && siteData.name.length > 2 && !siteData.name.toLowerCase().includes('map')) {
        data.push(siteData);
        console.log(`Row ${i}: Added site:`, siteData.name);
      } else {
        console.log(`Row ${i}: Skipping invalid site:`, siteData.name);
      }
    }
    
    return data;
  }, rowSelector);
  
  console.log(`Successfully extracted ${results.length} disposal sites from table`);
  return results;
}

/**
 * Fetch DEA disposal sites for a given ZIP code and radius.
 * @param {string} zipCode ZIP code to search
 * @param {string} radius Radius in miles ('5','10','20','50')
 * @returns {Promise<Array>} list of disposal site objects
 */
export async function getDisposalSites(zipCode = '73120', radius = '20') {
  const url = 'https://apps.deadiversion.usdoj.gov/pubdispsearch/spring/main';
  let browser;
  
  try {
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set longer timeout and add user agent
    page.setDefaultTimeout(30000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    console.log('Loading search page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for page to be fully loaded
    await page.waitForSelector('form[name="searchForm"]', { timeout: 15000 });
    
    // Activate "Year-Round Drop-Off Locations" tab
    console.log('Activating Year-Round tab...');
    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('a')).find(a => /Year-Round/.test(a.textContent));
      if (tab) {
        tab.click();
        return true;
      }
      return false;
    });
    
    // Wait longer for tab to switch
    await new Promise(res => setTimeout(res, 2000));
    
    // Fill ZIP code input
    console.log(`Filling ZIP code: ${zipCode}...`);
    const zipSel = 'input[name="searchForm:zipCodeInput"]';
    await page.waitForSelector(zipSel, { timeout: 15000 });
    
    await page.evaluate((sel, zip) => {
      const input = document.querySelector(sel);
      if (input) {
        input.focus();
        input.value = '';
        input.value = zip;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, zipSel, zipCode);
    
    // Select radius radio
    console.log(`Selecting radius: ${radius} miles...`);
    const radiusSel = `input[name="searchForm:radiusInput"][value="${radius}"]`;
    await page.waitForSelector(radiusSel, { timeout: 15000 });
    
    await page.evaluate((sel) => {
      const radio = document.querySelector(sel);
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, radiusSel);
    
    // Wait before submitting
    await new Promise(res => setTimeout(res, 1000));
    
    // Submit form
    console.log('Submitting form...');
    let formSubmitted = false;
    
    // Try clicking the submit button first
    try {
      const submitButton = await page.$('input[type="submit"], button[type="submit"]');
      if (submitButton) {
        console.log('Found submit button, clicking...');
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          submitButton.click()
        ]);
        formSubmitted = true;
      }
    } catch (error) {
      console.log('Submit button click failed:', error.message);
    }
    
    // Try form.submit() if button click didn't work
    if (!formSubmitted) {
      try {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          page.evaluate(() => {
            const form = document.forms['searchForm'];
            if (form) {
              form.submit();
              return true;
            }
            return false;
          })
        ]);
        formSubmitted = true;
      } catch (error) {
        console.log('Form.submit() failed:', error.message);
      }
    }
    
    if (!formSubmitted) {
      throw new Error('Could not submit form using any method');
    }
    
    console.log('Form submitted, waiting for results...');
    
    // Wait for results
    await page.waitForSelector('body', { timeout: 5000 });
    await new Promise(res => setTimeout(res, 3000));
    
    // Check for no results
    const pageText = await page.evaluate(() => document.body.textContent);
    if (pageText.includes('No results') || pageText.includes('no results') || pageText.includes('No locations found')) {
      console.log('No results found for this location');
      return [];
    }
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'debug_page.png' });
    
    // Try to find table rows with more specific selectors
    const possibleSelectors = [
      'table tbody tr',
      'table tr',
      'tbody tr',
      'tr'
    ];
    
    let bestSelector = null;
    let maxRowsFound = 0;
    
    // Test each selector to find the one that gives us the most data rows
    for (const selector of possibleSelectors) {
      try {
        const rowCount = await page.evaluate((sel) => {
          const rows = document.querySelectorAll(sel);
          let dataRows = 0;
          
          for (const row of rows) {
            const cells = row.querySelectorAll('td, th');
            const text = row.textContent.toLowerCase();
            
            // Count rows that have cells and don't look like headers
            if (cells.length > 0 && 
                !text.includes('bus name') && 
                !text.includes('addr 1') &&
                !text.includes('public controlled substance') &&
                !text.includes('map mapbus')) {
              dataRows++;
            }
          }
          
          return dataRows;
        }, selector);
        
        console.log(`Selector ${selector}: found ${rowCount} data rows`);
        
        if (rowCount > maxRowsFound) {
          maxRowsFound = rowCount;
          bestSelector = selector;
        }
      } catch (error) {
        console.log(`Selector ${selector} failed: ${error.message}`);
      }
    }
    
    if (!bestSelector || maxRowsFound === 0) {
      console.log('No table rows found, trying alternative extraction...');
      return await extractFromAlternativeStructure(page);
    }
    
    console.log(`Using selector: ${bestSelector} (found ${maxRowsFound} rows)`);
    
    // Extract data using the best selector
    const results = await extractFromTable(page, bestSelector);
    
    if (results.length === 0) {
      console.log('Table extraction failed, trying alternative method...');
      return await extractFromAlternativeStructure(page);
    }
    
    console.log(`Successfully extracted ${results.length} disposal sites`);
    
    // Log a few examples for verification
    if (results.length > 0) {
      console.log('\nFirst few results:');
      results.slice(0, 3).forEach((site, index) => {
        console.log(`${index + 1}. ${site.name}`);
        console.log(`   Address: ${site.address1} ${site.address2}`);
        console.log(`   Location: ${site.cityStateZip}`);
        console.log(`   Distance: ${site.distance}`);
        console.log('');
      });
    }
    
    return results;
    
  } catch (error) {
    console.error('Error in getDisposalSites:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Example usage and testing function
export async function testScraper() {
  try {
    console.log('Testing scraper...');
    const results = await getDisposalSites('73120', '20');
    
    console.log(`\n=== RESULTS ===`);
    console.log(`Found ${results.length} disposal sites:\n`);
    
    results.forEach((site, index) => {
      console.log(`${index + 1}. ${site.name}`);
      console.log(`   Address: ${site.address1}${site.address2 ? ' ' + site.address2 : ''}`);
      console.log(`   Location: ${site.cityStateZip}`);
      console.log(`   Distance: ${site.distance}`);
      if (site.mapUrl) {
        console.log(`   Map: ${site.mapUrl}`);
      }
      console.log('');
    });
    
    return results;
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

// Uncomment to run test
testScraper();