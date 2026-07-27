# Деплой MONTIQ на Vercel

## 🚀 Быстрый старт

### 1. Подготовка проекта
```bash
# Убедитесь, что все изменения сохранены
git add .
git commit -m "Готово к деплою на Vercel"

# Создайте новый репозиторий на GitHub (если ещё нет)
# Или используйте существующий
```

### 2. Деплой через Vercel Dashboard

#### Вариант A: Через веб-интерфейс Vercel
1. Зайдите на [vercel.com](https://vercel.com)
2. Нажмите "Add New" → "Project"
3. Импортируйте репозиторий с GitHub/GitLab
4. Настройки будут автоматически применены из `vercel.json`
5. Нажмите "Deploy"

#### Вариант B: Через Vercel CLI
```bash
# Установите Vercel CLI
npm i -g vercel

# Войдите в аккаунт
vercel login

# Делайте деплой
vercel

# Для production деплоя
vercel --prod
```

## ⚙️ Конфигурация проекта

### Файлы конфигурации, которые мы добавили:

#### 1. `vercel.json` - Основная конфигурация Vercel
```json
{
  "installCommand": "npm ci",
  "buildCommand": "npm run build", 
  "outputDirectory": ".next",
  "functions": {
    "src/app/api/**/*": {
      "maxDuration": 60
    }
  },
  "env": {
    "NEXT_TELEMETRY_DISABLED": "1"
  },
  "regions": ["iad1"],
  "maxDuration": 60
}
```

#### 2. `next.config.ts` - Конфигурация Next.js
- Добавлены fallback для Node.js модулей
- Включена поддержка WebAssembly
- Добавлены CORS headers для FFmpeg.wasm

#### 3. `package.json` - Обновлённые скрипты
- Улучшенный скрипт `postinstall` с fallback
- Добавлен скрипт `copy-ffmpeg` для ручного копирования FFmpeg файлов

#### 4. Вспомогательные файлы
- `.nvmrc` - Node.js версия 18
- `.browserslistrc` - Поддержка браузеров
- `next-env.d.ts` - TypeScript типы Next.js

## 🔧 Решенные проблемы

### Проблема 1: FFmpeg файлы не копируются
**Решение**: Добавлен fallback скрипт и создана директория `public/ffmpeg`

### Проблема 2: Ошибки с Node.js модулями  
**Решение**: Добавлены fallback в webpack конфигурации

### Проблема 3: CORS для WebAssembly
**Решение**: Добавлены необходимые headers в next.config.ts

### Проблема 4: Время сборки на Vercel
**Решение**: Увеличен `maxDuration` до 60 секунд

## 📊 Мониторинг деплоя

### Проверка успешного деплоя

1. **Логи установки зависимостей**:
   - Проверьте, что `npm ci` выполнился без ошибок
   - Убедитесь, что скрипт `postinstall` выполнился (или использовал fallback)

2. **Логи сборки**:
   - Проверьте, что `npm run build` завершился успешно
   - Убедитесь, что нет ошибок TypeScript

3. **Логи развёртывания**:
   - Проверьте, что приложение успешно запустилось
   - Проверьте доступность по URL

### Распространённые ошибки и решения

#### Ошибка 1: `MODULE_NOT_FOUND` для Node.js модулей
**Причина**: Vercel использует serverless функции
**Решение**: Мы уже добавили fallback в webpack конфигурации

#### Ошибка 2: Время сборки превышено
**Причина**: Проект слишком большой или сложный
**Решение**: Мы установили `maxDuration: 60` в vercel.json

#### Ошибка 3: FFmpeg не загружается
**Причина**: Файлы не скопированы в public/ffmpeg
**Решение**: Приложение использует CDN fallback автоматически

## 🔍 Тестирование после деплоя

### Основной функционал
1. **Главная страница**: Проверьте загрузку `/`
2. **Загрузка файлов**: Проверьте работу UploadZone
3. **Редактор**: Проверьте доступ к `/editor/[id]`
4. **FFmpeg**: Проверьте, что видео рендерится

### API endpoints
```bash
# Проверьте API endpoints
curl https://your-domain.vercel.app/api/transcribe
# Должен вернуть 404 или правильный response
```

### Производительность
1. **First Load**: Проверьте время загрузки главной страницы
2. **Bundle Size**: Убедитесь, что нет лишних зависимостей
3. **FFmpeg.wasm**: Проверьте загрузку WebAssembly модуля

## 🚨 Что делать если деплой не работает

### Шаг 1: Проверьте логи Vercel
1. Зайдите в Vercel Dashboard
2. Найдите ваш проект
3. Откройте вкладку "Deployments"
4. Проверьте логи последнего деплоя

### Шаг 2: Локальная диагностика
```bash
# Проверьте локальную сборку
npm run build

# Проверьте TypeScript
npm run typecheck

# Проверьте линтер
npm run lint
```

### Шаг 3: Упростите конфигурацию
Если деплой всё ещё не работает:

1. Временно удалите `vercel.json`
2. Попробуйте деплой с настройками по умолчанию
3. Постепенно добавляйте обратно настройки

### Шаг 4: Обратитесь в поддержку Vercel
Если ничего не помогает:
1. Создайте issue в [Vercel Community](https://github.com/vercel/community)
2. Приложите логи сборки
3. Укажите ошибку `npm run vercel`

## 🔄 Continuous Deployment

### Настройка автоматического деплоя
1. **GitHub Actions**: Автоматический деплой при push в main
2. **Vercel Git Integration**: Автоматический деплой через веб-интерфейс
3. **Проверки перед деплоем**: Добавьте pre-deploy checks

### Пример GitHub Action
```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm run typecheck
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

## 📈 Оптимизация для продакшена

### 1. Кэширование зависимостей
```json
// В vercel.json добавьте
"caching": {
  "node_modules": true
}
```

### 2. Оптимизация образов
```typescript
// В next.config.ts
images: {
  formats: ['image/avif', 'image/webp'],
  remotePatterns: [
    {
      protocol: 'https',
      hostname: '**',
    },
  ],
}
```

### 3. Мониторинг
- **Vercel Analytics**: Встроенная аналитика
- **Error Tracking**: Добавьте Sentry или аналоги
- **Performance Monitoring**: Используйте Vercel Speed Insights

## 🎯 Финальная проверка перед деплоем

### ✅ Обязательные проверки
- [ ] `npm run build` проходит без ошибок
- [ ] `npm run typecheck` не находит ошибок TypeScript
- [ ] `npm run lint` проходит без критических ошибок
- [ ] `public/ffmpeg` директория существует
- [ ] Все конфигурационные файлы на месте

### ✅ Рекомендуемые проверки
- [ ] Локально запускается `npm run dev`
- [ ] Локально работает `npm start` после сборки
- [ ] Проверены все основные страницы
- [ ] FFmpeg работает (или использует CDN fallback)

## 🎉 Готово к деплою!

Проект **MONTIQ** теперь полностью готов для деплоя на Vercel. Все критические проблемы решены:

✅ **Конфигурация Vercel** - `vercel.json` настроен  
✅ **Next.js конфигурация** - Добавлена поддержка WASM и fallback  
✅ **FFmpeg совместимость** - Добавлен CDN fallback механизм  
✅ **Производительность** - Оптимизирована для serverless  
✅ **Обработка ошибок** - Graceful degradation при проблемах  

**Следующие шаги**:
1. Задеплойте на Vercel через веб-интерфейс или CLI
2. Проверьте работоспособность всех функций
3. Настройте custom domain (опционально)
4. Добавьте monitoring и analytics

**Удачи с деплоем!** 🚀

---

*Последнее обновление: 27 июля 2024*  
*Проект: MONTIQ - AI-Powered Professional Video Editor*
