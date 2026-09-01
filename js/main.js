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

// ── Bundle deals ────────────────────────────────────────────────────────────
// Buy the War™ Zip and Joggers together and the pair drops to a flat £200
// (normally £120 + £110 = £230 — roughly 13% off). Detected automatically
// from the cart, no code needed. Shared by the cart drawer and checkout so
// the discount shown in the bag always matches what's charged at checkout.
// Add more bundles here as they're created.
const BUNDLES = [
  {
    label: 'War™ Zip + Joggers Bundle',
    items: { 'war-zip': 120, 'war-joggers': 110 },
    bundlePrice: 200,
  },
];

function cartProductId(id) {
  const parts = id.split('-');
  return parts.slice(0, -1).join('-');
}

function calcBundleDiscount(cart) {
  let totalDiscount = 0;
  const applied = [];
  for (const bundle of BUNDLES) {
    const productIds = Object.keys(bundle.items);
    const qtyFor = pid => cart
      .filter(i => cartProductId(i.id) === pid)
      .reduce((s, i) => s + i.qty, 0);
    const pairCount = Math.min(...productIds.map(qtyFor));
    if (pairCount > 0) {
      const normalPrice = Object.values(bundle.items).reduce((a, b) => a + b, 0);
      const savingPerBundle = normalPrice - bundle.bundlePrice;
      totalDiscount += pairCount * savingPerBundle;
      applied.push({ label: bundle.label, count: pairCount, savingPerBundle });
    }
  }
  return { totalDiscount, applied };
}

// Per-product order cap (across every size combined), on top of raw stock.
// A "limited drop" item can have 10 units in stock per size (30 total) and
// still shouldn't let one shopper take a third of the whole run in one cart.
const MAX_QTY_PER_PRODUCT = 5;

function getCartQtyForProduct(cart, productId, excludeId) {
  return cart
    .filter(i => cartProductId(i.id) === productId && i.id !== excludeId)
    .reduce((s, i) => s + i.qty, 0);
}

// Cart line ids are "polo-black-s", "polo-white-l", etc. — split off the
// trailing size to look up real stock. The returned number is the max this
// *line* (this product+size) can hold — capped by whatever's actually in
// stock for that size, and by MAX_QTY_PER_PRODUCT once every other size of
// the same product already in the cart is counted.
function getMaxQtyForCartId(id, cart) {
  const c = cart || getCart();
  const productId = cartProductId(id);
  const size = id.slice(productId.length + 1).toUpperCase();
  const stockCap = (typeof getSizeStock === 'function') ? Math.min(10, getSizeStock(productId, size)) : 10;
  const otherLinesQty = getCartQtyForProduct(c, productId, id);
  const productCapRemaining = Math.max(0, MAX_QTY_PER_PRODUCT - otherLinesQty);
  return Math.min(stockCap, productCapRemaining);
}

function addToCart(id, name, price, img, quantity = 1) {
  const cart = getCart();

  // Stock + per-product order cap guard — never let the cart hold more
  // units of one size than are in stock, or more of one product (any size
  // mix) than MAX_QTY_PER_PRODUCT.
  const maxQty = getMaxQtyForCartId(id, cart);
  if (maxQty <= 0) {
    const productId = cartProductId(id);
    const otherLinesQty = getCartQtyForProduct(cart, productId, id);
    if (otherLinesQty >= MAX_QTY_PER_PRODUCT) {
      showToast('You can add up to ' + MAX_QTY_PER_PRODUCT + ' of this product per order.');
    } else {
      showToast('Sorry, ' + name + ' is out of stock.');
    }
    return;
  }

  const existing = cart.find(item => item.id === id);
  if (existing) {
    if (existing.qty >= maxQty) {
      showToast('Only ' + maxQty + ' more of this line can be added.');
      return;
    }
    existing.qty = Math.min(maxQty, existing.qty + quantity);
  } else {
    cart.push({ id, name, price, img, qty: Math.min(maxQty, quantity) });
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
  'images/gallery/campaign-4K-3.webp',
  'images/gallery/campaign-girl-black-polo-78.webp',
  'images/gallery/campaign-juvy-95.webp',
  'images/gallery/campaign-4K-2.webp',
  'images/gallery/campaign-style-black-125.webp',
  'images/gallery/campaign-polo-112.webp',
  'images/gallery/campaign-leski-101.webp',
  'images/gallery/campaign-girl-black-polo-75.webp',
  'images/gallery/campaign-otis-109.webp',
  'images/gallery/campaign-leski-102.webp',
  'images/gallery/campaign-4K-4.webp',
  'images/gallery/campaign-oopsie-105.webp',
  'images/gallery/campaign-white-polo-girl-170.webp',
  'images/gallery/campaign-style-black-126.webp',
  'images/gallery/campaign-romy-121.webp',
  'images/gallery/campaign-ash-31.webp',
  'images/gallery/campaign-imz-81.webp',
  'images/gallery/campaign-style-black-146.webp',
  'images/gallery/campaign-blakc-dread-60.webp',
  'images/gallery/campaign-style-black-127.webp',
  'images/gallery/campaign-ash-36.webp',
  'images/gallery/campaign-imz-94.webp',
  'images/gallery/campaign-duo-66.webp',
  'images/gallery/campaign-ghost-71.webp',
  'images/gallery/campaign-style-black-140.webp',
  'images/gallery/campaign-romy-120.webp',
  'images/gallery/campaign-duo-68.webp',
  'images/gallery/campaign-style-black-168.webp',
  'images/gallery/campaign-romy-119.webp',
  'images/gallery/campaign-girl-black-polo-77.webp',
  'images/gallery/campaign-black-white-52.webp',
  'images/gallery/campaign-leski-104.webp',
  'images/gallery/campaign-romy-116.webp',
  'images/gallery/campaign-style-black-134.webp',
  'images/gallery/campaign-white-polo-girl-169.webp',
  'images/gallery/campaign-otis-108.webp',
  'images/gallery/campaign-style-black-155.webp',
  'images/gallery/campaign-ash-20.webp',
  'images/gallery/campaign-juvy-98.webp',
  'images/gallery/campaign-style-black-139.webp',
  'images/gallery/campaign-ash-37.webp',
  'images/gallery/campaign-asain-white-11.webp',
  'images/gallery/campaign-blakc-dread-63.webp',
  'images/gallery/campaign-style-black-145.webp',
  'images/gallery/campaign-imz-82.webp',
  'images/gallery/campaign-style-black-144.webp',
  'images/gallery/campaign-otis-111.webp',
  'images/gallery/campaign-black-white-55.webp',
  'images/gallery/campaign-white-polo-girl-171.webp',
  'images/gallery/campaign-style-black-131.webp',
  'images/gallery/campaign-ledby-100.webp',
  'images/gallery/campaign-imz-93.webp',
  'images/gallery/campaign-black-white-56.webp',
  'images/gallery/campaign-style-black-142.webp',
  'images/gallery/campaign-asain-white-12.webp',
  'images/gallery/campaign-juvy-99.webp',
  'images/gallery/campaign-imz-86.webp',
  'images/gallery/campaign-asain-white-7.webp',
  'images/gallery/campaign-ash-23.webp',
  'images/gallery/campaign-juvy-96.webp',
  'images/gallery/campaign-style-black-167.webp',
  'images/gallery/campaign-romy-118.webp',
  'images/gallery/campaign-ash-26.webp',
  'images/gallery/campaign-SHANIA-124.webp',
  'images/gallery/campaign-ash-34.webp',
  'images/gallery/campaign-blakc-dread-59.webp',
  'images/gallery/campaign-juvy-97.webp',
  'images/gallery/campaign-asain-white-9.webp',
  'images/gallery/campaign-black-white-57.webp',
  'images/gallery/campaign-polo-113.webp'
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
      pos += 0.7;
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
        <p class="cd-header__title">Your Order (<span id="cdCount">0</span>)</p>
        <button class="cd-close" id="cdClose" aria-label="Close bag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="cd-body" id="cdBody"></div>
      <div class="cd-footer" id="cdFooter" style="display:none;">
        <div class="cd-subtotal">
          <span class="cd-subtotal__label">Subtotal</span>
          <span class="cd-subtotal__value" id="cdSubtotal">£0.00</span>
        </div>
        <div class="cd-bundle-row" id="cdBundleRow" style="display:none;">
          <span class="cd-bundle-row__label" id="cdBundleLabel">Bundle discount</span>
          <span class="cd-bundle-row__value" id="cdBundleAmount">£0.00</span>
        </div>
        <div class="cd-subtotal cd-subtotal--total" id="cdTotalRow" style="display:none;">
          <span class="cd-subtotal__label">Total</span>
          <span class="cd-subtotal__value" id="cdTotal">£0.00</span>
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
        <button class="cd-empty__btn" onclick="closeCartDrawer()">Continue</button>
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

  const bundleRow = drawer.querySelector('#cdBundleRow');
  const totalRow = drawer.querySelector('#cdTotalRow');
  let bundleDiscount = 0;
  if (typeof calcBundleDiscount === 'function') {
    const result = calcBundleDiscount(cart);
    bundleDiscount = result.totalDiscount;
    if (bundleDiscount > 0) {
      bundleRow.style.display = 'flex';
      const labels = result.applied.map(b => b.count > 1 ? b.label + ' ×' + b.count : b.label).join(', ');
      drawer.querySelector('#cdBundleLabel').textContent = labels;
      drawer.querySelector('#cdBundleAmount').textContent = '−£' + bundleDiscount.toFixed(2);
    } else {
      bundleRow.style.display = 'none';
    }
  }
  if (bundleDiscount > 0) {
    totalRow.style.display = 'flex';
    drawer.querySelector('#cdTotal').textContent = '£' + (subtotal - bundleDiscount).toFixed(2);
  } else {
    totalRow.style.display = 'none';
  }

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
  const maxQty = getMaxQtyForCartId(item.id, cart);
  if (delta > 0 && item.qty >= maxQty) {
    const productId = cartProductId(item.id);
    const otherLinesQty = getCartQtyForProduct(cart, productId, item.id);
    showToast(otherLinesQty + item.qty >= MAX_QTY_PER_PRODUCT
      ? 'You can add up to ' + MAX_QTY_PER_PRODUCT + ' of this product per order.'
      : 'No more left in stock for this size.');
    return;
  }
  item.qty = Math.min(maxQty, item.qty + delta);
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

  // Exclude this line from the cap calc — it's being moved/merged, not
  // adding new demand for the product.
  const cartWithoutThisLine = cart.filter((c, i) => i !== index);

  // If another line already has this product/size, merge quantities into it
  // instead of creating a duplicate line.
  const existingIdx = cart.findIndex((c, i) => i !== index && c.id === newId);
  if (existingIdx !== -1) {
    const maxQty = getMaxQtyForCartId(newId, cartWithoutThisLine);
    cart[existingIdx].qty = Math.min(maxQty, cart[existingIdx].qty + item.qty);
    cart.splice(index, 1);
  } else {
    const maxQty = getMaxQtyForCartId(newId, cartWithoutThisLine);
    item.id = newId;
    item.name = displayName + ' — ' + newSize;
    item.qty = Math.min(maxQty, item.qty);
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

// ---- Footer accordion (Shop / Account / Help / Legal) ----

function toggleFooterAccordion(btn) {
  const panel = document.getElementById(btn.getAttribute('data-target'));
  const open = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!open));
  if (panel) panel.classList.toggle('open', !open);
}

// ---- Cookie Settings modal ----
// Preferences are stored client-side only (localStorage) and read by
// js/analytics.js to decide whether to fire the Meta Pixel / internal
// analytics events. Essential cookies are never optional.

function getCookieConsent() {
  try {
    const stored = JSON.parse(localStorage.getItem('xtc-cookie-consent') || 'null');
    if (stored && typeof stored === 'object') return { analytics: !!stored.analytics, marketing: !!stored.marketing };
  } catch (e) {}
  return { analytics: false, marketing: false };
}

function csGetModal() {
  let el = document.getElementById('cookieSettingsModal');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'cookieSettingsModal';
  el.innerHTML = `
    <div class="cs-backdrop" onclick="xtcCloseCookieSettings()"></div>
    <div class="cs-panel" role="dialog" aria-modal="true" aria-label="Cookie settings">
      <div class="cs-header">
        <p class="cs-header__title">Cookie Settings</p>
        <button class="cs-close" id="csClose" aria-label="Close" onclick="xtcCloseCookieSettings()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="cs-body">
        <p class="cs-intro">We use cookies to run the site, understand how it's used, and — if you allow it — personalise marketing. See our <a href="/cookie-policy" style="color:inherit;">Cookie Policy</a> for details.</p>
        <div class="cs-row">
          <div>
            <p class="cs-row__label">Essential</p>
            <p class="cs-row__desc">Required for the site to work. Always on.</p>
          </div>
          <button class="cs-switch on" disabled aria-label="Essential cookies (always on)"></button>
        </div>
        <div class="cs-row">
          <div>
            <p class="cs-row__label">Analytics</p>
            <p class="cs-row__desc">Helps us understand site usage and improve it.</p>
          </div>
          <button class="cs-switch" id="csAnalyticsSwitch" onclick="csToggleSwitch(this)" aria-label="Toggle analytics cookies"></button>
        </div>
        <div class="cs-row">
          <div>
            <p class="cs-row__label">Marketing</p>
            <p class="cs-row__desc">Used to personalise ads and campaigns.</p>
          </div>
          <button class="cs-switch" id="csMarketingSwitch" onclick="csToggleSwitch(this)" aria-label="Toggle marketing cookies"></button>
        </div>
      </div>
      <div class="cs-footer">
        <button class="cs-btn" onclick="xtcCloseCookieSettings()">Cancel</button>
        <button class="cs-btn cs-btn--primary" onclick="csSaveCookieSettings()">Save Preferences</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function csToggleSwitch(btn) {
  btn.classList.toggle('on');
}

function csSaveCookieSettings() {
  const consent = {
    analytics: document.getElementById('csAnalyticsSwitch').classList.contains('on'),
    marketing: document.getElementById('csMarketingSwitch').classList.contains('on'),
  };
  localStorage.setItem('xtc-cookie-consent', JSON.stringify(consent));
  xtcCloseCookieSettings();
  if (typeof showToast === 'function') showToast('Cookie preferences saved');
}

function xtcOpenCookieSettings() {
  const modal = csGetModal();
  const consent = getCookieConsent();
  document.getElementById('csAnalyticsSwitch').classList.toggle('on', consent.analytics);
  document.getElementById('csMarketingSwitch').classList.toggle('on', consent.marketing);
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function xtcCloseCookieSettings() {
  const modal = document.getElementById('cookieSettingsModal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

window.getCookieConsent = getCookieConsent;
window.xtcOpenCookieSettings = xtcOpenCookieSettings;
window.xtcCloseCookieSettings = xtcCloseCookieSettings;
window.csToggleSwitch = csToggleSwitch;
window.csSaveCookieSettings = csSaveCookieSettings;
window.toggleFooterAccordion = toggleFooterAccordion;

// ---- Product card image swipe ----
// Each .fp-card__media holds a base <img> (index 0) plus any number of
// overlay .fp-card__img elements (index 1, 2, 3, ...). Touch swipe cycles
// through all of them with wraparound; mouse hover previews the second
// image only, same as before. Dots (if present) track the active index.

function initProductCardSwipe() {
  document.querySelectorAll('.fp-card__media').forEach(function (media) {
    const overlays = Array.from(media.querySelectorAll('.fp-card__img'));
    const dots = Array.from(media.querySelectorAll('.fp-card__dot'));
    const total = overlays.length + 1;
    if (total <= 1) return;

    let index = 0;
    function show(i) {
      index = ((i % total) + total) % total;
      overlays.forEach((img, idx) => img.classList.toggle('fp-card__img--active', idx + 1 === index));
      dots.forEach((d, idx) => d.classList.toggle('fp-card__dot--active', idx === index));
    }

    media.addEventListener('mouseenter', () => show(1));
    media.addEventListener('mouseleave', () => show(0));

    let startX = 0, startY = 0, moved = false;
    media.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      moved = false;
    }, { passive: true });
    media.addEventListener('touchmove', function (e) {
      if (Math.abs(e.touches[0].clientX - startX) > 8) moved = true;
    }, { passive: true });
    media.addEventListener('touchend', function (e) {
      if (!moved) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < 30 || Math.abs(dy) > Math.abs(dx)) return;
      show(dx < 0 ? index + 1 : index - 1);
    }, { passive: true });
  });
}

// ---- Init ----

document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  initNavDrawer();
  initHero();
  initEarlyAccessSlideshow();
  initCartDrawer();
  initProductCardSwipe();
  if (typeof initPhoneCountrySelectors === 'function') initPhoneCountrySelectors();
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') xtcCloseCookieSettings();
  });
});
