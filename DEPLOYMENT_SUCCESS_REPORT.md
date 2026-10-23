# PRODUCTION DEPLOYMENT REPORT

**Deployment Date:** 2026-10-23 16:03 IST  
**Target Server:** `72.61.246.159`  
**Production Domain:** [`https://manavatapharma.in`](https://manavatapharma.in)  
**Deployed Commit:** `f7483474` (`feat(billing): implement dual-mode margin floor and dynamic cart repricing`)  
**Status:** **DEPLOYMENT COMPLETE & VERIFIED (LIVE & HEALTHY)**  

---

## 1. Executive Summary

The latest updates containing the **Dual-Mode Margin Floor** and **Dynamic Cart Repricing** have been successfully deployed to the production environment on `72.61.246.159`. 

The deployment followed the zero-downtime, safe execution protocol:
1. **Pre-Deploy Safety Backup:** Database snapshot `pre_deploy_20261023_102641.dump` (87 MB) and compose backup were created prior to any modifications.
2. **Configuration Protection:** Server-specific production configuration files were strictly preserved (production volumes, Gunicorn binding, Next.js build args, and port mappings).
3. **Co-hosted Isolation:** The co-hosted SaudaPakka production stack was untouched and experienced zero downtime.
4. **Build & Recreate:** Backend, Celery, and Next.js frontend containers were rebuilt and cleanly restarted.
5. **Live Verification:** HTTP 200 on login routes, HTTP 401 on authenticated API endpoints, and clean Gunicorn/Next.js runtime logs confirmed full operational health.

---

## 2. Container Status Post-Deployment

| Container Name | Image | Status | Ports | Service |
|:---|:---|:---:|:---|:---|
| **`mediflow_frontend`** | `mediflow-frontend` | **Up (healthy)** | `3000/tcp` | Next.js 14 (`next start`) |
| **`mediflow_backend`**  | `mediflow-backend`  | **Up (healthy)** | `8000/tcp` | Gunicorn (3 workers, prod mode) |
| **`mediflow_celery`**   | `mediflow-celery`   | **Up (healthy)** | `8000/tcp` | Asynchronous Celery worker |
| **`mediflow_nginx`**    | `nginx:stable-alpine` | **Up (healthy)** | `0.0.0.0:8090->80/tcp` | Internal reverse proxy & static asset server |
| **`mediflow_postgres`** | `postgres:15-alpine` | **Up 6 days (healthy)** | `5432/tcp` | PostgreSQL 15 database |
| **`mediflow_redis`**    | `redis:7-alpine`    | **Up 6 days (healthy)** | `6379/tcp` | Redis cache & broker |

---

## 3. Co-hosted Projects Verification

The co-hosted SaudaPakka stack was verified and remained completely unaffected:
- `saudapakka_nginx`: **Up 6 days** (`0.0.0.0:80->80`, `0.0.0.0:443->443`)
- `saudapakka_backend`: **Up 6 days** (`0.0.0.0:8000->8000`)
- `saudapakka_frontend`: **Up 6 days** (`0.0.0.0:3000->3000`)
- `saudapakka_stable_postgres`: **Up 6 days (healthy)** (`0.0.0.0:5433->5432`)

---

## 4. Live Verification & Smoke Tests

```bash
# 1. Internal Nginx Reverse Proxy (Port 8090)
HTTP/1.1 307 Temporary Redirect -> location: /login?redirect=%2F  [PASS]

# 2. Public Domain SSL Termination (https://manavatapharma.in)
HTTP/2 307 Temporary Redirect -> location: /login?redirect=%2F    [PASS]

# 3. Public Domain Login Page (https://manavatapharma.in/login)
HTTP/2 200 OK (Content-Length: 15,574 bytes)                     [PASS]

# 4. Backend REST API Security (https://manavatapharma.in/api/v1/sales/)
HTTP/2 401 Unauthorized (Protected JSON endpoint)                [PASS]
```

---

## 5. Deployed Features Now Live

1. **Dual-Mode Margin Floor:**
   - **Retail Mode:** Cost floor strictly governed by `landing_rate`, preventing sales below total landed expense.
   - **Wholesale Mode:** Cost floor governed by `purchase_rate`, unblocking wholesale trade margins without false positives.
   - **Dynamic Error Messaging:** Dynamic badges and validation messages showing `"landing cost"` (Retail) vs `"purchase rate"` (Wholesale).
2. **Dynamic Cart Repricing:**
   - Switching `saleType` between Retail and Wholesale instantly iterates cart items and recalculates unit selling rates (`MRP` for Retail vs `PTS`/`PTR` for Wholesale).
   - Recalculates tax-inclusive vs tax-exclusive line amounts and grand totals on the fly.
