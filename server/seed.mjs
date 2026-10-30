import { all, get, now, run, transaction } from "./db.mjs";

const categories = [
  { name: "Торты", slug: "cakes", sort_order: 10 },
  { name: "Десерты", slug: "desserts", sort_order: 20 },
  { name: "Выпечка", slug: "pastry", sort_order: 30 },
  { name: "Букеты", slug: "bouquets", sort_order: 40 },
];

const products = [
  {
    name: "Медовик", slug: "medovik", category: "cakes", price: 1500, unit: "1,2 кг", sort: 10,
    description: "Тонкие коржи, крем на сметане и обжаренный грецкий орех.",
    image: "/assets/img/product-medovik.jpg",
  },
  {
    name: "Чизкейк «Сан-Себастьян»", slug: "san-sebastian", category: "cakes", price: 1500, unit: "1,4 кг", sort: 20,
    description: "Нежный сливочный вкус и карамельная корочка. Подаём с ягодами.",
    image: "/assets/img/product-cheesecake.jpg",
  },
  {
    name: "Шоколадный чизкейк", slug: "chocolate-cheesecake", category: "cakes", price: 1700, unit: "1,2 кг", sort: 30,
    description: "Шоколадный бисквит, сливочный чизкейк и мраморная глазурь.",
    image: "/assets/img/product-chocolate-cheesecake.jpg",
  },
  {
    name: "Ягодный торт", slug: "berry-cake", category: "cakes", price: 2100, unit: "1,2 кг", sort: 40,
    description: "Ванильный бисквит, сливочный крем, свежие ягоды и шоколадный дрип.",
    image: "/assets/img/product-berry-cake.jpg",
  },
  {
    name: "Три шоколада", slug: "three-chocolate", category: "cakes", price: 1900, unit: "1,2 кг", sort: 50,
    description: "Три слоя мусса: молочный, тёмный и белый шоколад.",
    image: "/assets/img/product-three-chocolate.jpg",
  },
  {
    name: "Профитроли с вишней", slug: "profiteroles", category: "desserts", price: 350, unit: "6 шт", sort: 10,
    description: "Заварные профитроли, сливочный крем и вишнёвый конфитюр.",
    image: "/assets/img/product-profiteroles.jpg",
  },
  {
    name: "Трубочки с карамелью", slug: "tubes", category: "desserts", price: 120, unit: "1 шт", sort: 20,
    description: "Хрустящее вафельное тесто и варёная сгущёнка.",
    image: "/assets/img/product-tubes.jpg",
  },
  {
    name: "Пончики", slug: "donuts", category: "desserts", price: 80, unit: "1 шт", sort: 30,
    description: "Пышные пончики с глазурью и посыпкой. Ассорти вкусов.",
    image: "/assets/img/product-donuts.jpg",
  },
  {
    name: "Круассан с шоколадом", slug: "croissant", category: "pastry", price: 120, unit: "1 шт", sort: 10,
    description: "Слоёное тесто и шоколадная начинка. Свежий каждое утро.",
    image: "/assets/img/product-croissant.jpg",
  },
  {
    name: "Шоколадные букеты", slug: "bouquet", category: "bouquets", price: null, unit: "по запросу", sort: 10,
    description: "Авторские композиции из шоколада. Соберём к празднику и упакуем.",
    image: "/assets/img/placeholder-bouquet.jpg",
  },
  {
    name: "Эклеры", slug: "eclairs", category: "desserts", price: null, unit: "по запросу", sort: 40,
    description: "Классические эклеры с заварным кремом. Начинки и декор уточним.",
    image: "/assets/img/placeholder-eclairs.jpg",
  },
  {
    name: "Наполеон", slug: "napoleon", category: "cakes", price: null, unit: "по запросу", sort: 60,
    description: "Слоёный торт с заварным кремом. Вес и оформление подберём под заказ.",
    image: "/assets/img/placeholder-napoleon.jpg",
  },
];

function insertCategories() {
  const created = {};
  for (const category of categories) {
    const existing = get("SELECT * FROM categories WHERE slug = ?", category.slug);
    if (existing) {
      created[category.slug] = existing.id;
      continue;
    }
    const timestamp = now();
    const result = run(
      "INSERT INTO categories (name, slug, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      category.name, category.slug, category.sort_order, timestamp, timestamp
    );
    created[category.slug] = result.lastInsertRowid;
  }
  return created;
}

function insertProducts(categoryIds) {
  const timestamp = now();
  for (const product of products) {
    if (get("SELECT id FROM products WHERE slug = ?", product.slug)) continue;
    run(
      `INSERT INTO products
        (name, slug, description, price, old_price, unit, category_id, main_image, published, in_stock, promo, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?, ?)`,
      product.name,
      product.slug,
      product.description,
      product.price,
      null,
      product.unit,
      categoryIds[product.category] || null,
      product.image,
      product.sort,
      timestamp,
      timestamp
    );
  }
}

export function seedIfEmpty() {
  const productCount = Number(get("SELECT COUNT(*) AS count FROM products").count);
  if (productCount > 0) return { seeded: false, products: productCount };

  return transaction(() => {
    const categoryIds = insertCategories();
    insertProducts(categoryIds);
    const count = Number(get("SELECT COUNT(*) AS count FROM products").count);
    return { seeded: true, products: count };
  });
}

export function seedStatus() {
  return {
    categories: Number(get("SELECT COUNT(*) AS count FROM categories").count),
    products: Number(get("SELECT COUNT(*) AS count FROM products").count),
  };
}

if (process.argv[1] && process.argv[1].endsWith("seed.mjs")) {
  const result = seedIfEmpty();
  console.log(result.seeded ? `База заполнена: ${result.products} товаров.` : `База уже содержит ${result.products} товаров.`);
  console.log(all("SELECT name, slug FROM categories ORDER BY sort_order, id"));
}
