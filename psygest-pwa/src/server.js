require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS pour PsyGest desktop (Tauri dev = localhost:1420, prod = tauri://localhost)
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin || '';
  const allowed = /^(https?:\/\/localhost(:\d+)?|tauri:\/\/localhost)$/.test(origin);
  if (allowed || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erreur: 'Trop de requêtes, réessayez dans 15 minutes' },
});
app.use('/api', limiter);

app.use('/api', require('./routes/api'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`PsyGest PWA — port ${PORT}`);
});
