/* Boot: add JS class before paint and prevent framing of the public site. */
(() => {
  document.documentElement.classList.replace("no-js", "js");

  if (window.top !== window.self) {
    try {
      window.top.location.href = window.location.href;
    } catch (error) {
      // Cross-origin framing can block top navigation; hide the document instead.
      document.documentElement.style.display = "none";
    }
  }
})();
