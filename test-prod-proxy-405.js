const fetch = require("node-fetch");
async function test() {
  const res = await fetch("https://mcp.getmaterio.app/api/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Target-Url": "https://openrouter.ai/api/v1/chat/completions",
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
