# MONTIQ AI Production Studio — архитектурный план

_Статус: архитектурный аудит и дорожная карта. 31 июля 2026._

## Что уже есть в текущем проекте

MONTIQ уже не является «пустым» редактором: это Next.js 16 / React 19 приложение с локальным browser-first pipeline. В нём есть:

- загрузка медиа, IndexedDB-хранилище проектов и исходников;
- `localAnalyzer`, транскрибация и анализ энергии; AI/rule-based Director Engine;
- `autoEditToProject`, жанровые templates, beat-aware монтаж и FFmpeg filter graph;
- canvas preview, многодорожечный таймлайн, keyframes, цвет, эффекты, звук, текст и экспорт FFmpeg.wasm;
- Node/FFmpeg regression scripts для монтажа, рендера, музыки и фильтров.

Главный архитектурный разрыв был до монтажа: намерение пользователя сразу превращалось в генерацию/автомонтаж. Не было устойчивого production-документа, соединяющего идею, сценарий, режиссуру, съёмку и постпродакшн. Также часть AI-интеграций сейчас имеет fallback, а не единый jobs/API contract. Это определяет порядок работ: нельзя заменять работающий browser-first editor новым продуктом; нужно расширять его единым доменным слоем.

## Целевая модель

`ProductionPlan` — source of truth для творческого замысла. `Project` остаётся source of truth для монтажной timeline. Между ними — явный compilation layer: план даёт сценарные beats, shot requirements и deliverables; анализ материалов даёт asset evidence; auto-editor собирает clips и сохраняет traceability к сцене плана.

```
Brief → ProductionPlan → Script / Shot list → Ingest & asset analysis
      → Director decisions → Timeline Project → Review → Render / Deliverables
```

Все пользовательские данные остаются локальными по умолчанию (IndexedDB + FFmpeg.wasm). Облачные AI-функции должны быть opt-in, с явно отображаемым провайдером, статусом job и fallback без потери проекта.

## Этапы

### 1. Production Foundation — реализуется в этом изменении

- доменная модель `ProductionPlan` в `Project`, без миграции существующих проектов (поле optional);
- offline-first генератор editable creative brief: идея, аудитория, формат, длительность, CTA, пять драматургических beats, shot list, звук и монтажные заметки;
- blueprint на стартовом экране до запуска монтажа;
- Production Room в редакторе, где план читается, редактируются ключевые решения и он утверждается;
- план сохраняется вместе с созданным проектом.

### 2. Script, direction and shoot preparation

- versioned screenplay (beats → scenes → lines), character/brand bible и approval states;
- scene-to-asset requirements, call sheets, shot checklist, location/equipment/rights metadata;
- AI co-writer/director as structured JSON job with citations to brief and a human-editable diff;
- import/export brief in JSON/PDF, comments and review checkpoints.

### 3. Ingest and intelligent dailies

- asset folders, proxy lifecycle, hashes and relink;
- normalized analysis schema: transcript words, speakers, faces, shots, quality, objects, rights;
- review workspace: selects/rejects, markers, transcript editing, search by spoken phrase;
- persist analysis separately from timeline so it can be recomputed and reused.

### 4. Editorial intelligence and professional timeline

- map every generated clip to `productionSceneId` and evidence ranges;
- editable assembly / rough cut / fine cut versions, compare and rollback;
- multicam, transcript-based editing, compound clips, transitions and review comments;
- job queue abstraction for long analysis/render tasks with cancellation, progress and recoverability.

### 5. Finishing

- scopes, color-managed pipeline and grade layers; audio mixer, loudness meter and stem routing;
- caption editor, brand kit, template-driven motion graphics;
- render presets as deliverable packages, range render, quality validation and downloadable manifests.

### 6. Reliability and deployment

- browser E2E tests (ingest → plan → auto-edit → editor → export), fixture media and Vercel-safe smoke tests;
- telemetry only with consent; error boundary and retry UX for WASM and API jobs;
- feature flags for cloud providers, server-side secret isolation, rate limits and job persistence before any server render offering.

## Quality gates

Before every release/commit that changes the pipeline: `npm run lint`, `npm run typecheck`, `npm run build`, montage compile, FFmpeg E2E render, and relevant production-plan tests. Editor verification must cover opening a persisted project and Production Room; export verification must use the existing FFmpeg E2E render rather than a UI-only assertion.
