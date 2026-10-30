const money = (value) =>
  value == null
    ? "Цена по запросу"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value)) + " ₽";

const plural = (n, one, few, many) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });

const imageUrl = (value) => {
  const path = String(value || "");
  return /^\/(?:assets\/img|uploads)\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(path)
    ? path
    : "/assets/img/og-cover.jpg";
};

function productCard(product) {
  const request = product.price == null;
  const inStock = Boolean(product.in_stock);
  const images = (product.images?.length ? product.images : [product.main_image])
    .map(imageUrl)
    .filter(Boolean);
  const mainImage = images[0] || "/assets/img/og-cover.jpg";
  const gallery = [...new Set(images)].join("|");
  const category = product.category_name || "Без категории";
  const categorySlug = product.category_slug || "uncategorized";
  const oldPrice =
    product.old_price != null && product.price != null && Number(product.old_price) > Number(product.price)
      ? `<s class="product__old">${esc(money(product.old_price))}</s>`
      : "";
  const badge = product.promo
    ? '<span class="badge badge--pink">Акция</span>'
    : "";
  const quick = !request && inStock
    ? `<button class="product__quick js-add" type="button" aria-label="Добавить «${esc(product.name)}» в корзину">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.7"/></svg>
        </button>`
    : "";
  const action = request
    ? `<button class="product__add" type="button" data-open-product aria-label="Уточнить цену: ${esc(product.name)}">Уточнить</button>`
    : !inStock
      ? `<button class="product__add" type="button" disabled>Нет в наличии</button>`
      : `<button class="product__add js-add" type="button">В корзину</button>`;

  return `          <article class="product${request ? " product--request" : ""}${!inStock ? " product--out" : ""}" data-category="${esc(categorySlug)}" data-id="${esc(product.id)}" data-name="${esc(product.name)}" data-price="${request ? "" : esc(product.price)}" data-unit="${esc(product.unit || "")}" data-image="${esc(mainImage)}"${request ? ' data-request="true"' : ""} data-stock="${inStock ? "1" : "0"}" data-gallery="${esc(gallery)}">
            <div class="product__media">
              <img src="${esc(mainImage)}" alt="${esc(product.name)}" width="800" height="800" loading="lazy">
              ${badge}
              ${quick}
            </div>
            <div class="product__body">
              <div class="product__meta"><span>${esc(category)}</span><span>${esc(product.unit || "по запросу")}</span></div>
              <h3><button class="product__title" type="button" data-open-product>${esc(product.name)}</button></h3>
              <p>${esc(product.description)}</p>
              <div class="product__bottom">
                <span class="product__price${request ? " product__price--request" : ""}">${esc(money(product.price))}</span>
                ${oldPrice}
                ${action}
              </div>
            </div>
          </article>`;
}

export function renderProductCards(products) {
  if (!products.length) {
    return '<p class="catalog-empty">Пока здесь нет опубликованных товаров.</p>';
  }
  return products.map(productCard).join("\n\n");
}

export function renderFilters(categories) {
  return [
    '<button class="filter is-active" type="button" data-filter="all" aria-pressed="true">Всё</button>',
    ...categories.map(
      (category) =>
        `<button class="filter" type="button" data-filter="${esc(category.slug)}" aria-pressed="false">${esc(category.name)}</button>`
    ),
  ].join("\n            ");
}

export function renderCatalogCount(count) {
  return `${count} ${plural(count, "позиция", "позиции", "позиций")}`;
}

export function injectStorefront(html, catalog) {
  const filters = renderFilters(catalog.categories);
  const cards = renderProductCards(catalog.products);
  const count = renderCatalogCount(catalog.products.length);
  return html
    .replace(
      /<!-- FILTERS_START -->[\s\S]*?<!-- FILTERS_END -->/,
      `<!-- FILTERS_START -->\n            ${filters}\n            <!-- FILTERS_END -->`
    )
    .replace(
      /<!-- PRODUCTS_START -->[\s\S]*?<!-- PRODUCTS_END -->/,
      `<!-- PRODUCTS_START -->\n${cards}\n          <!-- PRODUCTS_END -->`
    )
    .replace(
      /<!-- COUNT_START -->[\s\S]*?<!-- COUNT_END -->/,
      `<!-- COUNT_START -->${esc(count)}<!-- COUNT_END -->`
    );
}

export function catalogJson(catalog) {
  return {
    categories: catalog.categories.map(({ id, name, slug }) => ({ id, name, slug })),
    products: catalog.products.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: product.price,
      oldPrice: product.old_price,
      unit: product.unit,
      category: product.category_slug,
      categoryName: product.category_name,
      image: imageUrl(product.main_image),
      images: (product.images || []).map(imageUrl),
      inStock: Boolean(product.in_stock),
      promo: Boolean(product.promo),
    })),
  };
}

function adminFlash(flash) {
  if (!flash) return "";
  const messages = {
    saved: "Изменения сохранены.",
    deleted: "Товар удалён.",
    hidden: "Товар скрыт с витрины.",
    published: "Товар опубликован.",
    category_saved: "Категория сохранена.",
    category_deleted: "Категория удалена, товары перенесены в «Без категории».",
    image_deleted: "Изображение удалено.",
    password: "Пароль обновлён.",
  };
  const text = messages[flash];
  if (!text) return "";
  return `<div class="admin-flash" role="status">${esc(text)}</div>`;
}

function adminShell({ title, body, admin, csrf, active = "", flash = "" }) {
  const nav = [
    ["/admin", "Обзор", "dashboard"],
    ["/admin/products", "Товары", "products"],
    ["/admin/categories", "Категории", "categories"],
  ];
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#0E5F5B">
  <title>${esc(title)} — АлаДея CMS</title>
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/css/fonts.css">
  <link rel="stylesheet" href="/admin-assets/admin.css">
  <script src="/admin-assets/admin.js" defer></script>
</head>
<body class="admin-body">
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <a class="admin-brand" href="/admin" aria-label="АлаДея CMS — обзор">
        <span>Ала<span>Дея</span></span>
        <small>управление сайтом</small>
      </a>
      <nav class="admin-nav" aria-label="Администрирование">
        ${nav
          .map(
            ([href, label, key]) =>
              `<a href="${href}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`
          )
          .join("\n        ")}
      </nav>
      <div class="admin-sidebar__bottom">
        <a class="admin-link-site" href="/" target="_blank" rel="noopener noreferrer">Открыть сайт ↗</a>
        <span class="admin-user">${esc(admin.email)}</span>
        <form method="post" action="/admin/logout">
          <input type="hidden" name="_csrf" value="${esc(csrf)}">
          <button class="admin-logout" type="submit">Выйти</button>
        </form>
      </div>
    </aside>
    <main class="admin-main">
      <header class="admin-topbar">
        <button class="admin-menu-toggle" type="button" data-admin-menu aria-label="Открыть меню">Меню</button>
        <span>${esc(title)}</span>
        <a href="/" target="_blank" rel="noopener noreferrer">Сайт ↗</a>
      </header>
      ${adminFlash(flash)}
      ${body}
    </main>
  </div>
</body>
</html>`;
}

export function loginPage({ csrf, error = "", email = "", next = "/admin" }) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#0E5F5B">
  <title>Вход — АлаДея CMS</title>
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/css/fonts.css">
  <link rel="stylesheet" href="/admin-assets/admin.css">
</head>
<body class="admin-login-body">
  <main class="admin-login">
    <a class="admin-brand admin-brand--login" href="/" aria-label="АлаДея — на сайт">
      <span>Ала<span>Дея</span></span>
      <small>управление сайтом</small>
    </a>
    <div class="admin-login__card">
      <p class="admin-eyebrow">Вход в панель</p>
      <h1>Управление<br><em>витриной.</em></h1>
      <p class="admin-login__intro">Доступ только для администраторов кондитерской.</p>
      ${error ? `<div class="admin-error" role="alert">${esc(error)}</div>` : ""}
      <form method="post" action="/admin/login" class="admin-form">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <input type="hidden" name="next" value="${esc(next)}">
        <label>Email
          <input type="email" name="email" autocomplete="username" value="${esc(email)}" maxlength="160" required autofocus>
        </label>
        <label>Пароль
          <input type="password" name="password" autocomplete="current-password" minlength="10" maxlength="200" required>
        </label>
        <button class="admin-button admin-button--primary" type="submit">Войти</button>
      </form>
      <a class="admin-back" href="/">← Вернуться на сайт</a>
    </div>
  </main>
</body>
</html>`;
}

export function dashboardPage({ admin, csrf, stats, recent, flash }) {
  const statCards = [
    ["Всего товаров", stats.total, "/admin/products"],
    ["Опубликовано", stats.published, "/admin/products?status=published"],
    ["Скрыто", stats.hidden, "/admin/products?status=hidden"],
    ["Нет в наличии", stats.outOfStock, "/admin/products?stock=out"],
    ["Акции", stats.promo, "/admin/products"],
    ["Без цены", stats.noPrice, "/admin/products"],
  ];
  const rows = recent
    .map(
      (product) => `<tr>
        <td><div class="admin-product-cell"><img src="${esc(imageUrl(product.main_image))}" alt="" width="48" height="48"><div><strong>${esc(product.name)}</strong><small>${esc(product.category_name || "Без категории")}</small></div></div></td>
        <td>${esc(money(product.price))}</td>
        <td>${product.published ? "Опубликован" : "Скрыт"}</td>
        <td><a href="/admin/products/${product.id}/edit">Изменить</a></td>
      </tr>`
    )
    .join("");
  return adminShell({
    title: "Обзор",
    admin,
    csrf,
    active: "dashboard",
    flash,
    body: `<section class="admin-heading">
      <p class="admin-eyebrow">CMS · ${new Date().toLocaleDateString("ru-RU")}</p>
      <h1>Добрый день.</h1>
      <p>Всё, что меняется здесь, сразу появляется на витрине сайта.</p>
    </section>
    <div class="admin-stats">
      ${statCards
        .map(
          ([label, value, href]) =>
            `<a class="admin-stat" href="${href}"><span>${esc(label)}</span><strong>${esc(value)}</strong></a>`
        )
        .join("")}
    </div>
    <section class="admin-panel">
      <div class="admin-panel__head"><h2>Последние изменения</h2><a href="/admin/products">Все товары →</a></div>
      <table class="admin-table">
        <thead><tr><th>Товар</th><th>Цена</th><th>Статус</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">Товаров пока нет.</td></tr>'}</tbody>
      </table>
    </section>
    <div class="admin-quick-actions">
      <a class="admin-button admin-button--primary" href="/admin/products/new">+ Добавить товар</a>
      <a class="admin-button" href="/admin/categories">Категории</a>
      <a class="admin-button" href="/" target="_blank" rel="noopener noreferrer">Посмотреть сайт ↗</a>
    </div>`,
  });
}

function pagination(page, pages, query) {
  if (pages <= 1) return "";
  const make = (number) => {
    const params = new URLSearchParams(query);
    params.set("page", String(number));
    return `?${params.toString()}`;
  };
  const items = [];
  for (let i = 1; i <= pages; i += 1) {
    if (pages > 9 && i !== 1 && i !== pages && Math.abs(i - page) > 1) {
      if (items.at(-1) !== "…") items.push("…");
      continue;
    }
    items.push(
      i === page
        ? `<span class="is-current">${i}</span>`
        : `<a href="${make(i)}">${i}</a>`
    );
  }
  return `<div class="admin-pagination">${items.join("")}</div>`;
}

export function productsPage({ admin, csrf, result, categories, filters, flash }) {
  const rows = result.rows
    .map(
      (product) => `<tr>
        <td><div class="admin-product-cell"><img src="${esc(imageUrl(product.main_image))}" alt="" width="52" height="52"><div><strong>${esc(product.name)}</strong><small>${esc(product.slug)}</small></div></div></td>
        <td>${esc(product.category_name || "Без категории")}</td>
        <td>${esc(money(product.price))}${product.old_price ? `<small class="admin-old">${esc(money(product.old_price))}</small>` : ""}</td>
        <td><div class="admin-badges"><span class="admin-badge ${product.published ? "is-on" : "is-off"}">${product.published ? "Опубликован" : "Скрыт"}</span><span class="admin-badge ${product.in_stock ? "is-on" : "is-off"}">${product.in_stock ? "В наличии" : "Нет"}</span>${product.promo ? '<span class="admin-badge is-promo">Акция</span>' : ""}</div></td>
        <td>${esc(product.sort_order)}</td>
        <td><div class="admin-row-actions">
          <a href="/admin/products/${product.id}/edit">Изменить</a>
          <form method="post" action="/admin/products/${product.id}/toggle">
            <input type="hidden" name="_csrf" value="${esc(csrf)}">
            <input type="hidden" name="field" value="published">
            <button type="submit">${product.published ? "Скрыть" : "Опубликовать"}</button>
          </form>
          <form method="post" action="/admin/products/${product.id}/toggle">
            <input type="hidden" name="_csrf" value="${esc(csrf)}">
            <input type="hidden" name="field" value="in_stock">
            <button type="submit">${product.in_stock ? "Нет в наличии" : "В наличии"}</button>
          </form>
          <form method="post" action="/admin/products/${product.id}/toggle">
            <input type="hidden" name="_csrf" value="${esc(csrf)}">
            <input type="hidden" name="field" value="promo">
            <button type="submit">${product.promo ? "Убрать акцию" : "Акция"}</button>
          </form>
        </div></td>
      </tr>`
    )
    .join("");
  const categoryOptions = [
    '<option value="">Все категории</option>',
    ...categories.map(
      (category) =>
        `<option value="${category.id}"${String(filters.category) === String(category.id) ? " selected" : ""}>${esc(category.name)}</option>`
    ),
  ].join("");
  const statusOptions = [
    ["", "Все статусы"],
    ["published", "Опубликованные"],
    ["hidden", "Скрытые"],
  ]
    .map(([value, label]) => `<option value="${value}"${filters.status === value ? " selected" : ""}>${label}</option>`)
    .join("");
  const query = { q: filters.q, category: filters.category, status: filters.status, stock: filters.stock, sort: filters.sort };
  return adminShell({
    title: "Товары",
    admin,
    csrf,
    active: "products",
    flash,
    body: `<section class="admin-heading admin-heading--row">
      <div><p class="admin-eyebrow">Каталог</p><h1>Товары</h1><p>${result.total} ${plural(result.total, "позиция", "позиции", "позиций")} в каталоге.</p></div>
      <a class="admin-button admin-button--primary" href="/admin/products/new">+ Добавить товар</a>
    </section>
    <form class="admin-filters" method="get" action="/admin/products">
      <label class="admin-search"><span>Поиск</span><input type="search" name="q" value="${esc(filters.q)}" placeholder="Название или описание"></label>
      <label><span>Категория</span><select name="category">${categoryOptions}</select></label>
      <label><span>Статус</span><select name="status">${statusOptions}</select></label>
      <label><span>Наличие</span><select name="stock"><option value="">Все</option><option value="in"${filters.stock === "in" ? " selected" : ""}>В наличии</option><option value="out"${filters.stock === "out" ? " selected" : ""}>Нет в наличии</option></select></label>
      <label><span>Сортировка</span><select name="sort"><option value="order"${filters.sort === "order" ? " selected" : ""}>По порядку</option><option value="name"${filters.sort === "name" ? " selected" : ""}>По названию</option><option value="price"${filters.sort === "price" ? " selected" : ""}>По цене</option><option value="updated"${filters.sort === "updated" ? " selected" : ""}>По обновлению</option></select></label>
      <button class="admin-button" type="submit">Применить</button>
      <a class="admin-reset" href="/admin/products">Сбросить</a>
    </form>
    <section class="admin-panel">
      <div class="admin-table-wrap"><table class="admin-table admin-table--products">
        <thead><tr><th>Товар</th><th>Категория</th><th>Цена</th><th>Статус</th><th>Порядок</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">Ничего не найдено. <a href="/admin/products/new">Добавить товар</a></td></tr>'}</tbody>
      </table></div>
      ${pagination(result.page, result.pages, query)}
    </section>`,
  });
}

export function productFormPage({ admin, csrf, product, categories, errors = [], flash, mode }) {
  const isEdit = mode === "edit";
  const gallery = (product.images || [])
    .map((image) => {
      const url = typeof image === "string" ? image : image.filename;
      return `<li class="admin-gallery-item">
        <img src="${esc(imageUrl(url))}" alt="" width="100" height="100">
        <label><input type="checkbox" name="remove_images" value="${esc(url)}"> Удалить</label>
      </li>`;
    })
    .join("");
  return adminShell({
    title: isEdit ? "Редактировать товар" : "Новый товар",
    admin,
    csrf,
    active: "products",
    flash,
    body: `<section class="admin-heading admin-heading--row">
      <div><p class="admin-eyebrow">Каталог / ${isEdit ? "Редактирование" : "Создание"}</p><h1>${isEdit ? esc(product.name) : "Новый товар"}</h1><p>${isEdit ? "Изменения появятся на сайте после сохранения." : "Заполните карточку и загрузите фотографию."}</p></div>
      <a class="admin-button" href="/admin/products">← К товарам</a>
    </section>
    ${errors.length ? `<div class="admin-error" role="alert">${errors.map(esc).join("<br>")}</div>` : ""}
    <form class="admin-form admin-product-form" method="post" action="${isEdit ? `/admin/products/${product.id}/edit` : "/admin/products"}" enctype="multipart/form-data">
      <input type="hidden" name="_csrf" value="${esc(csrf)}">
      <input type="hidden" name="main_image" value="${esc(product.main_image || "")}">
      <div class="admin-form-grid">
        <div class="admin-form-main">
          <section class="admin-panel">
            <h2>Основное</h2>
            <label>Название <input name="name" value="${esc(product.name || "")}" maxlength="140" required></label>
            <label>Slug <input name="slug" value="${esc(product.slug || "")}" maxlength="80" placeholder="auto"></label>
            <label>Описание <textarea name="description" rows="5" maxlength="2000">${esc(product.description || "")}</textarea></label>
          </section>
          <section class="admin-panel">
            <h2>Цена и наличие</h2>
            <div class="admin-field-row">
              <label>Цена, ₽ <input name="price" type="number" min="0" step="1" value="${product.price ?? ""}" placeholder="Оставьте пустым для цены по запросу"></label>
              <label>Старая цена, ₽ <input name="old_price" type="number" min="0" step="1" value="${product.old_price ?? ""}"></label>
              <label>Вес / порция <input name="unit" value="${esc(product.unit || "")}" maxlength="40" placeholder="1,2 кг"></label>
            </div>
            <div class="admin-switches">
              <label class="admin-switch"><input type="checkbox" name="published" value="1"${product.published ? " checked" : ""}><span></span>Опубликован</label>
              <label class="admin-switch"><input type="checkbox" name="in_stock" value="1"${product.in_stock ? " checked" : ""}><span></span>В наличии</label>
              <label class="admin-switch"><input type="checkbox" name="promo" value="1"${product.promo ? " checked" : ""}><span></span>Акция</label>
            </div>
          </section>
          <section class="admin-panel">
            <h2>Изображения</h2>
            <div class="admin-image-upload">
              <div class="admin-image-preview">
                <img src="${esc(product.main_image ? imageUrl(product.main_image) : "/assets/img/placeholder-empty.jpg")}" alt="" width="180" height="180" data-preview-image>
              </div>
              <div>
                <label>Главное фото <input type="file" name="main_image_file" accept="image/jpeg,image/png,image/webp" data-preview-input></label>
                <p class="admin-hint">JPG, PNG или WebP до 8 МБ. Изображение автоматически сожмётся в WebP.</p>
                ${product.main_image ? '<label class="admin-check"><input type="checkbox" name="remove_main_image" value="1"> Удалить текущее главное фото</label>' : ""}
                <label>Дополнительные фото <input type="file" name="additional_files" accept="image/jpeg,image/png,image/webp" multiple></label>
                <div class="admin-additional-preview" data-additional-preview></div>
              </div>
            </div>
            ${gallery ? `<h3 class="admin-subhead">Дополнительные изображения</h3><ul class="admin-gallery">${gallery}</ul>` : ""}
          </section>
        </div>
        <aside class="admin-form-side">
          <section class="admin-panel">
            <h2>Публикация</h2>
            <label>Категория
              <select name="category_id">
                <option value="">Без категории</option>
                ${categories.map((category) => `<option value="${category.id}"${Number(product.category_id) === Number(category.id) ? " selected" : ""}>${esc(category.name)}</option>`).join("")}
              </select>
            </label>
            <label>Порядок <input name="sort_order" type="number" step="1" value="${esc(product.sort_order ?? 0)}"></label>
            <button class="admin-button admin-button--primary admin-button--wide" type="submit">${isEdit ? "Сохранить изменения" : "Создать товар"}</button>
          </section>
          ${isEdit ? `<section class="admin-panel admin-danger-zone"><h2>Опасная зона</h2><p>Удаление нельзя отменить.</p><button class="admin-button admin-button--danger" type="submit" form="delete-product-form">Удалить товар</button></section>` : ""}
        </aside>
      </div>
    </form>
    ${isEdit ? `<form id="delete-product-form" method="post" action="/admin/products/${product.id}/delete" data-confirm="Удалить товар «${esc(product.name)}»? Это действие нельзя отменить."><input type="hidden" name="_csrf" value="${esc(csrf)}"></form>` : ""}`,
  });
}

export function categoriesPage({ admin, csrf, categories, errors = [], flash }) {
  const rows = categories
    .map(
      (category) => `<tr>
        <td><form class="admin-inline-form" method="post" action="/admin/categories/${category.id}">
          <input type="hidden" name="_csrf" value="${esc(csrf)}">
          <input name="name" value="${esc(category.name)}" maxlength="80" required aria-label="Название категории">
          <input name="slug" value="${esc(category.slug)}" maxlength="80" aria-label="Slug">
          <input name="sort_order" type="number" step="1" value="${esc(category.sort_order)}" aria-label="Порядок" class="admin-sort-input">
          <button type="submit">Сохранить</button>
        </form></td>
        <td>${category.product_count}</td>
        <td><form method="post" action="/admin/categories/${category.id}/delete" data-confirm="Удалить категорию «${esc(category.name)}»? Товары останутся без категории.">
          <input type="hidden" name="_csrf" value="${esc(csrf)}">
          <button class="admin-text-danger" type="submit">Удалить</button>
        </form></td>
      </tr>`
    )
    .join("");
  return adminShell({
    title: "Категории",
    admin,
    csrf,
    active: "categories",
    flash,
    body: `<section class="admin-heading"><p class="admin-eyebrow">Структура витрины</p><h1>Категории</h1><p>Порядок влияет на фильтры и карточки на сайте. При удалении товары перейдут в «Без категории».</p></section>
    ${errors.length ? `<div class="admin-error" role="alert">${errors.map(esc).join("<br>")}</div>` : ""}
    <section class="admin-panel">
      <h2>Новая категория</h2>
      <form class="admin-inline-form admin-inline-form--new" method="post" action="/admin/categories">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <input name="name" placeholder="Название" maxlength="80" required>
        <input name="slug" placeholder="slug (auto)" maxlength="80">
        <input name="sort_order" type="number" step="1" value="0" aria-label="Порядок" class="admin-sort-input">
        <button class="admin-button admin-button--primary" type="submit">Добавить</button>
      </form>
    </section>
    <section class="admin-panel">
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Категория</th><th>Товаров</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="3">Категорий пока нет.</td></tr>'}</tbody></table></div>
    </section>`,
  });
}

export function errorPage({ title, message }) {
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex"><title>${esc(title)} — АлаДея</title><link rel="stylesheet" href="/assets/css/fonts.css"><link rel="stylesheet" href="/admin-assets/admin.css"></head>
<body class="admin-login-body"><main class="admin-login"><div class="admin-login__card"><p class="admin-eyebrow">Ошибка</p><h1>${esc(title)}</h1><p>${esc(message)}</p><a class="admin-button admin-button--primary" href="/admin">В панель</a></div></main></body></html>`;
}
