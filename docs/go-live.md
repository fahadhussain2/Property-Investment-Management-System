# Go-live runbook (M7)

Everything in the repo is ready: the deploy, backup and keep-alive workflows, the security headers, and the
cut-over tools. What remains needs **your** accounts and settings. Do the steps in order. It takes about an hour,
plus however long it takes to enter your register data.

| Piece | Where | Cost |
|---|---|---|
| Database, logins, emails, document files | Supabase, free plan, region **Mumbai (ap-south-1)** | free (1 GB of files) |
| Website | Cloudflare Pages, `https://property-ledger.pages.dev` | free |
| Deploys, nightly backups, keep-alive | GitHub Actions (this repo) | free (≈ 150 of 2,000 min/month) |

> Throughout, `<ref>` is your Supabase project reference, the random id in `https://<ref>.supabase.co`.
> If you pick a different Cloudflare project name, replace `property-ledger` everywhere below.

---

## 1. Supabase project

1. Sign in at <https://supabase.com/dashboard> and click **New project**.
   - Name: `property-ledger`. Region: **South Asia (Mumbai)**. Plan: Free.
   - **Database password:** generate one and save it in your password manager. Use letters and digits only:
     it goes inside a connection URL, where symbols like `@ : / # ?` break it.
2. **Authentication → Sign In / Providers → Email**
   - **Confirm email: ON.** This is required: invitations are accepted only for confirmed emails.
   - Minimum password length: **8**. Secure email change: ON.
3. **Authentication → URL Configuration**
   - Site URL: `https://property-ledger.pages.dev`
   - Redirect URLs: add `https://property-ledger.pages.dev/**`
4. **Email delivery (built-in mailer), please read.** Supabase's built-in email:
   - delivers **only to people on your Supabase organization's team**, and
   - sends only a few emails per hour.

   So, before anyone signs up or is invited, add their email under **Organization → Team → Invite**
   (the free plan allows this). Otherwise their confirmation and password-reset emails never arrive.
   This is fine for an owner plus a few staff. When you have a domain, switch to Resend
   (**Authentication → Emails → SMTP settings**). That's a settings change only, with no code change.
5. Collect these values for step 3:
   - **Project URL** and **anon / publishable key:** **Project Settings → API Keys**. Either the legacy
     `anon` key or the `sb_publishable_…` key works. Never use the `service_role` / secret key in the web app.
   - **Session pooler connection string:** the **Connect** button at the top → **Session pooler** → URI, e.g.
     `postgresql://postgres.<ref>:<PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
     with your password filled in. Use the *session pooler*, not the "direct connection": GitHub's runners
     cannot reach the direct host, which is IPv6 only.
6. **Storage keys for backing up documents' files** (spec 004). The nightly backup copies uploaded files
   through Supabase Storage's S3 connection:
   - **Storage → Settings** (or **Project Settings → Storage**) → **S3 Connection**: make sure the S3 protocol
     connection is **enabled**, and note the **Endpoint** (`https://<ref>.storage.supabase.co/storage/v1/s3`)
     and **Region** (`ap-south-1`).
   - **S3 Access Keys → New access key**, description `github-backup`. Copy the **Access key ID** and the
     **Secret access key** (the secret is shown once).
   - These keys can read and write **every** file, bypassing the app's access rules. Keep them only in GitHub
     secrets and your password manager; never put them in the web app.

## 2. Cloudflare Pages project

1. Sign in at <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** →
   **Use direct upload**. Name it `property-ledger`, then upload any small folder (e.g. `web/public`) to finish
   creating it. The first real deploy replaces it.
   (Or from a terminal: `npx wrangler login`, then `npx wrangler pages project create property-ledger --production-branch=main`.)
2. **Account ID:** shown on the right side of **Workers & Pages** (or in the URL `dash.cloudflare.com/<account-id>/…`).
3. **API token:** **My Profile → API Tokens → Create Token → Create Custom Token**, with permission
   **Account · Cloudflare Pages · Edit**, limited to your account. Copy it (it is shown once).
4. If you chose a name other than `property-ledger`: in GitHub, go to **Settings → Secrets and variables → Actions →
   Variables** and add `CLOUDFLARE_PAGES_PROJECT` = your name.

## 3. GitHub environment and secrets

**Settings → Environments → New environment** `production`:
- Deployment branches: **Selected branches → `main`**.
- **Do not** add required reviewers. The nightly backup and keep-alive use this environment too, and they would
  wait for approval every night.

Add these **environment secrets**:

| Secret | Value |
|---|---|
| `SUPABASE_DB_URL` | Session pooler URI from step 1.5 (with the password) |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key |
| `CLOUDFLARE_API_TOKEN` | token from step 2.3 |
| `CLOUDFLARE_ACCOUNT_ID` | id from step 2.2 |
| `BACKUP_PASSPHRASE` | a long random passphrase. **Save it in your password manager: backups cannot be restored without it.** |
| `SUPABASE_S3_ENDPOINT` | Storage S3 endpoint from step 1.6 |
| `SUPABASE_S3_REGION` | Storage S3 region from step 1.6 (`ap-south-1`) |
| `SUPABASE_S3_ACCESS_KEY_ID` | access key id from step 1.6 |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | secret access key from step 1.6 |

The four `SUPABASE_S3_*` secrets are needed once anyone uploads a document: from then on, a backup **fails** without
them rather than silently leaving the files out.

## 4. First deploy

1. **Actions → Deploy → Run workflow** (branch `main`). It checks the secrets, backs up the database,
   applies every migration (`supabase db push`), builds the site and publishes it. After this, every merge to
   `main` deploys by itself once CI passes.
2. Open `https://property-ledger.pages.dev`:
   - **Create account** with your business name (your email must be on the Supabase team, see 1.4).
   - Open the confirmation email **on the same device**, then sign in. The set-up screen appears with your
     business name filled in: check the currency (PKR) and financial-year start, then create the business.
   - Try **Forgot password?** once, to prove that emails arrive.
3. Invite staff: add them to the Supabase team (1.4), then in the app go to **Settings → Members & invitations** and send
   them the sign-up link it shows.

## 5. Backups (and a restore drill)

- **Nightly backup** runs at 02:30 Pakistan time: an encrypted dump (roles, schema, data) **plus every uploaded
  document** (`files/`, with a `manifest.tsv`), kept 30 days as a workflow artifact. Every deploy also keeps a
  **pre-deploy** backup. The run log warns about orphan files (no document row) and rows whose file is missing.
  Orphans are harmless; remove them from **Storage → documents** in the dashboard if you like.
- Run it once by hand: **Actions → Nightly backup → Run workflow**. Then do a restore drill on your PC
  (Docker running, local stack started with `npm run db:start`):

```bash
# 1. Download the artifact from the workflow run and unzip it, giving nightly-YYYYMMDD.tar.gz.gpg
gpg --decrypt nightly-YYYYMMDD.tar.gz.gpg | tar xz        # asks for BACKUP_PASSPHRASE
# 2. Fresh local database with the same schema (from the migrations), then load the data. The migrations
#    already created the documents bucket, and data.sql brings it back too, so drop the fresh one first.
npm run db:reset
docker cp nightly-YYYYMMDD/data.sql supabase_db_property-ledger:/tmp/data.sql
MSYS_NO_PATHCONV=1 docker exec supabase_db_property-ledger psql -U postgres --single-transaction \
  -v ON_ERROR_STOP=1 -c "SET session_replication_role = replica" -c "SET storage.allow_delete_query = 'true'" \
  -c "DELETE FROM storage.buckets WHERE id = 'documents'" -f /tmp/data.sql
# 3. Put the documents' files back. Local keys: `npx supabase status` shows STORAGE_S3_URL,
#    S3_PROTOCOL_REGION, S3_PROTOCOL_ACCESS_KEY_ID and S3_PROTOCOL_ACCESS_KEY_SECRET.
SUPABASE_S3_ENDPOINT=http://127.0.0.1:54321/storage/v1/s3 SUPABASE_S3_REGION=local \
  SUPABASE_S3_ACCESS_KEY_ID=<id> SUPABASE_S3_SECRET_ACCESS_KEY=<secret> \
  node scripts/restore-files.mjs nightly-YYYYMMDD
# 4. Sign in locally with a production account: its businesses, entries, balances and documents are all there.
```

(`MSYS_NO_PATHCONV=1` stops Git Bash on Windows from rewriting `/tmp/...`.)

**Real disaster (the project is lost):** create a new Supabase project, then restore everything into it
(Supabase's documented order). After that, update the secrets and redeploy.

```bash
psql --single-transaction -v ON_ERROR_STOP=1 \
  -f roles.sql -f schema.sql -c "SET session_replication_role = replica" -f data.sql \
  -d "<new project's session pooler URI>"
# Then the documents' files, with the NEW project's Storage S3 keys (step 1.6):
SUPABASE_S3_ENDPOINT=... SUPABASE_S3_REGION=... SUPABASE_S3_ACCESS_KEY_ID=... SUPABASE_S3_SECRET_ACCESS_KEY=... \
  node scripts/restore-files.mjs nightly-YYYYMMDD
```

## 6. Cut-over and UAT sign-off (the M7 gate)

1. Pick the **cut-over date**, e.g. the last day of a month. Your registers' balances on that evening are the
   starting point. Nothing before it is entered as individual entries.
2. **Settings:** the business name, currency and financial-year start month are chosen when the business is
   created (the set-up screen after your first sign-in), and the app cannot change them yet, so choose carefully.
   Add each **bank account** under **Settings → Bank & cash accounts**.
3. **Properties and parties:** add every property you still own, and every tenant, buyer and seller you have
   an open balance with.
4. **+ New → Opening balances**, dated the cut-over date:
   - Cash in hand and each bank balance.
   - **Properties you already own**, at their total cost so far.
   - **Money others owe you** / **Money you owe**. Tick a property where it belongs to one.
   - **Security deposits you hold**, by tenant and property.
   - **Token money received**, by buyer and property. That property then shows *Under agreement*, and the sale
     applies the token money automatically.
5. **Leases:** add each current lease with its real start date, and set **Count rent from** to the month after
   cut-over. If a tenant already owes rent at cut-over, set it to the first unpaid month instead.
6. **Check against the registers.** Tick each line only when the numbers match:
   - [ ] **Reports → Trial balance** says *Balanced*.
   - [ ] **Cash & Bank:** cash in hand and every bank balance equal the registers / bank statements on the cut-over date.
   - [ ] **Reports → Balance sheet** (as at cut-over): properties at cost, receivables, payables, deposits held
     and token money each equal the registers. Difference = 0.
   - [ ] **Properties:** each property's *Total cost* equals its register cost, and its status is right
     (Rented / Vacant / Under agreement).
   - [ ] **Reports → Who owes whom:** each party's balance equals the register.
   - [ ] **Leases & Rent:** each lease's rent per month is right, and *months unpaid* equals what tenants actually owe.
7. **Sign-off:** when every box is ticked, write "UAT signed off, <date>" in the M7 pull request (or an issue).
   M7 is done.

## Running it day to day

- **Deploys:** merge to `main`, CI runs, then Deploy runs (backup, migrate, publish). A failed CI means no deploy.
- **Keep-alive:** a daily ping stops Supabase pausing the project. GitHub turns scheduled workflows off after
  **60 days without commits**. If that happens, re-enable *Nightly backup* and *Keep-alive* in the Actions tab.
- **Watch for failure emails** from GitHub about *Nightly backup*. A missed backup is the one alert that matters.
- **Free-tier limits:** 500 MB database and 50k monthly users are far beyond one business. Documents share **1 GB**
  of file storage (Settings shows how much is used). Each backup artifact grows with the files; GitHub's free
  artifact storage is 500 MB and 30 nightly copies count against it, so watch both as documents pile up. The move to Supabase Pro
  (~$25/month) is a plan change with no code change.
- **Rotating the database password:** change it in Supabase, then update `SUPABASE_DB_URL` in GitHub.
- **Rotating the Storage keys:** create a new S3 access key, update the two `SUPABASE_S3_*` key secrets, then delete
  the old key in Supabase.
