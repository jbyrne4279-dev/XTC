/* ── XTC Stock Management — server-backed ── */

const DEFAULT_STOCK = {
  'polo-black': { S: 0, M: 0, L: 6, XL: 0, XXL: 0 },
  'polo-white': { S: 0, M: 2, L: 8, XL: 0, XXL: 0 },
  // SS26 War Collection — pre-order (ships 21 July), limited run of 10 per size
  'war-zip': { S: 10, M: 10, L: 10 },
  'war-joggers': { S: 10, M: 10, L: 10 },
  'uniform-t': { S: 10, M: 10, L: 10 },
};

// In-memory cache populated by loadStock()
let _stockCache = null;

async function loadStock() {
  try {
    const res = await fetch('/stock');
    if (res.ok) {
      const data = await res.json();
      _stockCache = data.stock;
    }
  } catch(e) {
    // Fall back to defaults if server unreachable
  }
  if (!_stockCache) _stockCache = JSON.parse(JSON.stringify(DEFAULT_STOCK));
  return _stockCache;
}

// Force a fresh fetch from the server, bypassing cache
async function refreshStock() {
  try {
    const res = await fetch('/stock?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      _stockCache = data.stock;
    }
  } catch(e) { /* keep existing cache on network error */ }
  return _stockCache || DEFAULT_STOCK;
}

function getStock() {
  return _stockCache || DEFAULT_STOCK;
}

function getStockForProduct(productId) {
  return getStock()[productId] || {};
}

function getTotalStock(productId) {
  return Object.values(getStockForProduct(productId)).reduce((a, b) => a + b, 0);
}

function getSizeStock(productId, size) {
  return (getStockForProduct(productId)[size.toUpperCase()] || 0);
}

// Products whose out-of-stock sizes can still be PRE-ORDERED (charged now,
// shipped 21 July) rather than being blocked. Keep in sync with the server.
const PREORDER_PRODUCTS = ['polo-black', 'polo-white'];
function isPreorderProduct(productId) {
  return PREORDER_PRODUCTS.indexOf(productId) !== -1;
}

// Called after successful payment — sends decrement to server
async function decrementStockServer(items) {
  try {
    const res = await fetch('/stock/decrement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (res.ok) {
      const data = await res.json();
      _stockCache = data.stock;
    }
  } catch(e) { /* non-critical */ }
}

// Attach size stock badges to product page size buttons. For pre-order
// products, out-of-stock sizes stay selectable and are marked "Pre-Order"
// instead of being disabled.
async function applyStockToBadges(productId) {
  await loadStock();
  const preorder = isPreorderProduct(productId);
  const btns = document.querySelectorAll('[data-size]');
  btns.forEach(btn => {
    const size = btn.dataset.size;
    const qty = getSizeStock(productId, size);
    btn.classList.remove('size-btn--oos', 'size-btn--preorder');
    btn.disabled = false;
    btn.removeAttribute('data-stock-label');
    if (qty === 0) {
      if (preorder) {
        // No data-stock-label here — it triggers the amber low-stock border.
        btn.classList.add('size-btn--preorder');
        btn.title = 'Out of stock — pre-order, ships 21 July';
      } else {
        btn.classList.add('size-btn--oos');
        btn.disabled = true;
        btn.title = 'Out of stock';
      }
    } else if (qty <= 3) {
      btn.setAttribute('data-stock-label', `${qty} left`);
    }
  });
}

// Initialise cache on script load
loadStock();
