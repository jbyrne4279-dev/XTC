/* ── XTC Stock Management ── */
const XTC_STOCK_KEY = 'xtc-stock';
const XTC_STOCK_VERSION = '3';
const XTC_STOCK_VER_KEY = 'xtc-stock-ver';

const DEFAULT_STOCK = {
  'polo-black': { S: 0, M: 0, L: 6, XL: 0, XXL: 0 },
  'polo-white': { S: 0, M: 2, L: 8, XL: 0, XXL: 0 },
};

function getStock() {
  // Force-reset whenever DEFAULT_STOCK version changes
  if (localStorage.getItem(XTC_STOCK_VER_KEY) !== XTC_STOCK_VERSION) {
    localStorage.setItem(XTC_STOCK_KEY, JSON.stringify(DEFAULT_STOCK));
    localStorage.setItem(XTC_STOCK_VER_KEY, XTC_STOCK_VERSION);
    return DEFAULT_STOCK;
  }
  const stored = localStorage.getItem(XTC_STOCK_KEY);
  if (stored) {
    try { return JSON.parse(stored); } catch(e) {}
  }
  localStorage.setItem(XTC_STOCK_KEY, JSON.stringify(DEFAULT_STOCK));
  return DEFAULT_STOCK;
}

function getStockForProduct(productId) {
  const stock = getStock();
  return stock[productId] || {};
}

function getTotalStock(productId) {
  const sizes = getStockForProduct(productId);
  return Object.values(sizes).reduce((a, b) => a + b, 0);
}

function getSizeStock(productId, size) {
  const sizes = getStockForProduct(productId);
  return sizes[size.toUpperCase()] || 0;
}

function decrementStock(productId, size, qty) {
  const stock = getStock();
  if (!stock[productId]) return false;
  const sizeKey = size.toUpperCase();
  if ((stock[productId][sizeKey] || 0) < qty) return false;
  stock[productId][sizeKey] -= qty;
  localStorage.setItem(XTC_STOCK_KEY, JSON.stringify(stock));
  return true;
}

function setStock(productId, size, qty) {
  const stock = getStock();
  if (!stock[productId]) stock[productId] = {};
  stock[productId][size.toUpperCase()] = Math.max(0, parseInt(qty) || 0);
  localStorage.setItem(XTC_STOCK_KEY, JSON.stringify(stock));
}

// Attach size stock badges to product page size buttons
function applyStockToBadges(productId) {
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
