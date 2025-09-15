const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());

// Only allow your site that hosts the DrChrono page
app.use(cors({
  origin: ['https://innovahealthwellness.com'],
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));

app.get('/health', (_, res) => res.send('ok'));

// Helper: make a compact unique invoice (<= 20 chars)
function generateInvoice(prefix = process.env.INVOICE_PREFIX || 'INV') {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const base = `${String(d.getFullYear()).slice(-2)}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
  const rand = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0'); // 000–ZZZ
  return (prefix + base + rand).slice(0, 20);
}

app.post('/api/authorize-token', async (req, res) => {
  try {
    const { amount, invoiceNumber, customerId, description } = req.body;
    if (!amount) {
      return res.status(400).json({ error: 'amount is required' });
    }

    const apiLogin = process.env.AUTHNET_API_LOGIN_ID;
    const txnKey   = process.env.AUTHNET_TRANSACTION_KEY;
    const mode     = process.env.AUTHNET_ENV || 'sandbox';
    const commUrl  = process.env.COMMUNICATOR_URL;
    const retUrl   = process.env.RETURN_URL || 'https://innovahealthwellness.com/authorize-chrono/return.html';
    const cancelUrl= process.env.CANCEL_URL || 'https://innovahealthwellness.com/authorize-chrono/cancel.html';

    // Use provided invoice or generate one
    const inv = (invoiceNumber && String(invoiceNumber).trim())
      ? String(invoiceNumber).slice(0, 20)
      : generateInvoice();

    // Correct Authorize.net endpoints (XML path; JSON body is OK)
    const apiUrl = mode === 'production'
      ? 'https://api2.authorize.net/xml/v1/request.api'
      : 'https://apitest.authorize.net/xml/v1/request.api';

    // Build the transaction request — no <order> to avoid schema error; use poNumber + userFields
    const transactionRequest = {
      transactionType: 'authCaptureTransaction',
      amount: String(Number(amount).toFixed(2)),
      poNumber: inv, // shows in portal (limit 25, we're under 20)
      ...(customerId ? { customer: { id: String(customerId) } } : {}),
      userFields: {
        userField: [
          { name: 'invoiceNumber', value: inv },
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

    const token = data?.token || data?.getHostedPaymentPageResponse?.token;
    if (!token) {
      const diag = {
        resultCode: data?.messages?.resultCode,
        messageCodes: data?.messages?.message?.map(m => m.code),
        messageText: data?.messages?.message?.map(m => m.text)
      };
      return res.status(502).json({ error: 'No token in Authorize.net response', anet: diag });
    }

    // Return the invoice we used so the UI can show/record it
    res.json({ token, invoice: inv });
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
// Bind to 0.0.0.0 for Fly
app.listen(PORT, '0.0.0.0', () => console.log('Listening on ' + PORT));
