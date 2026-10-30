import { all, get } from "./db.mjs";

export function slugify(value, fallback = "item") {
  const map = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
    й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
    у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
    э: "e", ю: "yu", я: "ya",
  };
  const slug = String(value || "")
    .toLowerCase()
    .split("")
    .map((char) => map[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return slug || `${fallback}-${Date.now().toString(36)}`;
}

function attachImages(products) {
  if (!products.length) return products;
  const placeholders = products.map(() => "?").join(",");
  const images = all(
    `SELECT id, product_id, filename, sort_order
       FROM product_images
      WHERE product_id IN (${placeholders})
      ORDER BY sort_order, id`,
    ...products.map((product) => product.id)
  );
  const byProduct = new Map();
  for (const image of images) {
    if (!byProduct.has(image.product_id)) byProduct.set(image.product_id, []);
    byProduct.get(image.product_id).push(image.filename);
  }
  return products.map((product) => {
    const extra = byProduct.get(product.id) || [];
    const images = [product.main_image, ...extra].filter(Boolean);
    return { ...product, images: [...new Set(images)] };
  });
}

export function publicCatalog() {
  const categories = all(
    `SELECT c.id, c.name, c.slug, c.sort_order
       FROM categories c
      WHERE EXISTS (
        SELECT 1 FROM products p WHERE p.category_id = c.id AND p.published = 1
      )
      ORDER BY c.sort_order, c.id`
  );
  const products = all(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.published = 1
      ORDER BY COALESCE(c.sort_order, 9999), p.sort_order, p.id`
  );
  const withImages = attachImages(products);
  return { categories, products: withImages };
}

export function categoriesWithCounts() {
  return all(
    `SELECT c.*, COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.sort_order, c.id`
  );
}

export function allCategories() {
  return all("SELECT * FROM categories ORDER BY sort_order, id");
}

export function getCategory(id) {
  return get("SELECT * FROM categories WHERE id = ?", Number(id));
}

export function adminStats() {
  return {
    total: Number(get("SELECT COUNT(*) AS n FROM products").n),
    published: Number(get("SELECT COUNT(*) AS n FROM products WHERE published = 1").n),
    hidden: Number(get("SELECT COUNT(*) AS n FROM products WHERE published = 0").n),
    outOfStock: Number(get("SELECT COUNT(*) AS n FROM products WHERE in_stock = 0").n),
    promo: Number(get("SELECT COUNT(*) AS n FROM products WHERE promo = 1").n),
    noPrice: Number(get("SELECT COUNT(*) AS n FROM products WHERE price IS NULL").n),
    categories: Number(get("SELECT COUNT(*) AS n FROM categories").n),
  };
}

export function recentProducts(limit = 5) {
  return all(
    `SELECT p.*, c.name AS category_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.updated_at DESC, p.id DESC LIMIT ?`,
    Number(limit)
  );
}

export function adminProducts(options = {}) {
  const {
    q = "",
    category = "",
    status = "",
    stock = "",
    sort = "order",
    page = 1,
    perPage = 20,
  } = options;

  const where = [];
  const params = [];
  if (q) {
    where.push("(p.name LIKE ? OR p.description LIKE ? OR p.slug LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (category) {
    where.push("p.category_id = ?");
    params.push(Number(category));
  }
  if (status === "published" || status === "hidden") {
    where.push("p.published = ?");
    params.push(status === "published" ? 1 : 0);
  }
  if (stock === "in" || stock === "out") {
    where.push("p.in_stock = ?");
    params.push(stock === "in" ? 1 : 0);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderMap = {
    order: "COALESCE(c.sort_order, 9999), p.sort_order, p.id",
    name: "p.name COLLATE NOCASE",
    price: "p.price IS NULL, p.price",
    updated: "p.updated_at DESC",
  };
  const order = orderMap[sort] || orderMap.order;
  const safePage = Math.max(1, Number(page) || 1);
  const safePerPage = Math.min(100, Math.max(5, Number(perPage) || 20));
  const offset = (safePage - 1) * safePerPage;

  const total = Number(
    get(`SELECT COUNT(*) AS n FROM products p ${whereSql}`, ...params).n
  );
  const rows = all(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ${whereSql}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`,
    ...params,
    safePerPage,
    offset
  );

  return {
    rows: attachImages(rows),
    total,
    page: safePage,
    perPage: safePerPage,
    pages: Math.max(1, Math.ceil(total / safePerPage)),
  };
}

export function getProduct(id) {
  const product = get(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?`,
    Number(id)
  );
  if (!product) return null;
  const imageRows = all(
    "SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id",
    product.id
  );
  return { ...product, images: imageRows.map((image) => image.filename), imageRows };
}

export function productCountByCategory(categoryId) {
  return Number(
    get("SELECT COUNT(*) AS n FROM products WHERE category_id = ?", Number(categoryId)).n
  );
}
