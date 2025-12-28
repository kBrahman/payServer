import express from "express";
import fetch from "node-fetch";
import "dotenv/config";
import path from "path";
import admin from "firebase-admin";

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const originalConsoleLog = console.log;
console.log = function (...args) {
  const timestamp = new Date().toLocaleString();
  originalConsoleLog.apply(console, [`[${timestamp}]`, ...args]);
};

const serviceAccount = JSON.parse(readFileSync(`${__dirname}/serviceAccountKey.json`, 'utf-8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PRICE, BASE, PORT = 8888 } = process.env;
const app = express();
app.use(express.static("client"));
app.use(express.json());
var login;
var isMozilla;
/**
 * Generate an OAuth 2.0 access token for authenticating with PayPal REST APIs.
 * @see https://developer.paypal.com/api/rest/authentication/
 */
const generateAccessToken = async () => {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      throw new Error("MISSING_API_CREDENTIALS");
    }
    const auth = Buffer.from(PAYPAL_CLIENT_ID + ":" + PAYPAL_CLIENT_SECRET).toString("base64");
    const response = await fetch(`${BASE}/v1/oauth2/token`, {
      method: "POST",
      body: "grant_type=client_credentials",
      headers: { Authorization: `Basic ${auth}` }
    });
    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Failed to generate Access Token:", error);
  }
};

/**
 * Create an order to start the transaction.
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_create
 */
const createOrder = async () => {
  const accessToken = await generateAccessToken();
  console.log('access tok:' + accessToken);
  const url = `${BASE}/v2/checkout/orders`;
  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: "USD",
          value: `${PRICE}`
        }
      }
    ]
  };

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // Uncomment one of these to force an error for negative testing (in sandbox mode only). Documentation:
      // https://developer.paypal.com/tools/sandbox/negative-testing/request-headers/
      // "PayPal-Mock-Response": '{"mock_application_codes": "MISSING_REQUIRED_PARAMETER"}'
      // "PayPal-Mock-Response": '{"mock_application_codes": "PERMISSION_DENIED"}'
      // "PayPal-Mock-Response": '{"mock_application_codes": "INTERNAL_SERVER_ERROR"}'
    },
    method: "POST",
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
};

/**
 * Capture payment for the created order to complete the transaction.
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_capture
 */
const captureOrder = async (orderID) => {
  const accessToken = await generateAccessToken();
  const url = `${BASE}/v2/checkout/orders/${orderID}/capture`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // Uncomment one of these to force an error for negative testing (in sandbox mode only). Documentation:
      // https://developer.paypal.com/tools/sandbox/negative-testing/request-headers/
      // "PayPal-Mock-Response": '{"mock_application_codes": "INSTRUMENT_DECLINED"}'
      // "PayPal-Mock-Response": '{"mock_application_codes": "TRANSACTION_REFUSED"}'
      // "PayPal-Mock-Response": '{"mock_application_codes": "INTERNAL_SERVER_ERROR"}'
    },
  });

  return handleResponse(response);
};

async function handleResponse(response) {
  try {
    const jsonResponse = await response.json();
    return {
      jsonResponse,
      httpStatusCode: response.status,
    };
  } catch (err) {
    const errorMessage = await response.text();
    throw new Error(errorMessage);
  }
}

app.post("/api/orders", async (req, res) => {
  try {
    // use the cart information passed from the front-end to calculate the order amount detals
    const { jsonResponse, httpStatusCode } = await createOrder();
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to create order." });
  }
});

app.post("/api/orders/:orderID/capture", async (req, res) => {
  try {
    const { orderID } = req.params;
    const { jsonResponse, httpStatusCode } = await captureOrder(orderID);
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to capture order." });
  }
});

app.get("/pay", (req, res) => {
  login = req.query.login;
  isMozilla = req.query.is_mozilla === 'true';
  console.log('on req, login:', login);
  console.log('on req, is mozilla:', isMozilla);
  res.sendFile(path.resolve("./client/checkout.html"));
});

app.get("/paid", (req, res) => {
  console.log('updating firestore by login', login);
  admin.firestore().collection('user').doc(login).update({ isPremium: true, token: Date.now(), in_grace_period: false }).then(() => {
    console.log('Document successfully updated!');
  }).catch((error) => {
    console.error('Error updating document: ', error);
  });
  const file = getFile();
  console.log('final file', file);
  res.sendFile(path.resolve(`./client/${file}`));
});

function getFile() {
  console.log('get file is mozilla', isMozilla, 'Type of moz:', typeof isMozilla);
  return isMozilla ? 'paid_mozilla.html' : 'paid.html';
}

app.get("/price", (req, res) => {
  console.log('get rpice:' + PRICE);
  res.send(PRICE)
});

app.get('/id', (req, res) => {
  console.log('get id');
  res.json({ id: PAYPAL_CLIENT_ID });
});

app.get('/favicon.ico', (req, res) => res.sendStatus(200));

app.listen(PORT, () => {
  console.log(`Node server listening at http://localhost:${PORT}/`);
});