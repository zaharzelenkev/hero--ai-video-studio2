const fs = require('fs');

// 1. Revert UI in GenerationScreenV2.tsx
let uiCode = fs.readFileSync('src/components/generation/GenerationScreenV2.tsx', 'utf8');

uiCode = uiCode.replace(
  /const \[geminiApiKey, setGeminiApiKey\] = useState\(""\);\n  const \[showApiSettings, setShowApiSettings\] = useState\(false\);\n\n  useEffect\(\(\) => \{\n    const key = localStorage\.getItem\("montiq_gemini_api_key"\);\n    if \(key\) setGeminiApiKey\(key\);\n  \}, \[\]\);\n\n  const saveApiKey = \(\) => \{\n    if \(geminiApiKey\) \{\n      localStorage\.setItem\("montiq_gemini_api_key", geminiApiKey\);\n    \} else \{\n      localStorage\.removeItem\("montiq_gemini_api_key"\);\n    \}\n    setShowApiSettings\(false\);\n  \};/s,
  `const [groqApiKey, setGroqApiKey] = useState("");
  const [showApiSettings, setShowApiSettings] = useState(false);

  useEffect(() => {
    const key = localStorage.getItem("montiq_groq_api_key");
    if (key) setGroqApiKey(key);
  }, []);

  const saveApiKey = () => {
    if (groqApiKey) {
      localStorage.setItem("montiq_groq_api_key", groqApiKey);
    } else {
      localStorage.removeItem("montiq_groq_api_key");
    }
    setShowApiSettings(false);
  };`
);

uiCode = uiCode.replace(
  /geminiApiKey \? "Gemini настроен" : "Настроить AI \(Gemini\)"/g,
  'groqApiKey ? "AI настроен" : "Настроить AI (Groq)"'
);

uiCode = uiCode.replace(
  /Google Gemini API Key \(опционально\)/g,
  'Groq API Key (опционально)'
);

uiCode = uiCode.replace(
  /Для работы продвинутого режиссера монтажа \(Gemini 2\.0 Flash\)/g,
  'Для интеллектуального анализа видео и улучшенного монтажа (LLaMA 3.3)'
);

uiCode = uiCode.replace(
  /value=\{geminiApiKey\}\n\s+onChange=\{\(e\) => setGeminiApiKey\(e.target.value\)\}\n\s+placeholder="AIza..."/s,
  `value={groqApiKey}\n                onChange={(e) => setGroqApiKey(e.target.value)}\n                placeholder="gsk_..."`
);

uiCode = uiCode.replace(
  /groqApiKey: groqApiKey \|\| undefined,/g, // if it was there
  ''
);

// We should pass groqApiKey back to autoEditToProject if needed, but it uses AI_CONFIG directly or we pass it
uiCode = uiCode.replace(
  /style,\n\s+groqApiKey: groqApiKey \|\| undefined,\n\s+\}\);/s,
  `style,\n          groqApiKey: groqApiKey || undefined,\n        });`
);

fs.writeFileSync('src/components/generation/GenerationScreenV2.tsx', uiCode);


// 2. Revert engine.ts
let engineCode = fs.readFileSync('src/lib/brain/engine.ts', 'utf8');

engineCode = engineCode.replace(/if \(AI_CONFIG\.groqApiKey \|\| \(typeof window !== "undefined" && localStorage\.getItem\("montiq_gemini_api_key"\)\)\)/g, 'if (AI_CONFIG.groqApiKey)');

const geminiFetch1 = `let parsed: any;
        const geminiKey = typeof window !== "undefined" ? localStorage.getItem("montiq_gemini_api_key") : AI_CONFIG.geminiApiKey;
        if (geminiKey) {
            const resp = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=\${geminiKey}\`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json", temperature: 0.4 }
                })
            });
            const data = await resp.json();
            const rawText = data.candidates[0].content.parts[0].text;
            parsed = JSON.parse(rawText);
        } else {
            const resp = await fetch(AI_CONFIG.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${AI_CONFIG.groqApiKey}\` },
                body: JSON.stringify({
                  model: AI_CONFIG.model,
                  messages: [{ role: "system", content: prompt }],
                  temperature: 0.4,
                  response_format: { type: "json_object" },
                }),
            });
            const data = await resp.json();
            parsed = JSON.parse(data.choices[0].message.content);
        }`;

const groqFetch1 = `const resp = await fetch(AI_CONFIG.apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${AI_CONFIG.groqApiKey}\` },
            body: JSON.stringify({
              model: AI_CONFIG.model,
              messages: [{ role: "system", content: prompt }],
              temperature: 0.4,
              response_format: { type: "json_object" },
            }),
        });
        const data = await resp.json();
        const parsed = JSON.parse(data.choices[0].message.content);`;

engineCode = engineCode.replace(geminiFetch1, groqFetch1);


const geminiFetch2 = `let parsed: any;
            const geminiKey = typeof window !== "undefined" ? localStorage.getItem("montiq_gemini_api_key") : AI_CONFIG.geminiApiKey;
            if (geminiKey) {
                const resp = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=\${geminiKey}\`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                        generationConfig: { responseMimeType: "application/json", temperature: 0.3 }
                    })
                });
                const data = await resp.json();
                const rawText = data.candidates[0].content.parts[0].text;
                parsed = JSON.parse(rawText);
            } else {
                const resp = await fetch(AI_CONFIG.apiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${AI_CONFIG.groqApiKey}\` },
                    body: JSON.stringify({
                      model: AI_CONFIG.model,
                      messages: [{ role: "system", content: prompt }],
                      temperature: 0.3,
                      response_format: { type: "json_object" },
                    }),
                });
                const data = await resp.json();
                parsed = JSON.parse(data.choices[0].message.content);
            }`;

const groqFetch2 = `const resp = await fetch(AI_CONFIG.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${AI_CONFIG.groqApiKey}\` },
                body: JSON.stringify({
                  model: AI_CONFIG.model,
                  messages: [{ role: "system", content: prompt }],
                  temperature: 0.3,
                  response_format: { type: "json_object" },
                }),
            });
            const data = await resp.json();
            const parsed = JSON.parse(data.choices[0].message.content);`;

engineCode = engineCode.replace(geminiFetch2, groqFetch2);

fs.writeFileSync('src/lib/brain/engine.ts', engineCode);

// 3. Remove geminiApiKey from config
let configCode = fs.readFileSync('src/config/ai.ts', 'utf8');
configCode = configCode.replace(/\n\s*\/\/ Google Gemini API \(Gemini 2\.0 Flash\)[\s\S]*geminiApiKey: "", \/\/ User can input in UI/s, '');
fs.writeFileSync('src/config/ai.ts', configCode);

