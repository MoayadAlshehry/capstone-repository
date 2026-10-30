-- Preserve the existing first-pair gates while comparing committee means as
-- exact rationals. Historical stored assessment rows are not changed.
DO $$
DECLARE
  definition text;
  old_checks text := $old$  IF 2*s.quarter_points+3*cm.quarter_points<1400 THEN why:=array_append(why,'internal_floor');END IF;
  IF cm.quarter_points<260 THEN why:=array_append(why,'committee_floor');END IF;$old$;
  new_checks text := $new$  IF EXISTS(SELECT 1 FROM app.current_committee_results r WHERE r.id=cm.id AND r.case_id=cid) THEN
   IF (SELECT 2*s.quarter_points*r.member_count::numeric+3*r.sum_quarter_points::numeric < 1400::numeric*r.member_count FROM app.current_committee_results r WHERE r.id=cm.id AND r.case_id=cid) THEN why:=array_append(why,'internal_floor');END IF;
   IF (SELECT r.sum_quarter_points::numeric < 260::numeric*r.member_count FROM app.current_committee_results r WHERE r.id=cm.id AND r.case_id=cid) THEN why:=array_append(why,'committee_floor');END IF;
  ELSE
   IF 2*s.quarter_points+3*cm.quarter_points<1400 THEN why:=array_append(why,'internal_floor');END IF;
   IF cm.quarter_points<260 THEN why:=array_append(why,'committee_floor');END IF;
  END IF;$new$;
BEGIN
  SELECT pg_get_functiondef('app.first_pair_reasons(uuid)'::regprocedure) INTO definition;
  IF position(old_checks IN definition)=0 OR
     length(definition)-length(replace(definition,old_checks,''))<>length(old_checks) THEN
    RAISE EXCEPTION 'EXACT70_UNEXPECTED_FIRST_PAIR_DEFINITION';
  END IF;
  EXECUTE replace(definition,old_checks,new_checks);
END $$;
