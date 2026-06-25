// api/sheet.js  — Vercel serverless function
// Reads / writes the "Scheduler Data" sheet via Google Sheets API v4.
// Environment variables required (set in Vercel project settings):
//   SPREADSHEET_ID              — the ID from your Google Sheet URL
//   GOOGLE_SERVICE_ACCOUNT_JSON — full JSON string of the service-account key file
//   SHEET_NAME (optional)       — defaults to "Scheduler Data"

const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME     = process.env.SHEET_NAME || 'Scheduler Data';
const RANGE          = `${SHEET_NAME}!A:O`;

// Column order in the sheet (0-indexed):
// A=Code B=Name C=Manufacturer D=Pack Size(g) E=Prod M1 F=Prod M2
// G=SKU Class H=Current Stock I=DRR J=DOI K=Line Cap L=Min Cap M=Max Cap
// N=Priority O=Segment
const COL = {
  code:0, name:1, manufacturer:2, packSize:3,
  prodM1:4, prodM2:5, skuClass:6, currentStock:7,
  drr:8, doi:9, lineCap:10, minCap:11, maxCap:12,
  priority:13, segment:14,
};
const HEADER = [
  'SKU Code','SKU Name','Manufacturer','Pack Size (g)',
  'Production Plan M1','Production Plan M2',
  'SKU Class','Current Stock','DRR','DOI','Line Cap','Min Cap','Max Cap',
  'Priority','Segment',
];

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function num(v) {
  const n = parseFloat(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function rowToSku(row) {
  return {
    code:         String(row[COL.code]  ?? '').trim(),
    name:         String(row[COL.name]  ?? '').trim(),
    manufacturer: String(row[COL.manufacturer] ?? '').trim().toLowerCase(),
    packSize:     num(row[COL.packSize]),
    prodM1:       num(row[COL.prodM1]),
    prodM2:       num(row[COL.prodM2]),
    skuClass:     String(row[COL.skuClass] ?? 'A').trim().toUpperCase() || 'A',
    currentStock: num(row[COL.currentStock]),
    drr:          num(row[COL.drr]),
    doi:          num(row[COL.doi]),
    lineCap:      num(row[COL.lineCap]) || 10000,
    minCap:       num(row[COL.minCap])  || 1000,
    maxCap:       num(row[COL.maxCap])  || 10000,
    priority:     String(row[COL.priority] ?? '').trim() || null,
    segment:      String(row[COL.segment] ?? '').trim() || null,
  };
}

function skuToRow(sku, manufacturer) {
  return [
    sku.code, sku.name, manufacturer,
    sku.packSize, sku.prodM1, sku.prodM2,
    sku.skuClass, sku.currentStock, sku.drr, sku.doi,
    sku.lineCap, sku.minCap, sku.maxCap,
    sku.priority || '', sku.segment || '',
  ];
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SPREADSHEET_ID) {
    return res.status(500).json({ error: 'SPREADSHEET_ID env var is not set.' });
  }

  try {
    const auth   = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    /* ── GET: return all SKU data grouped by manufacturer ───────────── */
    if (req.method === 'GET') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: RANGE,
      });

      const rows = response.data.values || [];
      // If sheet is empty, return empty result (no crash)
      if (rows.length < 2) return res.json({ manufacturers: {} });

      const [, ...dataRows] = rows; // skip header row
      const manufacturers   = {};

      for (const row of dataRows) {
        const sku = rowToSku(row);
        if (!sku.code) continue;
        const mfr = sku.manufacturer || 'default';
        if (!manufacturers[mfr]) manufacturers[mfr] = { skus: [] };
        manufacturers[mfr].skus.push(sku);
      }

      return res.json({ manufacturers });
    }

    /* ── POST: update (or append) rows for one manufacturer ─────────── */
    if (req.method === 'POST') {
      const { manufacturer, skus } = req.body;
      if (!manufacturer || !Array.isArray(skus)) {
        return res.status(400).json({ error: 'Request body must include manufacturer and skus[].' });
      }

      // Read existing data to find which rows already exist
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: RANGE,
      });
      const allRows = existing.data.values || [];

      // Ensure header row exists
      if (allRows.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [HEADER] },
        });
        allRows.push(HEADER);
      }

      // Map: skuCode → 1-based sheet row number
      const rowIndexByCode = {};
      for (let i = 1; i < allRows.length; i++) {
        const code = String(allRows[i][COL.code] ?? '').trim();
        if (code) rowIndexByCode[code] = i + 1; // sheet rows are 1-indexed; +1 because header is row 1
      }

      const batchData = [];
      const newRows   = [];

      for (const sku of skus) {
        const rowData = skuToRow(sku, manufacturer);
        if (rowIndexByCode[sku.code] !== undefined) {
          const sheetRow = rowIndexByCode[sku.code];
          batchData.push({
            range:  `${SHEET_NAME}!A${sheetRow}:O${sheetRow}`,
            values: [rowData],
          });
        } else {
          newRows.push(rowData);
        }
      }

      if (batchData.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: batchData },
        });
      }

      if (newRows.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A:O`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: newRows },
        });
      }

      return res.json({ success: true, updated: batchData.length, added: newRows.length });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('[sheet.js]', err);
    return res.status(500).json({ error: err.message });
  }
};
