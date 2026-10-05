from celery import shared_task
from apps.purchases.ocr_engine import process_invoice_image
from apps.purchases.models import PurchaseInvoice
import logging

logger = logging.getLogger(__name__)

@shared_task(name="purchases.process_invoice_ocr")
def process_invoice_ocr(draft_id: str):
    logger.info(f"Starting OCR for invoice {draft_id}")
    try:
        invoice = PurchaseInvoice.objects.get(id=draft_id)
        
        if not invoice.invoice_image:
            logger.error(f"No image found for invoice {draft_id}")
            return
            
        result = process_invoice_image(invoice.invoice_image.path, str(invoice.outlet_id))
        
        if result.get('error'):
            invoice.ocr_processing_error = result['error']
        else:
            invoice.ocr_raw_data = result
            invoice.ocr_confidence = result.get('confidence', 0)
            
            header = result.get('header', {})
            invoice.ocr_distributor_name = header.get('distributor_name')
            invoice.ocr_distributor_gstin = header.get('gstin')
            invoice.ocr_distributor_phone = header.get('phone') or header.get('mobile')
            invoice.ocr_distributor_dl = header.get('dl_no')
            invoice.ocr_distributor_address = header.get('address')
            
            dist_match = result.get('distributor_match', {})
            if dist_match.get('distributor_id'):
                invoice.distributor_id = dist_match['distributor_id']
                
        invoice.save()
        logger.info(f"Successfully processed OCR for {draft_id}")
        
    except Exception as e:
        logger.exception(f"Failed to process OCR for {draft_id}: {e}")
        try:
            invoice = PurchaseInvoice.objects.get(id=draft_id)
            invoice.ocr_processing_error = str(e)
            invoice.save()
        except Exception:
            pass
