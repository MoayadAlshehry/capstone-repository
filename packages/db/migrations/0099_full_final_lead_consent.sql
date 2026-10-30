-- Explicit current-lead consent for new full-final academic review scopes.
-- Immutable historical packets, scores and accepted assignments are retained.
CREATE TABLE app.full_final_packet_consents (
 packet_id uuid PRIMARY KEY REFERENCES app.academic_review_packets(id),
 authorized_by uuid NOT NULL REFERENCES app.users(id),
 authorized_at timestamptz(3) NOT NULL,
 attestation text NOT NULL CHECK(attestation='SCORE_FREE_V1')
);
CREATE TRIGGER immutable_full_final_consent BEFORE UPDATE OR DELETE ON app.full_final_packet_consents FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE ALL ON app.full_final_packet_consents FROM PUBLIC,capstone_runtime,capstone_jobs;

-- Publication still belongs to the assigned supervisor. It grants no new
-- independent-review packet authority on behalf of a student.
CREATE OR REPLACE FUNCTION app.full_final_register(sub uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN RETURN; END $$;

CREATE FUNCTION app.full_final_packet_state(who uuid,sid uuid,pid uuid,vid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;c app.evaluation_cases;w app.academic_packet_workspaces;m jsonb;consented boolean;
BEGIN
 p:=app.packet_actor(who,sid,pid,vid);
 SELECT * INTO c FROM app.evaluation_cases WHERE project_id=pid AND version_id=vid AND submission_id=(SELECT approved_submission_id FROM app.project_versions WHERE id=vid);
 IF NOT EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=c.submission_id) THEN RETURN NULL;END IF;
 m:=app.full_final_manifest(c.id);
 SELECT * INTO w FROM app.academic_packet_workspaces WHERE case_id=c.id;
 consented:=EXISTS(SELECT 1 FROM app.full_final_packet_consents f JOIN app.academic_review_packets r ON r.id=f.packet_id WHERE f.packet_id=w.current_packet_id AND r.manifest_hash=app.packet_hash(m) AND NOT EXISTS(SELECT 1 FROM app.academic_packet_revocations v WHERE v.packet_id=r.id));
 RETURN jsonb_build_object('schema','FULL_FINAL_ARTIFACTS_V2','project',pid,'version',vid,'submission',c.submission_id,'case',c.id,'revision',coalesce(w.revision,0),'manifestHash',app.packet_hash(m),'files',m->'entries','languages',m->'languages','current',w.current_packet_id,'authorized',consented,'canAuthorize',p.published_version_id=vid AND EXISTS(SELECT 1 FROM app.project_authors a JOIN app.users u ON u.id=a.user_id WHERE a.project_id=pid AND a.user_id=who AND a.is_team_lead AND u.role_code='student' AND u.account_status='active'));
END $$;

CREATE FUNCTION app.full_final_packet_authorize(who uuid,sid uuid,pid uuid,vid uuid,expected integer,expected_hash text,ack boolean,cid uuid,commit_value boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;c app.evaluation_cases;w app.academic_packet_workspaces;m jsonb;f jsonb;packet uuid:=gen_random_uuid();a app.users;r app.command_receipts;digest text;ev uuid;result jsonb;
BEGIN
 p:=app.packet_actor(who,sid,pid,vid,true,true);
 IF ack IS DISTINCT FROM true OR expected IS NULL OR expected<0 OR cid IS NULL OR expected_hash IS NULL OR expected_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='CONSENT_REQUIRED';END IF;
 digest:=app.packet_hash(jsonb_build_array(pid,vid,expected,expected_hash,ack));
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=who AND command_id=cid;
 IF FOUND THEN IF r.action<>'academic-packet.authorize-final' OR r.payload_digest<>digest THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;RETURN jsonb_build_object('completed',r.result);END IF;
 SELECT * INTO c FROM app.evaluation_cases WHERE project_id=pid AND version_id=vid AND submission_id=(SELECT approved_submission_id FROM app.project_versions WHERE id=vid) FOR UPDATE;
 m:=app.full_final_manifest(c.id);
 SELECT * INTO w FROM app.academic_packet_workspaces WHERE case_id=c.id FOR UPDATE;
 IF coalesce(w.revision,0)<>expected OR app.packet_hash(m)<>expected_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
 IF EXISTS(SELECT 1 FROM app.full_final_packet_consents WHERE packet_id=w.current_packet_id) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='ALREADY_AUTHORIZED';END IF;
 -- Existing offered, accepted or completed scopes are never silently replaced.
 IF EXISTS(SELECT 1 FROM app.external_review_assignments WHERE case_id=c.id AND status IN ('offered','accepted','completed')) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='EXISTING_REVIEW_SCOPE';END IF;
 SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',o.size_bytes,'sha256',o.sha256) ORDER BY sf.relative_path COLLATE "C",sf.file_id) INTO f FROM app.submission_files sf JOIN app.storage_objects o ON o.id=sf.storage_object_id WHERE sf.submission_id=c.submission_id;
 IF NOT commit_value THEN RETURN jsonb_build_object('files',f,'manifest',m);END IF;
 a:=app.partner_access_principal(who,sid);
 INSERT INTO app.academic_review_packets(id,university_id,project_id,version_id,submission_id,case_id,manifest,manifest_hash,authorized_by,authorized_at,supersedes_packet_id) VALUES(packet,c.university_id,pid,vid,c.submission_id,c.id,m,expected_hash,who,app.governance_now(),w.current_packet_id);
 INSERT INTO app.full_final_packet_consents VALUES(packet,who,app.governance_now(),'SCORE_FREE_V1');
 INSERT INTO app.academic_packet_workspaces(case_id,revision,draft,draft_hash,current_packet_id,updated_by,updated_at) VALUES(c.id,expected+1,m,expected_hash,packet,who,app.governance_now()) ON CONFLICT(case_id) DO UPDATE SET revision=expected+1,draft=m,draft_hash=expected_hash,current_packet_id=packet,updated_by=who,updated_at=app.governance_now();
 ev:=app.packet_event(a,c,packet,'authorize-final',cid,'awaiting-lead','authorized',expected_hash,jsonb_array_length(m->'entries'));
 result:=jsonb_build_object('scope',packet,'row_version',expected+1);
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,cid,'academic-packet.authorize-final',digest,ev,result);
 RETURN jsonb_build_object('completed',result);
END $$;
REVOKE ALL ON FUNCTION app.full_final_packet_state(uuid,uuid,uuid,uuid),app.full_final_packet_authorize(uuid,uuid,uuid,uuid,integer,text,boolean,uuid,boolean) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.full_final_packet_state(uuid,uuid,uuid,uuid),app.full_final_packet_authorize(uuid,uuid,uuid,uuid,integer,text,boolean,uuid,boolean) TO capstone_runtime;

-- Preserve legacy curated packets and historical accepted reads; new V2 offers
-- and acceptance admission require an actual immutable lead-consent record.
ALTER FUNCTION app.external_candidate(uuid,uuid,boolean) RENAME TO external_candidate_before_lead_consent;
CREATE FUNCTION app.external_candidate(reviewer uuid,packet uuid,new_offer boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.academic_review_packets WHERE id=packet AND manifest->>'schema'='FULL_FINAL_ARTIFACTS_V2') AND NOT EXISTS(SELECT 1 FROM app.full_final_packet_consents WHERE packet_id=packet) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAD_CONSENT_REQUIRED';END IF;
 RETURN app.external_candidate_before_lead_consent(reviewer,packet,new_offer);
END $$;
REVOKE ALL ON FUNCTION app.external_candidate_before_lead_consent(uuid,uuid,boolean) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.external_candidate(uuid,uuid,boolean) FROM PUBLIC,capstone_runtime;
-- Existing engine calls are SECURITY DEFINER; no new direct caller grant.

ALTER FUNCTION app.allocation_snapshot() RENAME TO allocation_snapshot_before_lead_consent;
CREATE FUNCTION app.allocation_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE value jsonb;item jsonb;items jsonb:='[]';
BEGIN
 value:=app.allocation_snapshot_before_lead_consent();
 FOR item IN SELECT x FROM jsonb_array_elements(value->'cases') x LOOP
  IF EXISTS(SELECT 1 FROM app.academic_review_packets p WHERE p.id=(item->>'packet')::uuid AND p.manifest->>'schema'='FULL_FINAL_ARTIFACTS_V2' AND NOT EXISTS(SELECT 1 FROM app.full_final_packet_consents f WHERE f.packet_id=p.id)) THEN item:=item||jsonb_build_object('packetReadable',false);END IF;
  items:=items||jsonb_build_array(item);
 END LOOP;
 RETURN value||jsonb_build_object('cases',items);
END $$;
REVOKE ALL ON FUNCTION app.allocation_snapshot_before_lead_consent() FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.allocation_snapshot() FROM PUBLIC,capstone_runtime;
GRANT EXECUTE ON FUNCTION app.allocation_snapshot() TO capstone_jobs;
