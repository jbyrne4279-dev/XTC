/* ============================================
   XTC CLOTHING — main.js
   Cart, nav drawer, hero slideshow, search, toast
   ============================================ */

// Cart items store an image path in localStorage from whenever they were
// added — a cart from before the site's jpg/png → webp switch can still
// point at a file that no longer exists. Self-heal by retrying as .webp
// once before giving up and hiding the broken image.
function xtcImgFallback(el) {
  var webp = el.src.replace(/\.(jpg|jpeg|png)(\?.*)?$/i, '.webp');
  if (webp !== el.src && !el.dataset.xtcFallbackTried) {
    el.dataset.xtcFallbackTried = '1';
    el.src = webp;
  } else {
    el.onerror = null;
    el.style.background = 'rgba(255,255,255,0.04)';
    el.style.visibility = 'hidden';
  }
}

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
  // Fade the header basket in and out while it holds items.
  document.querySelectorAll('a[aria-label="Cart"]').forEach(el => {
    el.classList.toggle('cart-active', total > 0);
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

// ---- Click feedback pulse on Add to Cart / Buy Now (same pop as Size/Color) ----

document.addEventListener('click', function(e) {
  const btn = e.target.closest('.pdp-atc, .pdp-buy-now');
  if (!btn) return;
  btn.classList.remove('click-pop');
  void btn.offsetWidth; // restart the animation even on rapid repeat clicks
  btn.classList.add('click-pop');
});

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
  const heroEl = document.querySelector('.hero');
  if (!heroEl) return;

  const prev        = document.getElementById('heroPrev');
  const next        = document.getElementById('heroNext');
  const countEl     = document.getElementById('heroCountCurrent');
  const totalEl     = document.getElementById('heroCountTotal');
  const progressBar = document.getElementById('heroProgressBar');
  const eyebrow     = document.getElementById('heroEyebrow');
  const title       = document.getElementById('heroTitle');
  const cta         = document.getElementById('heroCta');
  const PRODUCT_HREF = { white: '/original-members-polo?color=white', black: '/original-members-polo?color=black' };

  const COPY_ELS = [eyebrow, title, document.querySelector('.hero-bar__right')].filter(Boolean);
  let timer = null;
  const pad = n => String(n).padStart(2, '0');

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

  // Hero images. On desktop (> 768px) the hero is a two-up split — black polos
  // (left half) and white polos (right half) advance together. On mobile the two
  // halves overlap full-width (see CSS) and we run ONE combined slideshow, a
  // single image at a time. We rebuild when crossing the breakpoint.
  const halves    = [...heroEl.querySelectorAll('.hero-half')];
  const allSlides = [...heroEl.querySelectorAll('.hero-slide')];
  if (!allSlides.length) return;
  const mq = window.matchMedia('(max-width: 768px)');

  function clearActive() { allSlides.forEach(s => s.classList.remove('active')); }

  function paint(i) {
    if (eyebrow) eyebrow.textContent = 'Original Members';
    if (title)   title.innerHTML = '';
    if (countEl) countEl.textContent = pad(i + 1);
    animateIn();
    startProgress();
  }

  // Desktop: synced split across both halves.
  function makeDesktop() {
    const groups = halves
      .map(h => [...h.querySelectorAll('.hero-slide')])
      .filter(s => s.length);
    const len = Math.max(...groups.map(g => g.length), 1);
    if (totalEl) totalEl.textContent = len;
    let step = 0;
    function show(n) {
      step = ((n % len) + len) % len;
      clearActive();
      groups.forEach(g => g[step % g.length].classList.add('active'));
      paint(step);
    }
    return { show, first: () => show(0), next: () => show(step + 1), prev: () => show(step - 1) };
  }

  // Mobile: one combined slideshow across every slide.
  function makeMobile() {
    const len = allSlides.length;
    if (totalEl) totalEl.textContent = len;
    let idx = 0;
    function show(n) {
      idx = ((n % len) + len) % len;
      clearActive();
      allSlides[idx].classList.add('active');
      paint(idx);
    }
    return { show, first: () => show(0), next: () => show(idx + 1), prev: () => show(idx - 1) };
  }

  let ctrl = null;
  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => ctrl && ctrl.next(), 5000);
  }
  function build() {
    clearInterval(timer);
    clearActive();
    ctrl = (mq.matches && halves.length >= 2) ? makeMobile() : makeDesktop();
    // Show the first slide instantly (no 1s opacity fade) — only the
    // slideshow's later auto-advances should fade.
    allSlides.forEach(s => { s.style.transition = 'none'; });
    ctrl.first();
    void heroEl.offsetHeight; // flush the opacity change before re-enabling transitions
    requestAnimationFrame(() => {
      allSlides.forEach(s => { s.style.transition = ''; });
    });
    startTimer();
  }

  // Product link for a hero click: on mobile use the visible (active) slide's
  // half; on desktop use the half that was clicked.
  function productForClick(e) {
    let half = mq.matches
      ? (heroEl.querySelector('.hero-slide.active') || null)?.closest('.hero-half')
      : e.target.closest('.hero-half');
    if (!half) half = heroEl.querySelector('.hero-slide.active')?.closest('.hero-half');
    return half && half.dataset.product === 'white' ? 'white' : 'black';
  }

  prev && prev.addEventListener('click', e => { e.stopPropagation(); ctrl && ctrl.prev(); startTimer(); });
  next && next.addEventListener('click', e => { e.stopPropagation(); ctrl && ctrl.next(); startTimer(); });
  if (cta) cta.href = '/original-members-polo';

  heroEl.addEventListener('click', e => {
    if (e.target.closest('button, a')) return;
    window.location.href = PRODUCT_HREF[productForClick(e)];
  });
  let touchStartX = 0;
  heroEl.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  heroEl.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (ctrl && Math.abs(diff) > 40) { (diff > 0 ? ctrl.next() : ctrl.prev()); startTimer(); }
  }, { passive: true });

  if (mq.addEventListener) mq.addEventListener('change', build);
  else if (mq.addListener) mq.addListener(build);
  build();
}

// ---- Members Only image (right side of the sign-up form) ----
// A single static image (girl wearing the polo). With one entry the builder
// shows it without any rotation. Add more entries to turn it back into a
// rotating slideshow.
const EARLY_ACCESS_IMAGES = [
  'images/gallery/campaign-4K-2.webp',
  'images/gallery/campaign-4K-3.webp',
  'images/gallery/campaign-4K-4.webp',
  'images/gallery/campaign-4K-5.webp',
  'images/gallery/campaign-asain-white-10.webp',
  'images/gallery/campaign-asain-white-11.webp',
  'images/gallery/campaign-asain-white-12.webp',
  'images/gallery/campaign-asain-white-13.webp',
  'images/gallery/campaign-asain-white-6.webp',
  'images/gallery/campaign-asain-white-7.webp',
  'images/gallery/campaign-asain-white-8.webp',
  'images/gallery/campaign-asain-white-9.webp',
  'images/gallery/campaign-ash-14.webp',
  'images/gallery/campaign-ash-15.webp',
  'images/gallery/campaign-ash-16.webp',
  'images/gallery/campaign-ash-17.webp',
  'images/gallery/campaign-ash-18.webp',
  'images/gallery/campaign-ash-19.webp',
  'images/gallery/campaign-ash-20.webp',
  'images/gallery/campaign-ash-21.webp',
  'images/gallery/campaign-ash-22.webp',
  'images/gallery/campaign-ash-23.webp',
  'images/gallery/campaign-ash-24.webp',
  'images/gallery/campaign-ash-25.webp',
  'images/gallery/campaign-ash-26.webp',
  'images/gallery/campaign-ash-27.webp',
  'images/gallery/campaign-ash-28.webp',
  'images/gallery/campaign-ash-29.webp',
  'images/gallery/campaign-ash-30.webp',
  'images/gallery/campaign-ash-31.webp',
  'images/gallery/campaign-ash-32.webp',
  'images/gallery/campaign-ash-33.webp',
  'images/gallery/campaign-ash-34.webp',
  'images/gallery/campaign-ash-35.webp',
  'images/gallery/campaign-ash-36.webp',
  'images/gallery/campaign-ash-37.webp',
  'images/gallery/campaign-ash-38.webp',
  'images/gallery/campaign-ash-39.webp',
  'images/gallery/campaign-ash-40.webp',
  'images/gallery/campaign-ash-41.webp',
  'images/gallery/campaign-ash-42.webp',
  'images/gallery/campaign-black-white-43.webp',
  'images/gallery/campaign-black-white-44.webp',
  'images/gallery/campaign-black-white-45.webp',
  'images/gallery/campaign-black-white-46.webp',
  'images/gallery/campaign-black-white-47.webp',
  'images/gallery/campaign-black-white-48.webp',
  'images/gallery/campaign-black-white-49.webp',
  'images/gallery/campaign-black-white-50.webp',
  'images/gallery/campaign-black-white-51.webp',
  'images/gallery/campaign-black-white-52.webp',
  'images/gallery/campaign-black-white-53.webp',
  'images/gallery/campaign-black-white-54.webp',
  'images/gallery/campaign-black-white-55.webp',
  'images/gallery/campaign-black-white-56.webp',
  'images/gallery/campaign-black-white-57.webp',
  'images/gallery/campaign-blakc-dread-58.webp',
  'images/gallery/campaign-blakc-dread-59.webp',
  'images/gallery/campaign-blakc-dread-60.webp',
  'images/gallery/campaign-blakc-dread-61.webp',
  'images/gallery/campaign-blakc-dread-62.webp',
  'images/gallery/campaign-blakc-dread-63.webp',
  'images/gallery/campaign-blakc-dread-64.webp',
  'images/gallery/campaign-blakc-dread-65.webp',
  'images/gallery/campaign-duo-66.webp',
  'images/gallery/campaign-duo-67.webp',
  'images/gallery/campaign-duo-68.webp',
  'images/gallery/campaign-ghost-69.webp',
  'images/gallery/campaign-ghost-70.webp',
  'images/gallery/campaign-ghost-71.webp',
  'images/gallery/campaign-ghost-72.webp',
  'images/gallery/campaign-ghost-73.webp',
  'images/gallery/campaign-ghost-74.webp',
  'images/gallery/campaign-girl-black-polo-75.webp',
  'images/gallery/campaign-girl-black-polo-76.webp',
  'images/gallery/campaign-girl-black-polo-77.webp',
  'images/gallery/campaign-girl-black-polo-78.webp',
  'images/gallery/campaign-imz-79.webp',
  'images/gallery/campaign-imz-80.webp',
  'images/gallery/campaign-imz-81.webp',
  'images/gallery/campaign-imz-82.webp',
  'images/gallery/campaign-imz-83.webp',
  'images/gallery/campaign-imz-84.webp',
  'images/gallery/campaign-imz-85.webp',
  'images/gallery/campaign-imz-86.webp',
  'images/gallery/campaign-imz-87.webp',
  'images/gallery/campaign-imz-88.webp',
  'images/gallery/campaign-imz-89.webp',
  'images/gallery/campaign-imz-90.webp',
  'images/gallery/campaign-imz-91.webp',
  'images/gallery/campaign-imz-92.webp',
  'images/gallery/campaign-imz-93.webp',
  'images/gallery/campaign-imz-94.webp',
  'images/gallery/campaign-juvy-95.webp',
  'images/gallery/campaign-juvy-96.webp',
  'images/gallery/campaign-juvy-97.webp',
  'images/gallery/campaign-juvy-98.webp',
  'images/gallery/campaign-juvy-99.webp',
  'images/gallery/campaign-ledby-100.webp',
  'images/gallery/campaign-leski-101.webp',
  'images/gallery/campaign-leski-102.webp',
  'images/gallery/campaign-leski-103.webp',
  'images/gallery/campaign-leski-104.webp',
  'images/gallery/campaign-oopsie-105.webp',
  'images/gallery/campaign-oopsie-106.webp',
  'images/gallery/campaign-oopsie-107.webp',
  'images/gallery/campaign-otis-108.webp',
  'images/gallery/campaign-otis-109.webp',
  'images/gallery/campaign-otis-110.webp',
  'images/gallery/campaign-otis-111.webp',
  'images/gallery/campaign-polo-112.webp',
  'images/gallery/campaign-polo-113.webp',
  'images/gallery/campaign-polo-114.webp',
  'images/gallery/campaign-polo-115.webp',
  'images/gallery/campaign-romy-116.webp',
  'images/gallery/campaign-romy-117.webp',
  'images/gallery/campaign-romy-118.webp',
  'images/gallery/campaign-romy-119.webp',
  'images/gallery/campaign-romy-120.webp',
  'images/gallery/campaign-romy-121.webp',
  'images/gallery/campaign-SHANIA-123.webp',
  'images/gallery/campaign-SHANIA-124.webp',
  'images/gallery/campaign-style-black-125.webp',
  'images/gallery/campaign-style-black-126.webp',
  'images/gallery/campaign-style-black-127.webp',
  'images/gallery/campaign-style-black-128.webp',
  'images/gallery/campaign-style-black-129.webp',
  'images/gallery/campaign-style-black-130.webp',
  'images/gallery/campaign-style-black-131.webp',
  'images/gallery/campaign-style-black-132.webp',
  'images/gallery/campaign-style-black-133.webp',
  'images/gallery/campaign-style-black-134.webp',
  'images/gallery/campaign-style-black-135.webp',
  'images/gallery/campaign-style-black-136.webp',
  'images/gallery/campaign-style-black-137.webp',
  'images/gallery/campaign-style-black-138.webp',
  'images/gallery/campaign-style-black-139.webp',
  'images/gallery/campaign-style-black-140.webp',
  'images/gallery/campaign-style-black-141.webp',
  'images/gallery/campaign-style-black-142.webp',
  'images/gallery/campaign-style-black-143.webp',
  'images/gallery/campaign-style-black-144.webp',
  'images/gallery/campaign-style-black-145.webp',
  'images/gallery/campaign-style-black-146.webp',
  'images/gallery/campaign-style-black-147.webp',
  'images/gallery/campaign-style-black-148.webp',
  'images/gallery/campaign-style-black-149.webp',
  'images/gallery/campaign-style-black-150.webp',
  'images/gallery/campaign-style-black-151.webp',
  'images/gallery/campaign-style-black-152.webp',
  'images/gallery/campaign-style-black-153.webp',
  'images/gallery/campaign-style-black-154.webp',
  'images/gallery/campaign-style-black-155.webp',
  'images/gallery/campaign-style-black-156.webp',
  'images/gallery/campaign-style-black-157.webp',
  'images/gallery/campaign-style-black-158.webp',
  'images/gallery/campaign-style-black-159.webp',
  'images/gallery/campaign-style-black-160.webp',
  'images/gallery/campaign-style-black-161.webp',
  'images/gallery/campaign-style-black-162.webp',
  'images/gallery/campaign-style-black-163.webp',
  'images/gallery/campaign-style-black-164.webp',
  'images/gallery/campaign-style-black-165.webp',
  'images/gallery/campaign-style-black-166.webp',
  'images/gallery/campaign-style-black-167.webp',
  'images/gallery/campaign-style-black-168.webp',
  'images/gallery/campaign-girl-black-polo-75.webp',
  'images/gallery/campaign-white-polo-girl-170.webp',
  'images/gallery/campaign-white-polo-girl-171.webp',
  'images/gallery/campaign-white-polo-girl-172.webp',
  'images/gallery/campaign-white-polo-girl-173.webp',
  'images/gallery/campaign-XTC-META-CAMPAIGN-2026-1.webp',
  'images/gallery/campaign-girl-black-polo-75.webp',
];

function initEarlyAccessSlideshow() {
  const box = document.querySelector('.early-access-bar__image');
  if (!box || !EARLY_ACCESS_IMAGES.length) return;

  box.innerHTML = '';

  // Build a continuous horizontal scroll track (same as the gallery carousel).
  // Duplicate the images for a seamless infinite loop.
  const track = document.createElement('div');
  track.className = 'ea-scroll-track';

  // Only the first few need to load eagerly (what's actually visible on
  // load) — with a full gallery's worth of images in the loop, eager-
  // loading all of them would tank the page load.
  [...EARLY_ACCESS_IMAGES, ...EARLY_ACCESS_IMAGES].forEach((src, idx) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'XTC';
    img.loading = idx < 3 ? 'eager' : 'lazy';
    img.draggable = false;
    track.appendChild(img);
  });

  // Native horizontal-scroll viewport so users can swipe it left/right on
  // mobile; JS gently auto-advances it and pauses while the user interacts.
  const viewport = document.createElement('div');
  viewport.className = 'ea-scroll-viewport';
  viewport.appendChild(track);
  box.appendChild(viewport);

  let paused = false, resumeTimer = null;
  // scrollLeft rounds to whole pixels on write in most browsers, so
  // accumulating a sub-1px-per-frame increment directly on it gets
  // truncated back to 0 every frame and never moves. Track the exact
  // position in JS instead and only write the rounded pixel value.
  let pos = viewport.scrollLeft;
  function pause() { paused = true; clearTimeout(resumeTimer); }
  function resumeSoon() { clearTimeout(resumeTimer); resumeTimer = setTimeout(() => { paused = false; }, 2500); }

  function step() {
    if (!paused) {
      const half = track.scrollWidth / 2; // images are duplicated once
      pos += 0.2;
      if (half > 0 && pos >= half) pos -= half;
      viewport.scrollLeft = pos;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  ['pointerdown', 'touchstart', 'mousedown', 'wheel'].forEach(ev =>
    viewport.addEventListener(ev, pause, { passive: true }));
  ['pointerup', 'touchend', 'mouseup', 'mouseleave'].forEach(ev =>
    viewport.addEventListener(ev, () => { pos = viewport.scrollLeft; resumeSoon(); }, { passive: true }));
  viewport.addEventListener('scroll', () => { if (!paused) return; pos = viewport.scrollLeft; resumeSoon(); }, { passive: true });
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

  const SIZE_ORDER = ['S', 'M', 'L', 'XL', 'XXL'];

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

    // Other in-stock sizes for this product, so "Change" only shows when
    // there's actually somewhere else to change to.
    const stockForProduct = typeof getStockForProduct === 'function' ? getStockForProduct(productId) : {};
    const otherSizes = SIZE_ORDER.filter(s => s !== size && (stockForProduct[s] || 0) > 0);

    return `
      <div class="cd-item${oos ? ' cd-item--oos' : ''}">
        <img class="cd-item__img" src="${item.img}" alt="${displayName}" loading="lazy" onerror="xtcImgFallback(this)" />
        <div class="cd-item__body">
          <div class="cd-item__top">
            <div>
              <p class="cd-item__name">${displayName}</p>
              ${oos ? `<p class="cd-item__oos-label">Out of stock</p>` : ''}
            </div>
            <p class="cd-item__price">${item.price}</p>
          </div>
          <div class="cd-item__bottom">
            <div class="cd-qty-wrap">
              <div class="cd-qty">
                <button class="cd-qty__btn" onclick="cdUpdateQty(${i},-1)" aria-label="Decrease quantity">−</button>
                <span class="cd-qty__val">${item.qty}</span>
                <button class="cd-qty__btn" onclick="cdUpdateQty(${i},1)" aria-label="Increase quantity">+</button>
              </div>
              ${variant ? `
              <div class="cd-size-row">
                <p class="cd-item__variant">Size: ${variant}</p>
                ${otherSizes.length ? `
                <div class="cd-size-change-wrap">
                  <button class="cd-size-change" onclick="cdToggleSizePicker(event,${i})">Change</button>
                  <div class="cd-size-picker" id="cdSizePicker-${i}">
                    ${otherSizes.map(s => `<button class="cd-size-picker__btn" onclick="cdChangeSize(${i},'${s}')">${s}</button>`).join('')}
                  </div>
                </div>` : ''}
              </div>` : ''}
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
  if (item.qty + delta < 1) { cdRemoveItem(index); return; }
  item.qty = Math.min(10, item.qty + delta);
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

function cdToggleSizePicker(event, index) {
  event.stopPropagation();
  const picker = document.getElementById('cdSizePicker-' + index);
  if (!picker) return;
  const isOpen = picker.classList.contains('open');
  document.querySelectorAll('.cd-size-picker.open').forEach(p => p.classList.remove('open'));
  if (!isOpen) picker.classList.add('open');
}

document.addEventListener('click', function (e) {
  if (!e.target.closest('.cd-size-change-wrap')) {
    document.querySelectorAll('.cd-size-picker.open').forEach(p => p.classList.remove('open'));
  }
});

function cdChangeSize(index, newSize) {
  const cart = getCart();
  const item = cart[index];
  if (!item) return;

  const idParts = item.id.split('-');
  const productId = idParts.slice(0, -1).join('-');
  const newId = productId + '-' + newSize.toLowerCase();

  const dashIdx = item.name.lastIndexOf(' — ');
  const displayName = dashIdx !== -1 ? item.name.slice(0, dashIdx) : item.name;

  // If another line already has this product/size, merge quantities into it
  // instead of creating a duplicate line.
  const existingIdx = cart.findIndex((c, i) => i !== index && c.id === newId);
  if (existingIdx !== -1) {
    cart[existingIdx].qty = Math.min(10, cart[existingIdx].qty + item.qty);
    cart.splice(index, 1);
  } else {
    item.id = newId;
    item.name = displayName + ' — ' + newSize;
  }

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
  if (typeof initPhoneCountrySelectors === 'function') initPhoneCountrySelectors();
});
