from django.core.management.base import BaseCommand
from apps.core.management.commands.seeder import run_seeder, generate_deterministic_anchors

class Command(BaseCommand):
    help = 'Generate realistic local GST test data for MediFlow'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='Wipes ONLY seeded test data before running')
        parser.add_argument('--hard-reset', action='store_true', help='Wipes ALL local transaction data (seeded and manual). Use with caution.')
        parser.add_argument('--seed', type=int, help='Random seed for deterministic generation')
        parser.add_argument('--size', type=str, choices=['small', 'medium'], default='medium', help='Size of the dataset')

    def handle(self, *args, **options):
        reset = options['reset']
        hard_reset = options['hard_reset']
        seed = options['seed']
        size = options['size']

        if hard_reset:
            self.stdout.write(self.style.WARNING("Performing HARD RESET of all local transactions..."))
            run_seeder(size=size, hard_reset=True, random_seed=seed)
        elif reset:
            self.stdout.write(self.style.WARNING("Performing safe reset of SEEDED local data..."))
            run_seeder(size=size, hard_reset=False, random_seed=seed)
        else:
            self.stdout.write(self.style.SUCCESS("Running seeder without reset (append mode)..."))
            run_seeder(size=size, hard_reset=False, random_seed=seed)
        
        self.stdout.write(self.style.SUCCESS("Generating deterministic anchor scenarios for validation..."))
        generate_deterministic_anchors()

        self.stdout.write(self.style.SUCCESS("Test data generation complete. Run validate_test_data to confirm."))
