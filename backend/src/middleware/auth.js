const supabase = require('../lib/prisma');

/**
 * Extracts the Supabase JWT from Authorization header,
 * verifies it, and attaches userId to req.
 */
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });

  req.userId = data.user.id;
  next();
}

module.exports = { requireAuth };
