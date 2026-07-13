/* ============================================================
   INSTALL PROMPT — "Add to Home Screen" banner
   iOS Safari never fires an install prompt, so we show manual
   instructions there; Chrome/Android gets a real install button.
   ============================================================ */

(function () {
  const DISMISS_KEY = "installBannerDismissedAt";
  const DISMISS_DAYS = 14;

  // Already installed / running standalone? Never show.
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  if (isStandalone) return;

  // Recently dismissed? Stay quiet.
  const dismissedAt = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
  if (Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;

  const ua = window.navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS
  let deferredPrompt = null;

  function buildBanner() {
    const banner = document.createElement("div");
    banner.id = "installBanner";
    banner.innerHTML = `
      <div class="ib-icon">📍</div>
      <div class="ib-text">
        <div class="ib-title">Add Japan Trip to your home screen</div>
        <div class="ib-sub" id="ibSub"></div>
      </div>
      <button class="ib-action" id="ibAction"></button>
      <button class="ib-close" id="ibClose" aria-label="Dismiss">✕</button>
    `;
    document.body.appendChild(banner);

    const sub = banner.querySelector("#ibSub");
    const action = banner.querySelector("#ibAction");

    if (isIOS) {
      sub.innerHTML =
        `Tap <span class="ib-share-icon">⎋</span> Share, then "Add to Home Screen"`;
      action.style.display = "none";
    } else if (deferredPrompt) {
      sub.textContent = "Works offline once installed";
      action.textContent = "Install";
      action.addEventListener("click", async () => {
        action.disabled = true;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        hide(true);
      });
    } else {
      // Desktop or browser without install support: menu instructions
      sub.textContent = "In your browser menu, choose “Install app” or “Add to Home Screen”";
      action.style.display = "none";
    }

    banner.querySelector("#ibClose").addEventListener("click", () => hide(true));

    // Slide in after a beat so it doesn't compete with first paint
    setTimeout(() => banner.classList.add("show"), 1800);

    function hide(remember) {
      banner.classList.remove("show");
      if (remember) localStorage.setItem(DISMISS_KEY, String(Date.now()));
      setTimeout(() => banner.remove(), 400);
    }
  }

  if (isIOS) {
    // iOS: no event will ever fire; show instructions directly.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", buildBanner);
    } else {
      buildBanner();
    }
  } else {
    // Chrome/Edge/Android: wait for installability signal.
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      buildBanner();
    });
  }
})();
