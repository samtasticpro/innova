const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());

app.use(cors({
  origin: ['https://innovahealthwellness.com'],
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
    const txnKey   = process.env.AUTHNET_TRANSACTION_KEY;
    const mode     = process.env.AUTHNET_ENV || 'sandbox';
    const commUrl  = process.env.COMMUNICATOR_URL;
    const retUrl   = process.env.RETURN_URL || 'https://innovahealthwellness.com/authorize-chrono/return.html';
    const cancelUrl= process.env.CANCEL_URL || 'https://innovahealthwellness.com/authorize-chrono/cancel.html';

    const apiUrl = mode === 'production'
      ? 'https://api2.authorize.net/xml/v1/request.api'
      : 'https://apitest.authorize.net/xml/v1/request.api';

    const transactionRequest = {
      transactionType: 'authCaptureTransaction',
      amount: String(Number(amount).toFixed(2)),
      ...(customerId ? { customer: { id: String(customerId) } } : {}),

      // Use userFields to carry invoice/description instead of <order>
      userFields: {
        userField: [
          { name: 'invoiceNumber', value: String(invoiceNumber).slice(0, 20) },
          ...(description ? [{ name: 'description', value: String(description).slice(0, 255) }] : [])
        ]
      }
    };

    const payload = {
      getHostedPaymentPageRequest: {
        merchantAuthentication: { name: apiLogin, transactionKey: txnKey },
        transactionRequest,
        hostedPaymentSettings: {
          setting: [
            {
              settingName: 'hostedPaymentIFrameCommunicatorUrl',
              settingValue: JSON.stringify({ url: commUrl })
            },
            {
              settingName: 'hostedPaymentReturnOptions',
              settingValue: JSON.stringify({
                showReceipt: false,
                url: retUrl,
                urlText: 'Continue',
                cancelUrl,
                cancelUrlText: 'Cancel'
              })
            }
          ]
        }
      }
    };

    const { data } = await axios.post(apiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

    const diag = {
      resultCode: data?.messages?.resultCode,
      messageCodes: data?.messages?.message?.map(m => m.code),
      messageText: data?.messages?.message?.map(m => m.text)
    };

    const token = data?.token || data?.getHostedPaymentPageResponse?.token;
    if (!token) {
      return res.status(502).json({ error: 'No token in Authorize.net response', anet: diag });
    }

    res.json({ token });
  } catch (err) {
    const resp = err?.response?.data;
    res.status(500).json({
      error: 'Unable to generate token',
      anet: {
        resultCode: resp?.messages?.resultCode,
        messageCodes: resp?.messages?.message?.map(m => m.code),
        messageText: resp?.messages?.message?.map(m => m.text)
      },
      hint: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('Listening on ' + PORT));
