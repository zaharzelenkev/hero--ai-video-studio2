const key = "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";
const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "OPTIONS",
  headers: {
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization,content-type",
    "Origin": "https://example.com"
  }
});
console.log("Status:", res.status);
console.log("CORS headers:", res.headers.get("access-control-allow-origin"));
