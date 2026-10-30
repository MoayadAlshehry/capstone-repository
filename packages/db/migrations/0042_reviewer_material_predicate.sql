-- Correct JSON containment precedence; preserve applied0041 and all historical SQL hashes.
CREATE OR REPLACE FUNCTION app.reviewer_command(who uuid,sid uuid,cid uuid,target uuid,operation text,expected integer,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
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
 material:=p.qualification_statement IS DISTINCT FROM btrim(body->>'qualification') OR NOT(p.domain_codes @> (body->'domains') AND p.domain_codes <@ (body->'domains')) OR p.institution_id IS DISTINCT FROM t.university_id;
 IF p.qualification_statement IS DISTINCT FROM btrim(body->>'qualification') THEN change_fields:=array_append(change_fields,'qualification');END IF;
 IF NOT(p.domain_codes @> (body->'domains') AND p.domain_codes <@ (body->'domains')) THEN change_fields:=array_append(change_fields,'domains');END IF;
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
