const express = require('express');
const store = require('./bubbleStore');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/bubbles', (req, res) => {
  res.json(store.listBubbles());
});

app.post('/api/bubbles', (req, res) => {
  const { title, color, parents } = req.body;
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  res.json(store.createBubble({ title, color, parents }));
});

app.put('/api/bubbles/:id', (req, res) => {
  const updated = store.updateBubble(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

app.delete('/api/bubbles/:id', (req, res) => {
  const deleted = store.softDeleteBubble(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.delete('/api/deleted', (req, res) => {
  store.clearDeleted();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Pop is running at http://localhost:${PORT}`);
});
