# RootRel — site + backend

A working full-stack setup: the marketing site, a zero-dependency Node.js
API, and an admin dashboard, all wired together.

## Run it locally

No `npm install` needed — the backend only uses Node's built-in modules.

```bash
node server.js
```

Then open:

- Site → http://localhost:3000
- Admin dashboard → http://localhost:3000/admin.html (password: `rootrel-admin`)

Change the admin password:

```bash
ADMIN_PASSWORD=your-new-password node server.js
```

## What's actually working

- `POST /api/waitlist` — validates email/country/interest, blocks duplicate emails, saves to `data/db.json`
- `POST /api/contact` — validates and saves contact messages
- `POST /api/careers` — validates and saves job applications (the "Apply Now" buttons on the Careers section open a real form)
- `POST /api/admin/login` — checks the admin password, issues a session token
- `GET /api/admin/{waitlist|contacts|careers}` — token-protected, returns saved records
- `DELETE /api/admin/{collection}/{id}` — token-protected, deletes a record
- `GET /api/admin/export/{collection}` — downloads a CSV
- The waitlist, contact, and application forms on the site call these routes for real — try submitting one, then check the admin dashboard.

All data lives in `data/db.json`, a plain JSON file created automatically on first run.

## Deploying

### Option A — a real server (Railway, Render, Fly.io, a VPS, etc.)
This is the easiest path, because this backend is a long-running Node
process with a local file it reads and writes. Point any of those
platforms at this repo with `node server.js` as the start command and
it works as-is. Set `ADMIN_PASSWORD` as an environment variable there.

### Option B — Vercel
Vercel doesn't run a persistent server like `server.js` — it runs
short-lived serverless functions, and their filesystem is wiped between
requests, so `data/db.json` won't persist. To deploy this specific
backend on Vercel you'd need to:

1. Convert each route in `server.js` into its own file under `/api`
   (e.g. `/api/waitlist.js`, `/api/contact.js`) using Vercel's Node
   function format.
2. Swap the JSON-file database for a real hosted database — Vercel
   Postgres, Supabase, or similar — since serverless functions can't
   share a local file.

The frontend alone (no live data) still deploys to Vercel instantly by
dragging this folder into vercel.com/new — same as before — you'd just
lose the working forms until the API is moved to a hosted database.
I'm glad to build the Vercel-native version (the `/api` functions +
a Postgres/Supabase schema) as the next step if you'd like to deploy
there specifically.

## Project structure

```
index.html        the site
admin.html         admin dashboard (login + data tables + CSV export)
server.js          the backend — API routes + static file server
assets/            logo + terrain images
data/db.json        auto-created on first run — waitlist/contacts/careers records
package.json
```
