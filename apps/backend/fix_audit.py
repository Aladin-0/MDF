import os
import re

paths = ['/home/asta/coding/MDF/apps/backend/apps/audit/tests']

for root, _, files in os.walk(paths[0]):
    for file in files:
        if file.endswith('.py'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()

            content = content.replace("filter(action=", "filter(event_name=")
            content = content.replace("filter(action__", "filter(event_name__")
            content = content.replace("'action'", "'event_name'")
            content = content.replace("'timestamp'", "'occurred_at'")
            content = content.replace("-timestamp", "-occurred_at")
            content = content.replace("order_by('timestamp')", "order_by('occurred_at')")
            content = content.replace("order_by('-timestamp')", "order_by('-occurred_at')")

            with open(filepath, 'w') as f:
                f.write(content)

print("Done")
