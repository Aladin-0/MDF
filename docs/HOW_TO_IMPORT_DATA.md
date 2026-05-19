# Marg Data Import — Step by Step

## Outlet IDs (confirmed from live server)
- **Manavata Pharma** : `654f7337-d7ca-4003-bb5f-a6e585531fbd`
- **SAI Medical**     : `c8e92121-087b-4c23-9edc-f48bd0ae1b67`

---

## Step 1 — Apply the new migration (run once)
```bash
docker compose exec backend python manage.py migrate purchases
```

---

## Step 2 — Copy xlsx files into the Docker container
```bash
docker compose cp "manavata pharma data" backend:/data/
docker compose cp "sai medical data"     backend:/data/
```

---

## Step 3 — DRY RUN first (no data written — just validation)

### Manavata Pharma dry run
```bash
docker compose exec backend python manage.py import_marg_data \
  --outlet      654f7337-d7ca-4003-bb5f-a6e585531fbd \
  --item-master "/data/manavata pharma data/item master MANVTA.xlsx" \
  --stock       "/data/manavata pharma data/BATCH CLOSE STK MANVTA.xlsx" \
  --party       "/data/manavata pharma data/party PUR MANAVTA.xlsx" \
  --stock-skip  2 \
  --dry-run
```

### SAI Medical dry run
```bash
docker compose exec backend python manage.py import_marg_data \
  --outlet      c8e92121-087b-4c23-9edc-f48bd0ae1b67 \
  --item-master "/data/sai medical data/hsncodemaster_SAI.xlsx" \
  --stock       "/data/sai medical data/stock_51_SAI.xlsx" \
  --party       "/data/sai medical data/partymst_81_SAI.xlsx" \
  --stock-skip  4 \
  --dry-run
```

---

## Step 4 — LIVE IMPORT (remove --dry-run)

### Manavata Pharma (run first)
```bash
docker compose exec backend python manage.py import_marg_data \
  --outlet      654f7337-d7ca-4003-bb5f-a6e585531fbd \
  --item-master "/data/manavata pharma data/item master MANVTA.xlsx" \
  --stock       "/data/manavata pharma data/BATCH CLOSE STK MANVTA.xlsx" \
  --party       "/data/manavata pharma data/party PUR MANAVTA.xlsx" \
  --stock-skip  2
```

### SAI Medical (run second)
```bash
docker compose exec backend python manage.py import_marg_data \
  --outlet      c8e92121-087b-4c23-9edc-f48bd0ae1b67 \
  --item-master "/data/sai medical data/hsncodemaster_SAI.xlsx" \
  --stock       "/data/sai medical data/stock_51_SAI.xlsx" \
  --party       "/data/sai medical data/partymst_81_SAI.xlsx" \
  --stock-skip  4
```

---

## Notes
- The script is **idempotent** — safe to re-run. It will skip already-imported records.
- Each outlet's data is **100% isolated** by outlet UUID. No mixing possible.
- MasterProducts are **shared globally** (same medicine doesn't get duplicated).
- Run Manavata first, then SAI. Order doesn't matter for data correctness but Manavata first is cleaner.
