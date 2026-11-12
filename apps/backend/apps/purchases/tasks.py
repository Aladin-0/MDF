from celery import shared_task
from apps.purchases.ocr_engine import process_invoice_image
from apps.purchases.models import PurchaseInvoice
import logging

logger = logging.getLogger(__name__)

# A scan can legitimately take several minutes (multi-page bill, quota waits,
# verification read). While this marker exists, "Retry scan" must not start a
# second run of the same draft.
OCR_IN_FLIGHT_SECONDS = 10 * 60


def _in_flight_key(draft_id) -> str:
    return f'purchases:ocr-in-flight:{draft_id}'


def mark_ocr_queued(draft_id) -> None:
    try:
        from django.core.cache import cache
        cache.set(_in_flight_key(draft_id), 1, OCR_IN_FLIGHT_SECONDS)
    except Exception:
        logger.warning('Could not record OCR in-flight marker', exc_info=True)


def ocr_in_flight(draft_id):
    """True / False, or None when the cache can't tell."""
    try:
        from django.core.cache import cache
        return bool(cache.get(_in_flight_key(draft_id)))
    except Exception:
        return None


def _clear_in_flight(draft_id) -> None:
    try:
        from django.core.cache import cache
        cache.delete(_in_flight_key(draft_id))
    except Exception:
        pass


def _write_back(draft_id, **fields) -> bool:
    """
    Store OCR output on the draft only if it is still a draft. A queryset
    update never re-creates a row, so a draft deleted or confirmed while the
    scan was running cannot come back as a ghost.
    """
    updated = PurchaseInvoice.objects.filter(id=draft_id, status='SAVED').update(**fields)
    if not updated:
        logger.info('Draft %s was deleted or confirmed during OCR; result discarded', draft_id)
    return bool(updated)


@shared_task(name="purchases.process_invoice_ocr")
def process_invoice_ocr(draft_id: str):
    logger.info(f"Starting OCR for invoice {draft_id}")
    try:
        try:
            invoice = PurchaseInvoice.objects.get(id=draft_id, status='SAVED')
        except PurchaseInvoice.DoesNotExist:
            logger.info('Draft %s no longer exists; nothing to scan', draft_id)
            return

        if not invoice.invoice_image:
            logger.error(f"No image found for invoice {draft_id}")
            _write_back(draft_id, ocr_processing_error='OCR_IMAGE_MISSING')
            return

        # All pages of a multi-page bill, in order (page 1 = invoice_image).
        paths = invoice.scan_image_paths()
        result = process_invoice_image(paths if len(paths) > 1 else paths[0], str(invoice.outlet_id))

        if result.get('error'):
            _write_back(draft_id, ocr_processing_error=result['error'])
        else:
            header = result.get('header', {})
            fields = {
                'ocr_raw_data': result,
                'ocr_confidence': result.get('confidence', 0),
                'ocr_processing_error': None,
                'ocr_distributor_name': header.get('distributor_name'),
                'ocr_distributor_gstin': header.get('gstin'),
                'ocr_distributor_phone': header.get('phone') or header.get('mobile'),
                'ocr_distributor_dl': header.get('dl_no'),
                'ocr_distributor_address': header.get('address'),
            }
            dist_id = (result.get('distributor_match') or {}).get('distributor_id')
            if dist_id:
                fields['distributor_id'] = dist_id
            if _write_back(draft_id, **fields):
                logger.info(f"Successfully processed OCR for {draft_id}")

    except Exception:
        logger.exception("Failed to process OCR for %s", draft_id)
        try:
            _write_back(draft_id, ocr_processing_error='OCR_PROCESSING_FAILED')
        except Exception:
            pass
    finally:
        _clear_in_flight(draft_id)
        # Scan photos (24 h) and unsaved drafts (3 days) are cleaned up in the
        # background — queued, hourly-throttled, never slowing this scan.
        from apps.purchases.scan_cleanup import maybe_cleanup_scan_photos
        maybe_cleanup_scan_photos()


@shared_task(name="purchases.cleanup_scan_photos")
def cleanup_scan_photos_task():
    """Delete old scan photos (24 h) and unsaved scan drafts (3 days). Safe to schedule hourly."""
    from apps.purchases.scan_cleanup import cleanup_scan_photos
    return cleanup_scan_photos()
