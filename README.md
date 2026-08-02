# MONTIQ - AI-Powered Professional Video Editor

![MONTIQ Logo](https://img.shields.io/badge/MONTIQ-AI%20Video%20Editor-blueviolet?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square)
![React](https://img.shields.io/badge/React-19-blue?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square)

**AI Production Studio для полного цикла создания видео**

MONTIQ объединяет идею, сценарий, режиссуру, подготовку съёмки, анализ исходников, автоматический монтаж и профессиональный постпродакшн в одной браузерной студии. Первый production blueprint создаёт редактируемый бриф и режиссёрский план ещё до монтажа; затем проект проходит через AI-assisted сборку, профессиональный редактор и экспорт.

## ✨ Ключевые возможности

### 🤖 Интеллектуальный AI-монтаж
- **AI Director (режиссёр, не монтажёр)**: центральная система принятия решений работает строго ДО монтажа. Восприятие всех материалов: нарезка на смысловые монтажные моменты (смены сцен + скачки качества/движения/лиц), композиция планов (общий/средний/крупный), движения камеры (панорама/наезд/тряска по траектории лица), сильные и слабые кадры, речь с драматическими паузами, музыкальная карта (BPM, дропы, энергия). Затем строится объяснимый **режиссёрский план**: драматургическая арка (flash-forward тизер → хук → нарастание → единственная кульминация на дропе музыки → выдох), кривая темпа, переходы с мотивировкой, семантические перебивки (B-roll «покажи сказанное», прикрытие слабых кадров), титры. План самопроверяется по профессиональным правилам жанра и только потом передаётся монтажному движку для исполнения. Детерминизм: те же материалы → тот же план (превью = экспорт). План виден в Production room («AI Director · план монтажа»).
- **Kinetic Typography**: Математическая физика анимаций текста (Elastic, Stomp, Bounce, Glitch) в стиле Hormozi и MrBeast.
- **Audio Mastering**: Нативный компрессор, эквалайзер и шумоподавление.
- **Smart Auto-Framing**: Автоматическое слежение за лицами (Face Detection) при кадрировании.
- **Algorithmic Music & SFX**: Браузер синтезирует Background Music и звуковые эффекты (Whoosh, Pop, Hit, Riser) налету.
- **Dynamic Google Fonts**: Интеграция любых шрифтов с Google Fonts напрямую в FFmpeg.
- **Анализ контента**: AI анализирует видео, находит лучшие моменты и эмоциональные пики
- **AI Director на OpenRouter**: интеллектуальное планирование монтажа через бесплатные модели OpenRouter (`:free`), Groq — как страховка
- **Форматно-специфичный монтаж**: 20 жанровых шаблонов — YouTube, Shorts/Reels/TikTok, Подкаст, Интервью, Влог, Gaming, Fitness, Свадьба, Food, Music Video, Обучение, Real Estate, реклама и др. Каждый шаблон задаёт собственную драматургию, темп, грейд и типографику
- **Настоящее AI-видео (Text-to-Video)**: генерация с нуля создаёт реальные видеоклипы с движением камеры через бесплатный tier Pollinations.AI (модель Seedance). Без ключа автоматически используется бесплатный конвейер AI-изображений + движок движения камеры — сервис работает всегда и без затрат. Ключ: `POLLINATIONS_API_KEY` (бесплатно на enter.pollinations.ai)
- **Синхронизация с музыкой**: Автоматическое определение битов и синхронизация монтажа
- **Rule-based fallback**: Работает без API ключа с продвинутым rule-based алгоритмом

### 🎬 Профессиональный редактор

#### Timeline & Montage
- Multi-track таймлайн (видео, аудио, текст, субтитры)
- Multi-select, группировка клипов
- Snap и magnet для точного позиционирования
- Ripple delete, split, trim, duplicate
- Drag-to-move между треками
- Markers для навигации
- Context меню с быстрыми действиями
- Горячие клавиши (Space, S, Cmd+D, N, M)

#### 🎨 Цветокоррекция
- **Базовые контролы**: Brightness, Contrast, Saturation, Vibrance, Hue
- **Экспозиция**: Exposure, Highlights, Shadows, Whites, Blacks
- **Баланс белого**: Temperature, Tint
- **Gamma контроль**
- **12 LUT пресетов**: Cinematic, Warm, Cool, B&W, Vintage, Vivid, Moody, Dramatic, и др.
- Готовность для RGB Curves, HSL, Color Wheels (в архитектуре)

#### ✨ Эффекты (25+ профессиональных эффектов)
- **Blur**: Gaussian, Motion, Radial
- **Glitch**: Digital, VHS, Scan Lines, RGB Split
- **Texture**: Film Grain, Static Noise
- **Distortion**: Wave, Ripple, Lens Distortion
- **Lens**: Chromatic Aberration, Lens Flare, Bokeh
- **Stylize**: Pixelate, Posterize, Halftone, Edge Detect
- **Keying**: Chroma Key, Luma Key
- **Blend Modes**: 16 режимов (Multiply, Screen, Overlay, и др.)
- **Motion Blur**: С настройкой samples и shutter angle
- **Маски**: Rectangle, Ellipse, Polygon с feather

#### 🎵 Аудио
- **3-полосный EQ**: Low, Mid, High (-15 до +15 dB)
- **Компрессор**: Threshold, Ratio, Attack, Release
- **Эффекты**: Denoise, Normalize, Voice Enhance, Remove Silence
- **Pan контроль**: Баланс L/R с анимацией
- **Fade In/Out**: С точным контролем времени
- Volume автоматизация через keyframes

#### 📝 Текст и субтитры
- **Шрифты**: 12 встроенных шрифтов + поддержка кастомных
- **Стили**: Weight (100-900), Italic, Letter Spacing, Line Height
- **Эффекты**: Shadow, Stroke, Gradient
- **12 анимаций**: Fade, Slide (4 направления), Pop, Scale, Bounce, Typewriter, Blur, Rotate
- **Позиционирование**: X/Y с keyframe анимацией
- Готовность для автоматических субтитров

#### 🪄 Motion Graphics (панель Motion)
Полноценная моушн-графика из 12 видов, каждый полностью настраивается
(текст, кикер, подзаголовок, шрифт, цвета, подложка, тень, обводка, анимация
входа/выхода, позиция, длительность):
- **Титры** — профессиональный титр: кикер, заголовок, акцентная линия, подзаголовок;
- **Lower Third** — имя и роль с акцентной плашкой (интервью, репортажи);
- **Callout** — выноска с указателем: пузырь, плашка, подчёркивание, маркер, стикер;
- **Progress Bar** — анимированный прогресс-бар с процентами (`%{eif}` в экспорте)
  и ключевыми кадрами прогресса;
- **Animated Captions** — динамические подписи: слова появляются одно за другим
  (classic / плашка / маркер / pop / karaoke);
- **Logo Reveal** — логотип (картинка из медиатеки или монограмма) + wordmark,
  5 стилей появления;
- **Intro / Outro** — полноэкранные заставки с градиентным свечением и CTA-кнопкой;
- **CTA** — кнопка / полоса / карточка с пульсацией;
- **Субтитры** — стилизованные субтитры (5 стилей, включая karaoke);
- **Tracking Text** — бегущая строка-тикер в 4 направлениях;
- **Kinetic Type** — пословная кинетическая типографика: wordBurst, wave, stomp,
  elastic, glitch (RGB-сплит), typewriter, flip.

Превью и экспорт рендерятся одним движком: canvas-рендер в редакторе, а в
FFmpeg — drawtext + drawbox + PNG-оверлеи панелей (генерируются тем же кодом,
что и превью) с fade/crop/overlay-цепочками. PNG-панели пишутся в ФС ffmpeg
автоматически, логотип подхватывается из медиатеки.

#### 🎞️ Keyframe Animation
- Визуальный редактор кейфреймов
- Timeline visualization с кривыми
- 5 типов easing: Linear, Ease In, Ease Out, Ease In Out, Cubic Bezier
- Поддержка Bezier curves (в типах)
- Анимация всех параметров: Position, Scale, Rotation, Opacity, Color, и др.

#### 🔒 Picture Lock (финальная сборка)
- **Автоматический контроль после автомонтажа**: длительность, ритм, длинные/короткие кадры, темп, визуальная логика
- **Автоисправления**: обрезка/ускорение/разрез длинных кадров, дотягивание коротких, выравнивание темпа по ритмической сетке, закрытие дыр, устранение jump cut'ов
- **Защита речи**: кадры с репликами не режутся по живому
- **Фиксация монтажа**: после подтверждения Picture Lock склейки и тайминг блокируются — дальше меняются только цвет, звук, титры и эффекты
- Отчёт по каждой проверке с журналом автоматических исправлений

#### 🚀 Экспорт
- **Форматы**: MP4 (H.264, H.265), WebM (VP9), MOV
- **Разрешения**: От 480p до 4K, портретные (Shorts/Reels), квадратные
- **Quick Presets**: YouTube 1080p, Shorts/Reels, Instagram, Gaming 60fps
- **Продвинутые**: Codec выбор, Bitrate control, Preset скорости, Audio-only
- **Оценка размера файла**: Автоматический расчет
- Локальный рендеринг через FFmpeg.wasm

## 🏗️ Архитектура

### Технологический стек
- **Frontend**: Next.js 16.2.6 (App Router), React 19, TypeScript 5.9
- **Styling**: Tailwind CSS 4.1.17
- **State**: Zustand 5.0.14
- **Storage**: IndexedDB (idb 8.0.3)
- **Video Processing**: FFmpeg.wasm 0.12.15
- **AI**: OpenRouter (бесплатные модели `:free`), Groq — страховочный провайдер

### Основные модули

```
src/
├── app/                        # Next.js App Router
│   ├── page.tsx               # Главная (GenerationScreenV2)
│   ├── editor/[id]/page.tsx   # Редактор
│   └── success/[id]/page.tsx  # Страница успеха
├── components/
│   ├── editor/
│   │   ├── EditorShellV2.tsx      # Главная оболочка редактора
│   │   ├── TimelineV2.tsx         # Профессиональный таймлайн
│   │   ├── PreviewCanvas.tsx      # Canvas рендеринг
│   │   ├── Transport.tsx          # Playback контроллер
│   │   ├── KeyframeEditor.tsx     # Редактор анимаций
│   │   └── panels/                # Панели инструментов
│   │       ├── MontagePanelV2.tsx
│   │       ├── ColorPanelV2.tsx
│   │       ├── EffectsPanelV2.tsx
│   │       ├── SoundPanelV2.tsx
│   │       ├── TextPanelV2.tsx
│   │       └── ExportPanelV2.tsx
│   └── generation/
│       ├── GenerationScreenV2.tsx # AI генерация с новым UX
│       ├── UploadZone.tsx
│       └── PromptForm.tsx
├── lib/
│   ├── ai/
│   │   ├── llmClient.ts         # единая точка вызова LLM (OpenRouter + Groq)
│   │   ├── openRouterClient.ts     # OpenRouter-клиент (бесплатные модели)
│   │   └── aiService.ts            # AI-интеграция
│   ├── types.ts                  # Расширенная типизация
│   ├── autoEdit.ts               # AI-enhanced авто-монтаж
│   ├── render.ts                 # FFmpeg рендеринг
│   ├── filterGraph.ts            # FFmpeg filter chain builder
│   ├── beatDetection.ts          # DSP beat detection
│   ├── keyframes.ts              # Keyframe evaluation
│   ├── factories.ts              # Clip/Track factories
│   └── db.ts                     # IndexedDB wrapper
└── store/
    └── projectStore.ts           # Zustand store
```

## 🚀 Быстрый старт

### Требования
- Node.js 18+ 
- npm или yarn

### Установка

```bash
# Клонируйте репозиторий
git clone <repository-url>
cd aiv-video-studio-full_2

# Установите зависимости
npm install

# Запустите dev сервер
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000) в браузере.

### Production сборка

```bash
npm run build
npm start
```

## 🎯 Как использовать

### 1. Создание проекта

1. **Загрузите материалы**: Перетащите видео, фото и аудио файлы
2. **Опишите задачу**: Напишите промпт (например, "Создай динамичный ролик для YouTube")
3. **(Опционально) Настройте AI**: Добавьте OpenRouter API ключ (бесплатные модели) для интеллектуального анализа
4. **Нажмите "Создать видео"**: AI соберёт профессиональный монтаж

### 2. Редактирование

После генерации откроется редактор MONTIQ:

- **Timeline**: Управляйте клипами, создавайте дорожки
- **Монтаж**: Trim, split, speed, transitions
- **Цвет**: Профессиональная цветокоррекция
- **Эффекты**: Применяйте эффекты и blend modes
- **Звук**: EQ, компрессор, шумоподавление
- **Текст**: Добавляйте титры с анимациями
- **Экспорт**: Рендерите финальное видео

### 3. Горячие клавиши

- `Space` — Play/Pause
- `S` — Split clip at playhead
- `Cmd/Ctrl + D` — Duplicate clip
- `Delete/Backspace` — Delete selected clip
- `N` — Toggle snap
- `M` — Toggle magnet
- `Shift + Click` — Multi-select

## 🔧 Конфигурация

### AI API (OpenRouter — бесплатные модели, Groq — страховка)

AI Director работает через **OpenRouter** на бесплатных моделях (`:free`):
никакой оплаты, ключ создаётся на [https://openrouter.ai/keys](https://openrouter.ai/keys).

1. Получите API ключ на [https://openrouter.ai/keys](https://openrouter.ai/keys)
2. Положите его в `.env.local` (для локальной разработки):
   ```env
   OPENROUTER_API_KEY=sk-or-v1-...
   NEXT_PUBLIC_OPENROUTER_API_KEY=sk-or-v1-...
   ```
   `NEXT_PUBLIC_*` нужен для клиентских вызовов («Магия», LLM-рейтинги фраз).
3. На Vercel добавьте те же переменные в Settings → Environment Variables.
4. Если задан `GROQ_API_KEY`, он используется автоматически как страховка,
   когда OpenRouter недоступен.

AI используется для:
- Анализа контента и эмоций
- Выбора лучших моментов
- Создания структуры монтажа
- Генерации текстовых наложений

Без API ключа работает продвинутый rule-based алгоритм.

## 🎨 Дизайн

MONTIQ следует принципам минималистичного дизайна в стиле Apple и Linear:

- **Цветовая схема**: Тёмная тема с violet/fuchsia градиентами
- **Типографика**: Чистая, читаемая, с правильной иерархией
- **Анимации**: Плавные, ненавязчивые
- **Layout**: Продуманное использование пространства
- **Accessibility**: Контрастные цвета, понятная навигация

## 📊 Производительность

### Оптимизации

✅ **ArrayBuffer detachment fix** — Устранена критическая ошибка экспорта  
✅ **Lazy loading** — Компоненты загружаются по требованию  
✅ **Media caching** — Video/Image элементы кешируются  
✅ **Auto-save debounce** — Сохранение с задержкой 800ms  
✅ **IndexedDB** — Эффективное хранилище проектов  
✅ **Canvas optimization** — Оптимизированный рендеринг preview  
✅ **Worker isolation** — FFmpeg работает в отдельном потоке  

### Рекомендации

- **Браузер**: Chrome/Edge 90+, Firefox 88+, Safari 14+
- **RAM**: Минимум 4GB, рекомендуется 8GB+
- **Разрешение**: 1920×1080 видео — 4-8GB RAM
- **Рендеринг**: Первый запуск FFmpeg займёт ~30-60 сек для загрузки ядра

## 🐛 Известные ограничения

1. **FFmpeg.wasm ограничения**:
   - Некоторые эффекты (VHS, Glitch) пока симулируются через CSS
   - RGB Curves, HSL, Color Wheels — готовы в типах, ждут FFmpeg implementation
   
2. **Браузерные лимиты**:
   - Файлы >2GB могут вызвать проблемы в некоторых браузерах
   - Safari имеет ограничения на IndexedDB (~1GB)

3. **AI функции**:
   - Транскрипция аудио требует дополнительного API (Whisper)
   - Автоматические субтитры в разработке

## 🛠️ Разработка

### Структура типов

Все типы определены в `src/lib/types.ts`:
- `Project` — корневой тип проекта
- `Clip` — union type для VideoClip, AudioClip, TextClip, SubtitleClip
- `AnimParam` — параметр с keyframes
- `ColorGrade` — профессиональная цветокоррекция
- И многое другое...

### Добавление нового эффекта

1. Добавьте в `EFFECT_LIBRARY` в `EffectsPanelV2.tsx`
2. Реализуйте в `filterGraph.ts` или `PreviewCanvas.tsx`
3. Добавьте CSS-based fallback если нужно

### Расширение AI

Модифицируйте `src/lib/ai/aiService.ts`:
- Изменяйте system prompt для других инструкций
- Добавляйте новые параметры в `AIEditDecision`
- Реализуйте в `autoEdit.ts`

## 📦 Сборка для production

```bash
# Оптимизированная сборка
npm run build

# Проверка типов
npm run typecheck

# Lint
npm run lint
```

## 🤝 Contributing

Проект создан как полнофункциональный прототип профессионального видеоредактора.

Основные направления для улучшения:
1. Whisper API для автоматических субтитров
2. Полная реализация RGB Curves / HSL / Color Wheels в FFmpeg
3. Дополнительные переходы и эффекты
4. Undo/Redo система
5. Collaborative editing

## 📄 Лицензия

Все права защищены.

## 🙏 Благодарности

- FFmpeg.wasm за возможность браузерного видео-процессинга
- Groq за быстрый AI inference
- Next.js и React команды за отличный фреймворк
- Tailwind CSS за прекрасную систему стилизации

---

**Made with ❤️ by AI Video Studio Team**

🎬 MONTIQ — Where AI Meets Professional Video Editing
