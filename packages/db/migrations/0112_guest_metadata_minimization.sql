-- Guest identity does not need internal person/institution keys from an internal snapshot.
-- Keep exact assessed version plus canonical display context; author emails/IDs are never exposed.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.committee_guest_read(uuid,text)'::regprocedure);
 d:=replace(d,'''metadata'',s.metadata_snapshot','''metadata'',jsonb_build_object(''title'',s.metadata_snapshot->''title'',''abstract'',s.metadata_snapshot->''abstract'',''keywords'',s.metadata_snapshot->''keywords'',''academicYear'',s.metadata_snapshot->''academicYear'',''domain'',s.metadata_snapshot->''domain'',''license'',s.metadata_snapshot->''license'',''university'',s.metadata_snapshot->''university''-''id'',''department'',s.metadata_snapshot->''department''-''id'',''supervisor'',jsonb_build_object(''name'',s.metadata_snapshot->''supervisor''->''name''))');
 EXECUTE d;
END $$;
