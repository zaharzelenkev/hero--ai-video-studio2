const res = await fetch("https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ru&q=hello", {
  headers: { "Origin": "https://example.com" }
});
console.log("Status:", res.status);
console.log("CORS:", res.headers.get("access-control-allow-origin"));
