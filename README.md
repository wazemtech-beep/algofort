# Algofort — projects & office finances

Independent Next.js/PostgreSQL application, stored under `algofort/`. OXGEN's code, login sessions and database remain separate.

## Implemented

- Owner login, HttpOnly revocable sessions, account lockout after repeated bad passwords, password change, single/all-device logout. Owner provisioning is CLI-only; there is no public signup.
- Dashboard: active projects, deadline/overdue list, gross receipts, current outstanding, office expenses and cash after fees/salary/expenses. Date/currency filters never mix currencies.
- Clients: contacts, company, notes, edits, project counts and currency-separated remaining balances.
- Projects: client, agreed decimal total, currency, deadline, status, platform/source and notes. Existing collections constrain edits to price/currency.
- Payments: gross payment, platform fee, date, method/reference, remaining-balance validation, transactional locks, idempotent retries, correction through audited voids. Platform fees do not increase a client's outstanding balance.
- Project access: AES-256-GCM secret encryption, owner-password reauthentication for reveal/delete, audit logging and automatic hiding after 20 seconds. Workspace APIs/exports never send the encrypted field or plaintext secrets.
- Employees/salaries: active/inactive employees, salary edits, monthly salary snapshots, advance/salary payments, idempotency and outstanding balance guards. Advances allocate to one salary month and are counted once.
- Office expenses: category, date, currency, notes, edits and audited voids.
- Reports: separate-currency cash summary, project/client balances, payments, expenses and salaries, with downloaded CSV/PDF exports and date filters.
- Settings: password and session controls, recent audit history and private JSON business-data export. This export deliberately excludes secrets and account/session data; it is not a full disaster-recovery backup or automatic restore tool.

Financial arithmetic and validation use PostgreSQL Decimal transactions; UI formatting uses two decimal places. Financial records are kept for history rather than hard-deleted. PDFs use a basic paginated Latin-text report; non-Latin characters are substituted in that PDF format (CSV/JSON retain Unicode).

## Local use

```powershell
Set-Location "D:\SAAS APPS PENDING\gym\algofort"
npm install
npm run db:generate
npm run dev
```

Open http://localhost:3100/login. The initial owner's credentials are in ignored `.env.owner-login`. An owner was provisioned locally; do not rerun setup to overwrite it. Change the generated password after first login.

For a fresh independent database only: configure `.env` from `.env.example`, review/apply the Prisma schema, then run `npm run setup:owner`. Optional INITIAL_OWNER_EMAIL/INITIAL_OWNER_PASSWORD select initial credentials; otherwise a unique random password is generated and saved privately. Never run resets or force schema pushes against existing business records.

## Database and security

The supplied separate Aiven PostgreSQL database is configured privately and has the Algofort schema. Runtime uses a globally reused one-connection pg pool, five-second idle cleanup, sixty-second connection rotation and Vercel Fluid pool attachment. Migration URI is separate from the runtime setting. Add the provider's PEM CA in DATABASE_CA_CERT to enable certificate verification; without it the supplied encrypted sslmode=require/libpq semantics are retained.

Aiven Free permits 20 connections and lacks managed PgBouncer. Application-side pooling does not cap the total across serverless instances. For higher concurrency use Aiven's Startup-or-higher managed pool or an appropriate external pooler/capacity. Keep the backend and database regions close. No new provider charges or accounts were created automatically.

Keep CREDENTIAL_ENCRYPTION_KEY (32 bytes, base64) unchanged across deployments and backed up securely. Losing it loses access to encrypted project passwords. SESSION_SECRET and database/password files must remain private. All browser writes enforce Origin, all API/export reads require an owner session, and general exports contain no project secrets.

## Verification

```powershell
npm run build
npm run verify
```

The HTTP suite starts a local production server on port 3111 with the same managed-pool branch as Vercel; creates an isolated temporary owner/client/project/employee; verifies auth, CSRF, database persistence, concurrent/duplicate payments, balances, salary advances, credentials, reports and logout; then removes test records. It sends no email or external messages. The real initial owner is preserved. A running development server may lock Prisma's Windows DLL during generation; stop only Algofort's dev process before building, then restart it.

## Deployment

Deploy `algofort` as its own Vercel project with Root Directory `.` for the standalone algofort repository (use `algofort` only for the gym monorepo), Framework Next.js, install `npm ci`, build `npm run build`, Node 24.x and Fluid compute enabled. Add private DATABASE_URL, DIRECT_URL, SESSION_SECRET, CREDENTIAL_ENCRYPTION_KEY, optional DATABASE_CA_CERT and HTTPS APP_URL. Preserve the encryption key/DB and use a runtime pooler when the plan supports one. Existing schema is already applied; the build generates the client but does not mutate the database. No cron is required for these manually recorded office workflows. Provider backups must be configured separately.

Local build/API checks are not certification of a cloud deployment, exhaustive browser accessibility or every possible financial case. No Algofort cloud deployment/store application was created.
