(() => {
  const toggle = document.querySelector("[data-admin-menu]");
  if (toggle) {
    toggle.addEventListener("click", () => {
      document.body.classList.toggle("admin-menu-open");
    });
  }

  document.querySelectorAll("form[data-confirm]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      if (!window.confirm(form.dataset.confirm || "Подтвердить действие?")) {
        event.preventDefault();
      }
    });
  });

  const fileInput = document.querySelector("[data-preview-input]");
  const image = document.querySelector("[data-preview-image]");
  if (fileInput && image) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        window.alert("Допустимы только JPG, PNG и WebP.");
        fileInput.value = "";
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        window.alert("Файл больше 8 МБ.");
        fileInput.value = "";
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      image.src = objectUrl;
      image.addEventListener(
        "load",
        () => URL.revokeObjectURL(objectUrl),
        { once: true }
      );
    });
  }

  const additionalInput = document.querySelector('input[name="additional_files"]');
  const additionalPreview = document.querySelector("[data-additional-preview]");
  if (additionalInput && additionalPreview) {
    additionalInput.addEventListener("change", () => {
      additionalPreview.replaceChildren();
      for (const file of additionalInput.files || []) {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) continue;
        const image = document.createElement("img");
        image.alt = "";
        image.width = 54;
        image.height = 54;
        image.src = URL.createObjectURL(file);
        image.addEventListener(
          "load",
          () => URL.revokeObjectURL(image.src),
          { once: true }
        );
        additionalPreview.append(image);
      }
    });
  }

  document.querySelectorAll(".admin-sidebar a").forEach((link) => {
    link.addEventListener("click", () => document.body.classList.remove("admin-menu-open"));
  });
})();
