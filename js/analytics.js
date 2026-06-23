/* ── XTC Analytics — GA4 custom events ── */

/* ─────────────────────────────────────────────────────────────────────────
   META (FACEBOOK) PIXEL
   1. Open Meta Events Manager → your Pixel → copy the Pixel ID (a number).
   2. Paste it between the quotes below. Leave blank to keep the pixel off.
   PageView, ViewContent, AddToCart, InitiateCheckout and Purchase then fire
   automatically across the whole site.
   ───────────────────────────────────────────────────────────────────────── */
var META_PIXEL_ID = '2539030076613054'; // Meta Pixel ID

(function initMetaPixel() {
  if (!META_PIXEL_ID || window.fbq) return;
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ?
      n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
    n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', META_PIXEL_ID);
  fbq('track', 'PageView');
  // Product pages → ViewContent (powers retargeting + optimisation)
  if (location.pathname.indexOf('product-') > -1) {
    fbq('track', 'ViewContent', { content_name: document.title, currency: 'GBP' });
  }
})();

function metaTrack(eventName, params) {
  if (window.fbq && META_PIXEL_ID) { try { fbq('track', eventName, params || {}); } catch (e) {} }
}

// Safe gtag wrapper (fires even if GA4 blocks)
function xtcEvent(eventName, params) {
  if (typeof gtag === 'function') {
    gtag('event', eventName, params);
  }
  // Mirror the key funnel events to the Meta Pixel. (Purchase is fired on the
  // order-confirmed page so it isn't cut off by the checkout redirect.)
  if (eventName === 'add_to_cart') {
    var it = params && params.items && params.items[0];
    metaTrack('AddToCart', {
      currency: (params && params.currency) || 'GBP',
      value: (params && params.value) || 0,
      content_type: 'product',
      content_name: it && it.item_name,
      content_ids: it ? [it.item_id] : undefined
    });
  }
  if (eventName === 'begin_checkout') {
    metaTrack('InitiateCheckout', { currency: 'GBP', value: (params && params.value) || 0 });
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
