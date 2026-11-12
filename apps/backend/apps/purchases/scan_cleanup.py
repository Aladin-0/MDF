"""
Retention for scanned bills, to keep the server and the purchase list clean:
* Scan photos are deleted OCR_SCAN_PHOTO_TTL_HOURS (default 24) after scanning.
  Only the files go — purchases, drafts, scanned data and learned aliases stay.
* Scan drafts nobody saved within OCR_DRAFT_TTL_DAYS (default 3) of scanning are
  deleted with their photos. Purchase drafts are only ever created by scanning
  (hand-typed bills are saved directly), so no typed work can be lost; saved
  purchases and purchase orders are never touched. The paper bill remains the
  original record.

Runs automatically (at most once an hour) from the OCR worker, and can be run
by hand or from cron:  python manage.py cleanup_scan_photos
"""
from __future__ import annotations

import logging
import os
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

LOCK_KEY = 'purchases:scan-photo-cleanup'
LOCK_SECONDS = 3600


def ttl_hours() -> float:
    try:
        return float(os.environ.get('OCR_SCAN_PHOTO_TTL_HOURS', '24'))
    except ValueError:
        return 24.0


def draft_ttl_days() -> float:
    try:
        return float(os.environ.get('OCR_DRAFT_TTL_DAYS', '3'))
    except ValueError:
        return 3.0


def draft_auto_delete_at(created_at):
    """When an unsaved scan draft created at ``created_at`` will be removed."""
    return created_at + timedelta(days=draft_ttl_days()) if created_at else None


def delete_stored_file(field_file) -> int:
    """Delete a stored file after the current transaction commits; returns its size (0 if unknown)."""
    if not field_file:
        return 0
    storage, name = field_file.storage, field_file.name
    try:
        size = storage.size(name)
    except Exception:
        size = 0

    def _delete():
        try:
            storage.delete(name)
        except Exception:
            logger.warning('Could not delete scan photo %s', name, exc_info=True)

    transaction.on_commit(_delete)
    return size


def cleanup_scan_photos(now=None, include_old: bool = False, dry_run: bool = False) -> dict:
    """
    Delete scan photos older than the retention window.

    include_old: also remove photos scanned before scan_uploaded_at existed
    (judged by the invoice's created_at). Off by default so a deploy never
    wipes historic photos without someone deciding to.
    """
    from apps.purchases.models import PurchaseInvoice, PurchaseInvoicePage

    now = now or timezone.now()
    cutoff = now - timedelta(hours=ttl_hours())
    stats = {'invoices': 0, 'pages': 0, 'drafts': 0, 'bytes': 0, 'cutoff': cutoff.isoformat()}

    # 1) Scan drafts nobody saved in time: delete draft + all its photos.
    draft_cutoff = now - timedelta(days=draft_ttl_days())
    for draft in PurchaseInvoice.objects.filter(status='SAVED', created_at__lt=draft_cutoff).iterator():
        stats['drafts'] += 1
        if dry_run:
            continue
        try:
            with transaction.atomic():
                stats['bytes'] += delete_stored_file(draft.invoice_image)
                for page in draft.extra_pages.all():
                    stats['bytes'] += delete_stored_file(page.image)
                draft.delete()
        except Exception:
            logger.warning('Could not delete stale scan draft %s', draft.pk, exc_info=True)

    with_photo = PurchaseInvoice.objects.exclude(invoice_image='').exclude(invoice_image__isnull=True)
    due = with_photo.filter(scan_uploaded_at__lt=cutoff)
    if include_old:
        due = due | with_photo.filter(scan_uploaded_at__isnull=True, created_at__lt=cutoff)

    for inv in due.only('id', 'invoice_image').iterator():
        stats['invoices'] += 1
        if dry_run:
            continue
        with transaction.atomic():
            stats['bytes'] += delete_stored_file(inv.invoice_image)
            # queryset update: no save() side effects on posted invoices
            PurchaseInvoice.objects.filter(pk=inv.pk).update(invoice_image='')

    pages = PurchaseInvoicePage.objects.filter(created_at__lt=cutoff)
    for page in pages.iterator():
        stats['pages'] += 1
        if dry_run:
            continue
        with transaction.atomic():
            stats['bytes'] += delete_stored_file(page.image)
            page.delete()

    if stats['invoices'] or stats['pages'] or stats['drafts']:
        logger.info('Scan cleanup%s: %s unsaved draft(s) removed, %s photo(s), %s extra page(s), %.1f MB freed',
                    ' (dry run)' if dry_run else '', stats['drafts'], stats['invoices'], stats['pages'],
                    stats['bytes'] / 1e6)
    return stats


def maybe_cleanup_scan_photos() -> None:
    """
    Queue the clean-up at most once per LOCK_SECONDS (lock in the shared
    cache — Redis in production — so all workers agree). Called after every
    scan and when the purchase list is opened, so it also runs on days
    without scans. Never raises and never blocks the caller.
    """
    try:
        from django.core.cache import cache
        if not cache.add(LOCK_KEY, 1, LOCK_SECONDS):
            return
    except Exception:
        logger.warning('Scan clean-up lock unavailable', exc_info=True)
        return
    try:
        from apps.purchases.tasks import cleanup_scan_photos_task
        cleanup_scan_photos_task.delay()
    except Exception:
        logger.warning('Could not queue scan clean-up; running it inline', exc_info=True)
        try:
            cleanup_scan_photos()
        except Exception:
            logger.warning('Scan photo cleanup failed', exc_info=True)
