-- Permanent retirement, rather than an inert automatic-registration workaround.
-- A published decision never creates a supervisor-authorized packet. The real
-- lead's explicit frozen-round consent is the sole V2 creation entry point.
DROP TRIGGER full_final_publication ON app.academic_decision_scope;
DROP FUNCTION app.full_final_publication();
DROP FUNCTION app.full_final_register(uuid);
