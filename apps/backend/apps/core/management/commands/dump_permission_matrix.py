import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.core.permission_matrix import build_permission_matrix

FIXTURE = Path(settings.BASE_DIR).parent / 'frontend' / 'lib' / 'permission-matrix.fixture.json'


class Command(BaseCommand):
    help = 'Write the role x flag -> permissions matrix the frontend tests its fallback rules against.'

    def handle(self, *args, **options):
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(json.dumps(build_permission_matrix(), indent=1) + '\n')
        self.stdout.write(self.style.SUCCESS(f'Wrote {FIXTURE}'))
