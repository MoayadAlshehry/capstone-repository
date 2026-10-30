-- Visual presentation assets are separate from immutable academic file originals.
CREATE TABLE app.visual_assets (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('cover','avatar')),
 owner_id uuid NOT NULL REFERENCES app.users(id), university_id uuid REFERENCES app.universities(id),
 project_id uuid, version_id uuid, main jsonb NOT NULL, small jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(university_id,project_id,version_id) REFERENCES app.project_versions(university_id,project_id,id),
 CHECK((kind='cover' AND university_id IS NOT NULL AND project_id IS NOT NULL AND version_id IS NOT NULL) OR (kind='avatar' AND project_id IS NULL AND version_id IS NULL))
);
CREATE INDEX visual_asset_owner_time ON app.visual_assets(owner_id,created_at);
CREATE UNIQUE INDEX visual_main_key ON app.visual_assets((main->>'key'));
CREATE UNIQUE INDEX visual_small_key ON app.visual_assets((small->>'key'));
CREATE TABLE app.visual_covers (
 version_id uuid PRIMARY KEY REFERENCES app.project_versions(id),
 asset_id uuid REFERENCES app.visual_assets(id), revision integer NOT NULL CHECK(revision>=0)
);
CREATE TABLE app.visual_avatars (
 user_id uuid PRIMARY KEY REFERENCES app.users(id),
 asset_id uuid REFERENCES app.visual_assets(id), revision integer NOT NULL CHECK(revision>=0)
);
CREATE TABLE app.visual_submission_covers (
 submission_id uuid PRIMARY KEY REFERENCES app.project_submissions(id),
 asset_id uuid REFERENCES app.visual_assets(id)
);
CREATE TRIGGER visual_assets_immutable BEFORE UPDATE OR DELETE ON app.visual_assets FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER visual_submission_immutable BEFORE UPDATE OR DELETE ON app.visual_submission_covers FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE ALL ON app.visual_assets,app.visual_covers,app.visual_avatars,app.visual_submission_covers FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.visual_capture_submission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 INSERT INTO app.visual_submission_covers(submission_id,asset_id) VALUES(NEW.id,(SELECT asset_id FROM app.visual_covers WHERE version_id=NEW.version_id));RETURN NEW;
END $$;
CREATE TRIGGER visual_capture AFTER INSERT ON app.project_submissions FOR EACH ROW EXECUTE FUNCTION app.visual_capture_submission();
INSERT INTO app.visual_submission_covers(submission_id,asset_id) SELECT id,NULL FROM app.project_submissions;
REVOKE ALL ON FUNCTION app.visual_capture_submission() FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.visual_principal(reader uuid,sid uuid) RETURNS app.users LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;BEGIN
 SELECT * INTO a FROM app.users WHERE id=reader AND account_status='active';
 IF a.id IS NULL OR NOT EXISTS(SELECT 1 FROM app.auth_sessions WHERE id=sid AND user_id=reader AND expires_at>clock_timestamp()) OR (a.university_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.universities WHERE id=a.university_id AND status='active')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 RETURN a;
END $$;
CREATE FUNCTION app.visual_read(reader uuid,sid uuid,target jsonb,storage_value boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;p app.projects;v app.project_versions;s app.project_submissions;asset app.visual_assets;
 pid uuid:=(target->>'project')::uuid;vid uuid:=(target->>'version')::uuid;sub uuid:=(target->>'submission')::uuid;uid uuid:=(target->>'user')::uuid;
 public_value boolean:=coalesce((target->>'published')::boolean,false);selected_asset uuid;rev integer:=0;editable boolean:=false;pub jsonb;
BEGIN
 IF target->>'kind' NOT IN ('cover','avatar') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_TARGET';END IF;
 IF public_value THEN
  IF pid IS NULL OR uid IS NOT NULL OR sub IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
  pub:=app.publication_projection(pid);
  IF vid IS NOT NULL AND vid IS DISTINCT FROM (pub->>'version')::uuid THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
  vid:=(pub->>'version')::uuid;SELECT * INTO v FROM app.project_versions WHERE id=vid;
  SELECT * INTO s FROM app.project_submissions WHERE id=v.approved_submission_id AND project_id=pid;
 ELSE
  a:=app.visual_principal(reader,sid);
  IF pid IS NOT NULL THEN
   SELECT * INTO p FROM app.projects WHERE id=pid;vid:=coalesce(vid,p.current_version_id);
   IF target ? 'grant' THEN
    IF target->>'kind'<>'cover' OR NOT target ? 'version' OR sub IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
    PERFORM app.file_delivery_read('partner-grant',reader,sid,pid,vid,NULL,NULL,(target->>'grant')::uuid);
   ELSE PERFORM app.file_actor(reader,sid,pid,vid,false);END IF;
   SELECT * INTO v FROM app.project_versions WHERE id=vid AND project_id=pid;
   IF target ? 'grant' THEN SELECT * INTO s FROM app.project_submissions WHERE id=v.approved_submission_id AND version_id=vid;IF s.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;END IF;
   IF sub IS NOT NULL THEN SELECT * INTO s FROM app.project_submissions WHERE id=sub AND project_id=pid AND version_id=vid;IF s.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;END IF;
  END IF;
 END IF;
 IF target->>'kind'='cover' THEN
  IF pid IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
  IF s.id IS NOT NULL THEN SELECT asset_id INTO selected_asset FROM app.visual_submission_covers WHERE submission_id=s.id;
  ELSE SELECT asset_id,revision INTO selected_asset,rev FROM app.visual_covers WHERE version_id=vid;
   editable:=NOT public_value AND p.current_version_id=vid AND v.status IN ('draft','revision_required') AND a.role_code='student' AND EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reader AND is_team_lead);
  END IF;
 ELSE
  IF public_value THEN
   IF target->>'person'='supervisor' THEN uid:=(s.metadata_snapshot->'supervisor'->>'id')::uuid;
   ELSIF target->>'person'='author' THEN SELECT (x->>'id')::uuid INTO uid FROM jsonb_array_elements(s.authors_snapshot) x WHERE (x->>'order')::int=(target->>'order')::int;
   ELSE RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
   IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
  ELSIF uid IS DISTINCT FROM reader THEN
   IF pid IS NOT NULL THEN
    IF s.id IS NOT NULL THEN
     IF uid IS DISTINCT FROM (s.metadata_snapshot->'supervisor'->>'id')::uuid AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.authors_snapshot) x WHERE (x->>'id')::uuid=uid) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
    ELSIF uid IS DISTINCT FROM p.supervisor_id AND NOT EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=uid) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
   ELSIF a.role_code<>'university_admin' OR NOT EXISTS(SELECT 1 FROM app.users WHERE id=uid AND university_id=a.university_id AND role_code IN ('student','faculty_supervisor')) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
  END IF;
  SELECT asset_id,revision INTO selected_asset,rev FROM app.visual_avatars WHERE user_id=uid;
  editable:=NOT public_value AND uid=reader;
  IF public_value AND NOT EXISTS(SELECT 1 FROM app.users WHERE id=uid AND account_status='active') THEN selected_asset:=NULL;END IF;
 END IF;
 SELECT * INTO asset FROM app.visual_assets WHERE id=selected_asset AND kind=target->>'kind';
 RETURN jsonb_build_object('revision',coalesce(rev,0),'canEdit',coalesce(editable,false),'image',CASE WHEN asset.id IS NULL THEN NULL ELSE
  jsonb_build_object('id',asset.id,'width',asset.main->'width','height',asset.main->'height','smallWidth',asset.small->'width','smallHeight',asset.small->'height') END)
  ||CASE WHEN storage_value AND asset.id IS NOT NULL THEN jsonb_build_object('objects',jsonb_build_object('main',asset.main,'small',asset.small)) ELSE '{}'::jsonb END;
END $$;
REVOKE ALL ON FUNCTION app.visual_principal(uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.visual_read(uuid,uuid,jsonb,boolean) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.visual_read(uuid,uuid,jsonb,boolean) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.visual_part_valid(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_typeof(p)='object' AND p-ARRAY['key','width','height','bytes','sha256']='{}'::jsonb
 AND p->>'key' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 AND (p->>'width')::int BETWEEN 1 AND 1600 AND (p->>'height')::int BETWEEN 1 AND 1000
 AND (p->>'bytes')::int BETWEEN 1 AND 2000000 AND p->>'sha256' ~ '^[0-9a-f]{64}$';
$$;
ALTER TABLE app.visual_assets ADD CONSTRAINT visual_asset_parts_valid CHECK(coalesce(app.visual_part_valid(main),false) AND coalesce(app.visual_part_valid(small),false) AND main->>'key'<>small->>'key');
CREATE FUNCTION app.visual_receipt(reader uuid,sid uuid,command_value uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;BEGIN PERFORM app.visual_principal(reader,sid);
 SELECT (r.result->>'scope')::jsonb INTO result FROM app.command_receipts r WHERE actor_id=reader AND command_id=command_value AND action IN ('visual.cover.change','visual.avatar.change');
 IF result IS NOT NULL THEN PERFORM app.visual_read(reader,sid,result->'target',false);END IF;
 RETURN result;
END $$;
CREATE FUNCTION app.visual_write(reader uuid,sid uuid,command_value uuid,payload_hash text,target jsonb,expected integer,asset_value jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;view_value jsonb;receipt app.command_receipts;kind_value text:=target->>'kind';pid uuid:=(target->>'project')::uuid;vid uuid;old_asset uuid;next_asset uuid;rev integer;event uuid:=gen_random_uuid();result jsonb;action_value text;total_bytes bigint;
BEGIN
 a:=app.visual_principal(reader,sid);PERFORM 1 FROM app.users WHERE id=reader FOR UPDATE;
 IF kind_value NOT IN ('cover','avatar') OR command_value IS NULL OR payload_hash !~ '^[0-9a-f]{64}$' OR expected<0 OR coalesce((target->>'published')::boolean,false) OR target ? 'submission' OR target ? 'grant' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 view_value:=app.visual_read(reader,sid,target,false);
 action_value:='visual.'||kind_value||'.change';
 SELECT * INTO receipt FROM app.command_receipts WHERE actor_id=reader AND command_id=command_value;
 IF receipt.command_id IS NOT NULL THEN
  IF receipt.action<>action_value OR receipt.payload_digest<>payload_hash THEN RAISE EXCEPTION USING ERRCODE='PV003',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;
  RETURN (receipt.result->>'scope')::jsonb;
 END IF;
 IF NOT (view_value->>'canEdit')::boolean THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MEDIA_READ_ONLY';END IF;
 rev:=(view_value->>'revision')::int;
 IF rev<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='MEDIA_CONFLICT';END IF;
 IF (SELECT count(*) FROM app.audit_logs WHERE actor_id=reader AND action IN ('visual.cover.change','visual.avatar.change') AND occurred_at>clock_timestamp()-interval '1 hour')>=20 THEN RAISE EXCEPTION USING ERRCODE='PV002',MESSAGE='MEDIA_RATE_LIMIT';END IF;
 IF kind_value='cover' THEN SELECT current_version_id INTO vid FROM app.projects WHERE id=pid;IF target ? 'version' AND (target->>'version')::uuid IS DISTINCT FROM vid THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='MEDIA_CONFLICT';END IF;END IF;
 IF asset_value IS NOT NULL AND asset_value<>'null'::jsonb THEN
  IF NOT coalesce(app.visual_part_valid(asset_value->'main'),false) OR NOT coalesce(app.visual_part_valid(asset_value->'small'),false) OR (asset_value->>'id')::uuid IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_IMAGE';END IF;
  IF kind_value='avatar' AND ((asset_value->'main'->>'width')::int>256 OR (asset_value->'main'->>'height')::int>256 OR (asset_value->'small'->>'width')::int>64 OR (asset_value->'small'->>'height')::int>64) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_IMAGE';END IF;
  SELECT coalesce(sum((main->>'bytes')::bigint+(small->>'bytes')::bigint),0) INTO total_bytes FROM app.visual_assets WHERE owner_id=reader;
  IF total_bytes+(asset_value->'main'->>'bytes')::bigint+(asset_value->'small'->>'bytes')::bigint>50000000 THEN RAISE EXCEPTION USING ERRCODE='PV001',MESSAGE='MEDIA_QUOTA';END IF;
  next_asset:=(asset_value->>'id')::uuid;
  INSERT INTO app.visual_assets(id,kind,owner_id,university_id,project_id,version_id,main,small) VALUES(next_asset,kind_value,reader,a.university_id,CASE WHEN kind_value='cover' THEN pid END,vid,asset_value->'main',asset_value->'small');
 END IF;
 old_asset:=(view_value->'image'->>'id')::uuid;
 IF kind_value='cover' THEN INSERT INTO app.visual_covers(version_id,asset_id,revision) VALUES(vid,next_asset,rev+1) ON CONFLICT(version_id) DO UPDATE SET asset_id=EXCLUDED.asset_id,revision=EXCLUDED.revision;
  -- Existing final/checkpoint CAS must notice a cover changed after its review.
  UPDATE app.project_versions SET row_version=row_version+1 WHERE id=vid;
 ELSE INSERT INTO app.visual_avatars(user_id,asset_id,revision) VALUES(reader,next_asset,rev+1) ON CONFLICT(user_id) DO UPDATE SET asset_id=EXCLUDED.asset_id,revision=EXCLUDED.revision;END IF;
 result:=jsonb_build_object('target',target,'revision',rev+1,'asset',next_asset);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,action,object_type,object_id,project_id,version_id,before_state,after_state,correlation_id,event_key)
 VALUES(event,reader,a.role_code,'user',a.university_id,action_value,'visual-'||kind_value,CASE WHEN kind_value='cover' THEN pid ELSE reader END,CASE WHEN kind_value='cover' THEN pid END,vid,jsonb_build_object('scope',old_asset::text,'row_version',rev),jsonb_build_object('scope',next_asset::text,'row_version',rev+1),command_value,gen_random_uuid());
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(reader,command_value,action_value,payload_hash,event,jsonb_build_object('scope',result::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) VALUES(event,reader,a.university_id,CASE WHEN kind_value='cover' THEN pid END,action_value,jsonb_build_object('route',CASE WHEN kind_value='cover' THEN '/projects/'||pid ELSE '/account' END,'message_key',action_value));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.visual_part_valid(jsonb),app.visual_receipt(uuid,uuid,uuid),app.visual_write(uuid,uuid,uuid,text,jsonb,integer,jsonb) FROM PUBLIC,capstone_jobs;
REVOKE ALL ON FUNCTION app.visual_part_valid(jsonb) FROM capstone_runtime;
GRANT EXECUTE ON FUNCTION app.visual_receipt(uuid,uuid,uuid),app.visual_write(uuid,uuid,uuid,text,jsonb,integer,jsonb) TO capstone_runtime;
CREATE FUNCTION app.visual_registered(reader uuid,sid uuid,asset_value uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 PERFORM app.visual_principal(reader,sid);PERFORM 1 FROM app.users WHERE id=reader FOR UPDATE;RETURN EXISTS(SELECT 1 FROM app.visual_assets WHERE id=asset_value AND owner_id=reader);
END $$;
REVOKE ALL ON FUNCTION app.visual_registered(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.visual_registered(uuid,uuid,uuid) TO capstone_runtime;
CREATE FUNCTION app.visual_cover_pointer_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$ BEGIN
 IF NEW.asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.visual_assets a JOIN app.project_versions v ON v.id=NEW.version_id WHERE a.id=NEW.asset_id AND a.kind='cover' AND a.project_id=v.project_id AND a.university_id=v.university_id) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INVALID_COVER_SCOPE';END IF;RETURN NEW;
END $$;
CREATE TRIGGER visual_cover_scope BEFORE INSERT OR UPDATE ON app.visual_covers FOR EACH ROW EXECUTE FUNCTION app.visual_cover_pointer_guard();
CREATE FUNCTION app.visual_avatar_pointer_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$ BEGIN
 IF NEW.asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.visual_assets WHERE id=NEW.asset_id AND kind='avatar' AND owner_id=NEW.user_id) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INVALID_AVATAR_SCOPE';END IF;RETURN NEW;
END $$;
CREATE TRIGGER visual_avatar_scope BEFORE INSERT OR UPDATE ON app.visual_avatars FOR EACH ROW EXECUTE FUNCTION app.visual_avatar_pointer_guard();
REVOKE ALL ON FUNCTION app.visual_cover_pointer_guard(),app.visual_avatar_pointer_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
