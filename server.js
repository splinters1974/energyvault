const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const cors = require('cors');
const MsgReader = require('@kenjiuno/msgreader').default;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const CONFIG_FILE = path.join(__dirname, 'vault-config.json');

// Load or initialise config
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  return { vaultPath: '', apiKey: '' };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Supported file types
const SUPPORTED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.ppt', '.pptx', '.eml', '.txt', '.csv', '.msg'
];

// Recursively scan directory for supported files
function scanDirectory(dirPath) {
  const files = [];
  if (!fs.existsSync(dirPath)) return files;

  function walk(currentPath) {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.includes(ext)) {
            const stats = fs.statSync(fullPath);
            files.push({
              id: Buffer.from(fullPath).toString('base64'),
              name: entry.name,
              path: fullPath,
              ext: ext.replace('.', '').toUpperCase(),
              size: stats.size,
              modified: stats.mtime,
              created: stats.birthtime,
              category: null
            });
          }
        }
      }
    } catch (e) {
      // Skip unreadable directories
    }
  }

  walk(dirPath);
  return files;
}

// Get file type label
function getFileType(ext) {
  const types = {
    '.pdf': 'PDF', '.doc': 'Word', '.docx': 'Word',
    '.xls': 'Excel', '.xlsx': 'Excel',
    '.ppt': 'PowerPoint', '.pptx': 'PowerPoint',
    '.eml': 'Email', '.msg': 'Email',
    '.txt': 'Text', '.csv': 'CSV'
  };
  return types[ext.toLowerCase()] || 'File';
}

// Format file size
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// GET config
app.get('/api/config', (req, res) => {
  const config = loadConfig();
  res.json({ vaultPath: config.vaultPath, hasApiKey: !!config.apiKey });
});

// POST config
app.post('/api/config', (req, res) => {
  const config = loadConfig();
  if (req.body.vaultPath !== undefined) config.vaultPath = req.body.vaultPath;
  if (req.body.apiKey !== undefined) config.apiKey = req.body.apiKey;
  saveConfig(config);
  res.json({ success: true });
});

// GET files - live search
app.get('/api/files', (req, res) => {
  const config = loadConfig();
  if (!config.vaultPath) return res.json({ files: [], total: 0 });

  const { search = '', type = '', category = '', dateFrom = '', dateTo = '' } = req.query;

  let files = scanDirectory(config.vaultPath);

  // Load saved categories
  const catFile = path.join(__dirname, 'vault-categories.json');
  const categories = fs.existsSync(catFile) ? JSON.parse(fs.readFileSync(catFile, 'utf8')) : {};
  files = files.map(f => ({ ...f, category: categories[f.id] || null, typeLabel: getFileType('.' + f.ext.toLowerCase()), sizeLabel: formatSize(f.size) }));

  // Filter by search
  if (search) {
    const q = search.toLowerCase();
    files = files.filter(f =>
      f.name.toLowerCase().includes(q) ||
      (f.category && f.category.toLowerCase().includes(q))
    );
  }

  // Filter by type
  if (type) {
    files = files.filter(f => f.typeLabel.toLowerCase() === type.toLowerCase());
  }

  // Filter by category
  if (category) {
    files = files.filter(f => f.category === category);
  }

  // Filter by date range
  if (dateFrom) {
    files = files.filter(f => new Date(f.modified) >= new Date(dateFrom));
  }
  if (dateTo) {
    files = files.filter(f => new Date(f.modified) <= new Date(dateTo));
  }

  // Sort
  const sort = req.query.sort || 'date-desc';
  files.sort((a, b) => {
    switch (sort) {
      case 'date-asc':  return new Date(a.modified) - new Date(b.modified);
      case 'name-asc':  return a.name.localeCompare(b.name);
      case 'name-desc': return b.name.localeCompare(a.name);
      case 'type':      return a.typeLabel.localeCompare(b.typeLabel) || a.name.localeCompare(b.name);
      case 'size-desc': return b.size - a.size;
      case 'size-asc':  return a.size - b.size;
      default:          return new Date(b.modified) - new Date(a.modified); // date-desc
    }
  });

  res.json({ files, total: files.length });
});

// GET categories list
app.get('/api/categories', (req, res) => {
  const catFile = path.join(__dirname, 'vault-categories.json');
  const categories = fs.existsSync(catFile) ? JSON.parse(fs.readFileSync(catFile, 'utf8')) : {};
  const unique = [...new Set(Object.values(categories))].filter(Boolean).sort();
  res.json({ categories: unique });
});

// POST save category for a file
app.post('/api/category', (req, res) => {
  const { fileId, category } = req.body;
  const catFile = path.join(__dirname, 'vault-categories.json');
  const categories = fs.existsSync(catFile) ? JSON.parse(fs.readFileSync(catFile, 'utf8')) : {};
  categories[fileId] = category;
  fs.writeFileSync(catFile, JSON.stringify(categories, null, 2));
  res.json({ success: true });
});

// GET download file
app.get('/api/download', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath);
});

// POST open file natively
app.post('/api/open', (req, res) => {
  const { filePath } = req.body;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  exec(`open "${filePath}"`, (err) => {
    if (err) return res.status(500).json({ error: 'Could not open file' });
    res.json({ success: true });
  });
});

// GET pick folder via native macOS dialog
app.get('/api/pick-folder', (req, res) => {
  exec(`osascript -e 'POSIX path of (choose folder with prompt "Select your Centrica vault folder")'`, (err, stdout) => {
    if (err) {
      const cancelled = err.message && err.message.includes('-128');
      return res.status(400).json({ error: cancelled ? 'cancelled' : 'Could not open folder picker' });
    }
    res.json({ path: stdout.trim() });
  });
});

// POST summarise via Claude API
app.post('/api/summarise', async (req, res) => {
  const { filePath, fileName } = req.body;
  const config = loadConfig();

  if (!config.apiKey) return res.status(400).json({ error: 'No API key configured' });
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const ext = path.extname(filePath).toLowerCase();

  try {
    let content = '';
    let messageContent = [];

    if (ext === '.pdf') {
      const fileData = fs.readFileSync(filePath);
      const base64Data = fileData.toString('base64');
      messageContent = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64Data }
        },
        {
          type: 'text',
          text: `Please provide a concise professional summary of this document called "${fileName}". Include: what it covers, key topics or decisions, any notable figures or clients mentioned, and why it might be useful to reference. Keep it to 3-4 paragraphs maximum.`
        }
      ];
    } else if (ext === '.msg') {
      // Parse Outlook .msg binary format
      try {
        const buffer = fs.readFileSync(filePath);
        const reader = new MsgReader(buffer);
        const msgData = reader.getFileData();
        const subject = msgData.subject || '(no subject)';
        const sender = [msgData.senderName, msgData.senderSmtpAddress].filter(Boolean).join(' ');
        const recipients = (msgData.recipients || []).map(r => r.name || r.smtpAddress).filter(Boolean).join(', ');
        const date = msgData.messageDeliveryTime || '';
        const body = (msgData.body || '').substring(0, 6000);
        content = `Subject: ${subject}\nFrom: ${sender}\nTo: ${recipients}\nDate: ${date}\n\n${body}`;
      } catch (e) {
        content = `File: ${fileName} (could not parse .msg content)`;
      }
      messageContent = [
        {
          type: 'text',
          text: `Please provide a concise professional summary of this Outlook email called "${fileName}". Here is its content:\n\n${content}\n\nInclude: who sent it and to whom, what it is about, any key decisions or actions, notable clients or projects mentioned, and why it might be useful to reference. Keep it to 3-4 paragraphs maximum.`
        }
      ];
    } else if (['.doc', '.docx', '.xls', '.xlsx', '.eml', '.txt', '.csv'].includes(ext)) {
      // For text-based files, read what we can
      try {
        content = fs.readFileSync(filePath, 'utf8').substring(0, 8000);
      } catch (e) {
        content = `File: ${fileName} (binary format - limited preview available)`;
      }
      messageContent = [
        {
          type: 'text',
          text: `Please provide a concise professional summary of this file called "${fileName}". Here is its content:\n\n${content}\n\nInclude: what it covers, key topics or decisions, any notable figures or clients mentioned, and why it might be useful to reference. Keep it to 3-4 paragraphs maximum.`
        }
      ];
    } else {
      messageContent = [{ type: 'text', text: `Summarise a file called "${fileName}" of type ${ext}. Explain what this type of file typically contains in a professional energy sector context and what to expect from it.` }];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: messageContent }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const summary = data.content.find(b => b.type === 'text')?.text || 'No summary available.';
    res.json({ summary });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST suggest category via Claude API
app.post('/api/suggest-category', async (req, res) => {
  const { fileName, filePath } = req.body;
  const config = loadConfig();

  if (!config.apiKey) return res.status(400).json({ error: 'No API key configured' });

  const CATEGORIES = [
    'Smart Metering & Technology', 'B2B Sales & Accounts', 'Residential & SME',
    'Contracts & Commercial', 'Strategy & Market Analysis', 'Energy Products & Tariffs',
    'Regulatory & Compliance', 'Internal Comms & HR', 'Finance & Reporting',
    'Operations & Field', 'Partnerships & Third Party', 'Marketing & Communications', 'Other'
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Based on this filename from a Centrica/British Gas energy company archive: "${fileName}", which single category best fits it?\n\nCategories: ${CATEGORIES.join(', ')}\n\nRespond with ONLY the category name, nothing else.`
        }]
      })
    });

    const data = await response.json();
    const suggested = data.content.find(b => b.type === 'text')?.text?.trim() || 'Other';
    const matched = CATEGORIES.find(c => c.toLowerCase() === suggested.toLowerCase()) || 'Other';
    res.json({ category: matched });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET stats
app.get('/api/stats', (req, res) => {
  const config = loadConfig();
  if (!config.vaultPath) return res.json({ total: 0, byType: {}, byCategory: {}, totalSize: 0, categorised: 0, uncategorised: 0, oldest: null, newest: null });

  const files = scanDirectory(config.vaultPath);
  const catFile = path.join(__dirname, 'vault-categories.json');
  const categories = fs.existsSync(catFile) ? JSON.parse(fs.readFileSync(catFile, 'utf8')) : {};

  const byType = {};
  const byCategory = {};
  let totalSize = 0;
  let categorised = 0;
  let oldest = null;
  let newest = null;

  files.forEach(f => {
    const type = getFileType('.' + f.ext.toLowerCase());
    byType[type] = (byType[type] || 0) + 1;
    const cat = categories[f.id] || null;
    if (cat) {
      categorised++;
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    } else {
      byCategory['Uncategorised'] = (byCategory['Uncategorised'] || 0) + 1;
    }
    totalSize += f.size || 0;
    const mtime = new Date(f.modified);
    if (!oldest || mtime < oldest) oldest = mtime;
    if (!newest || mtime > newest) newest = mtime;
  });

  res.json({
    total: files.length,
    byType,
    byCategory,
    totalSize,
    categorised,
    uncategorised: files.length - categorised,
    oldest: oldest ? oldest.toISOString() : null,
    newest: newest ? newest.toISOString() : null
  });
});

const PORT = 3747;
app.listen(PORT, () => {
  console.log(`\n⚡ Energy Vault running at http://localhost:${PORT}\n`);
});
