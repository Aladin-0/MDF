from django.db import migrations

# The audit trail must not be quietly rewritten. Postgres refuses (a) any DELETE and (b) any UPDATE other than the two columns the rules
# maintain (flag_count, severity) UNLESS the session says `audit.allow_purge = 'on'` (the retention purge and tests do, inside their own transaction).
# This stops application bugs and ad-hoc ORM calls; it is not a defence against a database administrator (who could drop the trigger).
FORWARD = """
CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
    IF current_setting('audit.allow_purge', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'The audit trail is append-only: rows are removed only by the retention purge';
    END IF;
    IF (to_jsonb(NEW) - 'flag_count' - 'severity') IS DISTINCT FROM (to_jsonb(OLD) - 'flag_count' - 'severity') THEN
        RAISE EXCEPTION 'The audit trail is append-only: an event can not be changed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_events_append_only ON audit_activity_event;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_activity_event FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
"""
REVERSE = "DROP TRIGGER IF EXISTS audit_events_append_only ON audit_activity_event; DROP FUNCTION IF EXISTS audit_events_append_only();"


def apply(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        schema_editor.execute(FORWARD)


def revert(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        schema_editor.execute(REVERSE)


class Migration(migrations.Migration):
    dependencies = [('audit', '0008_audit_trail_v3')]
    operations = [migrations.RunPython(apply, revert)]
