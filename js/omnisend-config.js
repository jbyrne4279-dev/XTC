/* ── Omnisend Integration ── */
const OMNISEND_API_KEY   = '686857c87d5d9b4678a0bf26-MP1JfwAUYUrugUb14knD7LfRP889t2XotO77wzKgIN3H1PYHbJ';
const OMNISEND_BRAND_ID  = '686857c87d5d9b4678a0bf26';

// Load Omnisend tracking widget
(function() {
  window.omnisend = window.omnisend || [];
  omnisend.push(['accountID', OMNISEND_BRAND_ID]);
  var s = document.createElement('script');
  s.type = 'text/javascript'; s.async = true;
  s.src = 'https://omnisend.com/widget.js';
  document.head.appendChild(s);
  // Persist so admin panel shows as connected
  localStorage.setItem('xtc-omnisend-id', OMNISEND_BRAND_ID);
})();

/**
 * Subscribe an email to Omnisend.
 * source = tag added to the contact (e.g. 'loyalty-form', 'checkout', 'contact-form')
 */
async function omnisendSubscribe(email, source) {
  if (!email || !email.includes('@')) return;

  // JS SDK identify (fires immediately, no CORS issue)
  if (window.omnisend) {
    omnisend.push(['identifyContact', { email }]);
    omnisend.push(['track', '$subscribed', { email }]);
  }

  // REST API — creates/updates the contact as subscribed
  try {
    await fetch('https://api.omnisend.com/v3/contacts', {
      method: 'POST',
      headers: {
        'X-API-KEY': OMNISEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        status: 'subscribed',
        statusDate: new Date().toISOString(),
        tags: [source || 'website'],
        sendWelcomeEmail: true,
      }),
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
