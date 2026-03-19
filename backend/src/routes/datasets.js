const express = require('express');
const supabase = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All dataset routes require authentication
router.use(requireAuth);

// GET /datasets
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('datasets')
      .select('id, name, created_at, records(count)')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /datasets/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('datasets')
      .select('*, records(*)')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .order('date', { referencedTable: 'records', ascending: true })
      .single();
    if (error) return res.status(404).json({ error: 'Dataset not found' });
    res.json(data);
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
      .eq('id', req.params.id)
      .eq('user_id', req.userId);
    if (error) throw error;
    res.json({ message: 'Dataset deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
