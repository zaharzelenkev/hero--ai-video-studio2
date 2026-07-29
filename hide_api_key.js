const fs = require('fs');

let code = fs.readFileSync('src/components/generation/GenerationScreenV2.tsx', 'utf8');

const settingsBlock = `          {/* Settings */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setShowApiSettings(!showApiSettings)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 backdrop-blur-sm transition-all hover:bg-white/10"
            >
              <span>⚙️</span>
              <span>{groqApiKey ? "AI настроен" : "Настроить AI (Groq)"}</span>
            </button>
          </div>

          {showApiSettings && (
            <div className="mx-auto mt-4 max-w-md rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-300">Groq API Key (опционально)</h3>
              <p className="mb-3 text-xs text-slate-400">
                Для интеллектуального анализа видео и улучшенного монтажа (LLaMA 3.3)
              </p>
              <input
                type="password"
                value={groqApiKey}
                onChange={(e) => setGroqApiKey(e.target.value)}
                placeholder="gsk_..."
                className="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none focus:border-violet-500/50"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveApiKey}
                  className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700"
                >
                  Сохранить
                </button>
                <button
                  onClick={() => setShowApiSettings(false)}
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}`;

code = code.replace(settingsBlock, '');

// Also remove the states and logic to prevent lint/typescript errors
code = code.replace(/const \[groqApiKey, setGroqApiKey\] = useState\(""\);\n  const \[showApiSettings, setShowApiSettings\] = useState\(false\);\n\n  useEffect\(\(\) => \{\n    const key = localStorage\.getItem\("montiq_groq_api_key"\);\n    if \(key\) setGroqApiKey\(key\);\n  \}, \[\]\);\n\n  const saveApiKey = \(\) => \{\n    if \(groqApiKey\) \{\n      localStorage\.setItem\("montiq_groq_api_key", groqApiKey\);\n    \} else \{\n      localStorage\.removeItem\("montiq_groq_api_key"\);\n    \}\n    setShowApiSettings\(false\);\n  \};/s, '');

// Remove groqApiKey from autoEditToProject call if it was there (we removed it earlier, but just to be sure)
code = code.replace(/groqApiKey: groqApiKey \|\| undefined,/g, '');

fs.writeFileSync('src/components/generation/GenerationScreenV2.tsx', code);
