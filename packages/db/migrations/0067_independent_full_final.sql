-- R07: versioned full-final evidence. Existing packets/results are never rewritten.
DO $$ DECLARE c record;BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='app.academic_review_packets'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%ACADEMIC_PACKET_V1%' LOOP EXECUTE format('ALTER TABLE app.academic_review_packets DROP CONSTRAINT %I',c.conname);END LOOP;END $$;
ALTER TABLE app.academic_review_packets ADD CHECK(manifest->>'case'=case_id::text AND manifest->>'project'=project_id::text AND manifest->>'version'=version_id::text AND manifest->>'submission'=submission_id::text AND manifest->>'schema' IN ('ACADEMIC_PACKET_V1','FULL_FINAL_ARTIFACTS_V2'));
CREATE FUNCTION app.full_final_manifest(cid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE c app.evaluation_cases;entries jsonb;BEGIN
 SELECT * INTO c FROM app.evaluation_cases WHERE id=cid;
 IF c.id IS NULL OR NOT EXISTS(SELECT 1 FROM app.academic_finals f JOIN app.academic_final_admissions a ON a.submission_id=f.submission_id AND a.outcome='accepted' JOIN app.academic_decision_scope d ON d.submission_id=f.submission_id AND d.outcome='publish' JOIN app.projects p ON p.id=c.project_id AND p.published_version_id=c.version_id JOIN app.project_versions v ON v.id=c.version_id AND v.status='archived' AND v.approved_submission_id=c.submission_id WHERE f.submission_id=c.submission_id) OR NOT app.partner_archive_eligible(c.project_id,c.version_id) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='FINAL_UNAVAILABLE';END IF;
 IF EXISTS(SELECT 1 FROM app.submission_files sf LEFT JOIN app.storage_objects o ON o.id=sf.storage_object_id AND o.project_id=sf.project_id AND o.university_id=sf.university_id WHERE sf.submission_id=c.submission_id AND (o.id IS NULL OR (o.size_bytes,o.sha256) IS DISTINCT FROM (sf.size_at_submit,sf.sha256_at_submit))) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='FINAL_INTEGRITY';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',sf.file_id,'path',sf.relative_path,'sha256',sf.sha256_at_submit,'size',sf.size_at_submit,'mime',sf.mime_at_submit) ORDER BY sf.relative_path COLLATE "C",sf.file_id),'[]') INTO entries FROM app.submission_files sf WHERE sf.submission_id=c.submission_id;
 IF jsonb_array_length(entries)=0 OR jsonb_array_length(entries)>10000 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='FINAL_MEMBERS_REQUIRED';END IF;
 RETURN jsonb_build_object('schema','FULL_FINAL_ARTIFACTS_V2','case',c.id,'project',c.project_id,'version',c.version_id,'submission',c.submission_id,'entries',entries,'languages',(SELECT CASE WHEN title||abstract ~ '[ء-ي]' THEN '["ar","en"]'::jsonb ELSE '["en"]'::jsonb END FROM app.project_versions WHERE id=c.version_id));
END $$;
CREATE FUNCTION app.full_final_register(sub uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE c app.evaluation_cases;m jsonb;packet uuid:=gen_random_uuid();a app.users;BEGIN
 SELECT * INTO c FROM app.evaluation_cases WHERE submission_id=sub FOR UPDATE;
 -- Preserve old offered/accepted/finalized scopes and all lead-curated packets.
 IF c.id IS NULL OR EXISTS(SELECT 1 FROM app.academic_review_packets WHERE case_id=c.id) OR EXISTS(SELECT 1 FROM app.external_review_assignments WHERE case_id=c.id) THEN RETURN;END IF;
 m:=app.full_final_manifest(c.id);SELECT u.* INTO a FROM app.users u JOIN app.academic_decision_commands r ON r.actor_id=u.id WHERE r.submission_id=sub AND r.operation='publish';
 IF a.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PUBLICATION_ACTOR_REQUIRED';END IF;
 INSERT INTO app.academic_review_packets(id,university_id,project_id,version_id,submission_id,case_id,manifest,manifest_hash,authorized_by,authorized_at) VALUES(packet,c.university_id,c.project_id,c.version_id,sub,c.id,m,app.packet_hash(m),a.id,app.governance_now());
 INSERT INTO app.academic_packet_workspaces(case_id,revision,draft,draft_hash,current_packet_id,updated_by,updated_at) VALUES(c.id,1,m,app.packet_hash(m),packet,a.id,app.governance_now()) ON CONFLICT(case_id) DO UPDATE SET current_packet_id=packet,revision=app.academic_packet_workspaces.revision+1,draft=m,draft_hash=app.packet_hash(m),updated_by=a.id,updated_at=app.governance_now();
 PERFORM app.packet_event(a,c,packet,'automatic-full-final',gen_random_uuid(),NULL,'authorized',app.packet_hash(m),jsonb_array_length(m->'entries'));
END $$;
CREATE FUNCTION app.full_final_publication() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN IF NEW.outcome='publish' THEN PERFORM app.full_final_register(NEW.submission_id);END IF;RETURN NEW;END $$;
CREATE TRIGGER full_final_publication AFTER INSERT ON app.academic_decision_scope FOR EACH ROW EXECUTE FUNCTION app.full_final_publication();
ALTER FUNCTION app.external_packet(uuid) RENAME TO external_packet_legacy_r07;
CREATE FUNCTION app.external_packet(packet uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.academic_review_packets;m jsonb;files jsonb;BEGIN
 SELECT * INTO r FROM app.academic_review_packets WHERE id=packet;
 IF r.manifest->>'schema' IS DISTINCT FROM 'FULL_FINAL_ARTIFACTS_V2' THEN RETURN app.external_packet_legacy_r07(packet);END IF;
 IF NOT EXISTS(SELECT 1 FROM app.academic_packet_workspaces WHERE case_id=r.case_id AND current_packet_id=packet) OR EXISTS(SELECT 1 FROM app.academic_packet_revocations WHERE packet_id=packet) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='FINAL_UNAVAILABLE';END IF;
 m:=app.full_final_manifest(r.case_id);IF m IS DISTINCT FROM r.manifest OR app.packet_hash(m)<>r.manifest_hash THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='FINAL_INTEGRITY';END IF;
 SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',o.size_bytes,'sha256',o.sha256) ORDER BY sf.relative_path COLLATE "C",sf.file_id) INTO files FROM app.submission_files sf JOIN app.storage_objects o ON o.id=sf.storage_object_id WHERE sf.submission_id=r.submission_id;
 RETURN jsonb_build_object('manifest',m,'hash',r.manifest_hash,'files',files);
END $$;
--> statement-breakpoint
-- Reuse the installed validation and command engine, changing only V2 requirements.
ALTER FUNCTION app.external_form(jsonb,uuid,boolean) RENAME TO external_form_legacy_r07;
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.external_form_legacy_r07(jsonb,uuid,boolean)'::regprocedure);
 d:=replace(d,'app.external_form_legacy_r07','app.external_form');
 d:=replace(d,'IF jsonb_typeof(body)', 'IF m->>''schema'' IS DISTINCT FROM ''FULL_FINAL_ARTIFACTS_V2'' THEN RETURN app.external_form_legacy_r07(body,packet,complete);END IF; IF jsonb_typeof(body)');
 d:=replace(d,$n$ OR jsonb_array_length(x->'locators')=0 OR lev IN (0,4) AND char_length(btrim(x->>'comment'))<20$n$,'');
 d:=replace(d,$n$ OR char_length(btrim(body->>'overall'))<50 OR body->'calibration'<>'true'::jsonb$n$,'');
 EXECUTE d;
END $$;
DO $$ DECLARE c record;BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='app.external_assessments'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%overall_comment%' LOOP EXECUTE format('ALTER TABLE app.external_assessments DROP CONSTRAINT %I',c.conname);END LOOP;
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='app.external_criterion_scores'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%comment%' LOOP EXECUTE format('ALTER TABLE app.external_criterion_scores DROP CONSTRAINT %I',c.conname);END LOOP;
END $$;
ALTER TABLE app.external_assessments ADD CHECK(char_length(btrim(overall_comment))<=2000);
ALTER TABLE app.external_criterion_scores ADD CHECK(char_length(btrim(comment))<=1000);
CREATE FUNCTION app.external_notes_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE policy text;BEGIN
 IF TG_TABLE_NAME='external_assessments' THEN SELECT p.manifest->>'schema' INTO policy FROM app.external_review_assignments t JOIN app.academic_review_packets p ON p.id=t.packet_id WHERE t.id=NEW.assignment_id;IF policy<>'FULL_FINAL_ARTIFACTS_V2' AND char_length(btrim(NEW.overall_comment))<50 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='LEGACY_COMMENT_REQUIRED';END IF;
 ELSE SELECT p.manifest->>'schema' INTO policy FROM app.external_assessments a JOIN app.external_review_assignments t ON t.id=a.assignment_id JOIN app.academic_review_packets p ON p.id=t.packet_id WHERE a.id=NEW.assessment_id;IF policy<>'FULL_FINAL_ARTIFACTS_V2' AND NEW.level IN (0,4) AND char_length(btrim(NEW.comment))<20 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='LEGACY_COMMENT_REQUIRED';END IF;END IF;RETURN NEW;
END $$;
CREATE TRIGGER external_notes_guard BEFORE INSERT ON app.external_assessments FOR EACH ROW EXECUTE FUNCTION app.external_notes_guard();
CREATE TRIGGER external_notes_guard BEFORE INSERT ON app.external_criterion_scores FOR EACH ROW EXECUTE FUNCTION app.external_notes_guard();
ALTER FUNCTION app.external_live(uuid,uuid,uuid,text) RENAME TO external_live_r07;
CREATE FUNCTION app.external_live(who uuid,sid uuid,aid uuid,required_status text DEFAULT NULL) RETURNS app.external_review_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t app.external_review_assignments;BEGIN t:=app.external_live_r07(who,sid,aid,required_status);
 IF required_status IS NOT NULL AND (EXISTS(SELECT 1 FROM app.evaluation_holds WHERE case_id=t.case_id AND state='open') OR coalesce((SELECT hold FROM app.evaluation_allocation_prerequisites WHERE case_id=t.case_id),false)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TASK_UNAVAILABLE';END IF;
 IF required_status='offered' THEN PERFORM app.external_candidate(who,t.packet_id,true);END IF;RETURN t;END $$;
--> statement-breakpoint
ALTER FUNCTION app.external_command(uuid,uuid,uuid,text,integer,jsonb,uuid,boolean) RENAME TO external_command_r07;
CREATE FUNCTION app.external_command(who uuid,sid uuid,aid uuid,operation text,expected integer,body jsonb,cid uuid,commit_value boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t app.external_review_assignments;BEGIN
 t:=app.external_live(who,sid,aid,NULL);
 IF NOT EXISTS(SELECT 1 FROM app.command_receipts WHERE actor_id=who AND command_id=cid) AND operation IN ('decline','withdraw','inability') AND app.governance_now()>=(CASE WHEN t.status='offered' THEN t.offer_expires_at ELSE t.due_at END) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='TASK_CLOSED';END IF;
 RETURN app.external_command_r07(who,sid,aid,operation,expected,body,cid,commit_value);
END $$;
REVOKE ALL ON FUNCTION app.external_command_r07(uuid,uuid,uuid,text,integer,jsonb,uuid,boolean) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.external_command(uuid,uuid,uuid,text,integer,jsonb,uuid,boolean) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.external_command(uuid,uuid,uuid,text,integer,jsonb,uuid,boolean) TO capstone_runtime;
-- Neutral before acceptance and byte-free personal history after terminal/expiry.
DO $$ DECLARE d text;BEGIN d:=pg_get_functiondef('app.external_view(uuid,uuid,uuid)'::regprocedure);d:=replace(d,'ORDER BY offered_at DESC,id LOOP','ORDER BY offered_at DESC,id LIMIT 100 LOOP');EXECUTE d;END $$;
ALTER FUNCTION app.external_view(uuid,uuid,uuid) RENAME TO external_view_r07;
CREATE FUNCTION app.external_view(who uuid,sid uuid,aid uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;x jsonb;items jsonb:='[]';allowed boolean;BEGIN
 result:=app.external_view_r07(who,sid,aid);
 FOR x IN SELECT value FROM jsonb_array_elements(CASE WHEN aid IS NULL THEN result->'items' ELSE jsonb_build_array(result) END) LOOP
  x:=x||jsonb_build_object('policy',(SELECT manifest->>'schema' FROM app.academic_review_packets WHERE id=(x->>'packet')::uuid),'languages',x->'manifest'->'languages','progress',CASE WHEN x->>'status'='accepted' THEN (SELECT count(*) FROM app.external_review_drafts d CROSS JOIN LATERAL jsonb_array_elements(d.body->'criteria') c WHERE d.assignment_id=(x->>'id')::uuid AND c->'level' IS DISTINCT FROM 'null'::jsonb) ELSE 0 END);
  allowed:=false;IF aid IS NOT NULL AND x->>'status'='accepted' THEN BEGIN PERFORM app.external_live(who,sid,aid,'accepted');allowed:=true;EXCEPTION WHEN SQLSTATE 'P0002' OR SQLSTATE '42501' OR SQLSTATE '40001' OR SQLSTATE '23514' THEN allowed:=false;END;END IF;
  IF x->>'status'='offered' THEN x:=x||jsonb_build_object('project',(x->'project')-ARRAY['abstract','version','versionNumber']);END IF;
  IF NOT allowed THEN x:=x-ARRAY['manifest','case','packet','context'];END IF;
  IF x->>'status' IN ('offered','accepted') AND app.governance_now()>=(CASE WHEN x->>'status'='offered' THEN (x->>'expiresAt')::timestamptz ELSE (x->>'dueAt')::timestamptz END) THEN x:=x||jsonb_build_object('status','expired','usable',false);END IF;
  items:=items||jsonb_build_array(x);
 END LOOP;
 RETURN CASE WHEN aid IS NULL THEN result||jsonb_build_object('items',items) ELSE items->0 END;
END $$;
CREATE FUNCTION app.external_check(who uuid,sid uuid,aid uuid,expected integer,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t app.external_review_assignments;q integer;BEGIN t:=app.external_live(who,sid,aid,'accepted');IF coalesce((SELECT revision FROM app.external_review_drafts WHERE assignment_id=aid),0)<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_DRAFT';END IF;q:=app.external_form(body,t.packet_id,true);RETURN jsonb_build_object('total',q::numeric/4,'quarterPoints',q,'revision',expected,'rubric','EXTERNAL_V1');END $$;
CREATE FUNCTION app.external_receipt(who uuid,sid uuid,aid uuid,cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t app.external_review_assignments;result jsonb;BEGIN t:=app.external_live(who,sid,aid,NULL);SELECT (r.result->>'scope')::jsonb INTO result FROM app.command_receipts r WHERE r.actor_id=who AND r.command_id=cid AND r.action LIKE 'external-review.%' AND (r.result->>'scope')::jsonb->>'assignment'=aid::text;RETURN result;END $$;
--> statement-breakpoint
-- Existing published R06 finals without any legacy packet/task may enter the same new contract.
DO $$ DECLARE r record;BEGIN FOR r IN SELECT d.submission_id FROM app.academic_decision_scope d JOIN app.evaluation_cases c ON c.submission_id=d.submission_id JOIN app.projects p ON p.id=c.project_id AND p.published_version_id=c.version_id WHERE d.outcome='publish' AND NOT EXISTS(SELECT 1 FROM app.academic_review_packets WHERE case_id=c.id) LOOP PERFORM app.full_final_register(r.submission_id);END LOOP;END $$;
REVOKE ALL ON FUNCTION app.full_final_manifest(uuid),app.full_final_register(uuid),app.full_final_publication(),app.external_packet_legacy_r07(uuid),app.external_form_legacy_r07(jsonb,uuid,boolean),app.external_form(jsonb,uuid,boolean),app.external_notes_guard(),app.external_live_r07(uuid,uuid,uuid,text),app.external_live(uuid,uuid,uuid,text),app.external_packet(uuid),app.external_view_r07(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.external_view(uuid,uuid,uuid),app.external_check(uuid,uuid,uuid,integer,jsonb),app.external_receipt(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.external_view(uuid,uuid,uuid),app.external_check(uuid,uuid,uuid,integer,jsonb),app.external_receipt(uuid,uuid,uuid,uuid) TO capstone_runtime;

--> statement-breakpoint
-- Recipient-only task links in the existing shared Inbox projection.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.academic_flow_inbox(uuid,uuid)'::regprocedure);
 d:=replace(d,$n$CASE WHEN p.id IS NULL THEN NULL WHEN$n$,$r$CASE WHEN n.type LIKE 'external-review.%' AND EXISTS(SELECT 1 FROM app.external_review_assignments t WHERE t.reviewer_id=who AND '/reviewer/tasks/'||t.id::text=n.payload->>'route') THEN n.payload->>'route' WHEN p.id IS NULL THEN NULL WHEN$r$);
 EXECUTE d;
END $$;

--> statement-breakpoint
-- New deterministic offers admit the explicit R06 full-final contract only.
-- Legacy accepted tasks still use their immutable original packet on every read.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.allocation_snapshot()'::regprocedure);
 d:=replace(d,'packet:=app.external_packet(c.current_packet_id);',$r$packet:=app.external_packet(c.current_packet_id);IF packet->'manifest'->>'schema' IS DISTINCT FROM 'FULL_FINAL_ARTIFACTS_V2' THEN packet:=NULL;END IF;$r$);
 EXECUTE d;
END $$;

--> statement-breakpoint
-- V2 scope integrity is checked by the exact frozen-manifest constructor.
-- Native delivery verifies the requested immutable original and rechecks current authority.
-- A list/ZIP checks each original once; assessment and allocation still verify the entire set.
-- Keep legacy all-packet byte verification unchanged.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.file_delivery_read_before_checkpoint(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure);
 IF position($n$jsonb_build_object('packetIntegrity',prepared->'files')$n$ IN d)=0 THEN RAISE EXCEPTION 'R07_NATIVE_GUARD_DEFINITION_MISMATCH';END IF;
 d:=replace(d,$n$jsonb_build_object('packetIntegrity',prepared->'files')$n$,$r$jsonb_build_object('packetIntegrity',CASE WHEN r.manifest->>'schema'='FULL_FINAL_ARTIFACTS_V2' THEN '[]'::jsonb ELSE prepared->'files' END)$r$);
 EXECUTE d;
END $$;
