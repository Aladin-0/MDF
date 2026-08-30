"""
seed_gst_sandbox_demo — idempotent local-development-only management command.

Creates / updates:
  1. SEED-Mumbai Outlet — the sandbox outlet (state / state_code fix)
  2. SandboxConfiguration — non-secret fields only, linked to the sandbox outlet
  3. A dedicated sandbox-only Staff user (phone from GST_SANDBOX_TEST_PHONE env var)

Does NOT:
  - touch Test Outlet or Staff user 9999999999
  - set, generate, print, or persist any password
  - store API keys, client secrets, tokens, or OTPs
  - call any external API
  - run in production / staging / non-debug environments

Usage:
    python manage.py seed_gst_sandbox_demo

Password must be set manually after this command:
    python manage.py changepassword <GST_SANDBOX_TEST_PHONE>
"""

import os
from io import StringIO

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import transaction
from django.utils import timezone

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SANDBOX_OUTLET_GSTIN = "27AAPCM1753L2ZX"
SANDBOX_OUTLET_STATE = "Maharashtra"
SANDBOX_OUTLET_STATE_CODE = "27"
SANDBOX_OUTLET_NAME_PREFIX = "SEED-"
PROTECTED_PHONE = "9999999999"          # never touch this user's outlet assignment


def _mask_gstin(gstin: str) -> str:
    if not gstin or len(gstin) < 5:
        return "***"
    return f"{gstin[:2]}***{gstin[-4:]}"


def _mask_phone(phone: str) -> str:
    if not phone or len(phone) < 5:
        return "***"
    return f"{phone[:3]}****{phone[-3:]}"


class Command(BaseCommand):
    help = (
        "Seed a local-development-only GST sandbox dataset. "
        "Creates / updates: sandbox outlet, SandboxConfiguration (no secrets), "
        "and a dedicated sandbox Staff user. "
        "Refuses to run outside DEBUG=True / development environment."
    )

    # ------------------------------------------------------------------
    # Guard: refuse in production / staging / non-debug
    # ------------------------------------------------------------------
    def _enforce_development_guard(self):
        if not settings.DEBUG:
            raise CommandError(
                "REFUSED: DEBUG is False. "
                "This command must only run in a local development environment."
            )

        env_marker = os.environ.get("ENVIRONMENT", "").lower()
        if env_marker in ("production", "prod", "staging", "stage"):
            raise CommandError(
                f"REFUSED: ENVIRONMENT={env_marker!r}. "
                "This command must only run with ENVIRONMENT=development or unset."
            )

        # Check database name does not contain production markers
        db_name = str(settings.DATABASES["default"].get("NAME", ""))
        for forbidden in ("prod", "production", "staging"):
            if forbidden in db_name.lower():
                raise CommandError(
                    f"REFUSED: Database name {db_name!r} appears to be a "
                    f"production/staging database. Aborting."
                )

        self.stdout.write(
            self.style.WARNING(
                "[GUARD PASSED] Running in development mode. "
                "No production data will be affected."
            )
        )

    # ------------------------------------------------------------------
    # Main handler
    # ------------------------------------------------------------------
    def handle(self, *args, **options):
        self._enforce_development_guard()

        # ── Read required non-secret env vars ──────────────────────────
        sandbox_gstin = os.environ.get("GSTIN", SANDBOX_OUTLET_GSTIN).strip()
        sandbox_base_url = os.environ.get(
            "SANDBOX_BASE_URL", "https://api.sandbox.co.in"
        ).strip()
        gst_username = os.environ.get("GST_USERNAME", "").strip()
        sandbox_phone = os.environ.get("GST_SANDBOX_TEST_PHONE", "").strip()

        if not sandbox_phone:
            raise CommandError(
                "GST_SANDBOX_TEST_PHONE is not set in the environment.\n"
                "Set it in your .env file (e.g. GST_SANDBOX_TEST_PHONE=8888888800) "
                "and re-run. This command will not hard-code a phone number."
            )

        if sandbox_phone == PROTECTED_PHONE:
            raise CommandError(
                f"GST_SANDBOX_TEST_PHONE must not be {PROTECTED_PHONE!r}. "
                "That is the existing admin user. Use a different phone number."
            )

        # ── Execute atomically ─────────────────────────────────────────
        with transaction.atomic():
            sandbox_outlet, outlet_created = self._setup_sandbox_outlet(sandbox_gstin)
            sandbox_cfg, cfg_created = self._setup_sandbox_config(
                sandbox_outlet, sandbox_base_url, gst_username, sandbox_gstin
            )
            sandbox_user, user_created = self._setup_sandbox_user(
                sandbox_phone, sandbox_outlet
            )
            self._write_audit_event(
                sandbox_outlet=sandbox_outlet,
                sandbox_cfg=sandbox_cfg,
                sandbox_user=sandbox_user,
                sandbox_gstin=sandbox_gstin,
                outlet_created=outlet_created,
                cfg_created=cfg_created,
                user_created=user_created,
            )

        # ── Safe summary output ────────────────────────────────────────
        self._print_safe_summary(
            sandbox_outlet=sandbox_outlet,
            sandbox_cfg=sandbox_cfg,
            sandbox_user=sandbox_user,
            sandbox_gstin=sandbox_gstin,
            sandbox_phone=sandbox_phone,
            sandbox_base_url=sandbox_base_url,
            outlet_created=outlet_created,
            cfg_created=cfg_created,
            user_created=user_created,
        )

    # ------------------------------------------------------------------
    # Step 1 — Sandbox Outlet
    # ------------------------------------------------------------------
    def _setup_sandbox_outlet(self, sandbox_gstin: str):
        from apps.core.models import Outlet

        outlet = Outlet.objects.filter(gstin=sandbox_gstin).first()

        if outlet is None:
            raise CommandError(
                f"No outlet with GSTIN {_mask_gstin(sandbox_gstin)} found.\n"
                "Expected the seeder to have created 'SEED-Mumbai Outlet'. "
                "Run: python manage.py seed_local_gst_test_data --size small"
            )

        created = False

        # Apply only the required consistency fixes; never rename / delete
        changed = False
        if outlet.state != SANDBOX_OUTLET_STATE:
            outlet.state = SANDBOX_OUTLET_STATE
            changed = True
        if outlet.state_code != SANDBOX_OUTLET_STATE_CODE:
            outlet.state_code = SANDBOX_OUTLET_STATE_CODE
            changed = True

        if changed:
            outlet.save(update_fields=["state", "state_code"])
            self.stdout.write(
                self.style.SUCCESS(
                    f"  [OUTLET] Updated state/state_code on '{outlet.name}'"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"  [OUTLET] '{outlet.name}' already consistent — no changes."
                )
            )

        return outlet, created

    # ------------------------------------------------------------------
    # Step 2 — SandboxConfiguration (no secrets)
    # ------------------------------------------------------------------
    def _setup_sandbox_config(
        self, sandbox_outlet, sandbox_base_url: str, gst_username: str, sandbox_gstin: str
    ):
        from apps.core.models import SandboxConfiguration

        cfg, created = SandboxConfiguration.objects.get_or_create(
            outlet=sandbox_outlet,
            defaults={
                "base_url": sandbox_base_url,
                "active": True,
            },
        )

        # Update mutable non-secret fields if they have drifted
        changed = False
        if cfg.base_url != sandbox_base_url:
            cfg.base_url = sandbox_base_url
            changed = True
        if not cfg.active:
            cfg.active = True
            changed = True
        if changed:
            cfg.save(update_fields=["base_url", "active"])

        # Store the GST username on the outlet (non-secret identifier)
        if gst_username and sandbox_outlet.gst_username != gst_username:
            sandbox_outlet.gst_username = gst_username
            sandbox_outlet.save(update_fields=["gst_username"])

        verb = "Created" if created else "Already exists"
        self.stdout.write(
            self.style.SUCCESS(
                f"  [SANDBOX CONFIG] {verb} — outlet={sandbox_outlet.name} "
                f"url={sandbox_base_url} active={cfg.active}"
            )
        )
        return cfg, created

    # ------------------------------------------------------------------
    # Step 3 — Sandbox Staff User
    # ------------------------------------------------------------------
    def _setup_sandbox_user(self, sandbox_phone: str, sandbox_outlet):
        from apps.accounts.models import Staff

        # Absolute safety: never touch the protected admin user
        if Staff.objects.filter(phone=PROTECTED_PHONE, outlet=sandbox_outlet).exists():
            raise CommandError(
                f"REFUSED: The protected user {_mask_phone(PROTECTED_PHONE)} "
                "is already linked to the sandbox outlet. "
                "This should not happen — manual investigation required."
            )

        user, created = Staff.objects.get_or_create(
            phone=sandbox_phone,
            defaults={
                "outlet": sandbox_outlet,
                "name": "GST Sandbox Test User",
                "role": "admin",
                "is_active": True,
                "is_staff": True,
                "can_access_reports": True,
                "can_create_purchases": True,
                # All other permission flags default to False — minimum needed
                "staff_pin": "",
            },
        )

        if not created:
            # Idempotency: ensure outlet and active status are correct
            changed = False
            if user.outlet_id != sandbox_outlet.pk:
                if str(user.phone) == PROTECTED_PHONE:
                    raise CommandError(
                        f"REFUSED: Cannot reassign protected user {PROTECTED_PHONE}."
                    )
                user.outlet = sandbox_outlet
                changed = True
            if not user.is_active:
                user.is_active = True
                changed = True
            if not user.can_access_reports:
                user.can_access_reports = True
                changed = True
            if changed:
                user.save(update_fields=["outlet", "is_active", "can_access_reports"])

        verb = "Created" if created else "Already exists"
        self.stdout.write(
            self.style.SUCCESS(
                f"  [SANDBOX USER] {verb} — phone={_mask_phone(sandbox_phone)} "
                f"outlet={sandbox_outlet.name} active={user.is_active}"
            )
        )

        # Safety: confirm protected user was NOT modified
        from apps.accounts.models import Staff as StaffModel
        protected = StaffModel.objects.filter(phone=PROTECTED_PHONE).first()
        if protected and str(protected.outlet_id) == str(sandbox_outlet.pk):
            raise CommandError(
                "SAFETY VIOLATION: Protected user 9999999999 was somehow linked "
                "to the sandbox outlet. Rolling back."
            )

        return user, created

    # ------------------------------------------------------------------
    # Step 4 — Audit Event
    # ------------------------------------------------------------------
    def _write_audit_event(
        self,
        *,
        sandbox_outlet,
        sandbox_cfg,
        sandbox_user,
        sandbox_gstin: str,
        outlet_created: bool,
        cfg_created: bool,
        user_created: bool,
    ):
        try:
            from apps.audit.models import ActivityLog

            ActivityLog.objects.create(
                outlet=sandbox_outlet,
                action="seed_gst_sandbox_demo",
                module="gst.management",
                entity_type="SandboxConfiguration",
                entity_id=str(sandbox_cfg.pk),
                entity_label=sandbox_outlet.name,
                description=(
                    "Local development GST sandbox seed executed. "
                    "No production data affected. No credentials stored."
                ),
                metadata_json={
                    "command": "seed_gst_sandbox_demo",
                    "environment": "development",
                    "sandbox_outlet_id": str(sandbox_outlet.pk),
                    "sandbox_outlet_name": sandbox_outlet.name,
                    "masked_gstin": _mask_gstin(sandbox_gstin),
                    "state": SANDBOX_OUTLET_STATE,
                    "state_code": SANDBOX_OUTLET_STATE_CODE,
                    "sandbox_config_created": cfg_created,
                    "sandbox_user_created": user_created,
                    "sandbox_user_phone_masked": _mask_phone(str(sandbox_user.phone)),
                    "timestamp_utc": timezone.now().isoformat(),
                    "note": "No secrets recorded in this audit entry.",
                },
            )
            self.stdout.write(
                self.style.SUCCESS("  [AUDIT] ActivityLog entry written.")
            )
        except Exception as exc:
            # Non-fatal — audit failure must not block the seed
            self.stdout.write(
                self.style.WARNING(f"  [AUDIT] Could not write ActivityLog: {exc}")
            )

    # ------------------------------------------------------------------
    # Safe summary
    # ------------------------------------------------------------------
    def _print_safe_summary(
        self,
        *,
        sandbox_outlet,
        sandbox_cfg,
        sandbox_user,
        sandbox_gstin: str,
        sandbox_phone: str,
        sandbox_base_url: str,
        outlet_created: bool,
        cfg_created: bool,
        user_created: bool,
    ):
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 62))
        self.stdout.write(self.style.SUCCESS("  GST SANDBOX SEED — COMPLETE (LOCAL DEVELOPMENT ONLY)"))
        self.stdout.write(self.style.SUCCESS("=" * 62))
        self.stdout.write(f"  Environment        : development (DEBUG=True)")
        self.stdout.write(f"  Sandbox outlet     : {sandbox_outlet.name}")
        self.stdout.write(f"  Outlet ID          : {sandbox_outlet.pk}")
        self.stdout.write(f"  Masked GSTIN       : {_mask_gstin(sandbox_gstin)}")
        self.stdout.write(f"  State              : {SANDBOX_OUTLET_STATE}")
        self.stdout.write(f"  State code         : {SANDBOX_OUTLET_STATE_CODE}")
        self.stdout.write(
            f"  SandboxConfig      : {'Created' if cfg_created else 'Already existed'} "
            f"(id={sandbox_cfg.pk})"
        )
        self.stdout.write(f"  Sandbox base URL   : {sandbox_base_url}")
        self.stdout.write(
            f"  Sandbox test user  : {_mask_phone(sandbox_phone)} "
            f"| outlet={sandbox_outlet.name} "
            f"| {'Created' if user_created else 'Already existed'}"
        )
        self.stdout.write("")
        self.stdout.write(self.style.WARNING("  *** CREDENTIAL NOT SET — ACTION REQUIRED ***"))
        self.stdout.write(
            self.style.WARNING(
                "  Set the sandbox user credential manually using the phone number\n"
                "  stored in GST_SANDBOX_TEST_PHONE:\n"
                "    python manage.py changepassword <GST_SANDBOX_TEST_PHONE>"
            )
        )
        self.stdout.write("")
        self.stdout.write("  To verify sandbox configuration (non-destructive):")
        self.stdout.write("    python manage.py check_sandbox_auth")
        self.stdout.write(self.style.SUCCESS("=" * 62))
        self.stdout.write("")
