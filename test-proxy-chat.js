const fetch = require("node-fetch");
async function test() {
  const res = await fetch("http://127.0.0.1:3001/api/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Target-Url": "https://openrouter.ai/api/v1",
      "Authorization": "Bearer undefined"
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "test" }]
    })
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response:", text);
}
test();
