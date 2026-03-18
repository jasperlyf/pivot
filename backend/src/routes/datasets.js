const express = require('express');
const supabase = require('../lib/prisma');

const router = express.Router();

// GET /datasets — list all datasets with record counts
router.get('/', async (req, res) => {
  try {
    const { data: datasets, error } = await supabase
      .from('datasets')
      .select('id, name, created_at, records(count)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(datasets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /datasets/:id — get single dataset with records
router.get('/:id', async (req, res) => {
  try {
    const { data: dataset, error } = await supabase
      .from('datasets')
      .select('*, records(*)')
      .eq('id', req.params.id)
      .order('date', { referencedTable: 'records', ascending: true })
      .single();
    if (error) return res.status(404).json({ error: 'Dataset not found' });
    res.json(dataset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /datasets/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('datasets')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Dataset deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
