const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const app = express();
// Raw body parser for Stripe webhook signature verification (must come before express.json)
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

const PRODUCTS = {
  'polo-black': { name: 'XTC Polo [Black]', amount: 6000 },
  'polo-white': { name: 'XTC Polo [White]', amount: 6000 },
};

// Loyalty: 1 point earned per £1 spent; each point redeems for 5 pence (100 pts = £5).
const POINT_VALUE_PENCE = 5;

// ── Meta Conversions API (server-side Purchase) ──────────────────────────────
// Sends the Purchase event straight from the server so conversions still track
// when the browser pixel is blocked (ad blockers / iOS). Deduplicated with the
// browser pixel via a shared event_id (the order ref). Set META_CAPI_TOKEN in
// the server environment (Railway) — never commit the token to the repo.
const META_PIXEL_ID   = process.env.META_PIXEL_ID || '2539030076613054';
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN || '';

// ── Omnisend (server-side order confirmation email) ──────────────────────────
// Set OMNISEND_API_KEY in the Railway environment variables.
const OMNISEND_API_KEY = process.env.OMNISEND_API_KEY || '';

function sha256(v) {
  return crypto.createHash('sha256').update(String(v == null ? '' : v).trim().toLowerCase()).digest('hex');
}

function readCookie(req, name) {
  const c = req.headers.cookie || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : undefined;
}

async function sendMetaCapiPurchase(order, req, cartItems) {
  if (!META_CAPI_TOKEN) return; // not configured yet — no-op
  try {
    const userData = {
      client_ip_address: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '',
      client_user_agent: req.headers['user-agent'] || '',
    };
    if (order.email) userData.em = [sha256(order.email)];
    const fbp = readCookie(req, '_fbp'); if (fbp) userData.fbp = fbp;
    const fbc = readCookie(req, '_fbc'); if (fbc) userData.fbc = fbc;

    const custom = { currency: 'GBP', value: Number(order.total) || 0 };
    if (Array.isArray(cartItems) && cartItems.length) {
      custom.content_type = 'product';
      custom.content_ids = cartItems.map(i => i.productId).filter(Boolean);
      custom.num_items = cartItems.reduce((n, i) => n + (parseInt(i.qty, 10) || 1), 0);
    }

    const payload = {
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: String(order.id || ''),            // dedup key — matches the browser pixel's eventID
        action_source: 'website',
        event_source_url: 'https://xtcclothing.com/order-confirmed',
        user_data: userData,
        custom_data: custom,
      }],
    };

    const url = 'https://graph.facebook.com/v21.0/' + META_PIXEL_ID + '/events?access_token=' + encodeURIComponent(META_CAPI_TOKEN);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('Meta CAPI error:', res.status, t);
    }
  } catch (e) {
    console.error('Meta CAPI exception:', e.message);
  }
}

// Posts an order to Omnisend's Orders API, which triggers the "Order Confirmation"
// automation and sends the customer a transactional confirmation email.
// Fire-and-forget — never blocks or breaks the checkout response.
async function sendOmnisendOrderConfirmation(order, cartItems) {
  if (!OMNISEND_API_KEY) return;
  try {
    const now = new Date().toISOString();
    const lineItems = (Array.isArray(cartItems) && cartItems.length)
      ? cartItems.map(ci => {
          const p = PRODUCTS[ci.productId];
          const unitPrice = p ? p.amount / 100 : (order.total || 0);
          return {
            productID: String(ci.productId || ''),
            productTitle: p ? p.name : String(ci.productId || ''),
            variantTitle: ci.size || '',
            quantity: parseInt(ci.qty, 10) || 1,
            price: parseFloat(unitPrice.toFixed(2)),
            currency: 'GBP',
          };
        })
      : (Array.isArray(order.items) ? order.items : []).map((it, idx) => ({
          productID: String(idx + 1),
          productTitle: it.name || 'Item',
          variantTitle: '',
          quantity: it.qty || 1,
          price: parseFloat(String(it.price || '0').replace(/[^0-9.]/g, '')) || 0,
          currency: 'GBP',
        }));

    const payload = {
      orderID: String(order.id || ''),
      email: (order.email || '').toLowerCase().trim(),
      orderUrl: `${BASE_URL}/track?id=${encodeURIComponent(order.id)}&email=${encodeURIComponent((order.email || '').toLowerCase().trim())}`,
      currency: 'GBP',
      orderSum: parseFloat((Number(order.total) || 0).toFixed(2)),
      paymentStatus: 'paid',
      fulfillmentStatus: 'inProgress',
      createdAt: now,
      updatedAt: now,
      lineItems,
    };

    const res = await fetch('https://api.omnisend.com/v3/orders', {
      method: 'POST',
      headers: {
        'X-API-KEY': OMNISEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('Omnisend order confirmation error:', res.status, body);
    } else {
      console.log('Omnisend order confirmation sent for', order.id);
    }
  } catch (e) {
    console.error('Omnisend order confirmation exception:', e.message);
  }
}

// ── Supabase client (service role for server-side writes) ─────────────────────
const sb = createClient(
  'https://mugifniadilfwfgrsvie.supabase.co',
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: ws } }
);

// ── Stock helpers ─────────────────────────────────────────────────────────────
async function getStock() {
  const { data, error } = await sb.from('stock').select('product_id, sizes');
  if (error || !data || !data.length) return null;
  const stock = {};
  data.forEach(row => { stock[row.product_id] = row.sizes; });
  return stock;
}

async function setStockSizes(productId, sizesObj) {
  // Write all sizes for a product atomically in one upsert
  const sizes = {};
  Object.keys(sizesObj).forEach(k => { sizes[k.toUpperCase()] = Math.max(0, parseInt(sizesObj[k]) || 0); });
  await sb.from('stock').upsert({ product_id: productId, sizes, updated_at: new Date().toISOString() }, { onConflict: 'product_id' });
}

async function setStockSize(productId, sizeKey, qty) {
  // Read current row, patch the one size, write back atomically
  const { data } = await sb.from('stock').select('sizes').eq('product_id', productId).single();
  const sizes = (data && data.sizes) ? { ...data.sizes } : {};
  sizes[sizeKey.toUpperCase()] = Math.max(0, qty);
  await sb.from('stock').upsert({ product_id: productId, sizes, updated_at: new Date().toISOString() }, { onConflict: 'product_id' });
}

// Public: read all stock
app.get('/stock', async (req, res) => {
  const stock = await getStock();
  res.json({ stock });
});

// Decrement stock for a list of { productId, size, qty } items.
async function doStockDecrement(items) {
  const stock = await getStock();
  if (!stock) return { ok: false, error: 'Could not load stock' };
  const errors = [];
  for (const { productId, size, qty = 1 } of items) {
    const sizeKey = (size || '').toUpperCase();
    if (!stock[productId] || stock[productId][sizeKey] === undefined) {
      errors.push(`Unknown product/size: ${productId}/${sizeKey}`);
      continue;
    }
    const newQty = Math.max(0, (stock[productId][sizeKey] || 0) - qty);
    await setStockSize(productId, sizeKey, newQty);
    stock[productId][sizeKey] = newQty;
  }
  return { ok: true, stock, errors };
}

// Idempotency guard: claim the stock decrement for an order so it only runs once,
// no matter how many paths (client order-save, webhook) try it.
// Returns true (claimed now → caller should decrement), false (already done →
// skip), or null (can't determine — e.g. stock_decremented column not migrated
// yet, or the order row doesn't exist).
async function claimStockDecrement(orderId) {
  if (!orderId) return null;
  try {
    const { data, error } = await sb.from('orders')
      .update({ stock_decremented: true })
      .eq('id', String(orderId))
      .eq('stock_decremented', false)
      .select('id');
    if (error) return null;
    return Array.isArray(data) && data.length > 0;
  } catch (e) { return null; }
}

// Called after successful payment to decrement stock. Idempotent per order when
// an orderId is supplied.
app.post('/stock/decrement', async (req, res) => {
  const { items, orderId } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
  if (orderId) {
    const claimed = await claimStockDecrement(orderId);
    if (claimed === false) return res.json({ ok: true, alreadyDone: true, stock: await getStock() });
    // claimed === true or null (best-effort, e.g. pre-migration) → proceed
  }
  const result = await doStockDecrement(items);
  res.json(result);
});

// Admin: update all sizes for a product at once (bulk) or a single size
app.put('/admin/stock', requireAdmin, async (req, res) => {
  const { productId, size, qty, sizes } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId required' });
  if (sizes && typeof sizes === 'object') {
    // Bulk: { productId, sizes: { S: 3, M: 5, ... } }
    await setStockSizes(productId, sizes);
  } else if (size !== undefined && qty !== undefined) {
    // Single size: { productId, size, qty }
    await setStockSize(productId, size.toUpperCase(), parseInt(qty) || 0);
  } else {
    return res.status(400).json({ error: 'sizes object or size+qty required' });
  }
  const stock = await getStock();
  res.json({ ok: true, stock });
});

// Admin: get full stock
app.get('/admin/stock', requireAdmin, async (req, res) => {
  const stock = await getStock();
  res.json({ stock });
});

const BASE_URL = process.env.BASE_URL || 'https://xtcclothing.com';

// ── Promo codes ──────────────────────────────────────────────────────────────
// Add new codes here. type: 'percent' or 'fixed' (pence). active: false to disable.
const PROMO_CODES = {
  'WELCOME10':  { type: 'percent', value: 10,   active: true,  description: '10% off' },
  'JBYRNE2005': { type: 'percent', value: 99,   active: true,  description: '99% off' },
  'XTC15':      { type: 'percent', value: 15,   active: true,  description: '15% off' },
  'FREESHIP':   { type: 'fixed',   value: 499,  active: true,  description: 'Free shipping' },
};

app.post('/validate-promo', (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase();
  const promo = PROMO_CODES[code];
  if (!promo || !promo.active) return res.status(400).json({ error: 'Invalid or expired code' });
  res.json({ valid: true, type: promo.type, value: promo.value, description: promo.description });
});

app.post('/create-payment-intent', async (req, res) => {
  const { amount, promoCode, cartSummary, cartItems, redeemPoints } = req.body;
  if (!amount || amount < 30) return res.status(400).json({ error: 'Invalid amount' });

  // Stock check — reject if any item is out of stock
  if (Array.isArray(cartItems) && cartItems.length) {
    const stock = await getStock();
    if (!stock) return res.status(500).json({ error: 'Could not load stock' });
    for (const { productId, size, qty = 1 } of cartItems) {
      const sizeKey = (size || '').toUpperCase();
      const available = (stock[productId] && stock[productId][sizeKey]) || 0;
      if (available < qty) {
        const label = `${productId} ${sizeKey}`;
        return res.status(400).json({ error: `Sorry, "${label}" is out of stock or has insufficient quantity. Please update your cart.`, outOfStock: true });
      }
    }
  }

  let finalAmount = Math.round(amount);

  // Apply promo discount server-side so it can't be tampered with client-side
  if (promoCode) {
    const promo = PROMO_CODES[(promoCode || '').trim().toUpperCase()];
    if (promo && promo.active) {
      if (promo.type === 'percent') {
        finalAmount = Math.round(finalAmount * (1 - promo.value / 100));
      } else if (promo.type === 'fixed') {
        finalAmount = Math.max(30, finalAmount - promo.value);
      }
    }
  }

  // Apply loyalty redemption server-side: validate against the signed-in user's
  // real balance, clamp, and discount (1 pt = 5 pence — 100 pts = £5). Never trust the client.
  let redeemApplied = 0;
  let redeemUserId = '';
  const reqRedeem = parseInt(redeemPoints, 10);
  if (Number.isFinite(reqRedeem) && reqRedeem > 0) {
    const user = await getUserFromToken(req);
    if (user) {
      try {
        const bal = await computeBalance(user);
        // Most points usable without dropping below the Stripe minimum (30p).
        const maxByAmount = Math.floor(Math.max(0, finalAmount - 30) / POINT_VALUE_PENCE);
        redeemApplied = Math.max(0, Math.min(reqRedeem, bal.available, maxByAmount));
        if (redeemApplied > 0) {
          finalAmount -= redeemApplied * POINT_VALUE_PENCE;
          redeemUserId = user.id;
        }
      } catch (e) { redeemApplied = 0; redeemUserId = ''; }
    }
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount: finalAmount,
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
      description: cartSummary || '',
      metadata: {
        promoCode: promoCode || '',
        cartSummary: (cartSummary || '').slice(0, 500),
        cartItems: JSON.stringify(cartItems || []).slice(0, 500),
        redeemPoints: String(redeemApplied),
        redeemUserId: redeemUserId,
      },
    });
    res.json({ clientSecret: intent.client_secret, intentId: intent.id, finalAmount, redeemApplied });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Stripe webhook — reliable server-side stock decrement ────────────────────
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    let cartItems = [];
    try { cartItems = JSON.parse((pi.metadata && pi.metadata.cartItems) || '[]'); } catch (e) { cartItems = []; }
    const ref = 'XTC' + pi.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();

    // 1) Persist the order as a safety net. The id is the SAME XTC ref derived
    //    from the PaymentIntent that the client checkout and the confirmation
    //    page use, so this reconciles to one row; insertOnly means it never
    //    overwrites their richer data (it only fills in if they never ran).
    //    Saved first so the stock claim below has a row to mark.
    try {
      const email = pi.receipt_email || (pi.metadata && pi.metadata.email) || '';
      const redeemed = redeemFromMetadata(pi.metadata);
      const items = (Array.isArray(cartItems) ? cartItems : []).map(ci => {
        const p = PRODUCTS[ci.productId];
        const unit = p ? p.amount / 100 : null;
        const name = (p ? p.name : ci.productId) + (ci.size ? ' — ' + ci.size : '');
        return { name, qty: ci.qty || 1, price: unit != null ? '£' + unit.toFixed(2) : '' };
      });
      await saveOrder({
        id: ref,
        email,
        items,
        total: pi.amount != null ? pi.amount / 100 : null,
        status: 'Processing',
        source: 'stripe',
        redeemed_points: redeemed,
      }, { insertOnly: true });
      // Authoritative redemption record: ensure it's set even if the client's
      // POST /orders created the row first without it. Same trusted value, so
      // this is idempotent.
      if (redeemed > 0) {
        try { await sb.from('orders').update({ redeemed_points: redeemed }).eq('id', ref); } catch (e) {}
      }
    } catch (err) {
      console.error('Webhook order save error:', err.message);
    }

    // 2) Send Omnisend order confirmation — idempotent (Omnisend deduplicates by
    //    orderID, so re-posting the same order won't send a duplicate email).
    try {
      const emailForOmnisend = pi.receipt_email || (pi.metadata && pi.metadata.email) || '';
      if (emailForOmnisend) {
        const itemsForOmnisend = (Array.isArray(cartItems) ? cartItems : []).map(ci => {
          const p = PRODUCTS[ci.productId];
          return { name: (p ? p.name : ci.productId) + (ci.size ? ' — ' + ci.size : ''), qty: ci.qty || 1, price: p ? '£' + (p.amount / 100).toFixed(2) : '' };
        });
        sendOmnisendOrderConfirmation(
          { id: ref, email: emailForOmnisend, total: pi.amount != null ? pi.amount / 100 : null, items: itemsForOmnisend },
          cartItems
        );
      }
    } catch (err) {
      console.error('Webhook Omnisend error:', err.message);
    }

    // 3) Decrement stock — idempotent fallback. Only runs if this order's stock
    //    wasn't already decremented by the client's POST /orders.
    try {
      if (Array.isArray(cartItems) && cartItems.length) {
        const claimed = await claimStockDecrement(ref);
        if (claimed === true) {
          await doStockDecrement(cartItems);
          console.log('Stock decremented (webhook) for payment_intent', pi.id);
        }
      }
    } catch (err) {
      console.error('Stock decrement error:', err.message);
    }
  }

  res.json({ received: true });
});

// Attach shipping/customer details to payment intent before confirmation
app.post('/update-payment-intent', async (req, res) => {
  const { intentId, name, email, phone, address, city, postcode, country, cartSummary } = req.body;
  if (!intentId) return res.status(400).json({ error: 'intentId required' });
  try {
    await stripe.paymentIntents.update(intentId, {
      receipt_email: email || undefined,
      shipping: {
        name: name || '',
        phone: phone || '',
        address: {
          line1: address || '',
          city: city || '',
          postal_code: postcode || '',
          country: country || 'GB',
        },
      },
      metadata: { name: name || '', email: email || '', country: country || '', cartSummary: cartSummary || '' },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/create-checkout-session', async (req, res) => {
  const { productId, size, quantity = 1 } = req.body;
  const product = PRODUCTS[productId];

  if (!product) return res.status(400).json({ error: 'Unknown product' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'gbp',
          unit_amount: product.amount,
          product_data: {
            name: `${product.name}${size ? ' — ' + size : ''}`,
          },
        },
        quantity,
      }],
      success_url: `${BASE_URL}/order-confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/cart`,
      shipping_address_collection: { allowed_countries: ['GB', 'US', 'CA', 'AU', 'IE'] },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Order lookup — verified order details for the confirmation page ──────────
// Reads the real Stripe Checkout Session so the confirmation page shows
// trusted line items + total (not just whatever is in the browser's cart).
app.get('/order/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return res.status(400).json({ error: 'Invalid session id' });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items'],
    });
    // Only reveal details for genuinely paid orders
    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Order not paid', paid: false });
    }
    const items = ((session.line_items && session.line_items.data) || []).map(li => ({
      name: li.description,
      qty: li.quantity,
      amount: li.amount_total, // pence, includes quantity
    }));
    const pi = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent && session.payment_intent.id) || session.id;
    const ref = 'XTC' + pi.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    const email = (session.customer_details && session.customer_details.email) || '';

    // Persist the Stripe hosted-checkout order so it shows on the customer's
    // profile (idempotent on the order ref — safe to re-run on page refresh).
    saveOrder({
      id: ref,
      email,
      items: items.map(li => ({ name: li.name, qty: li.qty, price: '£' + (li.amount / 100 / (li.qty || 1)).toFixed(2) })),
      total: session.amount_total != null ? session.amount_total / 100 : null,
      status: 'Processing',
      source: 'stripe',
    });

    res.json({
      ok: true,
      paid: true,
      ref,
      email,
      total: session.amount_total, // pence
      currency: session.currency,
      items,
    });
  } catch (err) {
    console.error('Order lookup error:', err.message);
    res.status(404).json({ error: 'Order not found' });
  }
});

// ── Orders (persistent, Supabase) ────────────────────────────────────────────
// Verify a Supabase access token and return the auth user (or null if absent/invalid).
async function getUserFromToken(req) {
  const authz = req.headers['authorization'] || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) return null;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error) return null;
    return (data && data.user) || null;
  } catch (e) { return null; }
}

// ── Loyalty points ───────────────────────────────────────────────────────────
// Points are derived from the account's orders: earn 1 point per £1 spent,
// minus points already redeemed on past orders. 100 pts = £5 (1 pt = 5 pence).
function redeemFromMetadata(meta) {
  const n = parseInt((meta && meta.redeemPoints) || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function computeBalance(user) {
  const email = (user.email || '').toLowerCase();
  let q = sb.from('orders').select('total, redeemed_points, user_id, email');
  q = email ? q.or(`user_id.eq.${user.id},email.eq.${email}`) : q.eq('user_id', user.id);
  const { data, error } = await q;
  if (error) return { earned: 0, redeemed: 0, available: 0 };
  let earned = 0, redeemed = 0;
  (data || []).forEach(function (o) {
    earned += Math.max(0, Math.round(Number(o.total) || 0));
    redeemed += Math.max(0, Math.round(Number(o.redeemed_points) || 0));
  });
  return { earned: earned, redeemed: redeemed, available: Math.max(0, earned - redeemed) };
}

// Current user's loyalty balance (for the checkout redeem UI + profile).
app.get('/loyalty', async (req, res) => {
  const user = await getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Not signed in', earned: 0, redeemed: 0, available: 0 });
  try {
    res.json(await computeBalance(user));
  } catch (e) {
    res.json({ earned: 0, redeemed: 0, available: 0 });
  }
});

// Idempotent upsert of an order row, keyed on the order id. Swallows errors so
// checkout / the confirmation page never break if the orders table isn't set up.
// Pass { insertOnly: true } for the webhook safety net so a sparse fallback row
// never overwrites the richer row written by the client or confirmation page.
async function saveOrder(order, opts) {
  opts = opts || {};
  try {
    const row = {
      id: String(order.id || ''),
      user_id: order.user_id || null,
      email: (order.email || '').toLowerCase(),
      items: Array.isArray(order.items) ? order.items : [],
      total: order.total != null ? Number(order.total) : null,
      status: order.status || 'Processing',
      source: order.source || 'custom',
    };
    // Only set redeemed_points when there's a redemption, so order saving still
    // works before the redeemed_points column migration has been run (redemption
    // is impossible until then anyway, since computeBalance returns 0).
    const rp = Math.max(0, Math.round(Number(order.redeemed_points) || 0));
    if (rp > 0) row.redeemed_points = rp;
    if (order.phone)    row.phone    = String(order.phone);
    if (order.country)  row.country  = String(order.country);
    if (order.name)     row.name     = String(order.name);
    if (order.address)  row.address  = String(order.address);
    if (order.city)     row.city     = String(order.city);
    if (order.postcode) row.postcode = String(order.postcode);
    if (!row.id || !row.email) return { ok: false, error: 'id and email required' };
    let { error } = await sb.from('orders').upsert(row, { onConflict: 'id', ignoreDuplicates: !!opts.insertOnly });
    // Graceful fallback: if columns don't exist yet, retry without the new fields
    if (error && /column|schema cache/i.test(error.message || '')) {
      const baseRow = { id: row.id, user_id: row.user_id, email: row.email, items: row.items, total: row.total, status: row.status, source: row.source };
      if (rp > 0) baseRow.redeemed_points = rp;
      ({ error } = await sb.from('orders').upsert(baseRow, { onConflict: 'id', ignoreDuplicates: !!opts.insertOnly }));
    }
    if (error) { console.error('saveOrder error:', error.message); return { ok: false, error: error.message }; }
    return { ok: true };
  } catch (e) {
    console.error('saveOrder exception:', e.message);
    return { ok: false, error: e.message };
  }
}

// Save an order placed via the custom checkout (called from checkout.html).
app.post('/orders', async (req, res) => {
  const { id, email, items, total, status, source, intentId, cartItems, phone, country, name, address, city, postcode } = req.body || {};
  if (!id || !email) return res.status(400).json({ error: 'id and email required' });
  const user = await getUserFromToken(req); // optional — links the order to the account when signed in
  // Redeemed points come from the trusted PaymentIntent metadata (set server-side
  // in /create-payment-intent), never from the client claim.
  let redeemed_points = 0;
  if (intentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(intentId);
      redeemed_points = redeemFromMetadata(pi.metadata);
    } catch (e) { /* ignore — leave at 0 */ }
  }
  const result = await saveOrder({
    id, email, items, total, status,
    source: source || 'custom',
    user_id: user ? user.id : null,
    redeemed_points,
    phone: phone || '',
    country: country || '',
    name: name || '',
    address: address || '',
    city: city || '',
    postcode: postcode || '',
  });
  if (!result.ok) return res.status(500).json({ error: result.error });

  // Fire the server-side Purchase to Meta (Conversions API). Fire-and-forget so
  // it never delays the order response; deduped with the browser pixel by event_id.
  sendMetaCapiPurchase({ id, email, total }, req, cartItems);

  // Send Omnisend order confirmation email (triggers the automation in Omnisend).
  sendOmnisendOrderConfirmation({ id, email, total, items }, cartItems);

  // Decrement stock once per order (idempotent via the order's flag). cartItems
  // is [{ productId, size, qty }]. The webhook does the same as a fallback.
  if (Array.isArray(cartItems) && cartItems.length) {
    try {
      const claimed = await claimStockDecrement(id);
      if (claimed !== false) await doStockDecrement(cartItems);
    } catch (e) { console.error('Order stock decrement error:', e.message); }
  }
  res.json({ ok: true });
});

// Return the signed-in user's orders (matched by user_id or email).
app.get('/orders', async (req, res) => {
  const user = await getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Not signed in', orders: [] });
  const email = (user.email || '').toLowerCase();
  try {
    let query = sb.from('orders').select('*').order('created_at', { ascending: false });
    query = email ? query.or(`user_id.eq.${user.id},email.eq.${email}`) : query.eq('user_id', user.id);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message, orders: [] });
    res.json({ orders: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message, orders: [] });
  }
});

// Admin/debug: inspect the persisted orders table. Confirms the table exists and
// the pipeline is writing rows. Optional ?email= filter. Requires the admin token.
app.get('/admin/orders-db', requireAdmin, async (req, res) => {
  try {
    const email = (req.query.email || '').toString().toLowerCase();
    let q = sb.from('orders').select('*').order('created_at', { ascending: false }).limit(200);
    if (email) q = q.eq('email', email);
    const { data, error } = await q;
    if (error) {
      return res.status(500).json({ ok: false, error: error.message, hint: 'Run db/orders.sql in the Supabase SQL editor to create the orders table.' });
    }
    res.json({ ok: true, count: data ? data.length : 0, orders: data || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── In-memory shipping records ───────────────────────────────────────────────
const shippingRecords = new Map();

// ── Admin auth middleware ────────────────────────────────────────────────────
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'XTC4279';

function requireAdmin(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Admin: Orders ────────────────────────────────────────────────────────────
app.get('/admin/orders', requireAdmin, async (req, res) => {
  try {
    const intents = await stripe.paymentIntents.list({ limit: 100, expand: ['data.latest_charge'] });
    const orders = intents.data.map(pi => {
      // `charges` was removed from PaymentIntent in recent Stripe API versions —
      // use the expanded `latest_charge` object instead.
      const charge = (pi.latest_charge && typeof pi.latest_charge === 'object') ? pi.latest_charge : null;
      const billing = charge && charge.billing_details;
      return {
        id: pi.id,
        amount: pi.amount,
        currency: pi.currency,
        status: pi.status,
        created: pi.created,
        receipt_email: pi.receipt_email || (billing && billing.email) || '',
        metadata: pi.metadata,
        description: pi.description,
        shipping: pi.shipping,
        // Fall back to billing_details from charge if no shipping set
        billing: billing ? {
          name: billing.name,
          email: billing.email,
          phone: billing.phone,
          address: billing.address,
        } : null,
      };
    });
    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Order fulfillment (status / tracking) — written to the Supabase orders
//    table so customers see it on their profile and the track-order page ───────
function refFromPiId(piId) {
  return 'XTC' + String(piId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
}

async function setOrderFulfillment(orderId, fields) {
  const core = {};
  if (fields.status != null && fields.status !== '') core.status = String(fields.status);
  if (fields.carrier != null) core.carrier = String(fields.carrier);
  if (fields.trackingNumber != null) core.tracking_number = String(fields.trackingNumber);
  if (Object.keys(core).length === 0) return { ok: false, error: 'Nothing to update' };

  const run = (patch) => sb.from('orders').update(patch).eq('id', String(orderId)).select('id, status');

  // Try the full update (incl. carrier/tracking/updated_at). If those columns
  // aren't migrated yet, fall back to a status-only update so status changes
  // always work — the part customers care about.
  let { data, error } = await run(Object.assign({ updated_at: new Date().toISOString() }, core));
  if (error && /column|schema cache/i.test(error.message || '')) {
    if (core.status) {
      ({ data, error } = await run({ status: core.status }));
    } else {
      return { ok: false, error: error.message, needsMigration: true };
    }
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, updated: !!(data && data.length), order: data && data[0] };
}

// Admin: update an order's status / tracking. :id is the order ref (XTC…).
app.patch('/admin/orders/:id', requireAdmin, async (req, res) => {
  const { status, carrier, trackingNumber } = req.body || {};
  if (status == null && carrier == null && trackingNumber == null) {
    return res.status(400).json({ error: 'Nothing to update' });
  }
  const r = await setOrderFulfillment(req.params.id, { status, carrier, trackingNumber });
  if (!r.ok) return res.status(500).json({ error: r.error, hint: 'Run db/setup.sql (orders needs carrier/tracking_number columns).' });
  if (!r.updated) return res.status(404).json({ error: 'Order not found in the orders table' });
  res.json({ ok: true, order: r.order });
});

// Public: track an order by ref + email (email must match — prevents enumeration).
app.get('/track', async (req, res) => {
  const id = (req.query.id || '').toString().trim();
  const email = (req.query.email || '').toString().trim().toLowerCase();
  if (!id || !email) return res.status(400).json({ error: 'Order ID and email are required' });
  try {
    const { data, error } = await sb.from('orders')
      .select('id, email, status, carrier, tracking_number, items, total, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data || (data.email || '').toLowerCase() !== email) {
      return res.status(404).json({ error: 'No order found for that ID and email.' });
    }
    res.json({ order: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: Promo codes (read-only) ───────────────────────────────────────────
app.get('/admin/promo-codes', requireAdmin, (req, res) => {
  const codes = Object.entries(PROMO_CODES).map(([code, data]) => ({
    code,
    ...data,
  }));
  res.json({ codes });
});

// ── Admin: Shipping (legacy in-memory; kept for compatibility) ───────────────
app.post('/admin/shipping', requireAdmin, (req, res) => {
  const { paymentIntentId, carrier, trackingNumber, status } = req.body;
  if (!paymentIntentId || !carrier || !trackingNumber) {
    return res.status(400).json({ error: 'paymentIntentId, carrier, trackingNumber required' });
  }
  const record = {
    paymentIntentId,
    carrier,
    trackingNumber,
    status: status || 'Shipped',
    shippedAt: new Date().toISOString(),
  };
  shippingRecords.set(paymentIntentId, record);
  res.json({ ok: true, record });
});

app.get('/admin/shipping', requireAdmin, (req, res) => {
  res.json({ shipping: Array.from(shippingRecords.values()) });
});

app.patch('/admin/shipping/:paymentIntentId', requireAdmin, (req, res) => {
  const { paymentIntentId } = req.params;
  const record = shippingRecords.get(paymentIntentId);
  if (!record) return res.status(404).json({ error: 'Shipping record not found' });
  const updated = { ...record, ...req.body, paymentIntentId };
  shippingRecords.set(paymentIntentId, updated);
  res.json({ ok: true, record: updated });
});

// ── Admin: Refund ────────────────────────────────────────────────────────────
app.post('/admin/refund', requireAdmin, async (req, res) => {
  const { paymentIntentId } = req.body;
  if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId required' });
  try {
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
    res.json({ ok: true, refund });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// ── SEO: sitemap + robots ────────────────────────────────────────────────────
app.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, 'sitemap.xml'));
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /checkout\nDisallow: /order-confirmed\nDisallow: /profile\n\nSitemap: https://xtcclothing.com/sitemap.xml\n'
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`XTC server running on port ${PORT}`));
