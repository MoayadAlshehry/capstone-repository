-- R09 follow-up: keep organization identity separate from its bounded eligibility response.
CREATE TABLE app.partner_clarifications(partner_id uuid NOT NULL REFERENCES app.users(id),command_id uuid NOT NULL,revision integer NOT NULL,response text,
 PRIMARY KEY(partner_id,command_id),UNIQUE(partner_id,revision),CHECK(response IS NULL OR char_length(response) BETWEEN 3 AND 1000));
CREATE TRIGGER immutable_partner_clarification BEFORE UPDATE OR DELETE ON app.partner_clarifications FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE ALL ON app.partner_clarifications FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.partner_command(actor uuid,session_id uuid,command_id uuid,target uuid,command text,expected_revision integer,reason text,organization text,clarification text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;old app.partner_clarifications;response_value text:=nullif(btrim(clarification),'');BEGIN
 IF clarification IS NOT NULL AND (command<>'resubmit' OR char_length(response_value) NOT BETWEEN 3 AND 1000 OR clarification~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f‪-‮⁦-⁩]' OR clarification~*'(password|secret|token|cookie)[[:space:]]*[:=]') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_CLARIFICATION';END IF;
 result:=app.partner_command(actor,session_id,command_id,target,command,expected_revision,reason,organization);
 IF command='resubmit' THEN
  SELECT * INTO old FROM app.partner_clarifications pc WHERE pc.partner_id=actor AND pc.command_id=partner_command.command_id;
  IF old.command_id IS NOT NULL THEN IF old.response IS DISTINCT FROM response_value THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CLARIFICATION_CONFLICT';END IF;
  ELSE INSERT INTO app.partner_clarifications(partner_id,command_id,revision,response) SELECT actor,partner_command.command_id,partner_revision,response_value FROM app.users WHERE id=actor;END IF;
 END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.partner_command(uuid,uuid,uuid,uuid,text,integer,text,text,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.partner_command(uuid,uuid,uuid,uuid,text,integer,text,text,text) TO capstone_runtime;
ALTER FUNCTION app.partner_view(uuid,uuid,text) RENAME TO partner_view_before_r09;
CREATE FUNCTION app.partner_view(actor uuid,session_id uuid,status_filter text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE rows jsonb;BEGIN
 rows:=app.partner_view_before_r09(actor,session_id,status_filter);
 RETURN (SELECT coalesce(jsonb_agg(x||jsonb_build_object('clarification',(SELECT response FROM app.partner_clarifications WHERE partner_id=(x->>'id')::uuid ORDER BY revision DESC LIMIT 1))),'[]'::jsonb) FROM jsonb_array_elements(rows) x);
END $$;
REVOKE ALL ON FUNCTION app.partner_view_before_r09(uuid,uuid,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.partner_view(uuid,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.partner_view(uuid,uuid,text) TO capstone_runtime;
