const SUPERMEMORY_API = "http://localhost:3001/api/memory";
const apiKey = "invalid_api_key_123\n";

async function test() {
  try {
    const res = await fetch(`${SUPERMEMORY_API}/memories/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ containerTags: ["user-1234"], limit: 50 })
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
export {};
