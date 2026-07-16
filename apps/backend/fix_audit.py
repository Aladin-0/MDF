import sys

def fix_views():
    with open('apps/audit/views.py', 'r') as f:
        content = f.read()

    target = "if flags.is_v2_read_enabled() or record_type in ('purchase', 'sale'):"
    
    if target in content:
        print("ALREADY HAS sale in views.py")
    else:
        # Actually it's probably just "purchase"
        target2 = "if flags.is_v2_read_enabled() or record_type in ('purchase',):"
        target3 = "if flags.is_v2_read_enabled() or record_type == 'purchase':"
        
        if target2 in content:
            content = content.replace(target2, "if flags.is_v2_read_enabled() or record_type in ('purchase', 'sale'):")
            print("Replaced target2")
        elif target3 in content:
            content = content.replace(target3, "if flags.is_v2_read_enabled() or record_type in ('purchase', 'sale'):")
            print("Replaced target3")
        else:
            print("NOT FOUND")
            
    with open('apps/audit/views.py', 'w') as f:
        f.write(content)

fix_views()
