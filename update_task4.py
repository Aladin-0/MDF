import re

with open('/home/asta/.gemini/antigravity/brain/6754f69c-4c1e-4f3e-a014-377d3df99261/task.md', 'r') as f:
    content = f.read()

content = content.replace("- `[/]` 4. Frontend UI & Hooks", "- `[x]` 4. Frontend UI & Hooks")
content = content.replace("- `[ ]` Add `lockGSTReport` and `unlockGSTReport` endpoints in `apiClient.ts`", "- `[x]` Add `lockGSTReport` and `unlockGSTReport` endpoints in `apiClient.ts`")
content = content.replace("- `[ ]` Add mutations `useLockGSTReport`, `useUnlockGSTReport` in `useReports.ts`", "- `[x]` Add mutations `useLockGSTReport`, `useUnlockGSTReport` in `useReports.ts`")
content = content.replace("- `[ ]` Update `GSTR1View.tsx` with visual status badges & lock/unlock buttons", "- `[x]` Update `GSTR1View.tsx` with visual status badges & lock/unlock buttons")
content = content.replace("- `[ ]` Update `GSTR3BView.tsx` with visual status badges & lock/unlock buttons", "- `[x]` Update `GSTR3BView.tsx` with visual status badges & lock/unlock buttons")
content = content.replace("- `[ ]` Update `reportExport.ts` (if needed, but mostly UI label changes from \"Export\" to \"Draft Export\")", "- `[x]` Update `reportExport.ts` (if needed, but mostly UI label changes from \"Export\" to \"Draft Export\")")

content = content.replace("- `[ ]` 5. Verification & Documentation", "- `[/]` 5. Verification & Documentation")

with open('/home/asta/.gemini/antigravity/brain/6754f69c-4c1e-4f3e-a014-377d3df99261/task.md', 'w') as f:
    f.write(content)
