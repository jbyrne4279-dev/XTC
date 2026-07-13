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
  openCartDrawer();
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

// ---- Members Only image (right side of the sign-up form) ----
// A single static image (girl wearing the polo). With one entry the builder
// shows it without any rotation. Add more entries to turn it back into a
// rotating slideshow.
const EARLY_ACCESS_IMAGES = [
  'images/hero-1.jpg',
  'images/polo-white-model-2.jpg',
  'images/polo-black-model-3.jpg',
  'images/polo-white-model-3.jpg',
  'images/hero-2.jpg',
  'images/polo-white-model-5.jpg',
  'images/polo-black-model-4.jpg',
  'images/editorial-1.jpg',
];

function initEarlyAccessSlideshow() {
  const box = document.querySelector('.early-access-bar__image');
  if (!box || !EARLY_ACCESS_IMAGES.length) return;

  box.innerHTML = '';

  // Build a continuous horizontal scroll track (same as the gallery carousel).
  // Duplicate the images for a seamless infinite loop.
  const track = document.createElement('div');
  track.className = 'ea-scroll-track';

  [...EARLY_ACCESS_IMAGES, ...EARLY_ACCESS_IMAGES].forEach((src, idx) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'XTC';
    img.loading = idx < EARLY_ACCESS_IMAGES.length ? 'eager' : 'lazy';
    img.draggable = false;
    track.appendChild(img);
  });

  box.appendChild(track);
}

// ---- Cart Drawer ----

function cdGetDrawer() {
  let el = document.getElementById('cartDrawer');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'cartDrawer';
  el.innerHTML = `
    <div class="cd-backdrop"></div>
    <div class="cd-panel" role="dialog" aria-modal="true" aria-label="Shopping bag">
      <div class="cd-header">
        <p class="cd-header__title">Your Bag (<span id="cdCount">0</span>)</p>
        <button class="cd-close" id="cdClose" aria-label="Close bag">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="cd-body" id="cdBody"></div>
      <div class="cd-footer" id="cdFooter" style="display:none;">
        <div class="cd-subtotal">
          <span class="cd-subtotal__label">Subtotal</span>
          <span class="cd-subtotal__value" id="cdSubtotal">£0.00</span>
        </div>
        <p class="cd-shipping-note">Free UK shipping on orders over £80. Taxes and shipping calculated at checkout.</p>
        <p class="cd-oos-warning" id="cdOosWarning" style="display:none;">Remove out-of-stock items to check out.</p>
        <div class="cd-actions">
          <a class="cd-checkout-btn" href="/checkout" id="cdCheckoutBtn">Checkout</a>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('.cd-backdrop').addEventListener('click', closeCartDrawer);
  el.querySelector('#cdClose').addEventListener('click', closeCartDrawer);
  el.querySelector('#cdCheckoutBtn').addEventListener('click', function(e) {
    if (this.classList.contains('cd-checkout-btn--disabled')) e.preventDefault();
  });
  return el;
}

function cdParsePrice(str) {
  const n = parseFloat(String(str).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function renderCartDrawer() {
  const drawer = cdGetDrawer();
  const cart = getCart();
  const body = drawer.querySelector('#cdBody');
  const footer = drawer.querySelector('#cdFooter');
  const countEl = drawer.querySelector('#cdCount');
  const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
  countEl.textContent = totalQty;

  if (cart.length === 0) {
    body.innerHTML = `
      <div class="cd-empty">
        <p class="cd-empty__text">Your bag is empty</p>
        <button class="cd-empty__btn" onclick="closeCartDrawer()">Continue Shopping</button>
      </div>`;
    footer.style.display = 'none';
    return;
  }

  footer.style.display = 'block';
  let hasOos = false;
  body.innerHTML = cart.map((item, i) => {
    const dashIdx = item.name.lastIndexOf(' — ');
    const displayName = dashIdx !== -1 ? item.name.slice(0, dashIdx) : item.name;
    const variant = dashIdx !== -1 ? item.name.slice(dashIdx + 3) : '';

    // id format is "productid-size", e.g. "polo-black-m" — the same convention
    // addToCart() uses for its own stock guard.
    const idParts = item.id.split('-');
    const size = (idParts[idParts.length - 1] || '').toUpperCase();
    const productId = idParts.slice(0, -1).join('-');
    const inStock = typeof getSizeStock === 'function' ? getSizeStock(productId, size) : 1;
    const oos = inStock <= 0;
    if (oos) hasOos = true;

    return `
      <div class="cd-item${oos ? ' cd-item--oos' : ''}">
        <img class="cd-item__img" src="${item.img}" alt="${displayName}" loading="lazy" onerror="this.style.background='rgba(255,255,255,0.04)'" />
        <div class="cd-item__body">
          <div class="cd-item__top">
            <div>
              <p class="cd-item__name">${displayName}</p>
              ${variant ? `<p class="cd-item__variant">${variant}</p>` : ''}
              ${oos ? `<p class="cd-item__oos-label">Out of stock</p>` : ''}
            </div>
            <p class="cd-item__price">${item.price}</p>
          </div>
          <div class="cd-item__bottom">
            <div class="cd-qty">
              <button class="cd-qty__btn" onclick="cdUpdateQty(${i},-1)" aria-label="Decrease quantity">−</button>
              <span class="cd-qty__val">${item.qty}</span>
              <button class="cd-qty__btn" onclick="cdUpdateQty(${i},1)" aria-label="Increase quantity">+</button>
            </div>
            <button class="cd-item__remove" onclick="cdRemoveItem(${i})">Remove</button>
          </div>
        </div>
      </div>`;
  }).join('');

  const subtotal = cart.reduce((sum, item) => sum + cdParsePrice(item.price) * item.qty, 0);
  drawer.querySelector('#cdSubtotal').textContent = '£' + subtotal.toFixed(2);

  const oosWarning = drawer.querySelector('#cdOosWarning');
  const checkoutBtn = drawer.querySelector('#cdCheckoutBtn');
  oosWarning.style.display = hasOos ? 'block' : 'none';
  checkoutBtn.classList.toggle('cd-checkout-btn--disabled', hasOos);
  checkoutBtn.setAttribute('aria-disabled', hasOos ? 'true' : 'false');
}

function cdUpdateQty(index, delta) {
  const cart = getCart();
  const item = cart[index];
  if (!item) return;
  item.qty = Math.max(1, Math.min(10, item.qty + delta));
  saveCart(cart);
  updateCartCount();
  renderCartDrawer();
}

function cdRemoveItem(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);
  updateCartCount();
  renderCartDrawer();
}

function openCartDrawer() {
  renderCartDrawer();
  cdGetDrawer().classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  if (!drawer) return;
  drawer.classList.remove('open');
  document.body.style.overflow = '';
}

function initCartDrawer() {
  document.querySelectorAll('a[href="/cart"][aria-label="Cart"]').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      openCartDrawer();
    });
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeCartDrawer();
  });
}

// ---- Init ----

document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  initNavDrawer();
  initHero();
  initEarlyAccessSlideshow();
  initCartDrawer();
});
