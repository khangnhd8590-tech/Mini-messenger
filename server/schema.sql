-- ================== USERS ==================
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) NOT NULL,
  password_hash TEXT NOT NULL,
  status        VARCHAR(10) NOT NULL DEFAULT 'offline',   -- online | offline
  last_seen     TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));

-- ================== GROUPS ==================
CREATE TABLE IF NOT EXISTS groups (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   INT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_gm_user ON group_members(user_id);

-- ================== MESSAGES ==================
CREATE TABLE IF NOT EXISTS messages (
  id           SERIAL PRIMARY KEY,
  sender_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id  INT REFERENCES users(id) ON DELETE CASCADE,
  group_id     INT REFERENCES groups(id) ON DELETE CASCADE,
  content      TEXT NOT NULL DEFAULT '',
  type         VARCHAR(10) NOT NULL DEFAULT 'text' CHECK (type IN ('text','image','video','file')),
  file_name    TEXT,
  file_size    BIGINT,
  file_path    TEXT,          -- tên file ngẫu nhiên (uuid) trong thư mục uploads/
  file_mime    TEXT,
  reply_to_id  INT REFERENCES messages(id) ON DELETE SET NULL,
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  recalled_at  TIMESTAMPTZ,   -- thu hồi tin nhắn (với mọi người)
  sequence_id  VARCHAR(100),  -- id do client sinh, dùng cho ACK/Retry/Idempotency
  delivered_at TIMESTAMPTZ,   -- "đã nhận"
  is_read      BOOLEAN NOT NULL DEFAULT false,  -- "đã xem" (chat 1-1)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Phải là chat 1-1 HOẶC chat nhóm, không được cả hai
  CHECK ((receiver_id IS NULL) <> (group_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_msg_group ON messages(group_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_msg_dm    ON messages(sender_id, receiver_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_msg_unread ON messages(receiver_id, is_read);

-- Nâng cấp cho DB đã tạo từ trước (chạy lại an toàn)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS recalled_at TIMESTAMPTZ;
-- Idempotency: client gửi lại cùng sequence_id thì không ghi trùng
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sequence_id VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS uq_msg_sequence ON messages(sender_id, sequence_id) WHERE sequence_id IS NOT NULL;

-- ================== BẢNG BỔ SUNG ==================

-- "Xóa ở phía tôi": chỉ ẩn tin nhắn với người xóa
CREATE TABLE IF NOT EXISTS message_deletions (
  message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  emoji      VARCHAR(8) NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_mentions (
  message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);

-- Mốc "đã đọc đến đâu" của từng thành viên trong nhóm (dùng đếm tin chưa đọc)
CREATE TABLE IF NOT EXISTS group_reads (
  group_id             INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id              INT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  last_read_message_id INT NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, user_id)
);
