// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './data/disposal_events.db';

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// SQLite setup
db = new sqlite3.Database(DB_PATH, err => {
  if (err) console.error('Error opening database:', err);
  else console.log('Connected to SQLite database');
});

// Initialize table
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS disposal_events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zipCode TEXT NOT NULL,
    phone TEXT,
    hours TEXT,
    eventDate TEXT,
    eventTime TEXT,
    latitude REAL,
    longitude REAL,
    isTemporary INTEGER DEFAULT 0,
    lastUpdated TEXT,
    source TEXT
  )`);
});

// Scraper endpoint
app.post('/api/scrape', async (req, res) => {
  const { zipCode, radius, radiusMiles } = req.body;
  if (!zipCode) return res.status(400).json({ error: 'zipCode is required' });
  const rad = radius || radiusMiles || '5';

  try {
    // Build file:// URL for scrape.mjs
    const moduleUrl = pathToFileURL(path.join(__dirname, 'scrape.mjs')).href;
    const scraper = await import(moduleUrl);

    if (typeof scraper.getDisposalSites !== 'function') {
      console.error('Invalid export from scrape.mjs:', Object.keys(scraper));
      return res.status(500).json({ error: 'Invalid scraper module' });
    }

    const sites = await scraper.getDisposalSites(zipCode, String(rad));
    return res.json({ success: true, sites });
  } catch (err) {
    console.error('Error in /api/scrape:', err);
    return res.status(500).json({ error: 'Scrape failed' });
  }
});

// Your existing routes (move them here)
app.get('/api/disposal-events/nearby', async (req, res) => { /* ... */ });
app.get('/api/disposal-events/zip/:zipCode', async (req, res) => { /* ... */ });
app.post('/api/disposal-events/update', async (req, res) => { /* ... */ });
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

// Start server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  db.close(err => {
    if (err) console.error('Error closing DB:', err);
    else console.log('DB closed');
    process.exit(0);
  });
});