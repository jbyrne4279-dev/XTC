/* ── XTC Stock Management — server-backed ── */

const DEFAULT_STOCK = {
  'polo-black': { S: 0, M: 0, L: 6, XL: 0, XXL: 0 },
  'polo-white': { S: 0, M: 2, L: 8, XL: 0, XXL: 0 },
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

// Attach size stock badges to product page size buttons
async function applyStockToBadges(productId) {
  await loadStock();
  const btns = document.querySelectorAll('[data-size]');
  btns.forEach(btn => {
    const size = btn.dataset.size;
    const qty = getSizeStock(productId, size);
    if (qty === 0) {
      btn.classList.add('size-btn--oos');
      btn.disabled = true;
      btn.title = 'Out of stock';
    } else if (qty <= 3) {
      btn.setAttribute('data-stock-label', `${qty} left`);
    }
  });
}

// Initialise cache on script load
loadStock();
