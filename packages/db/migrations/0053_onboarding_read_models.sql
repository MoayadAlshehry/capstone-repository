-- Forward refinement: strict required fields at the direct SQL port; no authority
-- or allocation/scoring changes. Never amend the already applied 0052 bytes.
ALTER FUNCTION app.onboarding_prepare(uuid,uuid,uuid,text,jsonb) RENAME TO onboarding_prepare_r03_base;
REVOKE ALL ON FUNCTION app.onboarding_prepare_r03_base(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.onboarding_prepare(actor uuid,sid uuid,cid uuid,op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE required text[];k text;result jsonb;event uuid;u app.users;
BEGIN
 required:=CASE op WHEN 'university.create' THEN ARRAY['code','name_en','name_ar'] WHEN 'administrator.invite' THEN ARRAY['university','name','email','locale'] WHEN 'person.invite' THEN ARRAY['name','email','role','department','locale'] WHEN 'university.status' THEN ARRAY['id','status','revision','reason'] WHEN 'person.status' THEN ARRAY['id','status','revision','reason'] ELSE NULL END;
 IF required IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(payload))<>array_length(required,1) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 FOREACH k IN ARRAY required LOOP IF jsonb_typeof(payload->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;END LOOP;
 result:=app.onboarding_prepare_r03_base(actor,sid,cid,op,payload);
 IF op IN ('administrator.invite','person.invite') AND result->>'reused'='true' THEN
  SELECT * INTO u FROM app.users WHERE id=(result->>'id')::uuid AND account_status='active';
  SELECT id INTO event FROM app.audit_logs WHERE actor_id=actor AND correlation_id=cid AND action='admin.'||op LIMIT 1;
  IF u.id IS NOT NULL AND event IS NOT NULL THEN INSERT INTO app.notifications(event_id,recipient_id,university_id,type,payload) VALUES(event,u.id,u.university_id,'admin.changed','{"route":"/account","message_key":"admin.changed"}') ON CONFLICT(event_id,recipient_id,type) DO NOTHING;END IF;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.onboarding_prepare(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.onboarding_prepare(uuid,uuid,uuid,text,jsonb) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.onboarding_approvals(actor uuid,sid uuid,kind text,target uuid,q text,filter_status text,page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;rows jsonb;record jsonb;total integer;pending integer;
BEGIN
 a:=app.onboarding_actor(actor,sid);IF a.role_code<>'platform_admin' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 IF kind NOT IN ('partners','reviewers') OR q IS NULL OR char_length(q)>200 OR page IS NULL OR page NOT BETWEEN 1 AND 10000 OR filter_status NOT IN ('','pending','approved','rejected','suspended') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 IF kind='partners' THEN
  IF target IS NOT NULL THEN
   SELECT jsonb_build_object('id',u.id,'name',u.full_name,'email',u.email,'organization',u.organization_name,'accountStatus',u.account_status,'status',u.partner_status,'revision',u.partner_revision,'reason',u.partner_reason,'history',coalesce((SELECT jsonb_agg(jsonb_build_object('revision',revision,'from',old_status,'to',new_status,'reason',reason,'at',occurred_at) ORDER BY revision) FROM app.partner_history WHERE partner_id=u.id),'[]'::jsonb)) INTO record FROM app.users u WHERE id=target AND role_code='partner';RETURN record;
  END IF;
  SELECT count(*) FILTER (WHERE (filter_status='' OR partner_status=filter_status) AND (q='' OR strpos(lower(full_name||' '||coalesce(organization_name,'')||' '||email),lower(q))>0)),count(*) FILTER (WHERE partner_status='pending') INTO total,pending FROM app.users WHERE role_code='partner';
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO rows FROM (SELECT id,full_name AS name,email,organization_name AS context,partner_status AS status FROM app.users WHERE role_code='partner' AND (filter_status='' OR partner_status=filter_status) AND (q='' OR strpos(lower(full_name||' '||coalesce(organization_name,'')||' '||email),lower(q))>0) ORDER BY CASE partner_status WHEN 'pending' THEN 0 ELSE 1 END,created_at,id LIMIT 20 OFFSET (page-1)*20) x;
 ELSE
  IF target IS NOT NULL THEN
   SELECT jsonb_build_object('id',u.id,'name',u.full_name,'institution',u.university_id,'institutionEn',i.name_en,'institutionAr',i.name_ar,'qualification',p.qualification_statement,'domains',p.domain_codes,'tags',p.expertise_tags,'languages',p.reading_languages,'available',p.availability,'status',CASE WHEN u.role_code<>'faculty_supervisor' OR p.institution_id IS DISTINCT FROM u.university_id THEN 'pending' ELSE p.status END,'revision',p.revision,'reason',p.reason,'history',coalesce((SELECT jsonb_agg(jsonb_build_object('revision',h.revision,'from',h.old_status,'to',h.new_status,'action',h.action,'reason',h.reason,'at',h.occurred_at) ORDER BY h.revision) FROM app.reviewer_profile_history h WHERE h.user_id=u.id),'[]'::jsonb)) INTO record FROM app.reviewer_profiles p JOIN app.users u ON u.id=p.user_id JOIN app.universities i ON i.id=u.university_id WHERE p.user_id=target;RETURN record;
  END IF;
  SELECT count(*) FILTER (WHERE (filter_status='' OR p.status=filter_status) AND (q='' OR strpos(lower(u.full_name||' '||i.name_en||' '||i.name_ar),lower(q))>0)),count(*) FILTER (WHERE p.status='pending') INTO total,pending FROM app.reviewer_profiles p JOIN app.users u ON u.id=p.user_id JOIN app.universities i ON i.id=u.university_id;
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO rows FROM (SELECT u.id,u.full_name AS name,i.name_en AS context,i.name_ar AS "contextAr",CASE WHEN u.role_code<>'faculty_supervisor' OR p.institution_id IS DISTINCT FROM u.university_id THEN 'pending' ELSE p.status END AS status FROM app.reviewer_profiles p JOIN app.users u ON u.id=p.user_id JOIN app.universities i ON i.id=u.university_id WHERE (filter_status='' OR p.status=filter_status) AND (q='' OR strpos(lower(u.full_name||' '||i.name_en||' '||i.name_ar),lower(q))>0) ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END,p.updated_at,u.id LIMIT 20 OFFSET (page-1)*20) x;
 END IF;
 RETURN jsonb_build_object('rows',rows,'total',total,'pending',pending,'page',page,'pageSize',20);
END $$;
REVOKE ALL ON FUNCTION app.onboarding_approvals(uuid,uuid,text,uuid,text,text,integer) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.onboarding_approvals(uuid,uuid,text,uuid,text,text,integer) TO capstone_runtime;
