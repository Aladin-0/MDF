import re

with open('/home/asta/.gemini/antigravity/brain/6754f69c-4c1e-4f3e-a014-377d3df99261/task.md', 'r') as f:
    content = f.read()

content = content.replace("- `[/]` 5. Verification & Documentation", "- `[x]` 5. Verification & Documentation")
content = content.replace("- `[ ]` Write `docs/GST_PHASE4A_LOCKING_REPORT.md`", "- `[x]` Write `docs/GST_PHASE4A_LOCKING_REPORT.md`")
content = content.replace("- `[ ]` Write `docs/GST_PHASE4A_VALIDATION_REPORT.md`", "- `[x]` Write `docs/GST_PHASE4A_VALIDATION_REPORT.md`")

with open('/home/asta/.gemini/antigravity/brain/6754f69c-4c1e-4f3e-a014-377d3df99261/task.md', 'w') as f:
    f.write(content)
