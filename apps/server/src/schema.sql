-- Hitalk v2 Database Schema
-- Database: Cloudflare D1 (SQLite)

-- Pages table: 管理页面元信息
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  title TEXT,
  comment_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pages_path ON pages(path);

-- Comments table: 存储评论内容
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  page_id INTEGER NOT NULL,
  parent_id TEXT,
  nick TEXT NOT NULL,
  email TEXT,
  website TEXT,
  content_md TEXT NOT NULL,
  content_html TEXT NOT NULL,
  ua TEXT,
  ip_hash TEXT,
  like_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT 0,
  is_admin BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_page_id ON comments(page_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);

-- Like records table: 点赞记录(用于防刷)
CREATE TABLE IF NOT EXISTS comment_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(comment_id, ip_hash),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_ip_hash ON comment_likes(ip_hash);
