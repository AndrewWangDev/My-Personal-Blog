-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- 生成的 UUID 或 Turnstile Session ID
    email TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT, -- 如果使用 Google 登录则为空
    auth_provider TEXT DEFAULT 'local', -- 'local' 或 'google'
    role TEXT DEFAULT 'user', -- 'admin' 或 'user'
    age TEXT,
    bio TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 1.5. 已注销用户表（用于防止恶意刷注册，保留邮箱1个月）
CREATE TABLE IF NOT EXISTS deleted_users (
    email TEXT PRIMARY KEY,
    expires_at DATETIME
);

-- 2. 博客评论表
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL, -- 对应 Astro 的文章 id
    user_id TEXT NOT NULL,
    parent_id INTEGER, -- 用于子评论，若为空则是顶级评论
    content TEXT NOT NULL,
    is_deleted INTEGER DEFAULT 0, -- 软删除标记: 0 正常, 1 已删除
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 3. 互动表（统一管理点赞和收藏，节省空间）
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    target_type TEXT NOT NULL, -- 'post_like', 'post_bookmark', 'comment_like', 'news_like', 'news_bookmark', etc.
    target_id TEXT NOT NULL, -- 文章 id 或 评论 id
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, target_type, target_id) -- 防止重复点赞/收藏
);

-- 4. 资源展示表
CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    author TEXT DEFAULT 'Andrew Wang',
    logo_url TEXT,
    cover_image_url TEXT,
    summary TEXT NOT NULL,
    details TEXT,
    tags TEXT, -- JSON 格式字符串，如 '["PySide", "Cloudflare"]'
    github_url TEXT,
    download_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. 新闻前沿表
CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT DEFAULT 'Andrew Wang',
    thumbnail_url TEXT,
    cover_url TEXT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. 博客文章表
CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT DEFAULT 'Andrew Wang',
    summary TEXT,
    thumbnail_url TEXT,
    content TEXT NOT NULL, -- Markdown 格式正文
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. 站务通知表
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT NOT NULL,
    target_user_id TEXT, -- NULL 代表所有用户，关联 users(id)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 7.1 用户通知已读记录表
CREATE TABLE IF NOT EXISTS notification_reads (
    user_id TEXT NOT NULL,
    notification_id INTEGER NOT NULL,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, notification_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);

-- 8. 橱窗展示表
CREATE TABLE IF NOT EXISTS showcase (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_url TEXT NOT NULL,
    link_url TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. 系统设置表
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. 投诉反馈表
CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    result TEXT,
    is_deleted_by_user INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 预设默认的系统投诉上限 (如果不存在则插入)
INSERT OR IGNORE INTO settings (key, value) VALUES ('max_user_complaints_daily', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('max_total_complaints_daily', '100');

-- 11. Passkey 通行密钥表
CREATE TABLE IF NOT EXISTS user_passkeys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    public_key TEXT NOT NULL,
    counter INTEGER DEFAULT 0,
    transports TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON user_passkeys(user_id);

-- 12. 第三方 OAuth 绑定表
CREATE TABLE IF NOT EXISTS user_oauth_accounts (
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL, -- 'google' 或 'github'
    provider_user_id TEXT NOT NULL,
    provider_email TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, provider),
    UNIQUE(provider, provider_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_oauth_provider_id ON user_oauth_accounts(provider, provider_user_id);

-- 13. 邮箱验证码表
CREATE TABLE IF NOT EXISTS email_verifications (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at DATETIME NOT NULL
);

-- 14. 邮件发送审计日志表
CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    domain TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_email ON email_logs(email);