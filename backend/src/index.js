require('dotenv').config();
const express = require('express');
const cors = require('cors');

const datasetsRouter = require('./routes/datasets');
const uploadRouter = require('./routes/upload');
const pivotRouter = require('./routes/pivot');
const marketDataRouter = require('./routes/marketData');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/market-data', marketDataRouter);
app.use('/datasets', datasetsRouter);
app.use('/dataset', datasetsRouter);
app.use('/upload', uploadRouter);
app.use('/pivot-data', pivotRouter);

app.listen(PORT, () => {
  console.log(`Pivot API running on port ${PORT}`);

  // Keep Render free tier warm — ping own /health every 10 min
  const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(() => {
    fetch(`${SELF_URL}/health`)
      .then(() => console.log('[keep-warm] ping ok'))
      .catch((e) => console.warn('[keep-warm] ping failed:', e.message));
  }, 10 * 60 * 1000);
});
