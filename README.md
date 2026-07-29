# MONTIQ - AI-Powered Professional Video Editor

![MONTIQ Logo](https://img.shields.io/badge/MONTIQ-AI%20Video%20Editor-blueviolet?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square)
![React](https://img.shields.io/badge/React-19-blue?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square)

**Профессиональный видеоредактор нового поколения с интеллектуальным монтажом**

MONTIQ — это полнофункциональный браузерный видеоредактор, который сочетает мощь искусственного интеллекта для автоматического монтажа с профессиональными инструментами редактирования, сравнимыми с Adobe Premiere Pro и DaVinci Resolve.

## ✨ Ключевые возможности

### 🤖 Интеллектуальный AI-монтаж
- **Director Engine**: ИИ строит профессиональные сценарии (Hook -> Build-up -> Climax -> Outro).
- **Kinetic Typography**: Математическая физика анимаций текста (Elastic, Stomp, Bounce, Glitch) в стиле Hormozi и MrBeast.
- **Audio Mastering**: Нативный компрессор, эквалайзер и шумоподавление.
- **Smart Auto-Framing**: Автоматическое слежение за лицами (Face Detection) при кадрировании.
- **Algorithmic Music & SFX**: Браузер синтезирует Background Music и звуковые эффекты (Whoosh, Pop, Hit, Riser) налету.
- **Dynamic Google Fonts**: Интеграция любых шрифтов с Google Fonts напрямую в FFmpeg.
- **Анализ контента**: AI анализирует видео, находит лучшие моменты и эмоциональные пики
- **Groq API интеграция**: Используйте мощь LLaMA 3.3 для интеллектуального планирования монтажа
- **Форматно-специфичный монтаж**: Оптимизация под YouTube, Shorts, Reels, TikTok, подкасты, рекламу
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

#### 🎞️ Keyframe Animation
- Визуальный редактор кейфреймов
- Timeline visualization с кривыми
- 5 типов easing: Linear, Ease In, Ease Out, Ease In Out, Cubic Bezier
- Поддержка Bezier curves (в типах)
- Анимация всех параметров: Position, Scale, Rotation, Opacity, Color, и др.

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
- **AI**: Groq API (LLaMA 3.3 70B)

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
│   │   └── aiService.ts          # Groq API интеграция
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
3. **(Опционально) Настройте AI**: Добавьте Groq API ключ для интеллектуального анализа
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

### Groq API (опционально)

Для включения AI-анализа:

1. Получите API ключ на [https://console.groq.com](https://console.groq.com)
2. На главной странице нажмите "⚙️ Настроить AI"
3. Введите ключ (сохраняется в localStorage)

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
