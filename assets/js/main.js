/* =========================================================
   АлаДея — interactions
   ========================================================= */

(() => {
  "use strict";

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));

  const WHATSAPP_NUMBER = "79188378048";
  const STORAGE_KEY = "aladea-cart-v1";
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    cart: loadCart(),
    activeFilter: "all",
    lastFocused: null,
  };

  const els = {
    body: document.body,
    header: $("#siteHeader"),
    nav: $("#mainNav"),
    navToggle: $("[data-nav-toggle]"),
    navOverlay: $("[data-nav-close]"),
    drawer: $("#cartDrawer"),
    overlay: $(".drawer-overlay"),
    openCartButtons: $$("[data-open-cart]"),
    closeCartButtons: $$("[data-close-cart]"),
    cartItems: $("[data-cart-items]"),
    cartEmpty: $("[data-cart-empty]"),
    cartCheckout: $("[data-cart-checkout]"),
    cartTotal: $("[data-cart-total]"),
    cartCount: $("[data-cart-count]"),
    cartTitleCount: $("[data-cart-title-count]"),
    catalogCount: $("#catalogCount"),
    toast: $("#toast"),
    checkoutForm: $("#checkoutForm"),
    customForm: $("#customForm"),
  };

  /* ---------- Utilities ---------- */

  const escapeHTML = (value) =>
    String(value).replace(/[&<>"']/g, (char) => {
      const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
      return map[char];
    });

  const formatPrice = (value) =>
    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value) + " ₽";

  const plural = (n, one, few, many) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  };

  const getScrollbarWidth = () =>
    Math.max(0, window.innerWidth - document.documentElement.clientWidth);

  let toastTimer;
  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove("is-visible");
    }, 3200);
  }

  function lockBody() {
    if (els.body.classList.contains("is-locked")) return;
    els.body.style.paddingRight = getScrollbarWidth() + "px";
    els.body.classList.add("is-locked");
  }

  function unlockBody() {
    if (els.body.classList.contains("cart-open") || els.body.classList.contains("nav-open")) return;
    els.body.classList.remove("is-locked");
    els.body.style.paddingRight = "";
  }

  /* ---------- Header / mobile nav ---------- */

  let scrollTicking = false;
  function updateHeader() {
    if (!els.header) return;
    els.header.classList.toggle("is-scrolled", window.scrollY > 10);
    scrollTicking = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (scrollTicking) return;
      scrollTicking = true;
      window.requestAnimationFrame(updateHeader);
    },
    { passive: true }
  );
  updateHeader();

  function openNav() {
    if (!els.nav || !els.navToggle) return;
    closeCart(false);
    state.lastFocused = document.activeElement;
    els.body.classList.add("nav-open");
    els.navToggle.setAttribute("aria-expanded", "true");
    els.navToggle.setAttribute("aria-label", "Закрыть меню");
    lockBody();
    const firstLink = $("a", els.nav);
    if (firstLink) window.setTimeout(() => firstLink.focus(), 300);
  }

  function closeNav(restoreFocus = true) {
    if (!els.body.classList.contains("nav-open")) return;
    els.body.classList.remove("nav-open");
    if (els.navToggle) {
      els.navToggle.setAttribute("aria-expanded", "false");
      els.navToggle.setAttribute("aria-label", "Открыть меню");
    }
    unlockBody();
    if (restoreFocus && state.lastFocused && typeof state.lastFocused.focus === "function") {
      state.lastFocused.focus();
    }
  }

  if (els.navToggle) {
    els.navToggle.addEventListener("click", () => {
      if (els.body.classList.contains("nav-open")) closeNav();
      else openNav();
    });
  }

  if (els.navOverlay) els.navOverlay.addEventListener("click", () => closeNav());

  $$("a", els.nav || document.createElement("nav")).forEach((link) => {
    link.addEventListener("click", () => closeNav(false));
  });

  /* ---------- Cart storage ---------- */

  function loadCart() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            Number.isFinite(Number(item.price)) &&
            Number.isFinite(Number(item.qty))
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          price: Number(item.price),
          unit: typeof item.unit === "string" ? item.unit : "",
          image: typeof item.image === "string" ? item.image : "",
          qty: Math.min(99, Math.max(1, Math.round(Number(item.qty)))),
        }));
    } catch (error) {
      return [];
    }
  }

  function saveCart() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
    } catch (error) {
      /* Storage can be disabled; cart still works for this page view. */
    }
  }

  function cartQuantity() {
    return state.cart.reduce((sum, item) => sum + item.qty, 0);
  }

  function cartSubtotal() {
    return state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }

  /* ---------- Cart rendering ---------- */

  function renderCart({ bump = false } = {}) {
    const quantity = cartQuantity();
    const total = cartSubtotal();

    if (els.cartCount) {
      els.cartCount.hidden = quantity === 0;
      els.cartCount.textContent = String(quantity);
      if (bump && quantity > 0 && !prefersReducedMotion) {
        els.cartCount.classList.remove("is-bumped");
        void els.cartCount.offsetWidth;
        els.cartCount.classList.add("is-bumped");
      }
    }

    if (els.cartTitleCount) {
      els.cartTitleCount.textContent = quantity
        ? `· ${quantity} ${plural(quantity, "товар", "товара", "товаров")}`
        : "";
    }

    if (!els.cartItems) return;

    if (!state.cart.length) {
      els.cartItems.innerHTML = "";
      if (els.cartEmpty) els.cartEmpty.hidden = false;
      if (els.cartCheckout) els.cartCheckout.hidden = true;
      return;
    }

    if (els.cartEmpty) els.cartEmpty.hidden = true;
    if (els.cartCheckout) els.cartCheckout.hidden = false;

    els.cartItems.innerHTML = state.cart
      .map(
        (item) => `
        <article class="cart-item">
          <img class="cart-item__image" src="${escapeHTML(item.image)}" alt="" width="72" height="82" loading="lazy">
          <div class="cart-item__info">
            <h3>${escapeHTML(item.name)}</h3>
            <span class="cart-item__unit">${escapeHTML(item.unit)}</span>
            <div class="cart-item__controls">
              <div class="qty" aria-label="Количество: ${escapeHTML(item.name)}">
                <button type="button" data-cart-action="decrease" data-id="${escapeHTML(item.id)}" aria-label="Уменьшить количество">−</button>
                <span aria-live="polite">${item.qty}</span>
                <button type="button" data-cart-action="increase" data-id="${escapeHTML(item.id)}" aria-label="Увеличить количество">+</button>
              </div>
              <button class="cart-item__remove" type="button" data-cart-action="remove" data-id="${escapeHTML(item.id)}">Удалить</button>
            </div>
          </div>
          <span class="cart-item__price">${formatPrice(item.price * item.qty)}</span>
        </article>`
      )
      .join("");

    if (els.cartTotal) els.cartTotal.textContent = formatPrice(total);
  }

  function addToCart(product) {
    const existing = state.cart.find((item) => item.id === product.id);
    if (existing) {
      existing.qty = Math.min(99, existing.qty + 1);
    } else {
      state.cart.push({ ...product, qty: 1 });
    }
    saveCart();
    renderCart({ bump: true });
    showToast(`«${product.name}» — в корзине`);
  }

  function changeQuantity(id, delta) {
    const item = state.cart.find((entry) => entry.id === id);
    if (!item) return;
    item.qty = Math.min(99, Math.max(0, item.qty + delta));
    if (item.qty === 0) {
      state.cart = state.cart.filter((entry) => entry.id !== id);
    }
    saveCart();
    renderCart();
  }

  function removeItem(id) {
    state.cart = state.cart.filter((entry) => entry.id !== id);
    saveCart();
    renderCart();
    showToast("Позиция удалена из корзины");
  }

  document.addEventListener("click", (event) => {
    const addButton = event.target.closest(".js-add");
    if (addButton) {
      const card = addButton.closest("[data-id]");
      if (!card) return;
      addToCart({
        id: card.dataset.id,
        name: card.dataset.name,
        price: Number(card.dataset.price),
        unit: card.dataset.unit || "",
        image: card.dataset.image || "",
      });
      return;
    }

    const cartAction = event.target.closest("[data-cart-action]");
    if (cartAction) {
      const id = cartAction.dataset.id;
      if (!id) return;
      if (cartAction.dataset.cartAction === "increase") changeQuantity(id, 1);
      if (cartAction.dataset.cartAction === "decrease") changeQuantity(id, -1);
      if (cartAction.dataset.cartAction === "remove") removeItem(id);
    }
  });

  /* ---------- Cart drawer ---------- */

  function openCart() {
    if (!els.drawer) return;
    closeNav(false);
    state.lastFocused = document.activeElement;
    els.body.classList.add("cart-open");
    lockBody();
    els.drawer.setAttribute("aria-hidden", "false");
    els.drawer.inert = false;
    if (els.overlay) els.overlay.hidden = false;
    const closeButton = $("[data-close-cart]", els.drawer);
    if (closeButton) window.setTimeout(() => closeButton.focus(), 250);
  }

  function closeCart(restoreFocus = true) {
    if (!els.drawer || !els.body.classList.contains("cart-open")) return;
    els.body.classList.remove("cart-open");
    els.drawer.setAttribute("aria-hidden", "true");
    els.drawer.inert = true;
    unlockBody();
    if (restoreFocus && state.lastFocused && typeof state.lastFocused.focus === "function") {
      state.lastFocused.focus();
    }
  }

  els.openCartButtons.forEach((button) => button.addEventListener("click", openCart));

  if (els.drawer) {
    $$("[data-close-cart]", els.drawer).forEach((button) => {
      button.addEventListener("click", () => closeCart());
    });
  }

  if (els.overlay) {
    els.overlay.addEventListener("click", () => closeCart());
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (els.body.classList.contains("cart-open")) closeCart();
      if (els.body.classList.contains("nav-open")) closeNav();
    }

    if (event.key !== "Tab") return;

    const activeContainer = els.body.classList.contains("cart-open")
      ? els.drawer
      : els.body.classList.contains("nav-open")
      ? els.nav
      : null;

    if (!activeContainer) return;

    const focusable = $$(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      activeContainer
    ).filter((el) => el.offsetParent !== null);

    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // Prepare initial drawer state.
  if (els.drawer) {
    els.drawer.inert = true;
    els.drawer.setAttribute("aria-hidden", "true");
  }

  // "Go to catalog" inside an empty cart.
  $$("[data-go-catalog]").forEach((button) => {
    button.addEventListener("click", () => {
      closeCart(false);
      const catalog = $("#catalog");
      if (catalog) catalog.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
    });
  });

  renderCart();

  /* ---------- Catalog filters ---------- */

  const filterButtons = $$("[data-filter]");
  const productCards = $$(".product");

  function updateCatalogCount(visibleCount) {
    if (!els.catalogCount) return;
    els.catalogCount.textContent = `${visibleCount} ${plural(
      visibleCount,
      "позиция",
      "позиции",
      "позиций"
    )}`;
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;
      if (!filter || filter === state.activeFilter) return;
      state.activeFilter = filter;

      filterButtons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });

      let visible = 0;
      productCards.forEach((card) => {
        const show = filter === "all" || card.dataset.category === filter;
        card.classList.toggle("is-filtered", !show);
        if (show) {
          visible += 1;
          card.classList.add("is-visible");
        }
      });
      updateCatalogCount(visible);
    });
  });

  /* ---------- Scroll reveal ---------- */

  const revealItems = $$(".reveal");
  if (!prefersReducedMotion && "IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  /* ---------- Active nav item ---------- */

  const navLinks = $$(".main-nav > a[href^='#']");
  const sections = navLinks
    .map((link) => {
      const id = link.getAttribute("href");
      return id ? document.querySelector(id) : null;
    })
    .filter(Boolean);

  if (sections.length && "IntersectionObserver" in window) {
    const navObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          navLinks.forEach((link) => {
            link.classList.toggle(
              "is-current",
              link.getAttribute("href") === `#${entry.target.id}`
            );
          });
        });
      },
      { rootMargin: "-38% 0px -55% 0px", threshold: 0 }
    );
    sections.forEach((section) => navObserver.observe(section));
  }

  /* ---------- FAQ accordion ---------- */

  const faqItems = $$(".faq__item");
  faqItems.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (!item.open) return;
      faqItems.forEach((other) => {
        if (other !== item) other.open = false;
      });
    });
  });

  /* ---------- Phone helpers ---------- */

  function phoneDigits(value) {
    let digits = String(value).replace(/\D/g, "");
    if (digits.startsWith("8")) digits = "7" + digits.slice(1);
    if (digits.length === 10 && digits.startsWith("9")) digits = "7" + digits;
    return digits.slice(0, 11);
  }

  function formatPhone(value) {
    const digits = phoneDigits(value);
    if (!digits) return "";
    let result = "+7";
    if (digits.length > 1) result += ` (${digits.slice(1, 4)}`;
    if (digits.length >= 5) result += `) ${digits.slice(4, 7)}`;
    if (digits.length >= 8) result += `-${digits.slice(7, 9)}`;
    if (digits.length >= 10) result += `-${digits.slice(9, 11)}`;
    return result;
  }

  $$('input[type="tel"]').forEach((input) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^\d+()\s-]/g, "");
    });
    input.addEventListener("blur", () => {
      if (input.value.trim()) input.value = formatPhone(input.value);
    });
  });

  /* ---------- Dates ---------- */

  function localISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(value) {
    if (!value) return "";
    const parts = value.split("-");
    if (parts.length !== 3) return value;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  const today = new Date();
  $$('input[type="date"]').forEach((input) => {
    input.min = localISODate(today);
  });

  /* ---------- Form validation ---------- */

  function errorElementFor(form, input) {
    if (!input) return null;
    if (input.id) {
      const byFor = form.querySelector(`[data-error-for="${input.id}"]`);
      if (byFor) return byFor;
    }
    if (input.name) {
      return form.querySelector(`[data-error-for="${input.name}"]`);
    }
    return null;
  }

  function setFieldError(input, message) {
    if (!input) return;
    const form = input.closest("form");
    const error = form ? errorElementFor(form, input) : null;
    input.classList.toggle("is-invalid", Boolean(message));
    input.setAttribute("aria-invalid", String(Boolean(message)));
    if (error) {
      error.textContent = message || "";
      if (message && !error.id && input.id) {
        error.id = `error-${input.id}`;
        input.setAttribute("aria-describedby", error.id);
      }
      if (!message && error.id && input.getAttribute("aria-describedby") === error.id) {
        input.removeAttribute("aria-describedby");
      }
    }
  }

  function validateName(input) {
    if (!input) return true;
    const value = input.value.trim();
    if (value.length < 2) {
      setFieldError(input, "Напишите, пожалуйста, имя");
      return false;
    }
    setFieldError(input, "");
    return true;
  }

  function validatePhone(input) {
    if (!input) return true;
    const digits = phoneDigits(input.value);
    if (digits.length !== 11 || !digits.startsWith("7")) {
      setFieldError(input, "Введите номер в формате +7 (918) 837-80-48");
      return false;
    }
    input.value = formatPhone(digits);
    setFieldError(input, "");
    return true;
  }

  function validateConsent(form) {
    const checkbox = form.querySelector('input[name="consent"]');
    if (!checkbox) return true;
    const label = checkbox.closest(".consent");
    if (!checkbox.checked) {
      if (label) label.classList.add("is-invalid");
      checkbox.classList.add("is-invalid");
      checkbox.setAttribute("aria-invalid", "true");
      const error = form.querySelector('[data-error-for$="Consent"]');
      if (error) error.textContent = "Нужно согласие на обработку данных";
      return false;
    }
    if (label) label.classList.remove("is-invalid");
    checkbox.classList.remove("is-invalid");
    checkbox.setAttribute("aria-invalid", "false");
    const error = form.querySelector('[data-error-for$="Consent"]');
    if (error) error.textContent = "";
    return true;
  }

  function validateAddress(form) {
    const method = form.querySelector('input[name="method"]:checked');
    const address = form.querySelector('input[name="address"]');
    if (!address) return true;
    if (method && method.value === "Доставка" && address.value.trim().length < 5) {
      setFieldError(address, "Укажите улицу и дом для доставки");
      return false;
    }
    setFieldError(address, "");
    return true;
  }

  /* ---------- WhatsApp order ---------- */

  function whatsappURL(message) {
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  function openWhatsApp(url) {
    const opened = window.open(url, "_blank", "noopener");
    return Boolean(opened);
  }

  function showSuccess(form, url, text) {
    const success = form.querySelector("[data-success]");
    if (!success) return;
    success.hidden = false;
    success.innerHTML = `${escapeHTML(text)} <a href="${escapeHTML(
      url
    )}" target="_blank" rel="noopener noreferrer">Открыть WhatsApp ещё раз ↗</a>`;
    if (!prefersReducedMotion) {
      success.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function resetSuccess(form) {
    const success = form.querySelector("[data-success]");
    if (!success) return;
    success.hidden = true;
    success.textContent = "";
  }

  // Checkout form
  if (els.checkoutForm) {
    const form = els.checkoutForm;
    const methodRadios = $$('input[name="method"]', form);
    const addressField = $("[data-address-field]", form);

    methodRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (!addressField) return;
        const isDelivery = radio.value === "Доставка" && radio.checked;
        addressField.hidden = !isDelivery;
        if (!isDelivery) setFieldError($("#orderAddress"), "");
      });
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      resetSuccess(form);

      if (!state.cart.length) {
        showToast("Сначала добавьте десерт в корзину");
        closeCart();
        return;
      }

      const nameInput = $("#orderName");
      const phoneInput = $("#orderPhone");
      const validName = validateName(nameInput);
      const validPhone = validatePhone(phoneInput);
      const validConsent = validateConsent(form);
      const validAddress = validateAddress(form);

      if (!validName || !validPhone || !validConsent || !validAddress) {
        const firstInvalid = form.querySelector(".is-invalid");
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      const formData = new FormData(form);
      const method = formData.get("method") || "Самовывоз";
      const address = String(formData.get("address") || "").trim();
      const date = String(formData.get("date") || "");
      const comment = String(formData.get("comment") || "").trim();

      const lines = [
        "Здравствуйте! Хочу оформить заказ в АлаДее:",
        "",
        ...state.cart.map(
          (item) =>
            `• ${item.name} — ${item.qty} × ${formatPrice(item.price)} = ${formatPrice(
              item.price * item.qty
            )}`
        ),
        "",
        `Итого: ${formatPrice(cartSubtotal())}`,
        `Имя: ${String(formData.get("name") || "").trim()}`,
        `Телефон: ${formatPhone(String(formData.get("phone") || ""))}`,
        `Получение: ${method}`,
      ];

      if (method === "Доставка" && address) lines.push(`Адрес: ${address}`);
      if (date) lines.push(`Дата: ${formatDate(date)}`);
      if (comment) lines.push(`Комментарий: ${comment}`);
      lines.push("", "Отправлено с сайта АлаДея");

      const url = whatsappURL(lines.join("\n"));
      const opened = openWhatsApp(url);

      showSuccess(
        form,
        url,
        opened
          ? "Заказ готов к отправке в WhatsApp. Проверьте сообщение и нажмите «Отправить» — мы подтвердим заказ."
          : "Браузер заблокировал новое окно. Откройте WhatsApp по ссылке ниже, чтобы отправить заказ."
      );
    });
  }

  // Custom cake form
  if (els.customForm) {
    const form = els.customForm;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      resetSuccess(form);

      const nameInput = $("#customName");
      const phoneInput = $("#customPhone");
      const validName = validateName(nameInput);
      const validPhone = validatePhone(phoneInput);
      const validConsent = validateConsent(form);

      if (!validName || !validPhone || !validConsent) {
        const firstInvalid = form.querySelector(".is-invalid");
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      const formData = new FormData(form);
      const date = String(formData.get("date") || "");
      const occasion = String(formData.get("occasion") || "").trim();
      const comment = String(formData.get("comment") || "").trim();

      const lines = [
        "Здравствуйте! Хочу обсудить торт в АлаДее.",
        "",
        `Имя: ${String(formData.get("name") || "").trim()}`,
        `Телефон: ${formatPhone(String(formData.get("phone") || ""))}`,
      ];
      if (date) lines.push(`Дата праздника: ${formatDate(date)}`);
      if (occasion) lines.push(`Повод: ${occasion}`);
      if (comment) lines.push(`Пожелания: ${comment}`);
      lines.push("", "Отправлено с сайта АлаДея");

      const url = whatsappURL(lines.join("\n"));
      const opened = openWhatsApp(url);

      showSuccess(
        form,
        url,
        opened
          ? "Сообщение готово в WhatsApp. Отправьте его — и мы вернёмся с вопросами и предложением."
          : "Браузер заблокировал новое окно. Откройте WhatsApp по ссылке ниже, чтобы обсудить заказ."
      );
    });
  }

  /* ---------- Responsive resets ---------- */

  let resizeTimer;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (window.innerWidth > 960 && els.body.classList.contains("nav-open")) {
        closeNav(false);
      }
    }, 120);
  });

  /* ---------- Image fallback ---------- */

  $$("img").forEach((image) => {
    image.addEventListener("error", () => {
      image.style.background = "var(--bg-deep)";
      image.style.opacity = "0";
    });
  });
})();
