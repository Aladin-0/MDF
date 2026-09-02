import os
import django
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.base")
django.setup()

from apps.reports.models import GSTTransactionSnapshot, GSTR2BData, ITCReconciliationRun, ITCReconciliationResult
from django.db.models import Sum

period = '082026'

# 1. Purchase Snapshots
purchases = GSTTransactionSnapshot.objects.filter(period=period, transaction_type='purchase')
gross_igst = 0
gross_cgst = 0
gross_sgst = 0
for p in purchases:
    for rate, vals in p.snapshot_json.get('items_by_rate', {}).items():
        gross_igst += vals.get('igst', 0)
        gross_cgst += vals.get('cgst', 0)
        gross_sgst += vals.get('sgst', 0)

# 2. Reversals
from apps.reports.gstr_builders import GSTR3BBuilder
from apps.core.models import Outlet
outlet = Outlet.objects.first()
if not outlet:
    print(json.dumps({"error": "No outlet found"}))
    exit(0)

builder = GSTR3BBuilder(gstin=outlet.gstin, period=period)
gstr3b = builder.generate_json()

itc_elg = gstr3b.get('itc_elg', {})
itc_avl = itc_elg.get('itc_avl', [])
itc_rev = itc_elg.get('itc_rev', [])
itc_net = itc_elg.get('itc_net', {})

# 3. GSTR-2B Data
g2b_records = GSTR2BData.objects.filter(period=period)
g2b_suppliers = g2b_records.values('supplier_gstin').distinct().count()
g2b_invoices = g2b_records.count()
g2b_igst = sum(r.igst for r in g2b_records)
g2b_cgst = sum(r.cgst for r in g2b_records)
g2b_sgst = sum(r.sgst for r in g2b_records)

# 4. Reconciliation Runs
run = ITCReconciliationRun.objects.filter(period=period).last()
recon_summary = run.summary if run else {}
results = run.results.all() if run else []

status_counts = {}
for r in results:
    status_counts[r.match_status] = status_counts.get(r.match_status, 0) + 1
    for mismatch in r.mismatch_reasons:
        status_counts[mismatch] = status_counts.get(mismatch, 0) + 1

sample_records = []
for r in results[:10]:
    pr = r.purchase_snapshot
    if pr:
        tv = 0
        tx = 0
        for rate, vals in pr.snapshot_json.get('items_by_rate', {}).items():
            tv += vals.get('taxable_amount', 0)
            tx += vals.get('igst', 0) + vals.get('cgst', 0) + vals.get('sgst', 0)
        sample_records.append({
            'supplier_gstin': pr.snapshot_json.get('distributor_gstin', 'N/A'),
            'invoice_number': pr.document_number,
            'date': str(pr.document_date),
            'taxable_value': tv,
            'tax': tx,
            'status': r.match_status,
            'mismatch_reason': ', '.join(r.mismatch_reasons)
        })

output = {
    'entity_gstin': outlet.gstin,
    'gross_igst': gross_igst,
    'gross_cgst': gross_cgst,
    'gross_sgst': gross_sgst,
    'gstr3b_itc_avl': itc_avl,
    'gstr3b_itc_rev': itc_rev,
    'gstr3b_itc_net': itc_net,
    'g2b_suppliers': g2b_suppliers,
    'g2b_invoices': g2b_invoices,
    'g2b_igst': float(g2b_igst),
    'g2b_cgst': float(g2b_cgst),
    'g2b_sgst': float(g2b_sgst),
    'recon_summary': recon_summary,
    'status_counts': status_counts,
    'sample_records': sample_records
}
print("===JSON_START===")
print(json.dumps(output))
print("===JSON_END===")
