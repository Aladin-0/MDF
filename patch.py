import sys

filename = '/home/asta/.gemini/antigravity/brain/4d7d6536-4f96-4c09-babb-88be5677650d/.system_generated/worktrees/subagent-BACKEND-DATA-INTEGRITY-developer-6d4f0b19/apps/backend/apps/billing/views.py'
with open(filename, 'r') as f:
    content = f.read()

target1 = """            items_data = request.data.get('items', [])
            schedule_h_data = request.data.get('scheduleHData')

            # Validate outlet exists"""
replacement1 = """            items_data = request.data.get('items', [])
            schedule_h_data = request.data.get('scheduleHData')

            if not items_data:
                return Response(
                    {'detail': 'Invoice must contain at least one item.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Validate outlet exists"""

if target1 in content:
    content = content.replace(target1, replacement1)
else:
    print("Target 1 not found!")
    sys.exit(1)

target2 = """        action = request.data.get('revisionAction')
        reason_code = request.data.get('revisionReasonCode')
        reason_text = request.data.get('revisionReasonText')

        if not action or not reason_code or not reason_text:
            return Response({'detail': 'Revision context (action, reasonCode, reasonText) is required.'}, status=status.HTTP_400_BAD_REQUEST)
"""
replacement2 = """        action = request.data.get('revisionAction')
        reason_code = request.data.get('revisionReasonCode')
        reason_text = request.data.get('revisionReasonText')
        items_data = request.data.get('items', [])

        if not action or not reason_code or not reason_text:
            return Response({'detail': 'Revision context (action, reasonCode, reasonText) is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if not items_data:
            return Response(
                {'detail': 'Invoice must contain at least one item.'},
                status=status.HTTP_400_BAD_REQUEST
            )
"""

if target2 in content:
    content = content.replace(target2, replacement2)
else:
    print("Target 2 not found!")
    sys.exit(1)

with open(filename, 'w') as f:
    f.write(content)

print("Patch applied successfully.")
