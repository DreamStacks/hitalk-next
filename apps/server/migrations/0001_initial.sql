-- Hitalk v2 Database Schema
-- Database: Cloudflare D1 (SQLite)

-- Pages table: 管理页面元信息
CREATE TABLE pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  title TEXT,
  comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- Comments table: 存储评论内容
CREATE TABLE comments (
  id TEXT PRIMARY KEY NOT NULL,
  page_id INTEGER NOT NULL,
  parent_id TEXT,
  nick TEXT NOT NULL,
  email TEXT,
  website TEXT,
  content_md TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX idx_comments_parent_id ON comments(parent_id);
CREATE INDEX idx_comments_created_at ON comments(created_at DESC, id DESC);

-- Like records table: 点赞记录(用于防刷)
CREATE TABLE comment_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(comment_id, ip_hash),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);


CREATE TRIGGER comments_parent_insert BEFORE INSERT ON comments
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM comments WHERE id = NEW.parent_id AND page_id = NEW.page_id
  ) THEN RAISE(ABORT, 'invalid_parent') END;
-- Keep headroom for D1 cascade/like/count triggers (verified in workerd tests).
  SELECT CASE WHEN (
    WITH RECURSIVE ancestors(id, parent_id) AS (
      SELECT id, parent_id FROM comments WHERE id = NEW.parent_id
      UNION ALL
      SELECT c.id, c.parent_id FROM comments c JOIN ancestors a ON c.id = a.parent_id
    ) SELECT COUNT(*) FROM ancestors
  ) >= 8 THEN RAISE(ABORT, 'reply_depth_exceeded') END;
END;

-- Moving comments is not supported; preserve an acyclic, single-page tree.
CREATE TRIGGER comments_identity_update BEFORE UPDATE OF id, page_id, parent_id ON comments
WHEN NEW.id IS NOT OLD.id OR NEW.page_id IS NOT OLD.page_id OR NEW.parent_id IS NOT OLD.parent_id
BEGIN
  SELECT RAISE(ABORT, 'comment_identity_immutable');
END;

CREATE TRIGGER comments_count_insert AFTER INSERT ON comments BEGIN
  UPDATE pages SET comment_count = comment_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = NEW.page_id;
END;
CREATE TRIGGER comments_count_delete AFTER DELETE ON comments BEGIN
  UPDATE pages SET comment_count = MAX(0, comment_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = OLD.page_id;
END;
CREATE TRIGGER likes_count_insert AFTER INSERT ON comment_likes BEGIN
  UPDATE comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
END;
CREATE TRIGGER likes_count_delete AFTER DELETE ON comment_likes BEGIN
  UPDATE comments SET like_count = MAX(0, like_count - 1) WHERE id = OLD.comment_id;
END;
CREATE INDEX idx_comments_roots ON comments(page_id, parent_id, is_pinned DESC, created_at DESC, id DESC);
