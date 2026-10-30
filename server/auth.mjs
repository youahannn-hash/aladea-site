import crypto from "node:crypto";
import { get, now, run } from "./db.mjs";

export const SESSION_COOKIE = "aladea_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

const secureCookies =
  process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "1";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, n, r, p, saltHex, hashHex] = parts;
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, "hex"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function cookieHeader(token, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secureCookies) parts.push("Secure");
  return parts.join("; ");
}

export function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", cookieHeader(token, Math.floor(SESSION_TTL_MS / 1000)));
}

export function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookies ? "; Secure" : ""}`
  );
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function loadSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token || token.length < 32) return null;
  const hash = tokenHash(token);
  const session = get(
    `SELECT s.*, a.email
       FROM admin_sessions s
       JOIN administrators a ON a.id = s.admin_id
      WHERE s.token_hash = ?`,
    hash
  );
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    run("DELETE FROM admin_sessions WHERE token_hash = ?", hash);
    return null;
  }
  return {
    tokenHash: hash,
    csrfToken: session.csrf_token,
    admin: { id: session.admin_id, email: session.email },
    expiresAt: session.expires_at,
  };
}

export function createSession(adminId, req) {
  const token = crypto.randomBytes(32).toString("base64url");
  const csrf = crypto.randomBytes(32).toString("base64url");
  const createdAt = now();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  run(
    `INSERT INTO admin_sessions (token_hash, admin_id, csrf_token, created_at, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    tokenHash(token),
    adminId,
    csrf,
    createdAt,
    expiresAt,
    String(req.ip || "").slice(0, 80),
    String(req.get("user-agent") || "").slice(0, 300)
  );
  return { token, csrf, expiresAt };
}

export function destroySession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) {
    run("DELETE FROM admin_sessions WHERE token_hash = ?", tokenHash(token));
  }
  clearSessionCookie(res);
}

export function requireAdmin(req, res, next) {
  req.adminSession = loadSession(req);
  if (!req.adminSession) {
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const nextUrl = encodeURIComponent(req.originalUrl || "/admin");
    return res.redirect(`/admin/login?next=${nextUrl}`);
  }
  req.admin = req.adminSession.admin;
  req.csrfToken = req.adminSession.csrfToken;
  res.setHeader("Cache-Control", "no-store, private");
  next();
}

export function requireCsrf(req, res, next) {
  if (req.method !== "POST") return next();
  const supplied = String(req.body?._csrf || req.get("x-csrf-token") || "");
  const expected = String(req.adminSession?.csrfToken || "");
  if (!supplied || !expected || supplied.length !== expected.length) {
    return res.status(403).send("CSRF token mismatch");
  }
  if (!crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(403).send("CSRF token mismatch");
  }
  next();
}

export function sameOrigin(req, res, next) {
  if (req.method !== "POST") return next();
  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) {
        return res.status(403).send("Cross-origin request blocked");
      }
    } catch {
      return res.status(403).send("Invalid origin");
    }
  }
  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return res.status(403).send("Cross-site request blocked");
  }
  next();
}

export function loginRateLimited(req, email) {
  const ip = String(req.ip || "");
  const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const row = get(
    `SELECT COUNT(*) AS count
       FROM login_attempts
      WHERE created_at > ? AND (ip = ? OR lower(email) = lower(?))`,
    since,
    ip,
    String(email || "")
  );
  return Number(row.count) >= MAX_LOGIN_ATTEMPTS;
}

export function recordLoginAttempt(req, email) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  run("DELETE FROM login_attempts WHERE created_at <= ?", since);
  run(
    "INSERT INTO login_attempts (email, ip, created_at) VALUES (?, ?, ?)",
    String(email || "").slice(0, 160),
    String(req.ip || "").slice(0, 80),
    now()
  );
}

export function clearLoginAttempts(req, email) {
  run(
    "DELETE FROM login_attempts WHERE ip = ? OR lower(email) = lower(?)",
    String(req.ip || ""),
    String(email || "")
  );
}

export function findAdministratorByEmail(email) {
  return get("SELECT * FROM administrators WHERE lower(email) = lower(?)", String(email || "").trim());
}
