const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

const PRODUCTS = {
  'polo-black': { name: 'XTC Polo [Black]', amount: 6000 },
  'polo-white': { name: 'XTC Polo [White]', amount: 6000 },
};

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
  const { amount, promoCode } = req.body;
  if (!amount || amount < 30) return res.status(400).json({ error: 'Invalid amount' });

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
      metadata: { promoCode: promoCode || '' },
    });
    res.json({ clientSecret: intent.client_secret, finalAmount });
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


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`XTC server running on port ${PORT}`));
