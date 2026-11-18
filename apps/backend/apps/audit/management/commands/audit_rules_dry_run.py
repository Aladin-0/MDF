"""Run the suspicious-behaviour rules over the history WITHOUT writing flags: see what they would say before anyone is alerted, then tune the thresholds."""
from collections import Counter

from django.core.management.base import BaseCommand

from apps.audit import rules


class Command(BaseCommand):
    help = 'Show what the audit rules would flag on past events (writes nothing)'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=5000)

    def handle(self, *args, **o):
        hits = rules.dry_run(limit=o['limit'])
        by_rule = Counter(h['rule'] for h in hits)
        for rule, n in by_rule.most_common():
            self.stdout.write(f'{n:5d}  {rules.RULES[rule]["title"]}')
        for h in hits[:25]:
            self.stdout.write(f"  {h['when'][:16]}  [{h['severity']}] {h['title']}")
        self.stdout.write(self.style.SUCCESS(f'{len(hits)} flag(s) would be raised from the last {o["limit"]} events. Nothing was written.'))
