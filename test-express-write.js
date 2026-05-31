const express = require('express');
const app = express();
app.get('/', (req, res) => {
  try {
    const chunk = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
    res.write(chunk);
    res.end();
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("Error");
  }
});
const server = app.listen(3002, async () => {
  const fetch = require('node-fetch');
  const res = await fetch('http://localhost:3002/');
  console.log(await res.text());
  server.close();
});
