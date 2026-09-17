-- Keep the original UA for historical imports; public responses expose parsed labels only.
ALTER TABLE comments ADD COLUMN ua TEXT;
