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
  'images/ZIP-HOODIE-XTC.png',        // hoodie front
  'images/JOGGERS-XTC.png',           // joggers front
  'images/ZIP-HOODIE-BLACK-BACK.png', // hoodie back
  'images/JOGGERS-XTC-back.png',      // jogger
  'images/T-SHIRT-XTC.png',           // t-shirt
];

function initEarlyAccessSlideshow() {
  const box = document.querySelector('.early-access-bar__image');
  if (!box || !EARLY_ACCESS_IMAGES.length) return;

  // Build the slides directly and let the browser load them natively. (No JS
  // preload gate — on mobile a stalled preload used to stop the slideshow from
  // ever building.) Vertical page scrolling still works over the panel.
  box.style.touchAction = 'pan-y';
  box.innerHTML = '';
  const slides = EARLY_ACCESS_IMAGES.map((src, idx) => {
    const img = document.createElement('img');
    img.className = 'ea-slide' + (idx === 0 ? ' active' : '');
    img.src = src;
    img.alt = 'XTC';
    img.loading = idx === 0 ? 'eager' : 'lazy';
    img.draggable = false;
    box.appendChild(img);
    return img;
  });

  if (slides.length <= 1) return;             // single image → no rotation
  let cur = 0;
  let autoTimer;

  function goTo(nextIdx, direction) {
    if (nextIdx === cur) return;
    const incoming = slides[nextIdx];
    const outgoing = slides[cur];
    cur = nextIdx;

    const enterFrom = direction === 1 ? 'translateX(100%)' : 'translateX(-100%)';
    const exitTo    = direction === 1 ? 'translateX(-100%)' : 'translateX(100%)';

    // Place the incoming slide just off-screen, instantly (no transition).
    incoming.style.transition = 'none';
    incoming.style.transform = enterFrom;
    incoming.style.filter = 'blur(12px)';
    incoming.offsetWidth; // force reflow so the next change animates

    // Animate the incoming slide IN to centre, and the outgoing slide OUT.
    incoming.style.transition = '';
    incoming.classList.add('active');
    incoming.style.transform = 'translateX(0)';
    incoming.style.filter = 'blur(0)';

    outgoing.classList.remove('active');
    outgoing.style.transition = '';
    outgoing.style.transform = exitTo;
    outgoing.style.filter = 'blur(12px)';
  }

  function next() { goTo((cur + 1) % slides.length, 1); }
  function prev() { goTo((cur - 1 + slides.length) % slides.length, -1); }

  function resetAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(next, 4000);
  }
  resetAuto();

  // Drag / swipe support (pointer events — works for mouse + touch)
  let dragStartX = null;
  let dragging = false;

  box.addEventListener('pointerdown', e => {
    dragStartX = e.clientX;
    dragging = false;
  });

  box.addEventListener('pointermove', e => {
    if (dragStartX === null) return;
    if (Math.abs(e.clientX - dragStartX) > 5) dragging = true;
  });

  box.addEventListener('pointerup', e => {
    if (dragStartX === null) return;
    const dx = e.clientX - dragStartX;
    dragStartX = null;
    if (!dragging) return;
    if (Math.abs(dx) < 40) return;   // ignore tiny drags
    if (dx < 0) { next(); } else { prev(); }
    resetAuto();
  });

  box.addEventListener('pointercancel', () => { dragStartX = null; });
  box.addEventListener('dragstart', e => e.preventDefault());
}

// ---- Init ----

document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  initNavDrawer();
  initHero();
  initEarlyAccessSlideshow();
});
