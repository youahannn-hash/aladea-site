import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import { fileURLToPath } from "node:url";
import { cleanupSessions, get, root, run, transaction, uploadsDir } from "./db.mjs";
import { seedIfEmpty, seedStatus } from "./seed.mjs";
import {
  adminProducts,
  adminStats,
  allCategories,
  categoriesWithCounts,
  getCategory,
  getProduct,
  publicCatalog,
  recentProducts,
  slugify,
} from "./catalog.mjs";
import {
  clearLoginAttempts,
  createSession,
  destroySession,
  findAdministratorByEmail,
  loadSession,
  loginRateLimited,
  parseCookies,
  recordLoginAttempt,
  requireAdmin,
  requireCsrf,
  sameOrigin,
  setSessionCookie,
  verifyPassword,
} from "./auth.mjs";
import {
  saveUploadedImage,
  deleteUploadedImage,
  uploadProductFiles,
} from "./uploads.mjs";
import {
  catalogJson,
  categoriesPage,
  dashboardPage,
  errorPage,
  injectStorefront,
  loginPage,
  productFormPage,
  productsPage,
} from "./views.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const isProduction = process.env.NODE_ENV === "production";
const secureCookies = isProduction || process.env.COOKIE_SECURE === "1";
const LOGIN_CSRF_COOKIE = "aladea_login_csrf";
const PUBLIC_DIR = path.join(root, "docs");
const ROOT_INDEX = path.join(PUBLIC_DIR, "index.html");
const PUBLIC_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self' https://wa.me",
  "frame-ancestors 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'none'",
  "media-src 'none'",
  "worker-src 'none'",
  "manifest-src 'self'",
].join("; ");
const ADMIN_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'none'",
  "media-src 'none'",
  "worker-src 'none'",
  "manifest-src 'self'",
].join("; ");

if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((req, res, next) => {
  const admin = req.path === "/admin" || req.path.startsWith("/admin/");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cross-Origin-Opener-Policy", admin ? "same-origin" : "same-origin-allow-popups");
  res.setHeader("Content-Security-Policy", admin ? ADMIN_CSP : PUBLIC_CSP);
  if (isProduction) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (admin) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Cache-Control", "no-store, private");
  }
  next();
});

app.use(sameOrigin);
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(express.json({ limit: "100kb" }));

app.use(
  "/assets",
  express.static(path.join(PUBLIC_DIR, "assets"), {
    dotfiles: "deny",
    fallthrough: true,
    maxAge: "1h",
    setHeaders(res, filePath) {
      if (/\.(woff2|jpg|jpeg|png|webp|svg)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=604800");
      }
    },
  })
);
app.use(
  "/uploads",
  express.static(uploadsDir, {
    dotfiles: "deny",
    fallthrough: true,
    maxAge: "30d",
    immutable: true,
  })
);
app.get("/admin-assets/admin.css", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("text/css").sendFile(path.join(__dirname, "admin.css"));
});
app.get("/admin-assets/admin.js", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("application/javascript").sendFile(path.join(__dirname, "admin.js"));
});

app.get("/favicon.ico", (req, res) => res.redirect(301, "/assets/img/favicon.svg"));
for (const file of ["robots.txt", "sitemap.xml", "site.webmanifest", "privacy.html", "404.html"]) {
  app.get(`/${file}`, (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.sendFile(path.join(PUBLIC_DIR, file));
  });
}

app.get(["/", "/index.html"], (req, res, next) => {
  try {
    const template = fs.readFileSync(ROOT_INDEX, "utf8");
    const html = injectStorefront(template, publicCatalog());
    res.setHeader("Cache-Control", "public, max-age=10");
    res.type("html").send(html);
  } catch (error) {
    next(error);
  }
});

app.get("/api/catalog", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=30");
  res.json(catalogJson(publicCatalog()));
});

/* ---------- Login ---------- */

function loginCsrf(res) {
  const token = crypto.randomBytes(32).toString("base64url");
  res.cookie(LOGIN_CSRF_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookies,
    path: "/admin",
    maxAge: 10 * 60 * 1000,
  });
  return token;
}

function clearLoginCsrf(res) {
  res.clearCookie(LOGIN_CSRF_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookies,
    path: "/admin",
  });
}

function validLoginCsrf(req) {
  const cookie = parseCookies(req)[LOGIN_CSRF_COOKIE] || "";
  const supplied = String(req.body?._csrf || "");
  if (!cookie || !supplied || cookie.length !== supplied.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(supplied));
  } catch {
    return false;
  }
}

function safeNext(value) {
  const next = String(value || "");
  if (next.startsWith("/admin") && !next.startsWith("//")) return next;
  return "/admin";
}

function renderLogin(req, res, { error = "", email = "", status = 200 } = {}) {
  const token = loginCsrf(res);
  const next = safeNext(req.body?.next || req.query?.next);
  res.status(status).type("html").send(loginPage({ csrf: token, error, email, next }));
}

app.get("/admin/login", (req, res) => {
  if (loadSession(req)) return res.redirect("/admin");
  renderLogin(req, res);
});

app.post("/admin/login", (req, res) => {
  if (!validLoginCsrf(req)) {
    clearLoginCsrf(res);
    return renderLogin(req, res, { error: "Сессия входа истекла. Попробуйте ещё раз.", email: String(req.body.email || "") });
  }
  const email = String(req.body.email || "").trim().slice(0, 160);
  const password = String(req.body.password || "");
  if (loginRateLimited(req, email)) {
    clearLoginCsrf(res);
    return renderLogin(req, res, {
      error: "Слишком много попыток входа. Подождите 15 минут.",
      email,
      status: 429,
    });
  }
  const admin = findAdministratorByEmail(email);
  if (!admin || !verifyPassword(password, admin.password_hash)) {
    recordLoginAttempt(req, email);
    clearLoginCsrf(res);
    return renderLogin(req, res, { error: "Неверный email или пароль.", email, status: 401 });
  }
  clearLoginAttempts(req, email);
  const session = createSession(admin.id, req);
  clearLoginCsrf(res);
  setSessionCookie(res, session.token);
  res.redirect(safeNext(req.body.next));
});

/* ---------- Admin area ---------- */

app.use("/admin", (req, res, next) => {
  if (req.path === "/login") return next();
  return requireAdmin(req, res, next);
});

app.use("/admin", (req, res, next) => {
  if (req.path === "/logout" && req.method === "POST") {
    return requireCsrf(req, res, () => {
      destroySession(req, res);
      res.redirect("/admin/login");
    });
  }
  next();
});

app.get("/admin", (req, res) => {
  res.type("html").send(
    dashboardPage({
      admin: req.admin,
      csrf: req.csrfToken,
      stats: adminStats(),
      recent: recentProducts(6),
      flash: String(req.query.saved || ""),
    })
  );
});

app.get("/admin/products", (req, res) => {
  const filters = {
    q: String(req.query.q || "").slice(0, 120),
    category: String(req.query.category || ""),
    status: String(req.query.status || ""),
    stock: String(req.query.stock || ""),
    sort: String(req.query.sort || "order"),
  };
  const result = adminProducts({
    ...filters,
    page: Number(req.query.page || 1),
    perPage: 20,
  });
  res.type("html").send(
    productsPage({
      admin: req.admin,
      csrf: req.csrfToken,
      result,
      categories: allCategories(),
      filters,
      flash: String(req.query.saved || ""),
    })
  );
});

app.get("/admin/products/new", (req, res) => {
  const product = {
    id: null,
    name: "",
    slug: "",
    description: "",
    price: null,
    old_price: null,
    unit: "",
    category_id: null,
    main_image: "",
    published: 1,
    in_stock: 1,
    promo: 0,
    sort_order: 0,
    images: [],
  };
  res.type("html").send(
    productFormPage({
      admin: req.admin,
      csrf: req.csrfToken,
      product,
      categories: allCategories(),
      mode: "create",
      flash: "",
    })
  );
});

app.get("/admin/products/:id/edit", (req, res, next) => {
  const product = getProduct(req.params.id);
  if (!product) return next();
  res.type("html").send(
    productFormPage({
      admin: req.admin,
      csrf: req.csrfToken,
      product,
      categories: allCategories(),
      mode: "edit",
      flash: "",
    })
  );
});

/* ---------- Product form helpers ---------- */

function clean(value, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function parsePrice(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || number > 1000000) return NaN;
  return Math.round(number);
}

function parseSort(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-9999, Math.min(9999, Math.round(number))) : 0;
}

function checkbox(value) {
  return value === "1" || value === "on" || value === true ? 1 : 0;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function validImagePath(value) {
  const pathValue = String(value || "");
  return /^\/(?:assets\/img|uploads)\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(pathValue)
    ? pathValue
    : "";
}

function uniqueProductSlug(base, excludeId = 0) {
  const cleanBase = slugify(base, "product");
  let candidate = cleanBase;
  let counter = 2;
  while (get("SELECT id FROM products WHERE slug = ? AND id <> ?", candidate, Number(excludeId))) {
    candidate = `${cleanBase}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function buildProductFromBody(body, existing = null) {
  const errors = [];
  const name = clean(body.name, 140);
  const description = clean(body.description, 2000);
  const unit = clean(body.unit, 40);
  const price = parsePrice(body.price);
  const oldPrice = parsePrice(body.old_price);
  const slugInput = clean(body.slug, 80);
  const categoryId = body.category_id ? Number(body.category_id) : null;
  const images = existing?.images || [];
  const removeMain = checkbox(body.remove_main_image) === 1;

  if (name.length < 2) errors.push("Укажите название товара (минимум 2 символа).");
  if (Number.isNaN(price)) errors.push("Цена должна быть целым числом от 0 до 1 000 000 ₽.");
  if (Number.isNaN(oldPrice)) errors.push("Старая цена должна быть целым числом от 0 до 1 000 000 ₽.");
  if (categoryId && !getCategory(categoryId)) errors.push("Выбранная категория не найдена.");
  if (existing && body.main_image === "" && !existing.main_image) {
    // no-op: empty image is allowed, the storefront uses a branded fallback
  }

  const slug = uniqueProductSlug(
    slugInput || slugify(name, "product"),
    existing?.id || 0
  );

  return {
    errors,
    product: {
      id: existing?.id || null,
      name,
      slug,
      description,
      price,
      old_price: oldPrice,
      unit,
      category_id: categoryId,
      main_image: removeMain ? "" : validImagePath(body.main_image) || existing?.main_image || "",
      published: checkbox(body.published),
      in_stock: checkbox(body.in_stock),
      promo: checkbox(body.promo),
      sort_order: parseSort(body.sort_order),
      images,
    },
  };
}

async function saveUploadedSet(files) {
  const saved = [];
  try {
    const mainFile = files?.main_image_file?.[0];
    const main = mainFile ? await saveUploadedImage(mainFile) : null;
    if (main) saved.push(main.url);
    const additional = [];
    for (const file of files?.additional_files || []) {
      const image = await saveUploadedImage(file);
      additional.push(image.url);
      saved.push(image.url);
    }
    return { main, additional, saved };
  } catch (error) {
    for (const image of saved) deleteUploadedImage(image);
    throw error;
  }
}

app.post(
  "/admin/products",
  uploadProductFiles,
  requireCsrf,
  async (req, res) => {
    const { errors, product } = buildProductFromBody(req.body);
    if (errors.length) {
      return res.status(422).type("html").send(
        productFormPage({
          admin: req.admin,
          csrf: req.csrfToken,
          product,
          categories: allCategories(),
          mode: "create",
          errors,
        })
      );
    }

    let uploaded;
    try {
      uploaded = await saveUploadedSet(req.files);
    } catch (error) {
      return res.status(422).type("html").send(
        productFormPage({
          admin: req.admin,
          csrf: req.csrfToken,
          product,
          categories: allCategories(),
          mode: "create",
          errors: [error.message],
        })
      );
    }

    const mainImage = uploaded.main?.url || product.main_image || "/assets/img/og-cover.jpg";
    try {
      transaction(() => {
        const timestamp = new Date().toISOString();
        const result = run(
          `INSERT INTO products
            (name, slug, description, price, old_price, unit, category_id, main_image, published, in_stock, promo, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          product.name,
          product.slug,
          product.description,
          product.price,
          product.old_price,
          product.unit,
          product.category_id,
          mainImage,
          product.published,
          product.in_stock,
          product.promo,
          product.sort_order,
          timestamp,
          timestamp
        );
        uploaded.additional.forEach((url, index) => {
          run(
            "INSERT INTO product_images (product_id, filename, sort_order, created_at) VALUES (?, ?, ?, ?)",
            result.lastInsertRowid,
            url,
            index,
            timestamp
          );
        });
      });
    } catch (error) {
      for (const image of uploaded.saved) deleteUploadedImage(image);
      console.error(error);
      return res.status(500).type("html").send(
        productFormPage({
          admin: req.admin,
          csrf: req.csrfToken,
          product,
          categories: allCategories(),
          mode: "create",
          errors: ["Не удалось сохранить товар. Попробуйте ещё раз."],
        })
      );
    }

    res.redirect("/admin/products?saved=saved");
  }
);

app.post(
  "/admin/products/:id/edit",
  uploadProductFiles,
  requireCsrf,
  async (req, res, next) => {
    const existing = getProduct(req.params.id);
    if (!existing) return next();
    const { errors, product } = buildProductFromBody(req.body, existing);
    if (errors.length) {
      return res.status(422).type("html").send(
        productFormPage({
          admin: req.admin,
          csrf: req.csrfToken,
          product,
          categories: allCategories(),
          mode: "edit",
          errors,
        })
      );
    }

    let uploaded;
    try {
      uploaded = await saveUploadedSet(req.files);
    } catch (error) {
      return res.status(422).type("html").send(
        productFormPage({
          admin: req.admin,
          csrf: req.csrfToken,
          product,
          categories: allCategories(),
          mode: "edit",
          errors: [error.message],
        })
      );
    }

    const removeImages = normalizeList(req.body.remove_images)
      .map(String)
      .filter((url) => existing.images.includes(url) && validImagePath(url));
    const removeMain = checkbox(req.body.remove_main_image) === 1;
    const newMain = uploaded.main?.url || product.main_image || (removeMain ? "" : existing.main_image) || "";
    const oldMain = existing.main_image;
    const filesToDelete = [...removeImages];

    try {
      transaction(() => {
        const timestamp = new Date().toISOString();
        run(
          `UPDATE products
              SET name = ?, slug = ?, description = ?, price = ?, old_price = ?, unit = ?,
                  category_id = ?, main_image = ?, published = ?, in_stock = ?, promo = ?,
                  sort_order = ?, updated_at = ?
            WHERE id = ?`,
          product.name,
          product.slug,
          product.description,
          product.price,
          product.old_price,
          product.unit,
          product.category_id,
          newMain,
          product.published,
          product.in_stock,
          product.promo,
          product.sort_order,
          timestamp,
          existing.id
        );
        for (const image of removeImages) {
          run("DELETE FROM product_images WHERE product_id = ? AND filename = ?", existing.id, image);
        }
        uploaded.additional.forEach((url, index) => {
          run(
            "INSERT INTO product_images (product_id, filename, sort_order, created_at) VALUES (?, ?, ?, ?)",
            existing.id,
            url,
            existing.images.length + index,
            timestamp
          );
        });
      });
    } catch (error) {
      for (const image of uploaded.saved) deleteUploadedImage(image);
      console.error(error);
      return res.status(500).type("html").send(
        productFormPage({
          admin: req.admin,
          csrf: req.csrfToken,
          product,
          categories: allCategories(),
          mode: "edit",
          errors: ["Не удалось сохранить изменения. Попробуйте ещё раз."],
        })
      );
    }

    if ((uploaded.main || removeMain) && oldMain && oldMain !== newMain) deleteUploadedImage(oldMain);
    for (const image of filesToDelete) deleteUploadedImage(image);
    res.redirect("/admin/products?saved=saved");
  }
);

app.post("/admin/products/:id/toggle", requireCsrf, (req, res, next) => {
  const product = getProduct(req.params.id);
  if (!product) return next();
  const field = ["published", "in_stock", "promo"].includes(req.body.field)
    ? req.body.field
    : null;
  if (!field) return res.status(400).send("Unknown field");
  run(
    `UPDATE products SET ${field} = ?, updated_at = ? WHERE id = ?`,
    product[field] ? 0 : 1,
    new Date().toISOString(),
    product.id
  );
  res.redirect("/admin/products?saved=saved");
});

app.post("/admin/products/:id/delete", requireCsrf, (req, res, next) => {
  const product = getProduct(req.params.id);
  if (!product) return next();
  transaction(() => {
    run("DELETE FROM products WHERE id = ?", product.id);
  });
  deleteUploadedImage(product.main_image);
  for (const image of product.images || []) deleteUploadedImage(image);
  res.redirect("/admin/products?saved=deleted");
});

/* ---------- Categories ---------- */

app.get("/admin/categories", (req, res) => {
  res.type("html").send(
    categoriesPage({
      admin: req.admin,
      csrf: req.csrfToken,
      categories: categoriesWithCounts(),
      flash: String(req.query.saved || ""),
    })
  );
});

function buildCategory(body, existing = null) {
  const errors = [];
  const name = clean(body.name, 80);
  const sortOrder = parseSort(body.sort_order);
  if (name.length < 2) errors.push("Название категории слишком короткое.");
  const base = clean(body.slug, 80) || slugify(name, "category");
  let slug = base;
  let counter = 2;
  while (
    get(
      "SELECT id FROM categories WHERE slug = ? AND id <> ?",
      slug,
      Number(existing?.id || 0)
    )
  ) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return {
    errors,
    category: { name, slug, sort_order: sortOrder, id: existing?.id || null },
  };
}

app.post("/admin/categories", requireCsrf, (req, res) => {
  const { errors, category } = buildCategory(req.body);
  if (errors.length) {
    return res.status(422).type("html").send(
      categoriesPage({
        admin: req.admin,
        csrf: req.csrfToken,
        categories: categoriesWithCounts(),
        errors,
      })
    );
  }
  const timestamp = new Date().toISOString();
  run(
    "INSERT INTO categories (name, slug, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    category.name,
    category.slug,
    category.sort_order,
    timestamp,
    timestamp
  );
  res.redirect("/admin/categories?saved=category_saved");
});

app.post("/admin/categories/:id", requireCsrf, (req, res, next) => {
  const existing = getCategory(req.params.id);
  if (!existing) return next();
  const { errors, category } = buildCategory(req.body, existing);
  if (errors.length) {
    return res.status(422).type("html").send(
      categoriesPage({
        admin: req.admin,
        csrf: req.csrfToken,
        categories: categoriesWithCounts(),
        errors,
      })
    );
  }
  run(
    "UPDATE categories SET name = ?, slug = ?, sort_order = ?, updated_at = ? WHERE id = ?",
    category.name,
    category.slug,
    category.sort_order,
    new Date().toISOString(),
    existing.id
  );
  res.redirect("/admin/categories?saved=category_saved");
});

app.post("/admin/categories/:id/delete", requireCsrf, (req, res, next) => {
  const existing = getCategory(req.params.id);
  if (!existing) return next();
  transaction(() => {
    run("UPDATE products SET category_id = NULL, updated_at = ? WHERE category_id = ?", new Date().toISOString(), existing.id);
    run("DELETE FROM categories WHERE id = ?", existing.id);
  });
  res.redirect("/admin/categories?saved=category_deleted");
});

app.use("/admin", (req, res) => {
  res.status(404).type("html").send(errorPage({ title: "Страница не найдена", message: "Такого раздела в панели нет." }));
});

/* ---------- Public fallback ---------- */

app.use((req, res) => {
  res.status(404).type("html").sendFile(path.join(PUBLIC_DIR, "404.html"));
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  const isAdmin = req.path.startsWith("/admin");
  const status = error.name === "MulterError" || error.status === 400 ? 400 : 500;
  if (isAdmin) {
    return res.status(status).type("html").send(
      errorPage({
        title: status === 400 ? "Ошибка загрузки" : "Ошибка сервера",
        message:
          error.name === "MulterError"
            ? "Файл слишком большой или превышено количество изображений (до 8 МБ, до 9 файлов)."
            : "Не удалось выполнить действие. Попробуйте ещё раз.",
      })
    );
  }
  res.status(status).type("text").send("Ошибка сервера");
});

seedIfEmpty();
cleanupSessions();
setInterval(cleanupSessions, 60 * 60 * 1000).unref();

app.listen(PORT, HOST, () => {
  console.log(`Aladea CMS: http://${HOST}:${PORT}`);
  console.log("DB:", seedStatus());
});
