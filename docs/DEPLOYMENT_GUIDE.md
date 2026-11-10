# MediFlow (MDF) — Production Deployment Guide

Read this fully before deploying. Last verified deploy: **2026-11-03**, server moved `763de0d9` → `ca2d047`
(backup: `/mediflow/backups/deploy_20261103_142602/`).

> **Never put the SSH password in this file or in git.** Ask the user for it each time.

## 🔒 GOLDEN RULE: ALWAYS USE THE SERVER'S OWN CONFIGURATION FILES

The production server runs correctly with its **own** configuration. Deploy *into* that configuration; never replace it
with the repo/dev versions and never "fix" it to match git. The user has explicitly required this.

Server config files that must be used exactly as they are on the server (all in `/mediflow`):

| File | Why it must stay as-is |
|---|---|
| `docker-compose.yml` | Prod version: gunicorn, `settings.prod`, `npm run build && npm start`, postgres 15, plain `mediflow_*` volumes, only nginx published (8090). Differs from git on purpose. |
| `.env` (root) | Postgres credentials, Django secret, domain/CORS, API URLs, `GEMINI_API_KEY`. |
| `apps/backend/.env` | Backend env (bind-mounted read-only + `env_file`). |
| `apps/frontend/.env.local` | Frontend env (bind-mounted read-only + `env_file`). |
| `apps/backend/mediflow/settings/base.py` | Bind-mounted into the backend container, so the server copy is what actually runs. |
| `nginx/nginx.conf` | MediFlow's inner nginx (port 8090). |
| outer `saudapakka_nginx` `/etc/nginx/conf.d/default.conf` | Public domain routing to :8090 — belongs to the other project; read-only for us. |

How to apply the rule on every deploy:
1. **Back up these files first** (Step 1 copies them into the backup dir).
2. Only pull with `git pull --ff-only`; check first that incoming commits don't touch any file in the table (Step 0 command).
3. **After the pull, `diff` each config against the backup copy and confirm identical** (Step 2) — if anything changed, restore it from the backup before building.
4. Build/start with the server's compose file (`docker compose ...` run from `/mediflow` picks up that file). Never copy a compose/env/settings file from the dev machine to the server.
5. If a new feature genuinely needs a config change (new env var, new setting, new service), **stop and ask the user**, apply the minimal addition to the server file by hand, and record it in the Deploy history table.

---

## 1. Server layout (the facts that matter)

| Item | Value |
|---|---|
| Host | `root@72.61.246.159` (hostname `srv1235340`, Ubuntu, 31 GB RAM, ~367 GB disk) |
| Repo path | `/mediflow` |
| Git remote on server | `origin` = `https://github.com/Aladin-0/MDF.git`, branch `main` |
| Compose project name | `mediflow` (working dir `/mediflow`) |
| Docker Compose | v5 (`docker compose`, not `docker-compose`) |
| MediFlow public port | `8090` → `mediflow_nginx` |
| Domain / outer proxy | `manavatapharma.in` → **`saudapakka_nginx`** (ports 80/443) → `proxy_pass http://72.61.246.159:8090` |

### MediFlow containers (project `mediflow`)
`mediflow_frontend` (Next.js, :3000 internal) · `mediflow_backend` (Django+gunicorn, :8000 internal) ·
`mediflow_celery` · `mediflow_nginx` (8090→80) · `mediflow_postgres` (postgres:15-alpine) · `mediflow_redis`

### ⚠️ SHARED SERVER — DO NOT TOUCH
A completely separate project, **saudapakka**, runs on the same host and owns ports **80, 443, 3000, 8000, 5433**:
`saudapakka_backend`, `saudapakka_frontend`, `saudapakka_nginx`, `saudapakka_stable_postgres`.
Also a host-level PostgreSQL 16 on :5432 and fail2ban. Rules:
- Never run `docker compose down`, `docker system prune`, `docker volume prune`, `docker rm/stop` on anything not named `mediflow_*`.
- Never edit `saudapakka_nginx` config (`/etc/nginx/conf.d/default.conf` inside it) — it is the public entry for MediFlow too.
- Always use `docker compose ... --no-deps <service names>` from `/mediflow` so only MediFlow services are affected.

### Docker volumes (hold ALL real data — never delete)
`mediflow_postgres_data` (database) · `mediflow_media_files` (uploads) · `mediflow_static_files` · `mediflow_redis_data`

---

## 2. The server config is intentionally different from git — preserve it

`/mediflow/docker-compose.yml` on the server is **modified relative to git** (`git status` shows ` M docker-compose.yml`).
It is the production config and it works. Differences vs the committed (dev) file:

- `postgres:15-alpine` (git says 17)
- backend runs `migrate && collectstatic && gunicorn ... --workers 3` with `DJANGO_SETTINGS_MODULE=mediflow.settings.prod` (git runs `runserver` + dev settings)
- no source-code bind mounts; only bind-mounts `apps/backend/mediflow/settings/base.py` and `apps/backend/.env` (read-only)
- frontend runs `npm run build && npm start` with `NODE_ENV=production`, mounts `apps/frontend/.env.local` read-only
- no published ports for backend/frontend (only nginx 8090)
- volumes are plain (`mediflow_postgres_data`, etc.), **not** `external`

Other server-only files (untracked / gitignored — leave them): `.env`, `apps/backend/.env`, `apps/frontend/.env.local`,
`docker-compose.yml.server_active`, `docker-compose.yml.prod_backup`, `backups/`, `import_data/`, several `scripts/*.py`,
`apps/backend/apps/accounts/{fresh_tally_migration,seed_ledgers}.py`.

**Consequences**
- Use `git pull --ff-only`. Do **not** `git checkout .`, `git reset --hard`, `git stash`, or `git clean` on the server
  (that would wipe the prod compose file). The only allowed `reset --hard` is a deliberate rollback (§6), and then restore
  the compose file from the backup dir afterwards.
- Before pulling, check whether incoming commits touch any of: `docker-compose.yml`, `apps/backend/mediflow/settings/base.py`,
  `nginx/nginx.conf`, `.env*`. If yes, **stop and reconcile by hand** — a plain pull will fail or clobber server config:
  `git diff --name-only HEAD origin/main | grep -E "docker-compose|settings/base|nginx|\.env"`
- `docker/backend.Dockerfile` and `docker/frontend.Dockerfile` ARE tracked and used by the server — changes there are applied on rebuild.

---

## 3. How to connect (no `sshpass` on the dev machine)

Use OpenSSH's askpass with the password in an env var (not written to disk). Create two throw-away scripts in the session
scratchpad, and **delete them when finished**:

```bash
cat > $S/askpass.sh <<'EOF'
#!/bin/sh
echo "$MDF_PW"
EOF
cat > $S/rs.sh <<'EOF'
#!/bin/bash
export MDF_PW='<password from user>'
export SSH_ASKPASS=$S/askpass.sh SSH_ASKPASS_REQUIRE=force DISPLAY=:0
exec ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password,keyboard-interactive \
  -o PubkeyAuthentication=no root@72.61.246.159 "$@"
EOF
chmod 700 $S/askpass.sh $S/rs.sh
$S/rs.sh 'hostname; docker ps --format "{{.Names}} {{.Status}}" | grep mediflow'
```
(Better long-term: have the user add an SSH key and switch to key auth.)

---

## 4. Deployment procedure (what was done on 2026-11-03)

Prereq: the code to deploy is **pushed to GitHub `origin/main`** (the server pulls from GitHub, not from the dev machine).
Local `origin` = `git@github.com:Aladin-0/MDF.git`. (Local also has a `deploy` remote → `mediflow-deployement.git`; the server does **not** use it.)

### Step 0 — Pre-flight (read-only)
```bash
cd /mediflow
git fetch origin
git log --oneline HEAD..origin/main                      # what's incoming
git diff --stat HEAD origin/main -- . ":(exclude)graphify-out" ":(exclude)*.md"
git diff --name-only HEAD origin/main | grep -E "docker-compose|settings/base|nginx|\.env"   # must be empty (see §2)
git diff --name-only HEAD origin/main | grep migrations   # review every new migration (esp. RunPython/data ones)
git diff HEAD origin/main -- docker/ apps/backend/requirements.txt
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8090/login     # baseline: expect 200
```

### Step 1 — Backup (do not skip)
```bash
cd /mediflow
TS=$(date +%Y%m%d_%H%M%S); B=/mediflow/backups/deploy_$TS; mkdir -p $B
git rev-parse HEAD > $B/git_head_before.txt
git diff > $B/server_local_changes.diff
cp -a docker-compose.yml .env nginx/nginx.conf $B/
cp -a apps/backend/.env $B/backend.env; cp -a apps/frontend/.env.local $B/frontend.env.local
cp -a apps/backend/mediflow/settings/base.py $B/settings_base.py
docker ps --format "{{.Names}} {{.Image}} {{.ID}}" | grep mediflow > $B/containers_before.txt
# tag the CURRENT images so rollback is instant
for i in backend frontend celery; do
  id=$(docker inspect mediflow_$i --format "{{.Image}}")
  docker tag $id mediflow-$i:pre_deploy_$TS; echo "mediflow-$i:pre_deploy_$TS = $id" >> $B/image_tags.txt
done
# database (custom format) + media volume
U=$(docker exec mediflow_postgres printenv POSTGRES_USER); D=$(docker exec mediflow_postgres printenv POSTGRES_DB)
docker exec mediflow_postgres pg_dump -U $U -d $D -Fc > $B/db_$TS.dump
cp $B/db_$TS.dump /mediflow/backups/pre_deploy_$TS.dump        # matches the naming used by earlier deploys
docker run --rm -v mediflow_media_files:/m:ro -v $B:/b alpine tar czf /b/media_$TS.tar.gz -C /m .
```
**Verify the dump** (note `-i`, otherwise stdin is empty and you get a false "0 entries"):
```bash
docker exec -i mediflow_postgres pg_restore -l < $B/db_$TS.dump | grep -c "TABLE DATA"   # should equal table count
docker exec mediflow_postgres psql -U $U -d $D -tAc "select count(*) from pg_stat_user_tables"
gzip -t $B/media_$TS.tar.gz && echo OK
```
Sizes for reference: DB dump ≈ 27 MB, media tar ≈ 630 MB. Disk is plentiful.

### Step 2 — Update code (fast-forward only)
```bash
cd /mediflow
git pull --ff-only origin main
git status --short                          # docker-compose.yml must still show " M"
# Golden rule check: every server config file must be byte-identical to the backup taken in Step 1
diff docker-compose.yml $B/docker-compose.yml && echo "compose unchanged"
diff .env $B/.env && diff apps/backend/.env $B/backend.env && diff apps/frontend/.env.local $B/frontend.env.local \
  && diff apps/backend/mediflow/settings/base.py $B/settings_base.py && diff nginx/nginx.conf $B/nginx.conf \
  && echo "ALL server configs unchanged"      # if ANY diff prints: restore that file from $B before continuing
docker compose config -q && echo compose-valid
```

### Step 3 — Build (old containers keep serving during this; ~4 min)
```bash
docker compose build backend celery frontend > $B/build.log 2>&1; echo exit=$?
```
Backend and celery share the same Dockerfile; frontend builds from repo root (`docker/frontend.Dockerfile`).

### Step 4 — Swap containers (only MediFlow app services)
```bash
docker compose up -d --no-deps backend celery frontend
```
- `backend` start command auto-runs `migrate --noinput` then `collectstatic` then gunicorn → watch `docker logs mediflow_backend`.
- `frontend` start command runs `npm run build && npm start` → ready in ~40 s; wait for `✓ Ready` in `docker logs mediflow_frontend`.
- postgres/redis are NOT recreated (config unchanged) — their data and uptime are preserved.

### Step 5 — Restart MediFlow nginx (required)
Recreated containers get new internal IPs; nginx caches upstream DNS at start, so otherwise you get 502s.
```bash
docker restart mediflow_nginx
```

### Step 6 — Verify
```bash
docker ps --format "{{.Names}} {{.Status}}" | grep -E "mediflow|saudapakka"
for u in /login /api/schema/; do echo "$u $(curl -s -o /dev/null -w %{http_code} http://localhost:8090$u)"; done   # 200 200
docker logs --since 3m mediflow_celery | grep -E "ready|Connected"
docker logs --since 5m mediflow_backend | grep -oE '" [0-9]{3} ' | sort | uniq -c       # no 5xx
# saudapakka untouched:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000    # 200
```
Notes: `/` returns 307 (redirect to login) — normal. `/api/v1/auth/login/` returns 405 on GET — normal (POST only).
`/api/schema/` triggers many harmless drf-spectacular "unable to guess serializer" warnings in the backend log — not real errors.

### Step 7 — Cleanup
Delete the temporary askpass/ssh helper scripts. Optionally record the deploy in the memory note.

---

## 4b. Extra pre-deploy checks for the access-control release (login + roles)

This release (see `docs/ACCESS_CONTROL.md`) removes login back doors and tightens API permissions. It cannot damage data,
but it **can lock the wrong person out** if production data is not what the code assumes. Do these read-only checks first,
on the server, and tell the user what they show before deploying:

```bash
docker exec mediflow_backend python manage.py shell -c "
from apps.accounts.models import Staff
from django.db.models import Count
print('active staff by role:', list(Staff.objects.filter(is_active=True).values_list('role').annotate(n=Count('id'))))
odd = Staff.objects.filter(is_active=True).exclude(role__in=['super_admin','admin','manager','billing_staff','view_only','cashier','custom'])
print('ACTIVE STAFF WITH AN UNKNOWN ROLE (would lose all access):', [(s.name, s.role) for s in odd])
print('active staff with an unusable password (could only ever log in via the old back doors):',
      [s.name for s in Staff.objects.filter(is_active=True) if not s.has_usable_password()])
"
```

- Any staff row with a role outside the five (`cashier` and `custom` are tolerated as `billing_staff`) gets **no** permissions: fix their role first.
- Rows stored as `custom` (written by the old staff form) or `cashier` keep working. List them with
  `docker exec mediflow_backend python manage.py normalize_staff_roles` and, if you want them tidied, rerun with `--apply`
  (flags are never touched; it only rewrites the role string).
- Staff listed as having an unusable password, or who currently log in with the word `password` / their own phone number,
  will be refused after this release: set a real password or PIN for them (Staff → edit) **before** deploying.
- No schema migration is involved, so rollback is the normal image/commit rollback in section 6.
- After deploying, log in with a normal account on the live site, and check `/api/v1/auth/me/` returns a `permissions` list.
- If the frontend and backend ever run different versions for a while, nothing breaks: an old frontend ignores the new
  fields, and a new frontend falls back to local rules when the server sends no `permissions`.

---

## 5. Things a future deploy should watch for

- **Data migrations run automatically on boot.** 2026-11-03: `core.0015_activate_pharma_tax_slabs` re-activated the 12% and 28%
  tax slabs on the live DB (reverse: `migrate core 0014`). Always read new migrations in Step 0 and tell the user about data-changing ones.
- Frontend rebuilds on **every** container start (production compose runs `npm run build` at start), so a frontend restart = ~40 s of
  502/blank on the site. Backend restart is a few seconds. Pick a quiet time if possible.
- `requirements.txt` / Dockerfile changes are only applied by `docker compose build` (Step 3) — always build, don't just restart.
- Frontend `.env.local` and backend `.env` are baked in via bind mounts/env_file on the server; changing them needs `up -d` (recreate), not just restart.
- If incoming commits modify `docker-compose.yml`, `settings/base.py`, `nginx/nginx.conf` or add required env vars:
  stop, show the user, and merge by hand (keep the prod differences from §2).
- Git is the source of truth for code, but the server has 2 old stashes and untracked scripts — leave them.

---

## 6. Rollback

Set `B=/mediflow/backups/deploy_<TS>` and `TS=<TS>` from the deploy you want to undo.

**Code + containers only (no DB change needed):**
```bash
cd /mediflow
git reset --hard $(cat $B/git_head_before.txt)        # deliberate rollback — this is the one allowed hard reset
cp $B/docker-compose.yml docker-compose.yml           # restore prod compose (reset --hard reverts it to the git version!)
for i in backend frontend celery; do docker tag mediflow-$i:pre_deploy_$TS mediflow-$i:latest; done
docker compose up -d --no-deps --no-build backend celery frontend
docker restart mediflow_nginx
```
(Alternatively just `git checkout <old-sha>` equivalents + rebuild, but retagging the saved images is faster and exact.)

**Undo a migration without restoring the whole DB** (example for the 2026-11-03 one):
```bash
docker exec mediflow_backend python manage.py migrate core 0014
```

**Full database restore (destructive — confirm with the user first; this overwrites data created since the backup):**
```bash
docker stop mediflow_backend mediflow_celery
U=$(docker exec mediflow_postgres printenv POSTGRES_USER); D=$(docker exec mediflow_postgres printenv POSTGRES_DB)
docker exec -i mediflow_postgres pg_restore -U $U -d $D --clean --if-exists --no-owner < $B/db_$TS.dump
docker start mediflow_backend mediflow_celery
```
**Media restore** (only if media was damaged):
`docker run --rm -v mediflow_media_files:/m -v $B:/b alpine sh -c "cd /m && tar xzf /b/media_$TS.tar.gz"`

---

## 7. Deploy history

| Date | From → To | Backup dir | Notes |
|---|---|---|---|
| 2026-11-03 (2nd) | `ca2d047` → `d065f12` | `/mediflow/backups/deploy_20261103_173854/` | Frontend-only: purchase product-search dropdown (4 visible + scroll) and arrow-key duplicate-row fix. Only `frontend` rebuilt/recreated (1m12s build, ~45s start) + nginx restart; backend/celery untouched, media tarball skipped (not affected). |
| 2026-11-03 | `763de0d9` → `ca2d047` | `/mediflow/backups/deploy_20261103_142602/` | ERP reports, purchases/OCR, billing integrity, tax-slab migration `core.0015`; OpenCV pinned `5.0.0.93`. Build 3m45s. All checks passed; saudapakka unaffected. |
| 2026-10-25 and earlier | → `763de0d9` | `/mediflow/backups/pre_deploy_*.dump`, `docker-compose.yml.*.bak` | Earlier manual deploys (dump + compose `.bak` per deploy). |

Older server-side backups also live in `/mediflow/backups/` (`mediflow_db*.dump`, `mediflow_media*.tar.gz`, `pre_*` dumps). Prune only with the user's OK.
