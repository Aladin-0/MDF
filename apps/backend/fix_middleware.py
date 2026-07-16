import sys

def fix_settings():
    with open('mediflow/settings/base.py', 'r') as f:
        content = f.read()

    # Add it after apps.audit.middleware.AuditContextMiddleware
    t = "'apps.audit.middleware.AuditContextMiddleware',"
    r = "'apps.audit.middleware.AuditContextMiddleware',\n    'apps.audit.core.middleware.AuditContextMiddleware',"
    
    if t in content:
        content = content.replace(t, r)
        print("Added AuditContextMiddleware")
    else:
        print("Not found")

    with open('mediflow/settings/base.py', 'w') as f:
        f.write(content)

fix_settings()
