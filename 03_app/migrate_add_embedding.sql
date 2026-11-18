-- Run once on a database made before the codes were stored (npm run db:embedding:remote)
ALTER TABLE searches ADD COLUMN embedding TEXT;
