import os
import sys
import django

# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from apps.audit.models import DocumentRevision, DocumentRevisionV2
from deepdiff import DeepDiff
import json

def run_parity_check():
    print("Starting parity check...")
    v2_revisions = DocumentRevisionV2.objects.all()
    print(f"Found {v2_revisions.count()} V2 revisions.")
    
    passed = 0
    failed = 0
    
    for v2_rev in v2_revisions:
        # Find corresponding V1 revision
        try:
            v1_rev = DocumentRevision.objects.get(
                content_type=v2_rev.content_type,
                object_id=v2_rev.object_id,
                created_at__range=(v2_rev.created_at - django.utils.timezone.timedelta(seconds=5), 
                                   v2_rev.created_at + django.utils.timezone.timedelta(seconds=5))
            )
        except DocumentRevision.DoesNotExist:
            print(f"FAIL: No corresponding V1 revision found for V2 rev {v2_rev.id} (Entity: {v2_rev.content_type.model} {v2_rev.object_id})")
            failed += 1
            continue
        except DocumentRevision.MultipleObjectsReturned:
            print(f"WARN: Multiple V1 revisions found for V2 rev {v2_rev.id}. Skipping.")
            continue
            
        # Compare diffs
        # V1 diffs are stored in diff_summary_json
        v1_diff = v1_rev.diff_summary_json
        v2_diff = v2_rev.diff_summary
        
        diff = DeepDiff(v1_diff, v2_diff, ignore_order=True)
        if diff:
            print(f"FAIL: Parity mismatch for {v2_rev.content_type.model} {v2_rev.object_id}")
            print(f"Diff: {diff}")
            failed += 1
        else:
            passed += 1

    print(f"\nParity Check Complete. Passed: {passed}, Failed: {failed}")

if __name__ == '__main__':
    run_parity_check()
