# Smart Outreach — Backend

Express + TypeScript API server. Handles auth, campaigns, Gmail sync, inbox, and email tracking.

## Stack

- Node.js / Express 4
- TypeScript (compiled to `dist/`)
- MongoDB / Mongoose
- Gmail API (OAuth2)
- Nodemailer (SMTP)

## Local Setup

```bash
npm install
cp .env.example .env   # fill in your values
npm run dev            # ts-node + nodemon, runs on :4000
```

## Build & Start (Production)

```bash
npm run build   # tsc → compiles to dist/
npm start       # node dist/server.js
```

## Render Deployment

| Setting | Value |
|---|---|
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `node dist/server.js` |

> `typescript` is in `dependencies` (not devDependencies) so Render's production `npm install` includes it and `tsc` is available during build.

Set all variables from `.env.example` in Render's **Environment** tab.

## Environment Variables

See `.env.example` for the full list. Required ones:

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `SMTP_USER` / `SMTP_PASS` | Gmail app password for sending emails |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` | Google OAuth2 credentials |
| `GMAIL_REDIRECT_URI` | Must match Google Cloud Console (e.g. `https://yourfrontend.com/api/gmail/callback`) |
| `TRACKING_BASE_URL` | Public URL of this backend (e.g. `https://your-backend.onrender.com/api/track`) |

## API Routes

| Prefix | Description |
|---|---|
| `POST /api/login` | Auth |
| `POST /api/signup` | Register |
| `GET /api/prospects/search` | Prospect search |
| `GET/POST /api/campaigns` | Campaign CRUD |
| `GET /api/inbox` | Inbox messages |
| `GET /api/gmail/sync` | Sync Gmail inbox |
| `GET /api/track` | Email click/open tracking |
