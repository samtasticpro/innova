const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());

// Allow only your site that hosts the DrChrono page
app.use(cors({
  origin: ['https://yourdomain.com'], // change to your domain
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));

app.get('/health', (_, res) => res.send('ok'));

app.post('/api/authorize-token', async (req, res) => {
  try {
    const { amount, invoiceNumber, customerId, description } = req.body;
    if (!amount || !invoiceNumber) {
      return res.status(400).json({ error: 'amount and invoiceNumber are required' });
    }

    const apiLogin = process.env.AUTHNET_API_LOGIN_ID;
    const txnKey  = process.env.AUTHNET_TRANSACTION_KEY;
    const mode    = process.env.AUTHNET_ENV || 'sandbox'; // sandbox or production
    const commUrl = process.env.COMMUNICATOR_URL; // https://yourdomain.com/iframe-communicator.html
    const retUrl  = process.env.RETURN_URL || 'https://yourdomain.com/return';
    const cancelUrl = process.env.CANCEL_URL || 'https://yourdomain.com/cancel';

    const apiUrl = mode === 'production'
      ? 'https://api.authorize.net/json/v1/request.api'
      : 'https://apitest.authorize.net/json/v1/request.api';

    const payload = {
      getHostedPaymentPageRequest: {
        merchantAuthentication: { name: apiLogin, transactionKey: txnKey },
        transactionRequest: {
          transactionType: 'authCaptureTransaction',
          amount: String(amount),
          customer: customerId ? { id: String(customerId) } : undefined,
          order: { invoiceNumber: String(invoiceNumber), description: description || 'Payment' }
        },
        hostedPaymentSettings: {
          setting: [
            {
              settingName: 'hostedPaymentIFrameCommunicatorUrl',
              settingValue: JSON.stringify({ url: commUrl })
            },
            {
              settingName: 'hostedPaymentReturnOptions',
              settingValue: JSON.stringify({
                showReceipt: false, url: retUrl, urlText: 'Continue',
                cancelUrl, cancelUrlText: 'Cancel'
              })
            }
          ]
        }
      }
    };

    const { data } = await axios.post(apiUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    const token = data?.token || data?.getHostedPaymentPageResponse?.token;
    if (!token) return res.status(502).json({ error: 'No token in Authorize.net response', raw: data });

    res.json({ token });
  } catch (err) {
    console.error('authorize-token error', err?.response?.data || err.message);
    res.status(500).json({ error: 'Unable to generate token' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Listening on ' + PORT));
