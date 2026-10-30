-- Grant only the capabilities used by Phase08 services. Later features own their additional grants.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.universities,app.departments,app.users,app.student_groups,app.group_members,app.projects,app.project_authors,app.project_versions,app.project_submissions,app.project_files,app.submission_files,app.access_requests,app.access_grants,app.roles FROM capstone_runtime;
GRANT UPDATE(name_en,name_ar,row_version,updated_at) ON app.departments TO capstone_runtime;
-- A minimal column update grant permits locking authoritative identity rows, not changing authority.
GRANT UPDATE(updated_at) ON app.users TO capstone_runtime;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.notifications,app.outbox_events FROM capstone_runtime;
