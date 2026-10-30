import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { get, now, run } from "./db.mjs";
import { hashPassword } from "./auth.mjs";

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

async function ask(question) {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

let email = String(process.env.ADMIN_EMAIL || "").trim();
let password = String(process.env.ADMIN_PASSWORD || "");
const reset = process.argv.includes("--reset");

if (!input.isTTY) {
  if (!email || !password) {
    console.error("В неинтерактивном режиме задайте ADMIN_EMAIL и ADMIN_PASSWORD.");
    process.exit(1);
  }
} else {
  if (!email) email = (await ask("Email администратора: ")).trim();
  if (!password) password = await ask("Пароль (минимум 10 символов): ");
}

if (!validEmail(email)) {
  console.error("Некорректный email.");
  process.exit(1);
}
if (password.length < 10) {
  console.error("Пароль должен содержать минимум 10 символов.");
  process.exit(1);
}

const existing = get("SELECT id FROM administrators WHERE lower(email) = lower(?)", email);
const timestamp = now();

if (existing) {
  if (!reset) {
    console.error("Администратор с таким email уже существует. Для смены пароля добавьте --reset.");
    process.exit(1);
  }
  run(
    "UPDATE administrators SET password_hash = ?, updated_at = ? WHERE id = ?",
    hashPassword(password),
    timestamp,
    existing.id
  );
  console.log(`Пароль обновлён: ${email}`);
} else {
  run(
    "INSERT INTO administrators (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)",
    email.toLowerCase(),
    hashPassword(password),
    timestamp,
    timestamp
  );
  console.log(`Администратор создан: ${email}`);
}
