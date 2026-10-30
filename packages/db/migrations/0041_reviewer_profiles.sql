-- Private faculty capability; no assignment or file-access grants.
CREATE FUNCTION app.reviewer_fields_valid(body jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE k text;v text;
BEGIN
 IF jsonb_typeof(body)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(body))<>5 OR EXISTS(SELECT 1 FROM jsonb_object_keys(body) x WHERE x NOT IN ('qualification','domains','tags','languages','available')) OR jsonb_typeof(body->'qualification')<>'string' OR jsonb_typeof(body->'available')<>'boolean' OR char_length(btrim(body->>'qualification')) NOT BETWEEN 50 AND 2000 OR body->>'qualification' ~ '[[:cntrl:]‪-‮⁦-⁩]' THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['domains','tags','languages'] LOOP
 IF jsonb_typeof(body->k)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(body->k) e WHERE jsonb_typeof(e)<>'string') THEN RETURN false;END IF;
 END LOOP;
 IF jsonb_array_length(body->'domains') NOT BETWEEN 1 AND 3 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(body->'domains') d WHERE d NOT IN ('software','data','hardware')) OR (SELECT count(DISTINCT d) FROM jsonb_array_elements_text(body->'domains') d)<>jsonb_array_length(body->'domains') THEN RETURN false;END IF;
 IF jsonb_array_length(body->'languages') NOT BETWEEN 1 AND 2 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(body->'languages') d WHERE d NOT IN ('en','ar')) OR (SELECT count(DISTINCT d) FROM jsonb_array_elements_text(body->'languages') d)<>jsonb_array_length(body->'languages') THEN RETURN false;END IF;
 IF jsonb_array_length(body->'tags')>20 THEN RETURN false;END IF;
 FOR v IN SELECT jsonb_array_elements_text(body->'tags') LOOP IF char_length(btrim(v)) NOT BETWEEN 2 AND 50 OR v ~ '[[:cntrl:]‪-‮⁦-⁩]' THEN RETURN false;END IF;END LOOP;
 IF (SELECT count(DISTINCT lower(normalize(btrim(t),NFC))) FROM jsonb_array_elements_text(body->'tags') t)<>jsonb_array_length(body->'tags') THEN RETURN false;END IF;
 RETURN true;
END $$;
CREATE TABLE app.reviewer_profiles (
 user_id uuid PRIMARY KEY REFERENCES app.users(id), institution_id uuid NOT NULL REFERENCES app.universities(id),
 qualification_statement text NOT NULL,domain_codes jsonb NOT NULL,expertise_tags jsonb NOT NULL,reading_languages jsonb NOT NULL,availability boolean NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','suspended')),revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 approved_by uuid REFERENCES app.users(id),approved_at timestamptz(3),reason text,
 calibration_version text CHECK(calibration_version='EXTERNAL_V1'),calibration_at timestamptz(3),updated_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
 CHECK((approved_by IS NULL)=(approved_at IS NULL)),CHECK((calibration_version IS NULL)=(calibration_at IS NULL)),
 CHECK(status<>'approved' OR approved_by IS NOT NULL),CHECK(reason IS NULL OR char_length(btrim(reason)) BETWEEN 3 AND 400),
 CHECK(app.reviewer_fields_valid(jsonb_build_object('qualification',qualification_statement,'domains',domain_codes,'tags',expertise_tags,'languages',reading_languages,'available',availability)))
);
CREATE FUNCTION app.reviewer_affiliation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.users WHERE id=NEW.user_id AND role_code='faculty_supervisor' AND university_id=NEW.institution_id) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='FACULTY_INSTITUTION_REQUIRED';END IF;RETURN NEW;END $$;
CREATE TRIGGER reviewer_faculty_affiliation BEFORE INSERT OR UPDATE ON app.reviewer_profiles FOR EACH ROW EXECUTE FUNCTION app.reviewer_affiliation_guard();
CREATE TABLE app.reviewer_profile_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app.reviewer_profiles(user_id),revision integer NOT NULL,old_status text,new_status text NOT NULL,action text NOT NULL,reason text NOT NULL,occurred_at timestamptz(3) NOT NULL,audit_id uuid NOT NULL UNIQUE REFERENCES app.audit_logs(id),UNIQUE(user_id,revision));
CREATE TRIGGER immutable_reviewer_history BEFORE UPDATE OR DELETE ON app.reviewer_profile_history FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE INDEX reviewer_queue_status ON app.reviewer_profiles(status,updated_at,user_id);
REVOKE ALL ON app.reviewer_profiles,app.reviewer_profile_history FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.reviewer_fields_valid(jsonb),app.reviewer_affiliation_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.reviewer_view(who uuid,sid uuid,filter_status text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;result jsonb;
BEGIN
 a:=app.partner_access_principal(who,sid);
 IF a.role_code NOT IN ('faculty_supervisor','platform_admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 IF filter_status IS NOT NULL AND filter_status NOT IN ('pending','approved','suspended') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'institution',u.university_id,'institutionEn',i.name_en,'institutionAr',i.name_ar,'qualification',p.qualification_statement,'domains',p.domain_codes,'tags',p.expertise_tags,'languages',p.reading_languages,'available',p.availability,'status',CASE WHEN u.role_code<>'faculty_supervisor' OR p.institution_id IS DISTINCT FROM u.university_id THEN 'pending' ELSE p.status END,'revision',p.revision,'reason',p.reason,'approvedBy',p.approved_by,'approvedAt',p.approved_at,'calibrationAt',p.calibration_at,'calibrationVersion',p.calibration_version,'history',coalesce((SELECT jsonb_agg(jsonb_build_object('revision',h.revision,'from',h.old_status,'to',h.new_status,'action',h.action,'reason',h.reason,'at',h.occurred_at) ORDER BY h.revision) FROM app.reviewer_profile_history h WHERE h.user_id=u.id),'[]')) ORDER BY p.updated_at,u.id),'[]') INTO result FROM (SELECT * FROM app.reviewer_profiles WHERE (a.role_code='platform_admin' OR user_id=who) AND (filter_status IS NULL OR status=filter_status) ORDER BY updated_at,user_id LIMIT 100) p JOIN app.users u ON u.id=p.user_id JOIN app.universities i ON i.id=u.university_id;
 RETURN jsonb_build_object('role',a.role_code,'name',a.full_name,'institution',a.university_id,'institutionEn',(SELECT name_en FROM app.universities WHERE id=a.university_id),'institutionAr',(SELECT name_ar FROM app.universities WHERE id=a.university_id),'profiles',result);
END $$;
CREATE FUNCTION app.reviewer_capability(who uuid,sid uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;
BEGIN
 PERFORM 1 FROM app.users WHERE id=who FOR SHARE;a:=app.partner_access_principal(who,sid);
 PERFORM 1 FROM app.reviewer_profiles WHERE user_id=who FOR SHARE;
 RETURN a.role_code='faculty_supervisor' AND EXISTS(SELECT 1 FROM app.reviewer_profiles p WHERE p.user_id=who AND p.institution_id=a.university_id AND p.status='approved');
END $$;
CREATE FUNCTION app.reviewer_command(who uuid,sid uuid,cid uuid,target uuid,operation text,expected integer,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;t app.users;p app.reviewer_profiles;receipt app.command_receipts;digest_value text;ev uuid:=gen_random_uuid();clock timestamptz(3);old_status text;next_status text;why text;material boolean:=false;result jsonb;change_fields text[]:=ARRAY[]::text[];
BEGIN
 IF cid IS NULL OR target IS NULL OR expected<0 OR expected IS NULL OR operation NOT IN ('save','approve','suspend','calibrate') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 PERFORM 1 FROM app.users WHERE id IN (who,target) ORDER BY id FOR UPDATE;
 a:=app.partner_access_principal(who,sid);SELECT * INTO t FROM app.users WHERE id=target;
 IF operation IN ('save','calibrate') THEN IF a.role_code<>'faculty_supervisor' OR who<>target THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 ELSE IF a.role_code<>'platform_admin' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;END IF;
 IF t.role_code<>'faculty_supervisor' OR t.account_status<>'active' OR t.university_id IS NULL OR NOT EXISTS(SELECT 1 FROM app.universities WHERE id=t.university_id AND status='active') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 IF operation='save' THEN IF NOT app.reviewer_fields_valid(body) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 ELSIF operation='calibrate' THEN IF body IS DISTINCT FROM '{"version":"EXTERNAL_V1","acknowledged":true}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 ELSE IF jsonb_typeof(body)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(body))<>1 OR jsonb_typeof(body->'reason')<>'string' OR char_length(btrim(body->>'reason')) NOT BETWEEN 3 AND 400 OR body->>'reason' ~ '[[:cntrl:]‪-‮⁦-⁩]' OR NOT app.audit_values_safe(jsonb_build_object('scope',body->>'reason')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;END IF;
 digest_value:=encode(sha256(convert_to(jsonb_build_array(target,operation,expected,body)::text,'UTF8')),'hex');
 SELECT * INTO receipt FROM app.command_receipts WHERE actor_id=who AND command_id=cid;
 IF FOUND THEN IF receipt.action<>'reviewer.'||operation OR receipt.payload_digest<>digest_value THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;RETURN receipt.result;END IF;
 SELECT * INTO p FROM app.reviewer_profiles WHERE user_id=target FOR UPDATE;
 clock:=clock_timestamp();old_status:=p.status;
 IF p.user_id IS NULL THEN
 IF operation<>'save' OR expected<>0 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;
 INSERT INTO app.reviewer_profiles(user_id,institution_id,qualification_statement,domain_codes,expertise_tags,reading_languages,availability) VALUES(target,t.university_id,btrim(body->>'qualification'),body->'domains',body->'tags',body->'languages',(body->>'available')::boolean) RETURNING * INTO p;
 next_status:='pending';why:='Faculty requested reviewer capability';
 ELSE
 IF p.revision<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;
 next_status:=p.status;
 IF operation='save' THEN
 material:=p.qualification_statement IS DISTINCT FROM btrim(body->>'qualification') OR NOT(p.domain_codes @> body->'domains' AND p.domain_codes <@ body->'domains') OR p.institution_id IS DISTINCT FROM t.university_id;
 IF p.qualification_statement IS DISTINCT FROM btrim(body->>'qualification') THEN change_fields:=array_append(change_fields,'qualification');END IF;
 IF NOT(p.domain_codes @> body->'domains' AND p.domain_codes <@ body->'domains') THEN change_fields:=array_append(change_fields,'domains');END IF;
 IF material AND p.status='approved' THEN next_status:='pending';END IF;
 -- A suspended faculty declaration never self-reactivates.
 why:=CASE WHEN material THEN 'Material declaration changed: '||array_to_string(change_fields,',') ELSE 'Reviewer declaration or availability changed' END;
 UPDATE app.reviewer_profiles SET institution_id=t.university_id,qualification_statement=btrim(body->>'qualification'),domain_codes=body->'domains',expertise_tags=body->'tags',reading_languages=body->'languages',availability=(body->>'available')::boolean WHERE user_id=target;
 ELSIF operation='calibrate' THEN why:='EXTERNAL_V1 calibration explicitly acknowledged';UPDATE app.reviewer_profiles SET calibration_version='EXTERNAL_V1',calibration_at=clock WHERE user_id=target;
 ELSIF operation='approve' THEN
 IF p.status NOT IN ('pending','suspended') OR p.institution_id IS DISTINCT FROM t.university_id THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;
 next_status:='approved';why:=btrim(body->>'reason');UPDATE app.reviewer_profiles SET approved_by=who,approved_at=clock WHERE user_id=target;
 ELSE
 IF p.status<>'approved' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;next_status:='suspended';why:=btrim(body->>'reason');
 END IF;
 END IF;
 UPDATE app.reviewer_profiles SET status=next_status,revision=p.revision+1,reason=CASE WHEN operation IN ('approve','suspend') THEN why ELSE reason END,updated_at=clock WHERE user_id=target;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,action,object_type,object_id,before_state,after_state,reason,occurred_at,correlation_id,event_key) VALUES(ev,who,a.role_code,'user',t.university_id,'reviewer.'||operation,'reviewer_profile',target,jsonb_build_object('scope',coalesce(old_status,''),'row_version',p.revision),jsonb_build_object('scope',next_status,'row_version',p.revision+1),why,clock,cid,gen_random_uuid());
 INSERT INTO app.reviewer_profile_history(user_id,revision,old_status,new_status,action,reason,occurred_at,audit_id) VALUES(target,p.revision+1,old_status,next_status,CASE WHEN operation='approve' AND old_status='suspended' THEN 'reapprove' WHEN operation='save' AND material AND old_status='approved' THEN 'reapproval-required' ELSE operation END,why,clock,ev);
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');
 result:=jsonb_build_object('scope',next_status,'row_version',p.revision+1);INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,cid,'reviewer.'||operation,digest_value,ev,result);RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.reviewer_view(uuid,uuid,text),app.reviewer_capability(uuid,uuid),app.reviewer_command(uuid,uuid,uuid,uuid,text,integer,jsonb) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.reviewer_view(uuid,uuid,text),app.reviewer_capability(uuid,uuid),app.reviewer_command(uuid,uuid,uuid,uuid,text,integer,jsonb) TO capstone_runtime;
