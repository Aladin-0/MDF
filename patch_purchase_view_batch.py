with open("apps/backend/apps/purchases/views.py", "r") as f:
    content = f.read()

# Add batchId to items
if "'batchNo': item.batch_no," in content:
    content = content.replace("'batchNo': item.batch_no,", "'batchId': str(item.batch_id) if item.batch_id else None,\n                    'batchNo': item.batch_no,")
    with open("apps/backend/apps/purchases/views.py", "w") as f:
        f.write(content)
    print("Patched successfully")
else:
    print("Code not found")
