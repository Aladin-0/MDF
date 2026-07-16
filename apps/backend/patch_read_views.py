import os
import re

FILES = [
    '/home/asta/coding/MDF/apps/backend/apps/billing/views.py',
    '/home/asta/coding/MDF/apps/backend/apps/purchases/views.py',
    '/home/asta/coding/MDF/apps/backend/apps/accounts/voucher_views.py'
]

V2_INJECTION = """
        from apps.audit.core import flags
        if flags.is_v2_read_enabled():
            from apps.audit.models import DocumentRevisionV2
            from apps.audit.serializers import DocumentRevisionV2LegacyAdapterSerializer
            revisions_v2 = DocumentRevisionV2.objects.filter(
                content_type=__CT_VAR__, object_id=str(__ID_VAR__), tenant_id=outlet_id
            ).order_by('-created_at')
            serializer = DocumentRevisionV2LegacyAdapterSerializer(revisions_v2, many=True)
        else:
            serializer = DocumentRevisionSerializer(revisions, many=True)
"""

def patch_file(filepath):
    if not os.path.exists(filepath):
        print(f"File {filepath} not found.")
        return

    with open(filepath, 'r') as f:
        content = f.read()

    lines = content.split('\n')
    new_lines = []
    
    inside_revision_view = False
    current_ct_var = None
    current_id_var = None
    
    for i, line in enumerate(lines):
        if "class " in line and ("RevisionDetailView" in line or "RevisionListView" in line):
            inside_revision_view = True
            current_ct_var = None
            current_id_var = None
            
        if inside_revision_view:
            if "content_type=" in line and "object_id=" in line:
                m = re.search(r'content_type=([\w_]+),\s*object_id=(?:str\()?([\w_]+)\)?', line)
                if m:
                    current_ct_var = m.group(1)
                    current_id_var = m.group(2)
            elif "content_type=" in line and "object_id__in=" not in line:
                m = re.search(r'content_type=([\w_]+)', line)
                if m:
                    current_ct_var = m.group(1)

            if "serializer = DocumentRevisionSerializer(" in line:
                if current_ct_var:
                    id_var = current_id_var or "invoice_id" # Default fallback
                    indent = line[:len(line) - len(line.lstrip())]
                    injection = V2_INJECTION.replace('__CT_VAR__', current_ct_var).replace('__ID_VAR__', id_var)
                    for inj_line in injection.split('\n'):
                        if inj_line.strip():
                            new_lines.append(indent + inj_line[8:])
                    
                    inside_revision_view = False # reset for next view
                    continue # SKIP original line because we added it in the else block
                
        new_lines.append(line)

    with open(filepath, 'w') as f:
        f.write('\n'.join(new_lines))
    print(f"Patched {filepath}")

for f in FILES:
    patch_file(f)
