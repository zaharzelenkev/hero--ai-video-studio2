const fs = require('fs');

let code = fs.readFileSync('src/components/generation/GenerationScreenV2.tsx', 'utf8');

const settingsBlock = `          <p className="mx-auto max-w-2xl text-sm text-slate-400 sm:text-base">
            Загрузите материалы — искусственный интеллект создаст профессиональный монтаж.<br />
            Доработайте результат в редакторе с продвинутыми инструментами.
          </p>

          {/* Settings */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setShowApiSettings(!showApiSettings)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 backdrop-blur-sm transition-all hover:bg-white/10"
            >
              <span>⚙️</span>
              <span>{geminiApiKey ? "Gemini настроен" : "Настроить AI (Gemini)"}</span>
            </button>
          </div>

          {showApiSettings && (
            <div className="mx-auto mt-4 max-w-md rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-300">Google Gemini API Key (опционально)</h3>
              <p className="mb-3 text-xs text-slate-400">
                Для работы продвинутого режиссера монтажа (Gemini 2.0 Flash)
              </p>
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="AIza..."
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

const oldHeaderBlock = `          <p className="mx-auto max-w-2xl text-sm text-slate-400 sm:text-base">
            Загрузите материалы — искусственный интеллект создаст профессиональный монтаж.<br />
            Доработайте результат в редакторе с продвинутыми инструментами.
          </p>
        </header>`;

code = code.replace(oldHeaderBlock, settingsBlock + '\n        </header>');

const oldState = `  const [recentProjects, setRecentProjects] = useState<Project[]>([]);`;

const newState = `  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [showApiSettings, setShowApiSettings] = useState(false);

  useEffect(() => {
    const key = localStorage.getItem("montiq_gemini_api_key");
    if (key) setGeminiApiKey(key);
  }, []);

  const saveApiKey = () => {
    if (geminiApiKey) {
      localStorage.setItem("montiq_gemini_api_key", geminiApiKey);
    } else {
      localStorage.removeItem("montiq_gemini_api_key");
    }
    setShowApiSettings(false);
  };`;

code = code.replace(oldState, newState);

fs.writeFileSync('src/components/generation/GenerationScreenV2.tsx', code);
