#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." &> /dev/null && pwd)"

cd "$ROOT_DIR/apps/backend"
source venv/bin/activate
export DJANGO_SETTINGS_MODULE=mediflow.settings.base
python manage.py spectacular --file ../../schema.yml

cd "$ROOT_DIR/apps/frontend"
npx openapi-typescript ../../schema.yml -o src/types/api.ts
