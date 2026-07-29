const fs = require('fs');

let code = fs.readFileSync('src/lib/brain/engine.ts', 'utf8');

const groqFetch = `const resp = await fetch(AI_CONFIG.apiUrl, {
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

const geminiFetch = `let parsed: any;
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

code = code.replace(groqFetch, geminiFetch);

const groqHookFetch = `const resp = await fetch(AI_CONFIG.apiUrl, {
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

const geminiHookFetch = `let parsed: any;
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

code = code.replace(groqHookFetch, geminiHookFetch);

code = code.replace(/if \(AI_CONFIG\.groqApiKey\)/g, 'if (AI_CONFIG.groqApiKey || (typeof window !== "undefined" && localStorage.getItem("montiq_gemini_api_key")))');

fs.writeFileSync('src/lib/brain/engine.ts', code);
