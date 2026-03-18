const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /datasets — list all datasets
router.get('/', async (req, res) => {
  try {
    const datasets = await prisma.dataset.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { records: true } } },
    });
    res.json(datasets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /dataset/:id — get single dataset with records
router.get('/:id', async (req, res) => {
  try {
    const dataset = await prisma.dataset.findUnique({
      where: { id: req.params.id },
      include: { records: { orderBy: { date: 'asc' } } },
    });
    if (!dataset) return res.status(404).json({ error: 'Dataset not found' });
    res.json(dataset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /dataset/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.dataset.delete({ where: { id: req.params.id } });
    res.json({ message: 'Dataset deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
