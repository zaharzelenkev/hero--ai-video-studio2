const res = await fetch("https://image.pollinations.ai/prompt/dog?width=1080&height=1920&nologo=true", {
  headers: { "Origin": "https://example.com" }
});
console.log("Status:", res.status);
console.log("CORS:", res.headers.get("access-control-allow-origin"));
