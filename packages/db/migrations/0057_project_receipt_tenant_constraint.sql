-- Receipt scope is also relationally bound, beyond the authoritative command guard.
ALTER TABLE app.project_onboarding_receipts ADD CONSTRAINT project_receipt_tenant_fk
FOREIGN KEY(university_id,project_id) REFERENCES app.projects(university_id,id);
