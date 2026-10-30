-- Phase08 core records only. No credentials/session, upload-session, review or evaluation tables.
CREATE TABLE app.roles (code text PRIMARY KEY CHECK (code IN ('student','faculty_supervisor','university_admin','platform_admin','partner')));
INSERT INTO app.roles VALUES ('student'),('faculty_supervisor'),('university_admin'),('platform_admin'),('partner');
REVOKE INSERT,UPDATE,DELETE ON app.roles FROM capstone_runtime;
CREATE TABLE app.universities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE CHECK(code=upper(btrim(code)) AND code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
 name_en text NOT NULL CHECK(length(btrim(name_en)) BETWEEN 1 AND 120), name_ar text NOT NULL CHECK(length(btrim(name_ar)) BETWEEN 1 AND 120),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.departments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), university_id uuid NOT NULL REFERENCES app.universities(id), code text NOT NULL CHECK(code IN ('CS','IS','CE')),
 name_en text NOT NULL CHECK(length(btrim(name_en)) BETWEEN 1 AND 120), name_ar text NOT NULL CHECK(length(btrim(name_ar)) BETWEEN 1 AND 120), row_version integer NOT NULL DEFAULT 0 CHECK(row_version>=0),
 UNIQUE(university_id,code), UNIQUE(university_id,id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text NOT NULL CHECK(length(btrim(full_name)) BETWEEN 1 AND 200),
 email text NOT NULL UNIQUE CHECK(email=lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 role_code text NOT NULL REFERENCES app.roles(code), university_id uuid REFERENCES app.universities(id), department_id uuid,
 student_id text, organization_name text, partner_status text CHECK(partner_status IN ('pending','approved','rejected','suspended')),
 account_status text NOT NULL DEFAULT 'inactive' CHECK(account_status IN ('active','inactive','suspended')), locale text NOT NULL DEFAULT 'en' CHECK(locale IN ('en','ar')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((role_code IN ('student','faculty_supervisor','university_admin') AND university_id IS NOT NULL) OR (role_code IN ('platform_admin','partner') AND university_id IS NULL AND department_id IS NULL)),
 CHECK((role_code='partner' AND partner_status IS NOT NULL) OR (role_code<>'partner' AND partner_status IS NULL)),
 CHECK(student_id IS NULL OR (role_code='student' AND student_id=btrim(student_id) AND length(student_id)>0)),
 FOREIGN KEY(university_id,department_id) REFERENCES app.departments(university_id,id),
 UNIQUE(university_id,id), UNIQUE(university_id,id,role_code), UNIQUE(id,role_code), UNIQUE(university_id,student_id)
);
CREATE TABLE app.student_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), university_id uuid NOT NULL REFERENCES app.universities(id), department_id uuid NOT NULL,
 external_group_id text NOT NULL CHECK(external_group_id=upper(btrim(external_group_id)) AND length(external_group_id) BETWEEN 1 AND 64), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(university_id,department_id) REFERENCES app.departments(university_id,id), UNIQUE(university_id,external_group_id), UNIQUE(university_id,id), UNIQUE(university_id,department_id,id)
);
CREATE TABLE app.group_members (
 university_id uuid NOT NULL, group_id uuid NOT NULL, user_id uuid NOT NULL, role_code text NOT NULL DEFAULT 'student' CHECK(role_code='student'),
 PRIMARY KEY(group_id,user_id), FOREIGN KEY(university_id,group_id) REFERENCES app.student_groups(university_id,id), FOREIGN KEY(university_id,user_id,role_code) REFERENCES app.users(university_id,id,role_code)
);
CREATE TABLE app.projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), university_id uuid NOT NULL REFERENCES app.universities(id), department_id uuid NOT NULL, group_id uuid NOT NULL,
 supervisor_id uuid NOT NULL, supervisor_role text NOT NULL DEFAULT 'faculty_supervisor' CHECK(supervisor_role='faculty_supervisor'), created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), first_submitted_at timestamptz, current_version_id uuid, published_version_id uuid, row_version integer NOT NULL DEFAULT 0 CHECK(row_version>=0),
 FOREIGN KEY(university_id,department_id) REFERENCES app.departments(university_id,id), FOREIGN KEY(university_id,department_id,group_id) REFERENCES app.student_groups(university_id,department_id,id),
 FOREIGN KEY(university_id,supervisor_id,supervisor_role) REFERENCES app.users(university_id,id,role_code), FOREIGN KEY(university_id,created_by) REFERENCES app.users(university_id,id), UNIQUE(university_id,id)
);
CREATE TABLE app.project_authors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), university_id uuid NOT NULL, project_id uuid NOT NULL, user_id uuid NOT NULL, role_code text NOT NULL DEFAULT 'student' CHECK(role_code='student'),
 author_order integer NOT NULL CHECK(author_order>0), is_team_lead boolean NOT NULL DEFAULT false,
 FOREIGN KEY(university_id,project_id) REFERENCES app.projects(university_id,id), FOREIGN KEY(university_id,user_id,role_code) REFERENCES app.users(university_id,id,role_code),
 UNIQUE(project_id,user_id), UNIQUE(project_id,author_order)
);
CREATE UNIQUE INDEX project_one_lead ON app.project_authors(project_id) WHERE is_team_lead;
CREATE TABLE app.project_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), university_id uuid NOT NULL, project_id uuid NOT NULL, version_number integer NOT NULL CHECK(version_number>0),
 title text, abstract text, keywords jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(keywords)='array'), academic_year text, domain text, custom_metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(custom_metadata)='object'), license_identifier text,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_review','revision_required','archived','rejected')), base_version_id uuid, approved_submission_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz, archived_at timestamptz, retained_at timestamptz,
 FOREIGN KEY(university_id,project_id) REFERENCES app.projects(university_id,id), UNIQUE(project_id,version_number), UNIQUE(university_id,project_id,id),
 FOREIGN KEY(university_id,project_id,base_version_id) REFERENCES app.project_versions(university_id,project_id,id), CHECK(status<>'archived' OR (approved_submission_id IS NOT NULL AND archived_at IS NOT NULL)), CHECK(status<>'rejected' OR retained_at IS NOT NULL)
);
ALTER TABLE app.projects ADD FOREIGN KEY(university_id,id,current_version_id) REFERENCES app.project_versions(university_id,project_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE app.projects ADD FOREIGN KEY(university_id,id,published_version_id) REFERENCES app.project_versions(university_id,project_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE app.project_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), university_id uuid NOT NULL, project_id uuid NOT NULL, version_id uuid NOT NULL, round_number integer NOT NULL CHECK(round_number>0), submitted_by uuid NOT NULL,
 submitted_at timestamptz NOT NULL DEFAULT now(), metadata_snapshot jsonb NOT NULL CHECK(jsonb_typeof(metadata_snapshot)='object'), authors_snapshot jsonb NOT NULL CHECK(jsonb_typeof(authors_snapshot)='array' AND jsonb_array_length(authors_snapshot)>0),
 FOREIGN KEY(university_id,project_id,version_id) REFERENCES app.project_versions(university_id,project_id,id), FOREIGN KEY(university_id,submitted_by) REFERENCES app.users(university_id,id), UNIQUE(version_id,round_number), UNIQUE(university_id,project_id,version_id,id)
);
ALTER TABLE app.project_versions ADD FOREIGN KEY(university_id,project_id,id,approved_submission_id) REFERENCES app.project_submissions(university_id,project_id,version_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE app.project_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), university_id uuid NOT NULL, project_id uuid NOT NULL, version_id uuid NOT NULL, storage_object_id uuid NOT NULL,
 relative_path text NOT NULL CHECK(relative_path<>'' AND relative_path !~ '(^/|(^|/)\.\.(/|$)|\\|^[A-Za-z]:)'), original_name text NOT NULL, extension text NOT NULL, detected_mime text NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes>=0), sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'), visibility text NOT NULL DEFAULT 'restricted' CHECK(visibility IN ('public','restricted')),
 uploaded_by uuid NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now(), supersedes_file_id uuid, is_current boolean NOT NULL DEFAULT true, processing_status text NOT NULL DEFAULT 'processing' CHECK(processing_status IN ('processing','ready','failed')),
 FOREIGN KEY(university_id,project_id,version_id) REFERENCES app.project_versions(university_id,project_id,id), FOREIGN KEY(university_id,uploaded_by) REFERENCES app.users(university_id,id),
 UNIQUE(university_id,project_id,version_id,id), FOREIGN KEY(university_id,project_id,version_id,supersedes_file_id) REFERENCES app.project_files(university_id,project_id,version_id,id)
);
CREATE UNIQUE INDEX current_file_path ON app.project_files(version_id,relative_path) WHERE is_current;
CREATE TABLE app.submission_files (
 university_id uuid NOT NULL, project_id uuid NOT NULL, version_id uuid NOT NULL, submission_id uuid NOT NULL, file_id uuid NOT NULL, relative_path text NOT NULL,
 visibility_at_submit text NOT NULL CHECK(visibility_at_submit IN ('public','restricted')), sha256_at_submit text NOT NULL CHECK(sha256_at_submit ~ '^[0-9a-f]{64}$'), PRIMARY KEY(submission_id,file_id),
 FOREIGN KEY(university_id,project_id,version_id,submission_id) REFERENCES app.project_submissions(university_id,project_id,version_id,id), FOREIGN KEY(university_id,project_id,version_id,file_id) REFERENCES app.project_files(university_id,project_id,version_id,id)
);
CREATE TABLE app.access_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), university_id uuid NOT NULL, project_id uuid NOT NULL, version_id uuid NOT NULL, requester_id uuid NOT NULL, requester_role text NOT NULL DEFAULT 'partner' CHECK(requester_role='partner'),
 justification text NOT NULL CHECK(length(btrim(justification))>0), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), decided_by uuid, decided_at timestamptz, decision_reason text,
 FOREIGN KEY(university_id,project_id,version_id) REFERENCES app.project_versions(university_id,project_id,id), FOREIGN KEY(requester_id,requester_role) REFERENCES app.users(id,role_code), FOREIGN KEY(university_id,decided_by) REFERENCES app.users(university_id,id),
 CHECK((status IN ('approved','denied') AND decided_by IS NOT NULL AND decided_at IS NOT NULL) OR status IN ('pending','cancelled')), UNIQUE(id,university_id,project_id,version_id,requester_id,status)
);
CREATE TABLE app.access_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE, university_id uuid NOT NULL, project_id uuid NOT NULL, version_id uuid NOT NULL, granted_to uuid NOT NULL,
 request_status text NOT NULL DEFAULT 'approved' CHECK(request_status='approved'), granted_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT (now()+interval '90 days'), revoked_at timestamptz, revoked_by uuid, revocation_reason text,
 FOREIGN KEY(request_id,university_id,project_id,version_id,granted_to,request_status) REFERENCES app.access_requests(id,university_id,project_id,version_id,requester_id,status),
 FOREIGN KEY(university_id,revoked_by) REFERENCES app.users(university_id,id), CHECK(expires_at=granted_at+interval '90 days'), CHECK((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND length(btrim(revocation_reason))>0))
);
CREATE FUNCTION app.audit_values_safe(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN jsonb_typeof(value)<>'object' THEN false ELSE NOT EXISTS(SELECT 1 FROM jsonb_object_keys(value) k WHERE k NOT IN ('name_en','name_ar','row_version','scope','count')) END;
$$;
CREATE TABLE app.audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES app.users(id), actor_role text REFERENCES app.roles(code), actor_kind text NOT NULL DEFAULT 'user' CHECK(actor_kind IN ('user','system')),
 university_id uuid REFERENCES app.universities(id), action text NOT NULL CHECK(length(action) BETWEEN 1 AND 80), object_type text NOT NULL CHECK(length(object_type) BETWEEN 1 AND 40), object_id uuid NOT NULL,
 project_id uuid, version_id uuid, before_state jsonb NOT NULL DEFAULT '{}' CHECK(app.audit_values_safe(before_state)), after_state jsonb NOT NULL DEFAULT '{}' CHECK(app.audit_values_safe(after_state)),
 reason text CHECK(length(reason)<=400), occurred_at timestamptz NOT NULL DEFAULT now(), correlation_id uuid NOT NULL, event_key uuid NOT NULL UNIQUE,
 CHECK((actor_kind='user' AND actor_id IS NOT NULL AND actor_role IS NOT NULL) OR (actor_kind='system' AND actor_id IS NULL AND actor_role IS NULL AND action LIKE 'system.%')),
 CHECK(project_id IS NULL OR university_id IS NOT NULL), CHECK(version_id IS NULL OR project_id IS NOT NULL), FOREIGN KEY(university_id,project_id) REFERENCES app.projects(university_id,id), FOREIGN KEY(university_id,project_id,version_id) REFERENCES app.project_versions(university_id,project_id,id)
);
CREATE INDEX audit_scope_time ON app.audit_logs(university_id,occurred_at,id);
CREATE TABLE app.command_receipts (actor_id uuid NOT NULL REFERENCES app.users(id), command_id uuid NOT NULL, action text NOT NULL, payload_digest text NOT NULL CHECK(payload_digest ~ '^[0-9a-f]{64}$'), audit_id uuid NOT NULL REFERENCES app.audit_logs(id), result jsonb NOT NULL CHECK(app.audit_values_safe(result)), PRIMARY KEY(actor_id,command_id));
CREATE TABLE app.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES app.audit_logs(id), recipient_id uuid NOT NULL REFERENCES app.users(id), university_id uuid REFERENCES app.universities(id), project_id uuid,
 type text NOT NULL, payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND NOT (payload - ARRAY['route','message_key']='{}'::jsonb) IS FALSE), created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
 FOREIGN KEY(university_id,project_id) REFERENCES app.projects(university_id,id), UNIQUE(event_id,recipient_id,type));
CREATE TABLE app.outbox_events (event_id uuid PRIMARY KEY REFERENCES app.audit_logs(id), kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz);
CREATE FUNCTION app.immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Immutable record'; END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON app.audit_logs FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER immutable_submission BEFORE UPDATE OR DELETE ON app.project_submissions FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER immutable_manifest BEFORE UPDATE OR DELETE ON app.submission_files FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.audit_logs,app.project_submissions,app.submission_files,app.command_receipts FROM capstone_runtime;
CREATE FUNCTION app.project_pointer_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.published_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.project_versions WHERE university_id=NEW.university_id AND project_id=NEW.id AND id=NEW.published_version_id AND status='archived') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Published pointer must identify archived edition'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER project_pointer BEFORE INSERT OR UPDATE ON app.projects FOR EACH ROW EXECUTE FUNCTION app.project_pointer_guard();
CREATE FUNCTION app.version_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status IN ('archived','rejected') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Frozen edition'; END IF;
 IF NEW.status='pending_review' AND (SELECT count(*) FROM app.project_authors WHERE project_id=NEW.project_id AND is_team_lead)<>1 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Exactly one lead required'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER frozen_version BEFORE UPDATE OR DELETE ON app.project_versions FOR EACH ROW EXECUTE FUNCTION app.version_guard();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO capstone_runtime;
