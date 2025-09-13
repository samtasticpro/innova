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

    // ✅ Correct Authorize.net endpoints (XML path; JSON body is OK)
    const apiUrl = mode === '
