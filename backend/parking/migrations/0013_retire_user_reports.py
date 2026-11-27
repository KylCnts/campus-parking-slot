from django.db import migrations

# The User Reports feature was removed: students and faculty now raise concerns with the guard at the parking area.
#
# This migration removes the UserReport model from Django, but deliberately does NOT drop the parking_userreport
# table, so any reports already submitted on a deployed system stay in the database (attachments stay under
# PRIVATE_MEDIA_ROOT/report_attachments/). Nothing in the application reads or writes that table any more.
#
# The table's foreign keys to accounts_user (reporter_id, handled_by_id) are removed. Django used to clear those
# links itself when an account was deleted; once the model is gone it no longer can, so the constraints would
# otherwise block deleting any account that ever sent or handled a report. The rows keep the reporter's name and
# email, so they stay readable as an archive.
#
# If the data is confirmed unneeded, a later migration can drop the table with:
#     migrations.RunSQL("DROP TABLE IF EXISTS parking_userreport;", migrations.RunSQL.noop)

DROP_USER_FOREIGN_KEYS = """
DO $$
DECLARE c record;
BEGIN
    IF to_regclass('public.parking_userreport') IS NOT NULL THEN
        FOR c IN
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.parking_userreport'::regclass AND contype = 'f'
        LOOP
            EXECUTE format('ALTER TABLE parking_userreport DROP CONSTRAINT %I', c.conname);
        END LOOP;
    END IF;
END $$;
"""

RESTORE_USER_FOREIGN_KEYS = """
DO $$
BEGIN
    IF to_regclass('public.parking_userreport') IS NOT NULL THEN
        UPDATE parking_userreport SET reporter_id = NULL
            WHERE reporter_id IS NOT NULL AND reporter_id NOT IN (SELECT id FROM accounts_user);
        UPDATE parking_userreport SET handled_by_id = NULL
            WHERE handled_by_id IS NOT NULL AND handled_by_id NOT IN (SELECT id FROM accounts_user);
        ALTER TABLE parking_userreport ADD CONSTRAINT parking_userreport_reporter_id_fk_accounts_user_id
            FOREIGN KEY (reporter_id) REFERENCES accounts_user (id) DEFERRABLE INITIALLY DEFERRED;
        ALTER TABLE parking_userreport ADD CONSTRAINT parking_userreport_handled_by_id_fk_accounts_user_id
            FOREIGN KEY (handled_by_id) REFERENCES accounts_user (id) DEFERRABLE INITIALLY DEFERRED;
    END IF;
END $$;
"""


class Migration(migrations.Migration):
    dependencies = [("parking", "0012_user_reports")]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[migrations.DeleteModel(name="UserReport")],
            database_operations=[migrations.RunSQL(DROP_USER_FOREIGN_KEYS, RESTORE_USER_FOREIGN_KEYS)],
        ),
    ]
