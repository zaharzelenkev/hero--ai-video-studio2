# MONTIQ - Deployment Guide

## 📋 Pre-Deployment Checklist

### ✅ Что уже сделано

1. **Критические исправления**
   - [x] ArrayBuffer detachment в FFmpeg
   - [x] Ложная ошибка после генерации устранена
   - [x] Экспорт стабилизирован

2. **Профессиональные возможности**
   - [x] Multi-track timeline
   - [x] Keyframe animations
   - [x] Professional color grading
   - [x] 25+ effects library
   - [x] Advanced audio tools
   - [x] Text & subtitle system

3. **AI Integration**
   - [x] Groq API integration
   - [x] Intelligent montage analysis
   - [x] Rule-based fallback
   - [x] Format-specific optimization

4. **UX/Брендинг**
   - [x] MONTIQ rebranding
   - [x] Modern minimalist design
   - [x] Success page flow
   - [x] Professional export panel

## 🚀 Deployment Options

### Option 1: Vercel (Рекомендуется)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production
vercel --prod
```

**Environment Variables** (не требуются для базовой версии):
```env
# Основной AI-провайдер: OpenRouter (бесплатные модели `:free`)
OPENROUTER_API_KEY=sk-or-v1-...
# Тот же ключ для клиентских вызовов (генерация «Магия» и т.п.)
NEXT_PUBLIC_OPENROUTER_API_KEY=sk-or-v1-...
# Страховочный провайдер (необязательно)
GROQ_API_KEY=your_groq_api_key
```

### Option 2: Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Build
npm run build

# Deploy
netlify deploy --prod --dir=.next
```

### Option 3: Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t montiq .
docker run -p 3000:3000 montiq
```

### Option 4: Static Export (для CDN)

**⚠️ Внимание**: App Router с dynamic routes требует server

Для полностью статичного варианта нужно изменить на Pages Router или использовать Static Site Generation.

## 🔧 Production Configuration

### 1. Next.js Config

`next.config.ts` уже оптимизирован:
```typescript
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false };
    return config;
  },
};
```

### 2. Environment Setup

Создайте `.env.production`:
```env
NEXT_PUBLIC_APP_NAME=MONTIQ
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### 3. Performance Optimizations

Уже реализовано:
- ✅ Code splitting
- ✅ Lazy loading components
- ✅ Media caching
- ✅ IndexedDB для storage
- ✅ Debounced auto-save

Дополнительно можно добавить:
```typescript
// next.config.ts
experimental: {
  optimizePackageImports: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
}
```

## 📊 Monitoring & Analytics

### Рекомендуемые инструменты

1. **Error Tracking**: Sentry
```bash
npm install @sentry/nextjs
```

2. **Analytics**: Vercel Analytics или Google Analytics
```bash
npm install @vercel/analytics
```

3. **Performance**: Vercel Speed Insights
```bash
npm install @vercel/speed-insights
```

## 🔐 Security Considerations

### API Keys
- Groq API key хранится в `localStorage` (client-side only)
- Для production: создайте server-side proxy в `/app/api/groq/route.ts`

### CORS
FFmpeg.wasm требует правильных headers:
```typescript
// middleware.ts (если нужно)
export function middleware(request: Request) {
  const headers = new Headers(request.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  return NextResponse.next({ headers });
}
```

Но для Vercel/Netlify это обычно не требуется.

## 🎯 Post-Deployment Testing

### Тестовый чеклист

1. **Генерация проекта**
   - [ ] Upload файлов работает
   - [ ] AI генерация (с и без Groq)
   - [ ] Redirect на success page
   - [ ] Preview video отображается

2. **Редактор**
   - [ ] Timeline загружается
   - [ ] Preview canvas рендерится
   - [ ] Все панели работают
   - [ ] Keyframes сохраняются
   - [ ] Auto-save работает

3. **Экспорт**
   - [ ] Рендеринг без ошибок
   - [ ] Download работает
   - [ ] Разные форматы (MP4, WebM)
   - [ ] Разные разрешения

4. **Кроссбраузерность**
   - [ ] Chrome/Edge
   - [ ] Firefox
   - [ ] Safari
   - [ ] Mobile browsers (limited)

## 🐛 Common Issues & Solutions

### Issue 1: FFmpeg не загружается

**Причина**: CORS или missing files

**Решение**:
```bash
# Убедитесь, что postinstall отработал
npm run postinstall
# или вручную
node scripts/copy-ffmpeg-core.mjs
```

### Issue 2: IndexedDB errors в Safari

**Причина**: Safari лимиты

**Решение**: Добавьте предупреждение о размере файлов
```typescript
if (totalSize > 500 * 1024 * 1024) { // 500MB
  alert('Safari: файлы >500MB могут вызвать проблемы');
}
```

### Issue 3: Memory errors при экспорте

**Причина**: Большие файлы

**Решение**: Уже реализовано в ArrayBuffer fix, но можно добавить chunking

### Issue 4: Slow first render

**Причина**: FFmpeg.wasm загрузка

**Решение**: Показываем "Preparing video engine..." (уже есть)

## 📈 Performance Optimization

### Bundle Size
Текущий размер:
- First Load JS: ~250KB (Next.js + React)
- FFmpeg.wasm: ~30MB (lazy loaded)
- Total: Приемлемо для video editor

### Lighthouse Scores (целевые)
- Performance: 80+
- Accessibility: 95+
- Best Practices: 90+
- SEO: 90+

### Optimization Tips

1. **Image Optimization**
```typescript
// Используйте next/image для статики
import Image from 'next/image';
```

2. **Font Optimization**
Fonts уже локальные в `/public/fonts`

3. **Code Splitting**
Уже реализовано через dynamic imports

## 🔄 Update Strategy

### Rolling Updates
```bash
# 1. Backup текущей версии
git tag v1.0.0

# 2. Deploy новой версии
vercel --prod

# 3. Monitor errors
# 4. Rollback если нужно
vercel rollback
```

### Database Migrations
При изменении `PROJECT_DB_VERSION` в types.ts:
```typescript
// Добавьте migration logic в db.ts
async function migrateProject(old: ProjectV1): Promise<ProjectV2> {
  // Transform old data to new structure
}
```

## 📝 Final Checklist

Перед production deploy:

- [ ] `npm run build` без ошибок
- [ ] `npm run typecheck` passed
- [ ] `npm run lint` passed
- [ ] README.md актуален
- [ ] Environment variables настроены
- [ ] Error tracking configured
- [ ] Analytics добавлен (опционально)
- [ ] HTTPS certificate (автоматически на Vercel/Netlify)
- [ ] Custom domain настроен (опционально)
- [ ] Backup strategy (git + Vercel)

## 🎉 Launch!

```bash
# Final production deploy
npm run build
vercel --prod

# Или с custom domain
vercel --prod --alias montiq.yourdomain.com
```

---

**MONTIQ готов к production!** 🚀

Все критические проблемы исправлены, профессиональные функции реализованы, UX полностью переработан.
