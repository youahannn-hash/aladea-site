import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(root, process.env.DATA_DIR || "data");
const uploadsDir = path.resolve(root, process.env.UPLOAD_DIR || path.join(dataDir, "uploads"));
const dbPath = path.join(dataDir, "aladea.sqlite");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS administrators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    price INTEGER,
    old_price INTEGER,
    unit TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    main_image TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
    in_stock INTEGER NOT NULL DEFAULT 1 CHECK (in_stock IN (0, 1)),
    promo INTEGER NOT NULL DEFAULT 0 CHECK (promo IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
  CREATE INDEX IF NOT EXISTS idx_products_published ON products(published);
  CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_admin ON admin_sessions(admin_id);
  CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(created_at);
`);

export const now = () => new Date().toISOString();

export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

export function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

export function run(sql, ...params) {
  const result = db.prepare(sql).run(...params);
  return {
    ...result,
    lastInsertRowid: Number(result.lastInsertRowid),
    changes: Number(result.changes),
  };
}

export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function cleanupSessions() {
  run("DELETE FROM admin_sessions WHERE expires_at <= ?", now());
  run("DELETE FROM login_attempts WHERE created_at <= ?", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
}

export { dataDir, uploadsDir, dbPath, root };
