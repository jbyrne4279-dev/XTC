/* ── XTC Stock Management ── */
const XTC_STOCK_KEY = 'xtc-stock';

const DEFAULT_STOCK = {
  'polo-black': { S: 12, M: 18, L: 14, XL: 4, XXL: 2 },
  'polo-white': { S: 10, M: 16, L: 12, XL: 5, XXL: 2 },
};

function getStock() {
  const stored = localStorage.getItem(XTC_STOCK_KEY);
  if (stored) {
    try { return JSON.parse(stored); } catch(e) {}
  }
  // First run — seed default stock
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
