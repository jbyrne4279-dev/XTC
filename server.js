const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
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

// Called after successful payment to decrement stock
app.post('/stock/decrement', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
  const stock = await getStock();
  if (!stock) return res.status(500).json({ error: 'Could not load stock' });
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
  res.json({ ok: true, stock, errors });
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
  const { amount, promoCode, cartSummary, cartItems } = req.body;
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
      },
    });
    res.json({ clientSecret: intent.client_secret, intentId: intent.id, finalAmount });
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
    try {
      const cartItems = JSON.parse(pi.metadata.cartItems || '[]');
      if (Array.isArray(cartItems) && cartItems.length) {
        const stock = await getStock();
        for (const { productId, size, qty = 1 } of cartItems) {
          const sizeKey = (size || '').toUpperCase();
          const current = (stock && stock[productId] && stock[productId][sizeKey]) || 0;
          await setStockSize(productId, sizeKey, Math.max(0, current - qty));
          if (stock && stock[productId]) stock[productId][sizeKey] = Math.max(0, current - qty);
        }
        console.log('Stock decremented for payment_intent', pi.id);
      }
    } catch (err) {
      console.error('Stock decrement error:', err.message);
    }
  }

  res.json({ received: true });
});

// Attach shipping/customer details to payment intent before confirmation
app.post('/update-payment-intent', async (req, res) => {
  const { intentId, name, email, phone, address, city, postcode, cartSummary } = req.body;
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
          country: 'GB',
        },
      },
      metadata: { name: name || '', email: email || '', cartSummary: cartSummary || '' },
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

// Idempotent upsert of an order row. Swallows errors so checkout / the
// confirmation page never break if the orders table isn't set up yet.
async function saveOrder(order) {
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
    if (!row.id || !row.email) return { ok: false, error: 'id and email required' };
    const { error } = await sb.from('orders').upsert(row, { onConflict: 'id' });
    if (error) { console.error('saveOrder error:', error.message); return { ok: false, error: error.message }; }
    return { ok: true };
  } catch (e) {
    console.error('saveOrder exception:', e.message);
    return { ok: false, error: e.message };
  }
}

// Save an order placed via the custom checkout (called from checkout.html).
app.post('/orders', async (req, res) => {
  const { id, email, items, total, status, source } = req.body || {};
  if (!id || !email) return res.status(400).json({ error: 'id and email required' });
  const user = await getUserFromToken(req); // optional — links the order to the account when signed in
  const result = await saveOrder({
    id, email, items, total, status,
    source: source || 'custom',
    user_id: user ? user.id : null,
  });
  if (!result.ok) return res.status(500).json({ error: result.error });
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

// ── In-memory shipping records ───────────────────────────────────────────────
const shippingRecords = new Map();

// ── Admin auth middleware ────────────────────────────────────────────────────
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'xtcadmin2026';

function requireAdmin(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Admin: Orders ────────────────────────────────────────────────────────────
app.get('/admin/orders', requireAdmin, async (req, res) => {
  try {
    const intents = await stripe.paymentIntents.list({ limit: 100, expand: ['data.charges'] });
    const orders = intents.data.map(pi => {
      const charge = pi.charges && pi.charges.data && pi.charges.data[0];
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

// ── Admin: Promo codes (read-only) ───────────────────────────────────────────
app.get('/admin/promo-codes', requireAdmin, (req, res) => {
  const codes = Object.entries(PROMO_CODES).map(([code, data]) => ({
    code,
    ...data,
  }));
  res.json({ codes });
});

// ── Admin: Shipping ──────────────────────────────────────────────────────────
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


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`XTC server running on port ${PORT}`));
