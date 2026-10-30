-- Exact archived evidence definition only; no offers, assignments or delivery grants.
CREATE FUNCTION app.packet_canonical(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,app AS $$
DECLARE result text;
BEGIN
 IF jsonb_typeof(v)='object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||app.packet_canonical(value),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v);RETURN result;
 ELSIF jsonb_typeof(v)='array' THEN SELECT '['||coalesce(string_agg(app.packet_canonical(value),',' ORDER BY ordinal),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY e(value,ordinal);RETURN result;
 ELSE RETURN v::text;END IF;
END $$;
CREATE FUNCTION app.packet_hash(v jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,app AS $$ SELECT encode(sha256(convert_to(app.packet_canonical(v),'UTF8')),'hex') $$;
CREATE TABLE app.academic_review_packets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),university_id uuid NOT NULL,project_id uuid NOT NULL,version_id uuid NOT NULL,submission_id uuid NOT NULL,case_id uuid NOT NULL,
 manifest jsonb NOT NULL,manifest_hash text NOT NULL CHECK(manifest_hash=app.packet_hash(manifest)),authorized_by uuid NOT NULL,authorized_at timestamptz(3) NOT NULL,supersedes_packet_id uuid,
 UNIQUE(case_id,id),UNIQUE(supersedes_packet_id),
 FOREIGN KEY(university_id,project_id,version_id,submission_id,case_id) REFERENCES app.evaluation_cases(university_id,project_id,version_id,submission_id,id),
 FOREIGN KEY(university_id,authorized_by) REFERENCES app.users(university_id,id),FOREIGN KEY(case_id,supersedes_packet_id) REFERENCES app.academic_review_packets(case_id,id),
 CHECK(manifest->>'case'=case_id::text AND manifest->>'project'=project_id::text AND manifest->>'version'=version_id::text AND manifest->>'submission'=submission_id::text AND manifest->>'schema'='ACADEMIC_PACKET_V1')
);
CREATE TABLE app.academic_packet_revocations(packet_id uuid PRIMARY KEY REFERENCES app.academic_review_packets(id),revoked_by uuid NOT NULL REFERENCES app.users(id),revoked_at timestamptz(3) NOT NULL,reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 3 AND 400),audit_id uuid NOT NULL UNIQUE REFERENCES app.audit_logs(id));
CREATE TABLE app.academic_packet_workspaces(case_id uuid PRIMARY KEY REFERENCES app.evaluation_cases(id),revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),draft jsonb NOT NULL,draft_hash text NOT NULL CHECK(draft_hash ~ '^[0-9a-f]{64}$'),current_packet_id uuid,updated_by uuid NOT NULL REFERENCES app.users(id),updated_at timestamptz(3) NOT NULL,FOREIGN KEY(case_id,current_packet_id) REFERENCES app.academic_review_packets(case_id,id));
CREATE TRIGGER immutable_academic_packet BEFORE UPDATE OR DELETE ON app.academic_review_packets FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER immutable_academic_packet_revocation BEFORE UPDATE OR DELETE ON app.academic_packet_revocations FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE INDEX academic_packet_case_time ON app.academic_review_packets(case_id,authorized_at,id);
REVOKE ALL ON app.academic_review_packets,app.academic_packet_revocations,app.academic_packet_workspaces FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.packet_canonical(jsonb),app.packet_hash(jsonb) FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.packet_actor(who uuid,sid uuid,pid uuid,vid uuid,mutate boolean DEFAULT false,current_target boolean DEFAULT false) RETURNS app.projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;p app.projects;
BEGIN
 a:=app.partner_access_principal(who,sid);
 IF mutate THEN SELECT * INTO p FROM app.projects WHERE id=pid FOR UPDATE;ELSE SELECT * INTO p FROM app.projects WHERE id=pid;END IF;
 IF p.id IS NULL OR a.university_id IS DISTINCT FROM p.university_id OR NOT(p.supervisor_id=who AND a.role_code='faculty_supervisor' OR a.role_code='university_admin' OR a.role_code='student' AND EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=who)) OR NOT app.partner_archive_eligible(pid,vid) OR NOT EXISTS(SELECT 1 FROM app.evaluation_cases c JOIN app.project_versions v ON v.approved_submission_id=c.submission_id AND v.id=c.version_id WHERE c.project_id=pid AND c.version_id=vid) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 IF mutate THEN
 PERFORM 1 FROM app.users WHERE id=who AND account_status='active' AND role_code='student' FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=who AND is_team_lead) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAD_ONLY';END IF;
 a:=app.partner_access_principal(who,sid);
 END IF;
 IF current_target AND p.published_version_id IS DISTINCT FROM vid THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NOT_CURRENT_PUBLISHED';END IF;
 RETURN p;
END $$;
CREATE FUNCTION app.packet_manifest(case_value uuid,body jsonb,complete boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE c app.evaluation_cases;item jsonb;f uuid;reference_value text;area text;entries jsonb;locators jsonb;languages jsonb;
BEGIN
 SELECT * INTO c FROM app.evaluation_cases WHERE id=case_value;
 IF c.id IS NULL OR jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(body))<>5 OR EXISTS(SELECT 1 FROM jsonb_object_keys(body) k WHERE k NOT IN ('files','reports','locators','languages','attestation')) OR jsonb_typeof(body->'attestation') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_PACKET';END IF;
 FOREACH area IN ARRAY ARRAY['files','reports','languages','locators'] LOOP IF jsonb_typeof(body->area) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_PACKET';END IF;END LOOP;
 IF jsonb_array_length(body->'files')>10000 OR jsonb_array_length(body->'reports')>10000 OR jsonb_array_length(body->'locators')>80 OR jsonb_array_length(body->'languages')>2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(body->'files') x WHERE jsonb_typeof(x)<>'string') OR EXISTS(SELECT 1 FROM jsonb_array_elements(body->'reports') x WHERE jsonb_typeof(x)<>'string') OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(body->'languages') l WHERE l NOT IN ('en','ar')) OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(body->'files') x)<>jsonb_array_length(body->'files') OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(body->'reports') x)<>jsonb_array_length(body->'reports') OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(body->'languages') x)<>jsonb_array_length(body->'languages') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_PACKET';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(body->'reports') x WHERE NOT (body->'files') ? x) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='REPORT_FILE';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(body->'files') LOOP
 f:=(item#>>'{}')::uuid;
 IF item#>>'{}' IS DISTINCT FROM f::text THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NONCANONICAL_FILE_ID';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.submission_files m JOIN app.project_files pf ON pf.id=m.file_id AND pf.university_id=m.university_id AND pf.project_id=m.project_id AND pf.version_id=m.version_id AND pf.processing_status='ready' AND pf.is_current JOIN app.storage_objects o ON o.id=m.storage_object_id AND o.project_id=m.project_id AND o.university_id=m.university_id WHERE m.submission_id=c.submission_id AND m.file_id=f AND (pf.relative_path,pf.storage_object_id,pf.size_bytes,pf.sha256,pf.detected_mime)=(m.relative_path,m.storage_object_id,m.size_at_submit,m.sha256_at_submit,m.mime_at_submit) AND (o.size_bytes,o.sha256)=(m.size_at_submit,m.sha256_at_submit)) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='FILE_NOT_FOUND';END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(body->'locators') LOOP
 IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>4 OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN ('area','file','kind','reference')) OR coalesce(item->>'area','') NOT IN ('method','contribution','validation','impact') OR coalesce(item->>'kind','') NOT IN ('page','section','figure','test','lines') OR jsonb_typeof(item->'reference') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'file') IS DISTINCT FROM 'string' OR NOT (body->'files') ? (item->>'file') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LOCATOR';END IF;
 reference_value:=btrim(normalize(item->>'reference',NFC));
 IF char_length(reference_value) NOT BETWEEN 1 AND 200 OR reference_value ~ '[[:cntrl:]‪-‮⁦-⁩]' OR item->>'kind' IN ('page','lines') AND (reference_value !~ '^[1-9]\d*(-[1-9]\d*)?$' OR length(reference_value)>17) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LOCATOR';END IF;
 IF item->>'kind' IN ('page','lines') AND (split_part(reference_value,'-',1)::numeric>10000000 OR coalesce(nullif(split_part(reference_value,'-',2),''),split_part(reference_value,'-',1))::numeric NOT BETWEEN split_part(reference_value,'-',1)::numeric AND 10000000) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_RANGE';END IF;
 END LOOP;
 IF complete THEN
 IF jsonb_array_length(body->'files')=0 OR jsonb_array_length(body->'reports')=0 OR jsonb_array_length(body->'languages')=0 OR body->'attestation' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INCOMPLETE_PACKET';END IF;
 FOREACH area IN ARRAY ARRAY['method','contribution','validation','impact'] LOOP IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(body->'locators') l WHERE l->>'area'=area) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='MISSING_AREA';END IF;END LOOP;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.file_id,'path',m.relative_path,'sha256',m.sha256_at_submit,'size',m.size_at_submit,'mime',m.mime_at_submit,'report',(body->'reports') ? m.file_id::text) ORDER BY m.relative_path COLLATE "C",m.file_id),'[]') INTO entries FROM app.submission_files m WHERE m.submission_id=c.submission_id AND (body->'files') ? m.file_id::text;
 IF jsonb_array_length(entries)<>jsonb_array_length(body->'files') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='FILE_MEMBERSHIP';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('area',l->>'area','file',l->>'file','kind',l->>'kind','reference',btrim(normalize(l->>'reference',NFC))) ORDER BY l->>'area' COLLATE "C",l->>'file' COLLATE "C",l->>'kind' COLLATE "C",btrim(normalize(l->>'reference',NFC)) COLLATE "C"),'[]') INTO locators FROM jsonb_array_elements(body->'locators') l;
 SELECT coalesce(jsonb_agg(l ORDER BY l COLLATE "C"),'[]') INTO languages FROM jsonb_array_elements_text(body->'languages') l;
 RETURN jsonb_build_object('schema','ACADEMIC_PACKET_V1','case',c.id,'project',c.project_id,'version',c.version_id,'submission',c.submission_id,'entries',entries,'locators',locators,'languages',languages,'attestation',jsonb_build_object('version','SCORE_FREE_V1','acknowledged',(body->>'attestation')::boolean));
END $$;
CREATE FUNCTION app.packet_event(a app.users,c app.evaluation_cases,packet uuid,operation text,cid uuid,before_state text,after_state text,digest_value text,n integer,reason text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE ev uuid:=gen_random_uuid();BEGIN
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,project_id,version_id,action,object_type,object_id,before_state,after_state,reason,occurred_at,correlation_id,event_key) VALUES(ev,a.id,a.role_code,'user',c.university_id,c.project_id,c.version_id,'academic-packet.'||operation,'academic_packet',coalesce(packet,c.id),jsonb_build_object('scope',before_state),jsonb_build_object('scope',jsonb_build_object('state',after_state,'case',c.id,'hash',digest_value,'areas',CASE WHEN operation='save' THEN NULL ELSE 4 END)::text,'count',n),reason,clock_timestamp(),cid,gen_random_uuid());INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');RETURN ev;
END $$;
REVOKE ALL ON FUNCTION app.packet_actor(uuid,uuid,uuid,uuid,boolean,boolean),app.packet_manifest(uuid,jsonb,boolean),app.packet_event(app.users,app.evaluation_cases,uuid,text,uuid,text,text,text,integer,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.packet_view(who uuid,sid uuid,pid uuid,vid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;c app.evaluation_cases;w app.academic_packet_workspaces;body jsonb;manifest_value jsonb;packet_values jsonb;files jsonb;
BEGIN
 p:=app.packet_actor(who,sid,pid,vid);
 SELECT * INTO c FROM app.evaluation_cases WHERE project_id=pid AND version_id=vid AND submission_id=(SELECT approved_submission_id FROM app.project_versions WHERE id=vid);
 SELECT * INTO w FROM app.academic_packet_workspaces WHERE case_id=c.id;
 body:=coalesce(w.draft,'{"files":[],"reports":[],"locators":[],"languages":[],"attestation":false}'::jsonb);
 manifest_value:=app.packet_manifest(c.id,body,false);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.file_id,'path',m.relative_path,'sha256',m.sha256_at_submit,'size',m.size_at_submit,'mime',m.mime_at_submit) ORDER BY m.relative_path COLLATE "C",m.file_id),'[]') INTO files FROM app.submission_files m WHERE m.submission_id=c.submission_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'manifest',r.manifest,'hash',r.manifest_hash,'authorizedBy',r.authorized_by,'authorizedAt',r.authorized_at,'supersedes',r.supersedes_packet_id,'revokedAt',v.revoked_at,'revocationReason',v.reason) ORDER BY r.authorized_at,r.id),'[]') INTO packet_values FROM app.academic_review_packets r LEFT JOIN app.academic_packet_revocations v ON v.packet_id=r.id WHERE r.case_id=c.id;
 RETURN jsonb_build_object('project',pid,'version',vid,'case',c.id,'submission',c.submission_id,'versionNumber',(SELECT version_number FROM app.project_versions WHERE id=vid),'currentPublished',p.published_version_id=vid,'canEdit',p.published_version_id=vid AND EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=who AND is_team_lead),'assignmentRevision',p.row_version,'revision',coalesce(w.revision,0),'draft',body,'draftHash',app.packet_hash(manifest_value),'files',files,'packets',packet_values,'current',w.current_packet_id);
END $$;
CREATE FUNCTION app.packet_save(who uuid,sid uuid,pid uuid,vid uuid,case_value uuid,expected integer,body jsonb,cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;c app.evaluation_cases;w app.academic_packet_workspaces;manifest_value jsonb;r app.command_receipts;digest_value text;ev uuid;result jsonb;
BEGIN
 p:=app.packet_actor(who,sid,pid,vid,true,true);SELECT * INTO c FROM app.evaluation_cases WHERE id=case_value AND project_id=pid AND version_id=vid AND submission_id=(SELECT approved_submission_id FROM app.project_versions WHERE id=vid);IF c.id IS NULL OR cid IS NULL OR expected IS NULL OR expected<0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_CASE';END IF;
 manifest_value:=app.packet_manifest(c.id,body,false);digest_value:=app.packet_hash(jsonb_build_array(pid,vid,case_value,expected,body));
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=who AND command_id=cid;IF FOUND THEN IF r.action<>'academic-packet.save' OR r.payload_digest<>digest_value THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;RETURN r.result;END IF;
 SELECT * INTO w FROM app.academic_packet_workspaces WHERE case_id=c.id FOR UPDATE;IF coalesce(w.revision,0)<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
 INSERT INTO app.academic_packet_workspaces(case_id,revision,draft,draft_hash,updated_by,updated_at) VALUES(c.id,expected+1,body,app.packet_hash(manifest_value),who,clock_timestamp()) ON CONFLICT(case_id) DO UPDATE SET revision=expected+1,draft=body,draft_hash=app.packet_hash(manifest_value),updated_by=who,updated_at=clock_timestamp();
 ev:=app.packet_event(app.partner_access_principal(who,sid),c,w.current_packet_id,'save',cid,'draft','draft',app.packet_hash(manifest_value),jsonb_array_length(body->'files'));
 result:=jsonb_build_object('scope','draft','row_version',expected+1);INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,cid,'academic-packet.save',digest_value,ev,result);RETURN result;
END $$;
CREATE FUNCTION app.packet_prepare(who uuid,sid uuid,pid uuid,vid uuid,case_value uuid,expected integer,expected_hash text,supersedes uuid,cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;c app.evaluation_cases;w app.academic_packet_workspaces;manifest_value jsonb;r app.command_receipts;files jsonb;digest_value text;
BEGIN
 p:=app.packet_actor(who,sid,pid,vid,true,true);SELECT * INTO c FROM app.evaluation_cases WHERE id=case_value AND project_id=pid AND version_id=vid AND submission_id=(SELECT approved_submission_id FROM app.project_versions WHERE id=vid);IF c.id IS NULL OR expected IS NULL OR expected<0 OR expected_hash !~ '^[0-9a-f]{64}$' OR expected_hash IS NULL OR cid IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 digest_value:=app.packet_hash(jsonb_build_array(pid,vid,case_value,expected,expected_hash,supersedes));SELECT * INTO r FROM app.command_receipts WHERE actor_id=who AND command_id=cid;IF FOUND THEN IF r.action<>'academic-packet.authorize' OR r.payload_digest<>digest_value THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;RETURN jsonb_build_object('completed',r.result);END IF;
 SELECT * INTO w FROM app.academic_packet_workspaces WHERE case_id=c.id FOR UPDATE;
 IF w.case_id IS NULL OR w.revision<>expected OR w.current_packet_id IS DISTINCT FROM supersedes THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
 manifest_value:=app.packet_manifest(c.id,w.draft,true);
 IF app.packet_hash(manifest_value)<>expected_hash OR w.draft_hash<>expected_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_HASH';END IF;
 IF supersedes IS NOT NULL AND EXISTS(SELECT 1 FROM app.academic_review_packets ap WHERE ap.id=supersedes AND ap.manifest_hash=expected_hash AND NOT EXISTS(SELECT 1 FROM app.academic_packet_revocations WHERE packet_id=ap.id)) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NO_MATERIAL_CHANGE';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('key',o.storage_key,'size',o.size_bytes,'sha256',o.sha256) ORDER BY o.id),'[]') INTO files FROM app.submission_files m JOIN app.storage_objects o ON o.id=m.storage_object_id WHERE m.submission_id=c.submission_id AND (w.draft->'files') ? m.file_id::text;
 RETURN jsonb_build_object('manifest',manifest_value,'hash',expected_hash,'files',files);
END $$;
CREATE FUNCTION app.packet_commit(who uuid,sid uuid,pid uuid,vid uuid,case_value uuid,expected integer,expected_hash text,supersedes uuid,cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prepared jsonb;c app.evaluation_cases;packet uuid:=gen_random_uuid();ev uuid;result jsonb;digest_value text;
BEGIN
 prepared:=app.packet_prepare(who,sid,pid,vid,case_value,expected,expected_hash,supersedes,cid);IF prepared ? 'completed' THEN RETURN prepared->'completed';END IF;
 SELECT * INTO c FROM app.evaluation_cases WHERE id=case_value;
 INSERT INTO app.academic_review_packets(id,university_id,project_id,version_id,submission_id,case_id,manifest,manifest_hash,authorized_by,authorized_at,supersedes_packet_id) VALUES(packet,c.university_id,pid,vid,c.submission_id,c.id,prepared->'manifest',expected_hash,who,clock_timestamp(),supersedes);
 UPDATE app.academic_packet_workspaces SET current_packet_id=packet,revision=revision+1,updated_by=who,updated_at=clock_timestamp() WHERE case_id=c.id;
 ev:=app.packet_event(app.partner_access_principal(who,sid),c,packet,CASE WHEN supersedes IS NULL THEN 'authorize' ELSE 'supersede' END,cid,'draft','authorized',expected_hash,jsonb_array_length(prepared->'manifest'->'entries'));
 result:=jsonb_build_object('scope',packet::text,'row_version',expected+1);digest_value:=app.packet_hash(jsonb_build_array(pid,vid,case_value,expected,expected_hash,supersedes));INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,cid,'academic-packet.authorize',digest_value,ev,result);RETURN result;
END $$;
CREATE FUNCTION app.packet_revoke(who uuid,sid uuid,pid uuid,vid uuid,packet uuid,expected integer,cid uuid,reason_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;r app.academic_review_packets;w app.academic_packet_workspaces;c app.evaluation_cases;receipt app.command_receipts;digest_value text;ev uuid;result jsonb;
BEGIN
 p:=app.packet_actor(who,sid,pid,vid,true,false);
 IF cid IS NULL OR expected IS NULL OR expected<0 OR reason_value IS NULL OR char_length(btrim(reason_value)) NOT BETWEEN 3 AND 400 OR reason_value ~ '[[:cntrl:]‪-‮⁦-⁩]' OR NOT app.audit_values_safe(jsonb_build_object('scope',reason_value)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 digest_value:=app.packet_hash(jsonb_build_array(pid,vid,packet,expected,btrim(reason_value)));SELECT * INTO receipt FROM app.command_receipts WHERE actor_id=who AND command_id=cid;IF FOUND THEN IF receipt.action<>'academic-packet.revoke' OR receipt.payload_digest<>digest_value THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;RETURN receipt.result;END IF;
 SELECT * INTO r FROM app.academic_review_packets WHERE id=packet AND project_id=pid AND version_id=vid;IF r.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 SELECT * INTO w FROM app.academic_packet_workspaces WHERE case_id=r.case_id FOR UPDATE;IF w.revision<>expected OR w.current_packet_id IS DISTINCT FROM packet OR EXISTS(SELECT 1 FROM app.academic_packet_revocations WHERE packet_id=packet) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
 SELECT * INTO c FROM app.evaluation_cases WHERE id=r.case_id;ev:=app.packet_event(app.partner_access_principal(who,sid),c,packet,'revoke',cid,'authorized','revoked',r.manifest_hash,jsonb_array_length(r.manifest->'entries'),btrim(reason_value));
 INSERT INTO app.academic_packet_revocations(packet_id,revoked_by,revoked_at,reason,audit_id) VALUES(packet,who,clock_timestamp(),btrim(reason_value),ev);UPDATE app.academic_packet_workspaces SET revision=revision+1,updated_by=who,updated_at=clock_timestamp() WHERE case_id=c.id;
 result:=jsonb_build_object('scope','revoked','row_version',expected+1);INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,cid,'academic-packet.revoke',digest_value,ev,result);RETURN result;
END $$;
CREATE FUNCTION app.packet_readability(who uuid,sid uuid,pid uuid,vid uuid,packet uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;r app.academic_review_packets;w app.academic_packet_workspaces;body jsonb;manifest_value jsonb;files jsonb;
BEGIN
 p:=app.packet_actor(who,sid,pid,vid);SELECT * INTO r FROM app.academic_review_packets WHERE id=packet AND project_id=pid AND version_id=vid;IF r.id IS NULL THEN RETURN jsonb_build_object('state','not-authorized');END IF;
 SELECT * INTO w FROM app.academic_packet_workspaces WHERE case_id=r.case_id;
 IF p.published_version_id IS DISTINCT FROM vid OR w.current_packet_id IS DISTINCT FROM packet THEN RETURN jsonb_build_object('state','invalid-case');END IF;
 IF EXISTS(SELECT 1 FROM app.academic_packet_revocations WHERE packet_id=packet) THEN RETURN jsonb_build_object('state','revoked');END IF;
 body:=jsonb_build_object('files',(SELECT jsonb_agg(e->'id') FROM jsonb_array_elements(r.manifest->'entries') e),'reports',(SELECT coalesce(jsonb_agg(e->'id'),'[]') FROM jsonb_array_elements(r.manifest->'entries') e WHERE e->'report'='true'::jsonb),'locators',r.manifest->'locators','languages',r.manifest->'languages','attestation',r.manifest->'attestation'->'acknowledged');
 BEGIN manifest_value:=app.packet_manifest(r.case_id,body,true);EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('state','evidence-unavailable');END;
 IF manifest_value IS DISTINCT FROM r.manifest OR app.packet_hash(manifest_value)<>r.manifest_hash THEN RETURN jsonb_build_object('state','invalid-manifest');END IF;
 SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',o.size_bytes,'sha256',o.sha256) ORDER BY o.id) INTO files FROM app.submission_files m JOIN app.storage_objects o ON o.id=m.storage_object_id WHERE m.submission_id=r.submission_id AND (body->'files') ? m.file_id::text;
 RETURN jsonb_build_object('state','ready','files',files);
END $$;
REVOKE ALL ON FUNCTION app.packet_view(uuid,uuid,uuid,uuid),app.packet_save(uuid,uuid,uuid,uuid,uuid,integer,jsonb,uuid),app.packet_prepare(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,uuid),app.packet_commit(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,uuid),app.packet_revoke(uuid,uuid,uuid,uuid,uuid,integer,uuid,text),app.packet_readability(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.packet_view(uuid,uuid,uuid,uuid),app.packet_save(uuid,uuid,uuid,uuid,uuid,integer,jsonb,uuid),app.packet_prepare(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,uuid),app.packet_commit(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,uuid),app.packet_revoke(uuid,uuid,uuid,uuid,uuid,integer,uuid,text),app.packet_readability(uuid,uuid,uuid,uuid,uuid) TO capstone_runtime;
