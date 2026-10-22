# ShareShed — Neighbourhood Tool & Equipment Library

> **This README is also the project report.** Fill in the "Project report" section as the team goes (team name, Scrum Master, sprint notes, screenshots).

A MERN-stack platform where neighbours lend and borrow tools and equipment instead of everyone buying their own.

**Stack:** MongoDB (Atlas) · Express · React (Vite) · Node.js — plus Mongoose, JWT (httpOnly cookie), bcrypt, multer, nodemailer, (Sprint 2: Stripe).

## Repository layout

```
shareshed/
├── client/                 React app (Vite)
│   └── src/
│       ├── api/            one axios client file per backend route file
│       ├── components/     common/ (shared UI) + one folder per feature
│       ├── context/        AuthContext (current user)
│       ├── pages/          one folder per area (auth, account, items, lender, admin, ...)
│       ├── routes/         routeConfig.jsx (all routes, pre-registered) + AppRoutes.jsx
│       ├── styles/ utils/
├── server/                 Express API (MVC)
│   ├── uploads/            public/ (item photos, manuals) · private/ (lender documents)
│   └── src/
│       ├── config/         env, db, constants
│       ├── models/         Mongoose schemas (see docs/SCHEMA.md)
│       ├── controllers/    request handlers (one file per feature)
│       ├── routes/         <name>.routes.js are AUTO-mounted at /api/<kebab-name>
│       ├── middleware/     auth (protect), roles, upload, validate, errorHandler
│       ├── utils/          ApiError, asyncHandler, email, tokens, validators, pagination
│       └── seed/           demo data
└── docs/                   SCHEMA.md · API_CONTRACT.md · OWNERSHIP.md · TEAM_WORKFLOW.md
```

Architecture: **MVC on the server** (models / controllers / routes) and a **component-based structure on the client** (pages → feature components → shared components).

## Prerequisites
Node.js 20+ (LTS), Git, a free MongoDB Atlas account (or a local MongoDB).

## Setup (first time)

```bash
git clone <repo-url> && cd <repo>
npm run install:all                     # root + server + client dependencies
cp server/.env.example server/.env      # then edit server/.env (see table below)
cp client/.env.example client/.env      # optional in dev
npm run seed                            # demo data (admin, member, lender, categories, items, tiers)
npm run dev                             # API on :5000  +  web on :5173
```

Open http://localhost:5173. All seeded users have password `Passw0rd!`: `admin`, `member1`, `member2`, `lender1` (verified lender), `applicant`.
In dev, the **DEV** button (bottom-right) logs you in as any of them in one click.

### Database setup (MongoDB Atlas)
1. Create a free **M0** cluster at https://cloud.mongodb.com.
2. *Database Access* → add a database user (username + password, "Read and write to any database").
3. *Network Access* → add each teammate's IP, or `0.0.0.0/0` for the course project.
4. *Connect → Drivers* → copy the connection string into `MONGO_URI` in `server/.env`. Put the database name `shareshed` before the `?`.
5. `npm run seed` creates all collections, indexes and demo data. `npm run seed:reset` wipes and re-seeds **(drops the database!)**.

## Environment variables (`server/.env`)

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | yes | MongoDB Atlas connection string |
| `JWT_SECRET` | yes | Long random string used to sign login cookies |
| `JWT_EXPIRES_IN` | no | Token lifetime (default `7d`) |
| `PORT` | no | API port (default `5000`) |
| `CLIENT_URL` | no | Origin of the React app for CORS (default `http://localhost:5173`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | no | SMTP server for emails. **If `SMTP_HOST` is empty, emails (e.g. OTP codes) are printed to the server console.** |
| `MAX_UPLOAD_MB` | no | Max upload size (default 5) |
| `OTP_EXPIRY_MINUTES` | no | Password-reset OTP lifetime (default 10) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Sprint 2 | Stripe **test-mode** keys |

`client/.env`: `VITE_API_URL` (only if the API is on another origin), `VITE_STRIPE_PUBLISHABLE_KEY` (Sprint 2).

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | API + web with hot reload |
| `npm run seed` / `seed:reset` | Seed / drop-and-seed the database |
| `npm run dev --prefix server` / `--prefix client` | Run one side only |

## Team docs
`docs/OWNERSHIP.md` (who edits what) · `docs/API_CONTRACT.md` (all endpoints) · `docs/SCHEMA.md` (database) · `docs/TEAM_WORKFLOW.md` (Git + conventions)

## Project report
- **Team name / Scrum Master:** _TODO_
- **Members & contributions:** _TODO (link to OWNERSHIP.md)_
- **Sprint 1 summary / screenshots:** _TODO_
- **Known issues:** _TODO_
