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

app.post('/create-payment-intent', async (req, res) => {
  const { amount } = req.body; // amount in pence
  if (!amount || amount < 30) return res.status(400).json({ error: 'Invalid amount' });
  try {
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: intent.client_secret });
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
      success_url: `${BASE_URL}/order-confirmed.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/cart.html`,
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
