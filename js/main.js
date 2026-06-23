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
  // Stock guard — id format is "polo-black-s", "polo-white-l", etc.
  if (typeof getSizeStock === 'function') {
    const parts = id.split('-');
    const size = parts[parts.length - 1].toUpperCase();
    const productId = parts.slice(0, -1).join('-');
    const inStock = getSizeStock(productId, size);
    if (inStock <= 0) {
      showToast('Sorry, ' + name + ' is out of stock.');
      return;
    }
  }

  const cart = getCart();
  const existing = cart.find(item => item.id === id);
  if (existing) {
    existing.qty = Math.min(10, existing.qty + quantity);
  } else {
    cart.push({ id, name, price, img, qty: quantity });
  }
  saveCart(cart);
  updateCartCount();
  showBagConfirm(name, price, img);
}

function showBagConfirm(name, price, img) {
  let overlay = document.getElementById('bagConfirm');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'bagConfirm';
    overlay.innerHTML = `
      <div class="bag-confirm__backdrop"></div>
      <div class="bag-confirm__box">
        <div class="bag-confirm__ring">
          <svg class="bag-confirm__check" viewBox="0 0 52 52" fill="none">
            <circle cx="26" cy="26" r="24" stroke="rgba(179,102,255,0.4)" stroke-width="1.5"/>
            <path class="bag-confirm__check-path" d="M15 26l8 8 14-14" stroke="#b366ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <p class="bag-confirm__label">Added to Cart</p>
        <div class="bag-confirm__meta">
          <p class="bag-confirm__name" id="bagConfirmName"></p>
          <p class="bag-confirm__size" id="bagConfirmSize"></p>
        </div>
        <p class="bag-confirm__price" id="bagConfirmPrice"></p>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.bag-confirm__backdrop').addEventListener('click', hideBagConfirm);
  }
  overlay.classList.remove('active');
  const parts = name.split(' — ');
  document.getElementById('bagConfirmName').textContent = parts[0];
  document.getElementById('bagConfirmSize').textContent = parts[1] ? 'Size ' + parts[1] : '';
  document.getElementById('bagConfirmPrice').textContent = price;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.classList.add('active');
  }));
  if (window._bagConfirmTimer) clearTimeout(window._bagConfirmTimer);
  window._bagConfirmTimer = setTimeout(hideBagConfirm, 1800);
}

function hideBagConfirm() {
  const overlay = document.getElementById('bagConfirm');
  if (overlay) overlay.classList.remove('active');
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

  // Each slide carries its own product link via data-product ("black" | "white")
  // in index.html, so slides can be reordered/added/removed there with nothing to
  // change here. The total count below is derived from the number of slides.
  const PRODUCT_HREF = { white: '/product-polo-white', black: '/product-polo-black' };
  const totalEl = document.getElementById('heroCountTotal');
  if (totalEl) totalEl.textContent = slides.length;

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

    const product = slides[current].dataset.product === 'white' ? 'white' : 'black';
    if (eyebrow) eyebrow.textContent = 'Original Members';
    if (title)   title.innerHTML = '';
    if (cta)     cta.href = PRODUCT_HREF[product];
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

  // Click hero to visit product page
  let touchStartX = 0;
  const heroEl = document.querySelector('.hero');
  if (heroEl) {
    heroEl.addEventListener('click', e => {
      if (e.target.closest('button, a')) return;
      const product = slides[current].dataset.product === 'white' ? 'white' : 'black';
      window.location.href = PRODUCT_HREF[product];
    });
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

// ---- Early-access image slideshow (right side of the SS26 sign-up form) ----
// Upload your images to the repo's images/ folder named EXACTLY as below (in the
// order you want them shown). The slideshow preloads them and only switches on
// once they exist — until then the page keeps showing the single static image,
// so it can never end up blank.
const EARLY_ACCESS_IMAGES = [
  'images/JOGGERS-XTC-back.png',
  'images/JOGGERS-XTC.png',
  'images/T-SHIRT-XTC.png',
  'images/ZIP-HOODIE-BLACK-BACK.png',
  'images/ZIP-HOODIE-XTC.png',
];

function initEarlyAccessSlideshow() {
  const box = document.querySelector('.early-access-bar__image');
  if (!box || !EARLY_ACCESS_IMAGES.length) return;

  // Preload first — only build the slideshow from images that actually load, so
  // missing files never blank the panel (the static fallback image stays).
  const loaded = [];
  let pending = EARLY_ACCESS_IMAGES.length;

  function finish() {
    if (--pending > 0) return;
    if (!loaded.length) return;                 // none uploaded yet → keep static image
    loaded.sort((a, b) => a.i - b.i);

    box.innerHTML = '';
    const slides = loaded.map((o, idx) => {
      const img = document.createElement('img');
      img.className = 'ea-slide' + (idx === 0 ? ' active' : '');
      img.src = o.src;
      img.alt = 'XTC SS26';
      box.appendChild(img);
      return img;
    });

    if (slides.length <= 1) return;             // single image → no rotation
    let cur = 0;
    setInterval(() => {
      const prev = cur;
      cur = (cur + 1) % slides.length;
      slides[prev].classList.add('ea-exit');
      slides[prev].classList.remove('active');
      slides[cur].classList.add('active');
      setTimeout(() => slides[prev].classList.remove('ea-exit'), 800);
    }, 4000);
  }

  EARLY_ACCESS_IMAGES.forEach((src, i) => {
    const test = new Image();
    test.onload = () => { loaded.push({ i: i, src: src }); finish(); };
    test.onerror = finish;
    test.src = src;
  });
}

// ---- Init ----

document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  initNavDrawer();
  initHero();
  initEarlyAccessSlideshow();
});
