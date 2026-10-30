-- R07 reconnects the existing recipient-only due reminders to their exact task.
DO $$ DECLARE d text;needle text:=$n$CASE WHEN n.type LIKE 'external-review.%'$n$;BEGIN
 d:=pg_get_functiondef('app.academic_flow_inbox(uuid,uuid)'::regprocedure);
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'R07_INBOX_DEFINITION_MISMATCH';END IF;
 EXECUTE replace(d,needle,$r$CASE WHEN n.type IN ('reminder.review-offer','reminder.review-task') AND EXISTS(SELECT 1 FROM app.external_review_assignments t JOIN app.reminder_targets rt ON rt.id IN (t.offer_reminder,t.task_reminder) WHERE t.reviewer_id=who AND rt.event_id=n.event_id) THEN (SELECT '/reviewer/tasks/'||t.id::text FROM app.external_review_assignments t JOIN app.reminder_targets rt ON rt.id IN (t.offer_reminder,t.task_reminder) WHERE t.reviewer_id=who AND rt.event_id=n.event_id) WHEN n.type LIKE 'external-review.%'$r$);
END $$;
