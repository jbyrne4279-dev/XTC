/* ============================================
   XTC CLOTHING — main.js
   Cart, nav drawer, hero slideshow, search, toast
   ============================================ */

// ---- Cart (localStorage) ----

function getCart() {
  try { return JSON.parse(localStorage.getItem('xtc-cart') || '[]'); }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem('xtc-cart', JSON.stringify(cart));
}

function updateCartCount() {
  const cart = getCart();
  const total = cart.reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll('#cartCount, #drawerCartCount').forEach(el => {
    el.textContent = total;
  });
}

function addToCart(id, name, price, img, quantity = 1) {
  const cart = getCart();
  const existing = cart.find(item => item.id === id);
  if (existing) {
    existing.qty = Math.min(10, existing.qty + quantity);
  } else {
    cart.push({ id, name, price, img, qty: quantity });
  }
  saveCart(cart);
  updateCartCount();
  showToast(name + ' added to bag');
}

// ---- Toast ----

let toastTimer = null;

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ---- Mobile Nav Drawer ----

function initNavDrawer() {
  const toggle   = document.getElementById('menuToggle');
  const drawer   = document.getElementById('navDrawer');
  const overlay  = document.getElementById('drawerOverlay');
  const close    = document.getElementById('drawerClose');
  if (!toggle || !drawer || !overlay || !close) return;

  function open()  { drawer.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function close_() { drawer.classList.remove('open'); document.body.style.overflow = ''; }

  toggle.addEventListener('click', open);
  overlay.addEventListener('click', close_);
  close.addEventListener('click', close_);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close_(); });
}

// ---- Search Overlay ----

function initSearch() {
  const toggle  = document.getElementById('searchToggle');
  const overlay = document.getElementById('searchOverlay');
  const closeBtn = document.getElementById('searchClose');
  const input   = document.getElementById('searchInput');
  if (!toggle || !overlay) return;

  function open() {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input && input.focus(), 50);
  }
  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  toggle.addEventListener('click', open);
  closeBtn && closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  input && input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (q) {
        close();
        // Simple client-side search redirect to collections with query
        window.location.href = 'collections.html?q=' + encodeURIComponent(q);
      }
    }
  });
}

// ---- Hero Slideshow (premium editorial) ----

function initHero() {
  const slides   = document.querySelectorAll('.hero-slide');
  const prev     = document.getElementById('heroPrev');
  const next     = document.getElementById('heroNext');
  const countEl  = document.getElementById('heroCountCurrent');
  const progressBar = document.getElementById('heroProgressBar');
  const eyebrow  = document.getElementById('heroEyebrow');
  const title    = document.getElementById('heroTitle');
  const cta      = document.getElementById('heroCta');
  if (!slides.length) return;

  const B = { eyebrow: 'Original Members', title: '[Black]', href: 'product-polo-black.html' };
  const W = { eyebrow: 'Original Members', title: '[White]', href: 'product-polo-white.html' };
  // Order matches index.html slides 0-26:
  // 0:hero-1(B) 1:white-m1(W) 2:hero-2(B) 3:white-m2(W) 4:hero-3(B) 5:white-m3(W)
  // 6:hero-4(W) 7:white-m4(W) 8:black-m1(B) 9:white-m5(W) 10:black-m2(B) 11:white-m6(W)
  // 12:black-m3(B) 13:white-m7(W) 14:black-m4(B) 15:white-m8(W) 16:black-m5(B)
  // 17-22:editorial(B) alternating with black models, 23-26:editorial(B)
  const SLIDE_DATA = [
    B, W, B, W, B, W, W, W,
    B, W, B, W, B, W, B, W,
    B, B, B, B, B, B, B, B, B, B, B,
  ];

  const COPY_ELS = [eyebrow, title, document.querySelector('.hero-bar__right')].filter(Boolean);
  let current = 0;
  let timer = null;

  function pad(n) { return String(n).padStart(2, '0'); }

  function animateIn() {
    COPY_ELS.forEach(el => el.classList.remove('in'));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      COPY_ELS.forEach(el => el.classList.add('in'));
    }));
  }

  function startProgress() {
    if (!progressBar) return;
    progressBar.style.transition = 'none';
    progressBar.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      progressBar.style.transition = 'width 5s linear';
      progressBar.style.width = '100%';
    }));
  }

  function goTo(n) {
    slides[current].classList.remove('active');
    current = (n + slides.length) % slides.length;
    slides[current].classList.add('active');

    const d = SLIDE_DATA[current];
    if (eyebrow) eyebrow.textContent = d.eyebrow;
    if (title)   title.innerHTML = d.title;
    if (cta)     cta.href = d.href;
    if (countEl) countEl.textContent = pad(current + 1);

    animateIn();
    startProgress();
  }

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => goTo(current + 1), 5000);
  }

  prev && prev.addEventListener('click', () => { goTo(current - 1); startTimer(); });
  next && next.addEventListener('click', () => { goTo(current + 1); startTimer(); });

  // Touch/swipe
  let touchStartX = 0;
  const heroEl = document.querySelector('.hero');
  if (heroEl) {
    heroEl.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    heroEl.addEventListener('touchend', e => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) { goTo(diff > 0 ? current + 1 : current - 1); startTimer(); }
    }, { passive: true });
  }

  // Init
  slides[0].classList.add('active');
  animateIn();
  startProgress();
  startTimer();
}

// ---- Init ----

document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  initNavDrawer();
  initSearch();
  initHero();
});
