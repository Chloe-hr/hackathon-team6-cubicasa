-- Run once on a database made before the model tabs existed (npm run db:migrate:remote)
ALTER TABLE searches ADD COLUMN model TEXT;
UPDATE searches SET model = 'v3' WHERE model IS NULL;
