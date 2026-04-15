# ⚡ Energy Vault
### Centrica Archive Intelligence Tool

A local search, browse, and AI-powered knowledge tool for your Centrica document and email archive.

---

## What it does

- Live search across all your files by keyword, date, file type, or category
- AI-powered auto-categorisation using Claude API
- One-click document summarisation
- Opens files natively on your Mac
- Everything stays local — nothing goes to the cloud except Anthropic API calls

---

## Setup (one time only)

### 1. Install Node.js
Download from https://nodejs.org — choose the LTS version.

### 2. Copy this folder to your Mac
Put the `energy-vault` folder somewhere sensible, e.g. your Desktop or Documents.

### 3. Install dependencies
Open Terminal, navigate to the folder, and run:

```
cd ~/Desktop/energy-vault
npm install
```

### 4. Start the app
```
npm start
```

### 5. Open in browser
Go to: **http://localhost:3747**

### 6. First run setup
- Enter the path to your archive folder (e.g. `/Volumes/MyDrive/Centrica`)
- Enter your Anthropic API key (get one at console.anthropic.com)
- Click **Open Vault**

---

## Finding your folder path on Mac

1. Open Finder and navigate to your archive folder
2. Right-click the folder → **Get Info**
3. The path is shown under **Where:** — copy it and add the folder name at the end

Example: `/Volumes/Seagate/Centrica Archive`

---

## Supported file types

PDF, Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx), Email (.eml/.msg), Text (.txt), CSV

> **Note:** Convert your PST files to .eml format first using Aid4Mail before pointing the Vault at your folder.

---

## Pre-built categories

The app will auto-suggest one of these categories for each file:

- Smart Metering & Technology
- B2B Sales & Accounts
- Residential & SME
- Contracts & Commercial
- Strategy & Market Analysis
- Energy Products & Tariffs
- Regulatory & Compliance
- Internal Comms & HR
- Finance & Reporting
- Operations & Field
- Partnerships & Third Party
- Marketing & Communications
- Other

---

## To stop the app
Press `Ctrl+C` in Terminal.

## To start again next time
Just run `npm start` from the energy-vault folder and go to http://localhost:3747
