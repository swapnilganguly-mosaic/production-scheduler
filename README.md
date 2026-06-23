# Production Scheduler — Vercel + GitHub + Google Sheets

A browser-based production scheduler that reads and writes data from a Google Sheet, hosted on Vercel and version-controlled on GitHub.

---

## Project structure

```
production-scheduler/
├── index.html          ← the full scheduler UI
├── api/
│   └── sheet.js        ← Vercel serverless function (reads/writes Google Sheets)
├── package.json
├── vercel.json
├── .env.example        ← copy to .env for local dev
└── .gitignore
```

---

## Google Sheet setup

Your sheet ID is already pre-filled: `1_8vj8EFB1xGDpNxn-uUGZNWYG2shDLkWi-Po1s15OTw`

The app expects a sheet tab named **"Scheduler Data"** with these columns in row 1 (A–M):

| A | B | C | D | E | F | G | H | I | J | K | L | M |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SKU Code | SKU Name | Manufacturer | Pack Size (g) | Production Plan M1 | Production Plan M2 | SKU Class | Current Stock | DRR | DOI | Line Cap | Min Cap | Max Cap |

> **Tip:** The `Manufacturer` column value should be `sapiens` (lowercase) to match the existing dropdown. You can add more manufacturers by adding more rows with a different value in column C.

---

## Part 1 — Google Cloud service account

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com) and sign in with your Google account (swapnil.ganguly@mosaicwellness.in).

2. Create a new project (or reuse an existing one). Give it a name like `production-scheduler`.

3. In the left sidebar go to **APIs & Services → Library**. Search for **"Google Sheets API"** and click **Enable**.

4. Go to **APIs & Services → Credentials**. Click **"+ Create Credentials" → Service account**.
   - Name it anything, e.g. `scheduler-backend`
   - Click **Create and Continue**, then skip the optional role steps and click **Done**

5. Click on the newly created service account email to open it, then go to the **Keys** tab.
   Click **Add Key → Create new key → JSON**. A `.json` file will download — keep it safe.

6. Open your Google Sheet. Click **Share** (top right).
   Paste the service account email (looks like `scheduler-backend@your-project.iam.gserviceaccount.com`) and give it **Editor** access. Click **Send**.

---

## Part 2 — GitHub repo

1. Go to [https://github.com/new](https://github.com/new) and create a new **private** repository called `production-scheduler`.

2. On your computer, open Terminal (Mac) or Command Prompt (Windows) in the `production-scheduler/` folder and run:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/production-scheduler.git
git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

---

## Part 3 — Deploy on Vercel

1. Go to [https://vercel.com](https://vercel.com) and sign in with your GitHub account.

2. Click **"Add New → Project"**. Import your `production-scheduler` GitHub repository.

3. Vercel will auto-detect the settings. Leave everything as defaults and click **Deploy**.

4. After the first deploy, go to your project → **Settings → Environment Variables** and add these three variables:

| Name | Value |
|------|-------|
| `SPREADSHEET_ID` | `1_8vj8EFB1xGDpNxn-uUGZNWYG2shDLkWi-Po1s15OTw` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Paste the **entire contents** of the downloaded `.json` key file as one line |
| `SHEET_NAME` | `Scheduler Data` |

5. After adding the env vars, go to **Deployments** and click **Redeploy** (so the new env vars take effect).

6. Your app is live at the Vercel URL shown in the dashboard (e.g. `https://production-scheduler.vercel.app`).

---

## How the sync works

- **On page load:** The app automatically fetches all SKU rows from the Google Sheet and populates the tables. If the sheet is empty or unreachable, the hardcoded Sapiens SKU list is shown as a fallback.

- **Editing:** All edits are in-browser only until you save.

- **"💾 Save to Sheet":** Writes every row for the current manufacturer back to the sheet. Existing rows are updated in place; new SKU codes are appended.

- **"↻ Reload from Sheet":** Discards in-browser edits and re-fetches from the sheet.

---

## Local development

```bash
npm install
npx vercel dev        # requires Vercel CLI: npm i -g vercel
```

Copy `.env.example` to `.env` and fill in your credentials before running locally.

---

## Adding a new manufacturer

1. In your Google Sheet, add rows with the new manufacturer's name in column C (e.g. `acme`).
2. Click **"↻ Reload from Sheet"** in the app — the new manufacturer will appear in the dropdown automatically.

No code changes needed.
