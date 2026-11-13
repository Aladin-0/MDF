"""
Export everything the scanner has learned, ready for training an in-house reader:

  <out>/samples.jsonl            one confirmed bill per line: AI reading, correct answer, corrections, image paths
  <out>/images/                  training copies of the page photos (if OCR_KEEP_TRAINING_IMAGES was on)
  <out>/product_aliases.csv      name as printed on bills -> catalogue product (learned from staff picks)
  <out>/distributor_aliases.csv  printed seller names / GSTINs -> distributor (learned from confirmed bills)
  <out>/README.txt               format description

Usage: python manage.py export_scan_training --out /path/to/folder [--since 2026-11-01] [--outlet <uuid>]
"""
import csv
import json
import os
import shutil

from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand

README = """Scanner training data export
============================
samples.jsonl — one JSON object per confirmed scanned bill:
  id, created_at, outlet_id, distributor_id, model, prompt_version
  images:      list of files in images/ (page 1 first; empty if photos were not kept)
  ai:          what the AI read  {header, items[], totals, meta}
  truth:       what staff saved  {header, items[], totals}   <- use as the correct label
  corrections: [{row, field, ai, final, bill_name}] fields staff changed (row_added / row_removed included)
Item fields: name/bill_name, product_id, product_name, batch, expiry (YYYY-MM-DD), qty, free, mrp, rate,
discount, gst, amount/taxable/total, and (ai only) row_text, page, box [ymin,xmin,ymax,xmax 0-1000].
product_aliases.csv / distributor_aliases.csv: the learned name -> record memory.
"""


class Command(BaseCommand):
    help = 'Export confirmed-scan training data and learned aliases for an in-house bill reader.'

    def add_arguments(self, parser):
        parser.add_argument('--out', required=True, help='Folder to write the export into (created if missing).')
        parser.add_argument('--since', help='Only bills confirmed on/after this date (YYYY-MM-DD).')
        parser.add_argument('--outlet', help='Only this outlet id.')

    def handle(self, *args, **opts):
        from apps.inventory.models import MasterProductAlias
        from apps.purchases.models import Distributor, ScanTrainingSample

        out = opts['out']
        os.makedirs(os.path.join(out, 'images'), exist_ok=True)
        qs = ScanTrainingSample.objects.order_by('created_at')
        aliases = MasterProductAlias.objects.select_related('product').order_by('outlet_id', 'alias_name')
        dists = Distributor.objects.order_by('outlet_id', 'name')
        if opts.get('since'):
            qs = qs.filter(created_at__date__gte=opts['since'])
        if opts.get('outlet'):
            qs = qs.filter(outlet_id=opts['outlet'])
            aliases = aliases.filter(outlet_id=opts['outlet'])
            dists = dists.filter(outlet_id=opts['outlet'])

        n = images = 0
        with open(os.path.join(out, 'samples.jsonl'), 'w', encoding='utf-8') as fh:
            for s in qs.iterator():
                copied = []
                for name in s.image_files or []:
                    target = os.path.join('images', os.path.basename(name))
                    try:
                        with default_storage.open(name, 'rb') as src, open(os.path.join(out, target), 'wb') as dst:
                            shutil.copyfileobj(src, dst)
                        copied.append(target)
                        images += 1
                    except Exception:
                        pass
                fh.write(json.dumps({
                    'id': str(s.id), 'created_at': s.created_at.isoformat(), 'outlet_id': str(s.outlet_id),
                    'distributor_id': str(s.distributor_id) if s.distributor_id else None,
                    'model': s.model_name, 'prompt_version': s.prompt_version, 'images': copied,
                    'ai': s.ocr_result, 'truth': s.confirmed, 'corrections': s.corrections,
                }, ensure_ascii=False, default=str) + '\n')
                n += 1

        with open(os.path.join(out, 'product_aliases.csv'), 'w', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh)
            w.writerow(['outlet_id', 'name_on_bill', 'product_id', 'product_name', 'learned_at'])
            for a in aliases.iterator():
                w.writerow([a.outlet_id, a.alias_name, a.product_id, a.product.name if a.product else '', a.created_at.isoformat()])

        with open(os.path.join(out, 'distributor_aliases.csv'), 'w', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh)
            w.writerow(['outlet_id', 'distributor_id', 'distributor_name', 'gstin', 'learned_names', 'learned_gstins'])
            for d in dists.iterator():
                learned = d.ocr_aliases if isinstance(d.ocr_aliases, dict) else {}
                if learned.get('names') or learned.get('gstins'):
                    w.writerow([d.outlet_id, d.id, d.name, d.gstin or '', ' | '.join(learned.get('names') or []),
                                ' | '.join(learned.get('gstins') or [])])

        with open(os.path.join(out, 'README.txt'), 'w', encoding='utf-8') as fh:
            fh.write(README)
        self.stdout.write(self.style.SUCCESS(f'Exported {n} confirmed bill(s), {images} image(s) to {out}'))
