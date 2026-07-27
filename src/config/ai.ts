export const AI_CONFIG = {
  // Вы можете указать API ключ здесь или в .env.local (NEXT_PUBLIC_GROQ_API_KEY)
  groqApiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY || "",
  
  // URL для запросов к API
  apiUrl: "https://api.groq.com/openai/v1/chat/completions",
  
  // Модель, которая будет использоваться для анализа видео
  model: "llama-3.3-70b-versatile",
};
