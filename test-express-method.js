const express = require('express');
const app = express();
app.get('/test', (req, res) => res.send('OK'));
const server = app.listen(3003, async () => {
  const fetch = require('node-fetch');
  const res = await fetch('http://localhost:3003/test', { method: 'POST' });
  console.log("Status:", res.status);
  server.close();
});
