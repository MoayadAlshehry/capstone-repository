DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.committee_guest_read(uuid,text)'::regprocedure);
 d:=replace(d,'s.metadata_snapshot->''university''-''id''','(s.metadata_snapshot->''university'')-''id''');
 d:=replace(d,'s.metadata_snapshot->''department''-''id''','(s.metadata_snapshot->''department'')-''id''');
 EXECUTE d;
END $$;
