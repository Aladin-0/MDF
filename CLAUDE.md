## Project map (read first)

Before any task, read PROJECT_MAP.md and graphify-out/GRAPH_REPORT.md. Use /graphify explain and /graphify path to locate code before opening files. After changing code, update PROJECT_MAP.md if APIs, models, fields, or features changed.

PROJECT_MAP.md is ~2,200 lines: don't read it whole. Read its "How to use this file" TOC, sections 1–3 and 11.1, then only the section you need (use Read offset/limit with the TOC line numbers).

## Deploying to production

Before any server/deploy task, read `docs/DEPLOYMENT_GUIDE.md` (server layout, shared-server safety rules, backup, deploy, verify and rollback steps). ALWAYS use the server's own configuration files (`docker-compose.yml`, `.env`, `apps/backend/.env`, `apps/frontend/.env.local`, `settings/base.py`, `nginx/nginx.conf`) exactly as they are on the server — they differ from git on purpose and production runs correctly with them; never overwrite them, and take a backup before every deploy. The server also hosts the separate saudapakka project — never touch it. Never store the SSH password in files; ask the user.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
