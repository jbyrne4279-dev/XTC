/* ── XTC Analytics — GA4 custom events ── */

// Safe gtag wrapper (fires even if GA4 blocks)
function xtcEvent(eventName, params) {
  if (typeof gtag === 'function') {
    gtag('event', eventName, params);
  }
  // Also track locally for admin dashboard
  const key = 'xtc-analytics';
  const data = JSON.parse(localStorage.getItem(key) || '{}');
  const today = new Date().toISOString().slice(0, 10);
  if (!data[today]) data[today] = { pageviews: 0, addToCart: 0, checkouts: 0, purchases: 0, revenue: 0 };
  if (eventName === 'page_view')       data[today].pageviews++;
  if (eventName === 'add_to_cart')     data[today].addToCart++;
  if (eventName === 'begin_checkout')  data[today].checkouts++;
  if (eventName === 'purchase')        { data[today].purchases++; data[today].revenue += (params && params.value) || 0; }
  // Keep 90 days
  const keys = Object.keys(data).sort();
  if (keys.length > 90) keys.slice(0, keys.length - 90).forEach(k => delete data[k]);
  localStorage.setItem(key, JSON.stringify(data));
}

// Auto page view on load
document.addEventListener('DOMContentLoaded', function() {
  xtcEvent('page_view', { page_title: document.title, page_location: window.location.href });
});

// Hook add-to-cart globally
const _origAddToCart = window.addToCart;
if (typeof _origAddToCart === 'function') {
  window.addToCart = function(id, name, price, img, qty) {
    _origAddToCart.apply(this, arguments);
    const value = parseFloat((price || '0').replace(/[^0-9.]/g, ''));
    xtcEvent('add_to_cart', { currency: 'GBP', value, items: [{ item_id: id, item_name: name, quantity: qty || 1, price: value }] });
  };
}
