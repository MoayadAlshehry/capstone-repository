-- Modern full-final forms permit no locators. The original read aggregate uses
-- JSON null for that empty set; render it as an empty array in recipient feedback.
-- Other malformed scalar values still fail, and identity redaction/release rules
-- remain in their existing functions.
CREATE OR REPLACE FUNCTION app.feedback_form(aid uuid,cid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE b jsonb; criteria_value jsonb;
BEGIN
  b:=app.assessment_payload(aid);
  SELECT jsonb_agg(jsonb_build_object(
    'code',c->>'code','level',c->'level','comment',app.feedback_redact(c->>'comment',cid),
    'locators',coalesce((
      SELECT jsonb_agg(jsonb_build_object('kind',l->>'kind','reference',app.feedback_redact(l->>'reference',cid)))
      FROM jsonb_array_elements(coalesce(nullif(c->'locators','null'::jsonb),'[]'::jsonb)) l
    ),'[]'::jsonb)
  ) ORDER BY c->>'code') INTO criteria_value
  FROM jsonb_array_elements(b->'criteria') c;
  RETURN jsonb_build_object('criteria',criteria_value,'overall',app.feedback_redact(b->>'overall',cid));
END $$;
REVOKE ALL ON FUNCTION app.feedback_form(uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
