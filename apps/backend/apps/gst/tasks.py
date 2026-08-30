import hashlib
import json
import logging
from datetime import datetime
from celery import shared_task
from django.db import transaction
from django.utils import timezone
from apps.reports.models import GSTR2BImportJob, GSTR2BData
from apps.gst.provider import get_active_provider
from apps.core.models import GstTaxpayerAuth

logger = logging.getLogger(__name__)

def generate_checksum(payload: dict) -> str:
    """Generate SHA-256 hash of a JSON payload deterministically."""
    sorted_json = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(sorted_json.encode('utf-8')).hexdigest()

@shared_task(bind=True, max_retries=3)
def sync_gstr2b_job(self, job_id: str):
    """
    Async celery task to fetch and normalize GSTR-2B data.
    """
    try:
        job = GSTR2BImportJob.objects.select_related('outlet').get(id=job_id)
    except GSTR2BImportJob.DoesNotExist:
        logger.error(f"GSTR2BImportJob {job_id} not found.")
        return

    # Lock to prevent concurrent runs for same outlet/gstin/period
    lock_id = f"gstr2b_sync_{job.outlet_id}_{job.gstin}_{job.period}"
    
    # In a real app we'd use cache-based locking (Redis). 
    # For now, we will rely on DB state checking.
    active_jobs = GSTR2BImportJob.objects.filter(
        outlet=job.outlet,
        gstin=job.gstin,
        period=job.period,
        status='IN_PROGRESS'
    ).exclude(id=job.id)
    
    if active_jobs.exists():
        job.status = 'FAILED'
        job.error_metadata = {"message": "Another sync is currently in progress for this period."}
        job.save(update_fields=['status', 'error_metadata'])
        return

    # Retrieve taxpayer session
    try:
        auth = GstTaxpayerAuth.objects.get(id=job.session_reference_id)
        session_token = auth.session_token
        if not session_token:
            raise ValueError("Empty session token.")
    except (GstTaxpayerAuth.DoesNotExist, ValueError):
        job.status = 'FAILED'
        job.error_metadata = {"message": "Invalid or missing active taxpayer session."}
        job.save(update_fields=['status', 'error_metadata'])
        return

    try:
        from django.conf import settings
        from apps.reports.normalizers import normalize_gstr2b_record

        provider = get_active_provider()
        
        # Store provider mode and host
        job.provider_mode = getattr(settings, 'SANDBOX_PROVIDER_MODE', 'test')
        job.host = getattr(settings, 'SANDBOX_BASE_URL', '')
        job.save(update_fields=['provider_mode', 'host'])
        
        # Fetch Data
        page = 1
        all_docdata = []
        provider_checksum = None
        page_hashes = []
        
        while True:
            response = provider.fetch_gstr2b(
                gstin=job.gstin,
                period=job.period,
                session_token=session_token,
                file_number=page if page > 1 else None
            )
            
            if response.get('_no_data'):
                job.status = 'NO_DATA_AVAILABLE'
                job.save(update_fields=['status'])
                return
            
            # Combine pages
            docdata = response.get('docdata') or response.get('data', {}).get('docdata')
            
            # Record page hash and metadata
            page_hash = generate_checksum(response)
            if page_hash in page_hashes:
                logger.warning(f"Duplicate page detected: {page}")
                break
            page_hashes.append(page_hash)
            
            if docdata:
                all_docdata.append(response)
                
            if not provider_checksum and 'chksum' in response:
                provider_checksum = response['chksum']
            
            # Pagination check: status_cd 3 means more pages might exist based on file_number
            if response.get('status_cd') == "3" or response.get('fc') and int(response.get('fc')) > page:
                page += 1
            else:
                break
            
        # Calculate local SHA256 of combined docdata
        local_payload_sha256 = generate_checksum(all_docdata)
        page_hash_combined = generate_checksum(page_hashes)
        
        job.provider_chksum = provider_checksum
        job.local_payload_sha256 = local_payload_sha256
        job.raw_payload_hash = local_payload_sha256
        job.page_hash = page_hash_combined
        job.file_count_fetched = page
        job.save(update_fields=['provider_chksum', 'local_payload_sha256', 'raw_payload_hash', 'page_hash', 'file_count_fetched'])
        
        # Check NO_CHANGE idempotency
        last_completed = GSTR2BImportJob.objects.filter(
            outlet=job.outlet, gstin=job.gstin, period=job.period, status='COMPLETED'
        ).exclude(id=job.id).order_by('-retrieval_timestamp').first()
        
        if last_completed and last_completed.raw_payload_hash == job.raw_payload_hash:
            job.status = 'NO_CHANGE'
            job.reused_from_job = last_completed
            job.record_count = last_completed.record_count
            job.save(update_fields=['status', 'reused_from_job', 'record_count'])
            return
            
        # Normalize Data
        records_to_create = []
        for resp in all_docdata:
            docdata = resp.get('docdata') or resp.get('data', {}).get('docdata', {})
            
            for category, suppliers in docdata.items():
                if category not in ['b2b', 'b2ba', 'cdn', 'cdna', 'isd']:
                    job.error_metadata[f"unknown_category_{category}"] = True
                    continue
                
                for supplier in suppliers:
                    ctin = supplier.get('ctin')
                    trdnm = supplier.get('trdnm')
                    items = supplier.get('inv', []) or supplier.get('nt', []) or supplier.get('isd', [])
                    for item in items:
                        try:
                            norm = normalize_gstr2b_record(category, ctin, trdnm, item)
                            records_to_create.append(GSTR2BData(
                                outlet=job.outlet,
                                import_job=job,
                                period=job.period,
                                supplier_gstin=norm['supplier_gstin'],
                                supplier_name=norm['supplier_name'],
                                document_type=norm['document_type'],
                                invoice_number=norm['invoice_number'],
                                invoice_date=norm['invoice_date'],
                                original_document_reference=norm['original_document_reference'],
                                taxable_value=norm['taxable_value'],
                                igst=norm['igst'],
                                cgst=norm['cgst'],
                                sgst=norm['sgst'],
                                cess=norm['cess'],
                                itc_availability_status=norm['itc_availability_status'],
                                ims_status=norm['ims_status'],
                                raw_data=norm['raw_data'],
                                normalizer_version=norm['normalizer_version'],
                                raw_record_hash=norm['raw_record_hash'],
                                source_document_type=norm['source_document_type'],
                                source_field_map=norm['source_field_map']
                            ))
                        except Exception as ne:
                            job.error_metadata[f"normalization_error_{ctin}_{len(records_to_create)}"] = str(ne)
        
        with transaction.atomic():
            # Check for incompleteness
            if job.error_metadata:
                job.status = 'INCOMPLETE'
            else:
                job.status = 'COMPLETED'
            # Create records in bulk
            GSTR2BData.objects.bulk_create(records_to_create, ignore_conflicts=True)
            job.record_count = len(records_to_create)
            job.save(update_fields=['status', 'record_count', 'error_metadata'])
            
    except Exception as e:
        logger.exception(f"Error in sync_gstr2b_job for job {job_id}")
        job.status = 'FAILED'
        job.error_metadata = {"error": str(e)}
        job.save(update_fields=['status', 'error_metadata'])
