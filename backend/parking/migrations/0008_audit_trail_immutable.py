from django.db import migrations

CREATE = """
CREATE FUNCTION parking_auditlog_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Audit trail records cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER parking_auditlog_no_change
BEFORE UPDATE OR DELETE ON parking_auditlog
FOR EACH ROW EXECUTE FUNCTION parking_auditlog_immutable();
"""

DROP = """
DROP TRIGGER IF EXISTS parking_auditlog_no_change ON parking_auditlog;
DROP FUNCTION IF EXISTS parking_auditlog_immutable();
"""


class Migration(migrations.Migration):
    dependencies = [("parking", "0007_audit_verification_sessions")]
    operations = [migrations.RunSQL(CREATE, DROP)]
