import os
import re

directory = 'apps/backend/apps/billing/tests/'

for filename in os.listdir(directory):
    if filename.endswith(".py"):
        filepath = os.path.join(directory, filename)
        with open(filepath, 'r') as f:
            content = f.read()

        # Find if it has invoice_no="INV-...
        if re.search(r'invoice_no=["\']INV-[A-Z0-9-]*["\']', content):
            # Check if import uuid is present
            if 'import uuid' not in content:
                content = "import uuid\n" + content
            
            # Replace invoice_no="INV-xxx" with invoice_no=f"INV-xxx-{uuid.uuid4().hex[:6]}"
            content = re.sub(r'invoice_no=(["\'])(INV-[A-Z0-9-]*)(["\'])', r'invoice_no=f\1\2-{uuid.uuid4().hex[:6]}\3', content)

            with open(filepath, 'w') as f:
                f.write(content)
            print(f"Fixed {filename}")
