// RootRel backend — plain Node.js, zero npm dependencies.
// Run it with:  node server.js
// Then open:    http://localhost:3000

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'rootrel-admin'; // change this in production
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const SESSIONS = new Map(); // token -> expiry timestamp

// ---------- tiny file database ----------
function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    const empty = { waitlist: [], contacts: [], careers: [] };
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ---------- helpers ----------
function send(res, status, body, headers = {}) {
  const isJson = typeof body === 'object';
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json' : 'text/plain',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) req.destroy(); // 2MB cap
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function requireAdmin(req, url) {
  const token = req.headers['x-admin-token'] || (url && url.searchParams.get('token'));
  if (!token || !SESSIONS.has(token)) return false;
  if (SESSIONS.get(token) < Date.now()) {
    SESSIONS.delete(token);
    return false;
  }
  return true;
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveStatic(req, res, urlPath) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(__dirname, safePath === '/' ? 'index.html' : safePath);
  if (!filePath.startsWith(__dirname)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(filePath, (err, content) => {
    if (err) return send(res, 404, { error: 'Not found' });
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------- request handler ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') return send(res, 204, '');

  try {
    // ----- POST /api/waitlist -----
    if (pathname === '/api/waitlist' && req.method === 'POST') {
      const body = await readBody(req);
      const { email, country, interest } = body;
      if (!isEmail(email)) return send(res, 400, { error: 'A valid email is required.' });
      if (!country || !country.trim()) return send(res, 400, { error: 'Country is required.' });
      if (!interest || !interest.trim()) return send(res, 400, { error: 'Interest is required.' });

      const db = readDb();
      if (db.waitlist.some((w) => w.email.toLowerCase() === email.toLowerCase())) {
        return send(res, 409, { error: 'This email is already on the waitlist.' });
      }
      const entry = { id: crypto.randomUUID(), email, country: country.trim(), interest, createdAt: new Date().toISOString() };
      db.waitlist.push(entry);
      writeDb(db);
      return send(res, 201, { message: "You're on the list.", entry });
    }

    // ----- POST /api/contact -----
    if (pathname === '/api/contact' && req.method === 'POST') {
      const body = await readBody(req);
      const { name, email, subject, message } = body;
      if (!name || !name.trim()) return send(res, 400, { error: 'Name is required.' });
      if (!isEmail(email)) return send(res, 400, { error: 'A valid email is required.' });
      if (!subject || !subject.trim()) return send(res, 400, { error: 'Subject is required.' });
      if (!message || !message.trim()) return send(res, 400, { error: 'Message is required.' });

      const db = readDb();
      const entry = { id: crypto.randomUUID(), name, email, subject, message, createdAt: new Date().toISOString() };
      db.contacts.push(entry);
      writeDb(db);
      return send(res, 201, { message: 'Message sent.', entry });
    }

    // ----- POST /api/careers -----
    if (pathname === '/api/careers' && req.method === 'POST') {
      const body = await readBody(req);
      const { role, name, email, phone, country, linkedin, github, portfolio, resumeUrl, coverLetter } = body;
      if (!role || !role.trim()) return send(res, 400, { error: 'Role is required.' });
      if (!name || !name.trim()) return send(res, 400, { error: 'Name is required.' });
      if (!isEmail(email)) return send(res, 400, { error: 'A valid email is required.' });

      const db = readDb();
      const entry = {
        id: crypto.randomUUID(), role, name, email,
        phone: phone || '', country: country || '', linkedin: linkedin || '',
        github: github || '', portfolio: portfolio || '', resumeUrl: resumeUrl || '',
        coverLetter: coverLetter || '', createdAt: new Date().toISOString(),
      };
      db.careers.push(entry);
      writeDb(db);
      return send(res, 201, { message: 'Application received.', entry });
    }

    // ----- POST /api/admin/login -----
    if (pathname === '/api/admin/login' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.password !== ADMIN_PASSWORD) return send(res, 401, { error: 'Incorrect password.' });
      const token = crypto.randomBytes(24).toString('hex');
      SESSIONS.set(token, Date.now() + 1000 * 60 * 60 * 4); // 4 hour session
      return send(res, 200, { token });
    }

    // ----- GET /api/admin/:collection -----
    const adminGet = pathname.match(/^\/api\/admin\/(waitlist|contacts|careers)$/);
    if (adminGet && req.method === 'GET') {
      if (!requireAdmin(req, url)) return send(res, 401, { error: 'Unauthorized.' });
      const db = readDb();
      return send(res, 200, db[adminGet[1]]);
    }

    // ----- DELETE /api/admin/:collection/:id -----
    const adminDelete = pathname.match(/^\/api\/admin\/(waitlist|contacts|careers)\/([\w-]+)$/);
    if (adminDelete && req.method === 'DELETE') {
      if (!requireAdmin(req, url)) return send(res, 401, { error: 'Unauthorized.' });
      const [, collection, id] = adminDelete;
      const db = readDb();
      const before = db[collection].length;
      db[collection] = db[collection].filter((item) => item.id !== id);
      writeDb(db);
      if (db[collection].length === before) return send(res, 404, { error: 'Not found.' });
      return send(res, 200, { message: 'Deleted.' });
    }

    // ----- GET /api/admin/export/:collection (CSV) -----
    const adminExport = pathname.match(/^\/api\/admin\/export\/(waitlist|contacts|careers)$/);
    if (adminExport && req.method === 'GET') {
      if (!requireAdmin(req, url)) return send(res, 401, { error: 'Unauthorized.' });
      const db = readDb();
      const rows = db[adminExport[1]];
      if (rows.length === 0) return send(res, 200, '', { 'Content-Type': 'text/csv' });
      const headers = Object.keys(rows[0]);
      const csv = [headers.join(',')]
        .concat(rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')))
        .join('\n');
      return send(res, 200, csv, {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${adminExport[1]}.csv"`,
      });
    }

    // ----- static files (site + admin dashboard) -----
    if (req.method === 'GET') return serveStatic(req, res, pathname);

    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`RootRel server running → http://localhost:${PORT}`);
  console.log(`Admin dashboard        → http://localhost:${PORT}/admin.html`);
  console.log(`Admin password         → ${ADMIN_PASSWORD} (set ADMIN_PASSWORD env var to change it)`);
});
