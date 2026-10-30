-- Forward constraint strengthening; prior applied migrations unchanged.
CREATE OR REPLACE FUNCTION app.native_path_valid(path text,ext text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,app AS $$
DECLARE segment text; name text; actual text;
BEGIN
 IF path ~ '[­؀؁؂؃؄؅؜۝܏࢐࢑࣢᠎​‌‍‎‏‪‫‬‭‮⁠⁡⁢⁣⁤⁦⁧⁨⁩⁪⁫⁬⁭⁮⁯﻿￹￺￻𑂽𑃍𓐰𓐱𓐲𓐳𓐴𓐵𓐶𓐷𓐸𓐹𓐺𓐻𓐼𓐽𓐾𓐿𛲠𛲡𛲢𛲣𝅳𝅴𝅵𝅶𝅷𝅸𝅹𝅺󠀁󠀠󠀡󠀢󠀣󠀤󠀥󠀦󠀧󠀨󠀩󠀪󠀫󠀬󠀭󠀮󠀯󠀰󠀱󠀲󠀳󠀴󠀵󠀶󠀷󠀸󠀹󠀺󠀻󠀼󠀽󠀾󠀿󠁀󠁁󠁂󠁃󠁄󠁅󠁆󠁇󠁈󠁉󠁊󠁋󠁌󠁍󠁎󠁏󠁐󠁑󠁒󠁓󠁔󠁕󠁖󠁗󠁘󠁙󠁚󠁛󠁜󠁝󠁞󠁟󠁠󠁡󠁢󠁣󠁤󠁥󠁦󠁧󠁨󠁩󠁪󠁫󠁬󠁭󠁮󠁯󠁰󠁱󠁲󠁳󠁴󠁵󠁶󠁷󠁸󠁹󠁺󠁻󠁼󠁽󠁾󠁿]' OR char_length(path) NOT BETWEEN 1 AND 512 OR path ~ '(^/|^[A-Za-z]:|\\|[[:cntrl:]<>:"|?*‪-‮⁦-⁩])' THEN RETURN false; END IF;
 FOREACH segment IN ARRAY string_to_array(path,'/') LOOP
  IF segment IN ('','.','..') OR segment ~ '(^[[:space:]]|[. ]$)' OR lower(segment) IN ('.git','node_modules','vendor','dist','build') OR segment ~* '^\.env([._-].*)?$' OR segment ~* '^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)' THEN RETURN false;END IF;
 END LOOP;
 name:=segment;actual:=CASE WHEN lower(name)='.gitignore' THEN 'gitignore' WHEN name LIKE '%.%' THEN lower(regexp_replace(name,'^.*\.','')) ELSE '' END;
 RETURN actual=ext AND (ext=ANY(string_to_array('pdf docx pptx csv txt md png jpg jpeg webp mp4 mp3 wav ts tsx js jsx mjs cjs py java c h cpp hpp cs go rs php rb swift kt kts dart r m sh ps1 sql html css scss sass less vue svelte json yml yaml toml xml ini ipynb gitignore',' ')) OR (ext='' AND name IN ('README','LICENSE','Dockerfile','Makefile')));
END $$;

ALTER TABLE app.project_files ADD CONSTRAINT native_file_path CHECK(app.native_path_valid(relative_path,extension));
CREATE FUNCTION app.file_object_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$ BEGIN
 IF NEW.processing_status='ready' AND NOT EXISTS(SELECT 1 FROM app.storage_objects WHERE id=NEW.storage_object_id AND project_id=NEW.project_id AND university_id=NEW.university_id AND size_bytes=NEW.size_bytes AND sha256=NEW.sha256) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ready file requires matching immutable object';END IF;RETURN NEW;
END $$;
CREATE TRIGGER file_object_identity BEFORE INSERT OR UPDATE ON app.project_files FOR EACH ROW EXECUTE FUNCTION app.file_object_identity();
REVOKE ALL ON FUNCTION app.file_object_identity() FROM PUBLIC,capstone_runtime,capstone_jobs;
