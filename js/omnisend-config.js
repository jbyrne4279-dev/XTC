/* ── Omnisend Integration ── */
const OMNISEND_BRAND_ID = '686857c87d5d9b4678a0bf26';

// Load Omnisend tracking widget
(function() {
  window.omnisend = window.omnisend || [];
  omnisend.push(['accountID', OMNISEND_BRAND_ID]);
  var s = document.createElement('script');
  s.type = 'text/javascript'; s.async = true;
  s.src = 'https://omnisend.com/widget.js';
  document.head.appendChild(s);
  localStorage.setItem('xtc-omnisend-id', OMNISEND_BRAND_ID);
})();

/**
 * Subscribe an email to Omnisend via the server proxy (API key stays server-side).
 */
async function omnisendSubscribe(email, source) {
  if (!email || !email.includes('@')) return;

  if (window.omnisend) {
    omnisend.push(['identifyContact', { email }]);
    omnisend.push(['track', '$subscribed', { email }]);
  }

  try {
    await fetch('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: source || 'website' }),
    });
  } catch (e) {
    // Silently fail — tracking SDK still fired above
  }
}

/**
 * Track a purchase event in Omnisend
 */
function omnisendTrackPurchase(orderId, email, items, total) {
  if (!window.omnisend) return;
  omnisend.push(['identifyContact', { email }]);
  omnisend.push(['track', '$purchased', {
    orderId,
    currency: 'GBP',
    revenue: total,
    lineItems: (items || []).map(i => ({
      productId: i.id,
      productName: i.name,
      quantity: i.qty,
      price: parseFloat((i.price || '0').replace(/[^0-9.]/g, '')),
    })),
  }]);
}
