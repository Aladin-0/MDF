import os
import sys
import django
import json

# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from apps.audit.models import DocumentRevision, DocumentRevisionV2

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
            
        # Compare diffs using json serialization to avoid small dict-typing differences
        v1_diff_str = json.dumps(v1_rev.diff_summary_json, sort_keys=True)
        v2_diff_str = json.dumps(v2_rev.diff_summary_json, sort_keys=True)
        
        if v1_diff_str != v2_diff_str:
            print(f"FAIL: Parity mismatch for {v2_rev.content_type.model} {v2_rev.object_id}")
            print(f"  V1 Diff: {v1_diff_str}")
            print(f"  V2 Diff: {v2_diff_str}")
            failed += 1
        else:
            passed += 1

    print(f"\nParity Check Complete. Passed: {passed}, Failed: {failed}")

if __name__ == '__main__':
    run_parity_check()
