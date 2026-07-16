import sys

def fix_views():
    with open('apps/audit/views.py', 'r') as f:
        content = f.read()

    target = """        from apps.audit.core import flags
        if flags.is_v2_read_enabled() and record_type in ['purchase', 'voucher']:
            # READ V2"""
            
    replacement = """        from apps.audit.core import flags
        if flags.is_v2_read_enabled() and record_type in ['purchase', 'voucher', 'sale']:
            # READ V2"""
            
    if target in content:
        content = content.replace(target, replacement)
        print("Replaced audit views V2 read")
    else:
        print("FAILED to replace audit views V2 read")
        
    with open('apps/audit/views.py', 'w') as f:
        f.write(content)

fix_views()
