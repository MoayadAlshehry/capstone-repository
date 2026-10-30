-- Owner R07: optional notes for newly finalized assessments, including existing tasks.
-- This interaction policy never changes a packet's authorized file membership or rubric.
-- Previously finalized rows retain their original interaction-policy provenance.
ALTER TABLE app.external_assessments ADD COLUMN interaction_policy text NOT NULL DEFAULT 'REFERENCED_EXTERNAL_V1' CHECK(interaction_policy IN ('REFERENCED_EXTERNAL_V1','SIMPLE_EXTERNAL_V2'));
CREATE FUNCTION app.external_interaction_policy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN NEW.interaction_policy:='SIMPLE_EXTERNAL_V2';RETURN NEW;END $$;
CREATE TRIGGER external_00_interaction_policy BEFORE INSERT ON app.external_assessments FOR EACH ROW EXECUTE FUNCTION app.external_interaction_policy();
CREATE OR REPLACE FUNCTION app.external_notes_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE policy text;BEGIN
 IF TG_TABLE_NAME='external_assessments' THEN
 IF NEW.interaction_policy='REFERENCED_EXTERNAL_V1' AND char_length(btrim(NEW.overall_comment))<50 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='LEGACY_COMMENT_REQUIRED';END IF;
 ELSE SELECT interaction_policy INTO policy FROM app.external_assessments WHERE id=NEW.assessment_id;
 IF policy='REFERENCED_EXTERNAL_V1' AND NEW.level IN (0,4) AND char_length(btrim(NEW.comment))<20 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='LEGACY_COMMENT_REQUIRED';END IF;END IF;RETURN NEW;
END $$;
DO $$ DECLARE d text;needle text:=$n$IF m->>'schema' IS DISTINCT FROM 'FULL_FINAL_ARTIFACTS_V2' THEN RETURN app.external_form_legacy_r07(body,packet,complete);END IF;$n$;BEGIN
 d:=pg_get_functiondef('app.external_form(jsonb,uuid,boolean)'::regprocedure);
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'R07_INTERACTION_DEFINITION_MISMATCH';END IF;
 EXECUTE replace(d,needle,'');
END $$;
REVOKE ALL ON FUNCTION app.external_interaction_policy(),app.external_notes_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
