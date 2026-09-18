-- Fresh schema. No legacy migration or compatibility layer.
CREATE TABLE identities (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT UNIQUE,
  kind TEXT NOT NULL DEFAULT 'visitor' CHECK(kind IN ('visitor','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','blocked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((kind='visitor' AND token_hash IS NOT NULL) OR (kind='admin' AND token_hash IS NULL))
);
INSERT INTO identities(id,kind) VALUES('site-owner','admin');
CREATE TABLE pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  title TEXT,
  comments_enabled INTEGER NOT NULL DEFAULT 1 CHECK(comments_enabled IN (0,1))
);
CREATE TABLE comments (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  author_id TEXT NOT NULL REFERENCES identities(id),
  root_id TEXT REFERENCES comments(id),
  reply_to_id TEXT REFERENCES comments(id),
  client_request_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  nick TEXT NOT NULL,
  email TEXT,
  website TEXT,
  content_md TEXT,
  ua TEXT,
  notify INTEGER NOT NULL DEFAULT 0 CHECK(notify IN (0,1)),
  moderation_status TEXT NOT NULL DEFAULT 'published' CHECK(moderation_status IN ('published','pending','hidden','spam')),
  deleted_at TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK(is_pinned IN (0,1)),
  first_published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(author_id,client_request_id),
  CHECK((root_id IS NULL AND reply_to_id IS NULL) OR (root_id IS NOT NULL AND reply_to_id IS NOT NULL)),
  CHECK(root_id IS NULL OR is_pinned=0),
  CHECK((deleted_at IS NULL AND content_md IS NOT NULL) OR (deleted_at IS NOT NULL AND content_md IS NULL))
);
CREATE INDEX comments_page ON comments(page_id,seq);
CREATE INDEX comments_root ON comments(root_id,seq);
CREATE INDEX comments_author ON comments(author_id,seq);
CREATE INDEX comments_status ON comments(moderation_status,seq);
CREATE TABLE comment_likes (
  comment_id TEXT NOT NULL REFERENCES comments(id),
  identity_id TEXT NOT NULL REFERENCES identities(id),
  PRIMARY KEY(comment_id,identity_id)
);
CREATE TABLE moderation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE notification_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  comment_id TEXT NOT NULL REFERENCES comments(id),
  recipient TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('owner','reply')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','cancelled','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  first_attempt_at INTEGER,
  payload_json TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(comment_id,recipient)
);
CREATE INDEX notifications_due ON notification_jobs(status,next_attempt_at,lease_until);
CREATE TABLE email_suppressions(recipient TEXT PRIMARY KEY NOT NULL);
CREATE TRIGGER comments_parent_insert BEFORE INSERT ON comments WHEN NEW.root_id IS NOT NULL BEGIN
  SELECT RAISE(ABORT,'invalid_parent') WHERE NOT EXISTS (
    SELECT 1 FROM comments r JOIN comments p ON p.id=NEW.reply_to_id
    WHERE r.id=NEW.root_id AND r.root_id IS NULL AND r.page_id=NEW.page_id
      AND p.page_id=NEW.page_id AND COALESCE(p.root_id,p.id)=r.id
      AND p.deleted_at IS NULL AND p.moderation_status='published' AND r.moderation_status='published'
  );
END;
CREATE TRIGGER comments_identity_update BEFORE UPDATE OF id,seq,page_id,author_id,root_id,reply_to_id,client_request_id,request_hash ON comments BEGIN
  SELECT RAISE(ABORT,'comment_identity_immutable');
END;
CREATE TRIGGER comments_write_guard BEFORE INSERT ON comments BEGIN
  SELECT RAISE(ABORT,'identity_blocked') WHERE NOT EXISTS(SELECT 1 FROM identities WHERE id=NEW.author_id AND status='active');
  SELECT RAISE(ABORT,'comments_closed') WHERE NOT EXISTS(SELECT 1 FROM pages WHERE id=NEW.page_id AND comments_enabled=1);
END;
CREATE TRIGGER likes_write_guard BEFORE INSERT ON comment_likes BEGIN
  SELECT RAISE(ABORT,'identity_blocked') WHERE NOT EXISTS(SELECT 1 FROM identities WHERE id=NEW.identity_id AND status='active');
  SELECT RAISE(ABORT,'comment_unavailable') WHERE NOT EXISTS(
    SELECT 1 FROM comments c LEFT JOIN comments r ON r.id=c.root_id
    WHERE c.id=NEW.comment_id AND c.deleted_at IS NULL AND c.moderation_status='published'
      AND (c.root_id IS NULL OR r.moderation_status='published')
  );
END;
CREATE VIEW visible_comments AS
SELECT c.* FROM comments c LEFT JOIN comments r ON r.id=c.root_id
WHERE c.deleted_at IS NULL AND c.moderation_status='published'
  AND (c.root_id IS NULL OR r.moderation_status='published');
CREATE TRIGGER comments_pin_limit BEFORE UPDATE OF is_pinned ON comments
WHEN NEW.is_pinned=1 AND OLD.is_pinned=0 BEGIN
  SELECT RAISE(ABORT,'pin_limit') WHERE (SELECT COUNT(*) FROM comments WHERE page_id=NEW.page_id AND is_pinned=1)>=5;
END;
