"use client";

import type { ReactNode } from "react";

/**
 * MONTIQ — unified professional icon set (24×24, stroke-based, Lucide/Feather
 * lineage). Replaces the scattered emoji across the product with a single
 * consistent visual voice.
 */

export type IconName =
  | "clapper"        // MONTIQ brand
  | "video"
  | "scissors"
  | "palette"
  | "sparkles"
  | "music"
  | "type"
  | "wand"
  | "keyframe"
  | "brain"
  | "draft"
  | "lock"
  | "rocket"
  | "upload"
  | "download"
  | "trash"
  | "undo"
  | "redo"
  | "save"
  | "plus"
  | "minus"
  | "arrow-right"
  | "arrow-left"
  | "arrow-up"
  | "arrow-down"
  | "play"
  | "compass"
  | "lightbulb"
  | "target"
  | "book"
  | "script"
  | "vision"
  | "storyboard"
  | "clipboard"
  | "calendar"
  | "casting"
  | "map-pin"
  | "alert"
  | "chat"
  | "check"
  | "home"
  | "layout"
  | "sliders"
  | "settings"
  | "x"
  | "menu"
  | "film"
  | "image"
  | "monitor"
  | "refresh"
  | "clock"
  | "share"
  | "zap"
  | "mic"
  | "eye"
  | "arrow-up-right"
  | "pause"
  | "skip-back"
  | "skip-forward"
  /* ── editor toolset ── */
  | "cursor"          // инструмент «Выбор»
  | "hand"            // инструмент «Рука»
  | "magnet"          // магнитное прилипание
  | "waves"           // ripple-режим
  | "copy"            // дублировать
  | "unlink"          // отделить звук
  | "flag"            // маркер
  | "repeat"          // зацикливание
  | "volume"          // звук включён
  | "volume-2"        // громче
  | "volume-x"        // звук выключен
  | "stop"            // стоп
  | "frame-back"      // кадр назад
  | "frame-forward"   // кадр вперёд
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "chevron-down"
  | "chevrons-left"   // предыдущая склейка
  | "chevrons-right"  // следующая склейка
  | "maximize"        // полный экран / вместить
  | "minimize"
  | "grid"            // сетки и безопасные зоны
  | "layers"
  | "search"
  | "eye-off"         // скрыть дорожку
  | "more-horizontal"
  | "keyboard"        // горячие клавиши
  | "audio-lines"     // волновая форма
  | "crop"
  | "flip-horizontal"
  | "flip-vertical"
  | "rotate-ccw"      // сброс
  | "gauge"           // скорость
  | "diamond"         // ключевой кадр
  | "equalizer"       // эквалайзер
  | "activity"        // аудио-метр
  | "trending-up"     // нормализация громкости
  | "smartphone"
  | "droplet"         // пипетка / цвет
  | "filter"
  | "info"
  | "check-circle"
  | "alert-circle"
  | "help"
  | "record"          // точка записи
  | "plus-circle"
  | "brush"           // кисть удаления объекта
  | "broom"           // очистить / шумоподавление
  | "dice"            // новый узор зерна
  | "star"
  | "sun"             // тёплая цветовая температура
  | "moon"            // холодная
  | "thermometer"
  | "shield"          // защита тона кожи
  | "wrench"          // автоматические исправления
  | "file-text"       // отчёт / логлайн
  | "camera"          // съёмка
  | "headphones"      // прослушивание / соло
  | "timer"
  | "bracket-left"    // точка входа
  | "bracket-right"   // точка выхода
  | "crosshair"
  | "grip"            // перетаскивание
  | "captions"        // субтитры
  | "link"
  | "move-horizontal" // выровнять по плейхеду
  | "indent"          // убрать пустоты
  | "music-note";

const P: Record<IconName, ReactNode> = {
  clapper: (
    <>
      <path d="M20.2 6 3.8 18" />
      <path d="M20 6.5 14.5 3l-5 4.5L15 11l5-4.5Z" />
      <path d="M4.5 9.5 2.5 21" />
      <path d="M14.8 6 20 9.5" />
      <path d="M2 13.5 9 11" />
      <path d="M7 16 13 13.5" />
      <path d="M14.5 6 12.5 19" />
      <path d="M5 9.5 7.5 18" />
      <path d="M14.5 6 9 14.5" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="6" width="14" height="12" rx="2.5" />
      <path d="m16 10.5 6-3v9l-6-3Z" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M20 4 8.5 16" />
      <path d="M8.5 8 20 20" />
      <path d="m14.5 14.5 2 2" />
      <path d="m11 17 3 3" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-2 0-.6-.4-1-1-1.4-.6-.5-1-1.2-1-2.1 0-1.4 1.1-2.5 2.5-2.5H17a4.5 4.5 0 0 0 4.5-4.5C21.5 6.6 17.2 3 12 3Z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3 13.8 9.2 20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z" />
      <path d="M19 15.5 19.7 18 22 18.7 19.7 19.4 19 22l-.7-2.6L16 18.7l2.3-.7Z" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </>
  ),
  type: (
    <>
      <path d="M4 6V4h16v2" />
      <path d="M12 4v16" />
      <path d="M9 20h6" />
    </>
  ),
  wand: (
    <>
      <path d="m15 4 5 5L8 21a2 2 0 0 1-3-3L15 4Z" />
      <path d="m13 6 5 5" />
      <path d="M18 2v3" />
      <path d="M21 3.5h-3" />
      <path d="M3 7.5 3 10.5" />
      <path d="M1.5 9h3" />
    </>
  ),
  keyframe: (
    <>
      <path d="M13 6h7l-3 4 3 4h-7" />
      <path d="m13 6-3 4 3 4" />
      <path d="M7 6v12" />
      <path d="M4 6h3" />
      <path d="M4 18h3" />
    </>
  ),
  brain: (
    <>
      <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V14a3 3 0 0 0 1 5.8V21" />
      <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V14a3 3 0 0 1-1 5.8V21" />
      <path d="M9 7.5h6" />
      <path d="M9 12h6" />
      <path d="M9 16.5h6" />
    </>
  ),
  draft: (
    <>
      <path d="m14 3 5 5L7.5 19.5 3 21l1.5-4.5L14 3Z" />
      <path d="m12.5 5.5 5 5" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <path d="M12 15v2" />
    </>
  ),
  rocket: (
    <>
      <path d="M5 15c-1.5 1.5-2 4-2 4s2.5-.5 4-2" />
      <path d="M12 3c3 1 5.5 3.5 6.5 6.5L21 14l-4 4-4.5-2.5A11 11 0 0 1 6 9L9.5 6.5c2.5 1 5 1 5 1" />
      <circle cx="14" cy="10" r="1.5" />
      <path d="M14 14 10 10" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7 7 20a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9L18 7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  undo: (
    <>
      <path d="M9 7 4 12l5 5" />
      <path d="M4 12h11a5 5 0 0 1 0 10" />
    </>
  ),
  redo: (
    <>
      <path d="m15 7 5 5-5 5" />
      <path d="M20 12H9a5 5 0 0 0 0 10" />
    </>
  ),
  save: (
    <>
      <path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M8 3v5h7V3" />
      <path d="M8 21v-7h8v7" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  minus: (
    <>
      <path d="M5 12h14" />
    </>
  ),
  "arrow-right": (
    <>
      <path d="M4 12h16" />
      <path d="m13 5 7 7-7 7" />
    </>
  ),
  "arrow-left": (
    <>
      <path d="M20 12H4" />
      <path d="m11 5-7 7 7 7" />
    </>
  ),
  "arrow-up": (
    <>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </>
  ),
  "arrow-down": (
    <>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </>
  ),
  play: (
    <>
      <path d="M6 4.5v15l13-7.5-13-7.5Z" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 1 3.6 10.8c-.6.5-1 1.3-1 2.2h-5.2c0-.9-.4-1.7-1-2.2A6 6 0 0 1 12 3Z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21V4.5Z" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    </>
  ),
  script: (
    <>
      <path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </>
  ),
  vision: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  storyboard: (
    <>
      <rect x="3" y="4" width="8" height="6" rx="1" />
      <rect x="13" y="4" width="8" height="6" rx="1" />
      <rect x="3" y="14" width="8" height="6" rx="1" />
      <rect x="13" y="14" width="8" height="6" rx="1" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4a2 2 0 0 1 6 0" />
      <path d="M9 10h6" />
      <path d="M9 14h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3 9h18" />
    </>
  ),
  casting: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.5a3 3 0 0 1 0 5" />
      <path d="M18 14.6c2 .9 3 2.8 3 5.4" />
    </>
  ),
  "map-pin": (
    <>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5" />
      <path d="M12 17.5v.5" />
    </>
  ),
  chat: (
    <>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.6-.8L4 21l1.8-4.4a8.5 8.5 0 1 1 15.2-5.1Z" />
      <path d="M8 10h8" />
      <path d="M8 14h5" />
    </>
  ),
  check: (
    <>
      <path d="m4 12.5 5.5 5.5L20 6.5" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-7 9 7" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  layout: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
      <circle cx="9" cy="6" r="2" fill="var(--bg-base, #0b0b11)" />
      <circle cx="15" cy="12" r="2" fill="var(--bg-base, #0b0b11)" />
      <circle cx="7" cy="18" r="2" fill="var(--bg-base, #0b0b11)" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  x: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16" />
      <path d="M17 4v16" />
      <path d="M3 9h4" />
      <path d="M3 15h4" />
      <path d="M17 9h4" />
      <path d="M17 15h4" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m3 16 5-5 4 4 3-3 6 6" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 8A8 8 0 0 0 5.6 6.6L4 8" />
      <path d="M4 3v5h5" />
      <path d="M4 16a8 8 0 0 0 14.4 1.4L20 16" />
      <path d="M20 21v-5h-5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.6" />
      <path d="m8.2 13.2 7.6 4.6" />
    </>
  ),
  zap: (
    <>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "arrow-up-right": (
    <>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </>
  ),
  pause: (
    <>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </>
  ),
  "skip-back": (
    <>
      <path d="M19 20 9 12l10-8v16Z" />
      <path d="M5 19V5" />
    </>
  ),
  "skip-forward": (
    <>
      <path d="m5 4 10 8-10 8V4Z" />
      <path d="M19 5v14" />
    </>
  ),
  /* ───────────────────────── editor toolset ───────────────────────── */
  cursor: (
    <>
      <path d="M4 3.5 20 11l-7 2.5L9.5 21 4 3.5Z" />
      <path d="m13 13.5 4.5 6" />
    </>
  ),
  hand: (
    <>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M11 11V4a1.5 1.5 0 0 1 3 0v7" />
      <path d="M14 10V5.5a1.5 1.5 0 0 1 3 0V13" />
      <path d="M17 11.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-4.2-1.8L3 15.4a1.6 1.6 0 0 1 2.3-2.2L8 16" />
    </>
  ),
  magnet: (
    <>
      <path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15" />
      <path d="m5 8 4 4" />
      <path d="m12 15 4 4" />
    </>
  ),
  waves: (
    <>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
  unlink: (
    <>
      <path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.71 1.72" />
      <path d="m5.16 11.75-1.72 1.71a5 5 0 0 0 7.07 7.07l1.71-1.72" />
      <path d="M8 2v3" />
      <path d="M2 8h3" />
      <path d="M16 22v-3" />
      <path d="M22 16h-3" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h13l-2.5 3.5L18 11H5" />
    </>
  ),
  repeat: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </>
  ),
  volume: (
    <>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </>
  ),
  "volume-2": (
    <>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  "volume-x": (
    <>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="m16 9 6 6" />
      <path d="m22 9-6 6" />
    </>
  ),
  stop: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </>
  ),
  "frame-back": (
    <>
      <path d="M8 5v14" />
      <path d="m18 6-6 6 6 6" />
    </>
  ),
  "frame-forward": (
    <>
      <path d="M16 5v14" />
      <path d="m6 6 6 6-6 6" />
    </>
  ),
  "chevron-left": (
    <>
      <path d="m15 18-6-6 6-6" />
    </>
  ),
  "chevron-right": (
    <>
      <path d="m9 18 6-6-6-6" />
    </>
  ),
  "chevron-up": (
    <>
      <path d="m18 15-6-6-6 6" />
    </>
  ),
  "chevron-down": (
    <>
      <path d="m6 9 6 6 6-6" />
    </>
  ),
  "chevrons-left": (
    <>
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </>
  ),
  "chevrons-right": (
    <>
      <path d="m6 17 5-5-5-5" />
      <path d="m13 17 5-5-5-5" />
    </>
  ),
  maximize: (
    <>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </>
  ),
  minimize: (
    <>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2 10 6-10 6L2 8l10-6Z" />
      <path d="m2 14 10 6 10-6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="M2 2l20 20" />
      <path d="M14 12a2 2 0 0 0-2-2" />
    </>
  ),
  "more-horizontal": (
    <>
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
      <circle cx="5" cy="12" r="1" fill="currentColor" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 9h.01" />
      <path d="M10 9h.01" />
      <path d="M14 9h.01" />
      <path d="M18 9h.01" />
      <path d="M6 13h.01" />
      <path d="M10 13h.01" />
      <path d="M14 13h.01" />
      <path d="M18 13h.01" />
      <path d="M8 17h8" />
    </>
  ),
  "audio-lines": (
    <>
      <path d="M2 10v3" />
      <path d="M6 6v11" />
      <path d="M10 3v18" />
      <path d="M14 8v7" />
      <path d="M18 5v13" />
      <path d="M22 10v3" />
    </>
  ),
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </>
  ),
  "flip-horizontal": (
    <>
      <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
      <path d="M12 20v2" />
      <path d="M12 14v2" />
      <path d="M12 8v2" />
      <path d="M12 2v2" />
    </>
  ),
  "flip-vertical": (
    <>
      <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
      <path d="M4 12H2" />
      <path d="M10 12H8" />
      <path d="M16 12h-2" />
      <path d="M22 12h-2" />
    </>
  ),
  "rotate-ccw": (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  gauge: (
    <>
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </>
  ),
  diamond: (
    <>
      <path d="M12 2.5 21.5 12 12 21.5 2.5 12 12 2.5Z" />
    </>
  ),
  equalizer: (
    <>
      <path d="M5 3v18" />
      <path d="M12 3v18" />
      <path d="M19 3v18" />
      <circle cx="5" cy="9" r="2" />
      <circle cx="12" cy="15" r="2" />
      <circle cx="19" cy="6" r="2" />
    </>
  ),
  activity: (
    <>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </>
  ),
  "trending-up": (
    <>
      <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
      <path d="M16 7h6v6" />
    </>
  ),
  smartphone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M12 18h.01" />
    </>
  ),
  droplet: (
    <>
      <path d="M12 2.5s6.5 6.9 6.5 11.5a6.5 6.5 0 1 1-13 0C5.5 9.4 12 2.5 12 2.5Z" />
    </>
  ),
  filter: (
    <>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01" />
      <path d="M11 12h1v4h1" />
    </>
  ),
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 5-6" />
    </>
  ),
  "alert-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.8.4-.9 1-.9 1.7" />
      <path d="M12 17h.01" />
    </>
  ),
  record: (
    <>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  "plus-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </>
  ),
  brush: (
    <>
      <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02Z" />
    </>
  ),
  broom: (
    <>
      <path d="m13 11 9-9" />
      <path d="M14 6.5 17.5 10" />
      <path d="M17 3.5 20.5 7" />
      <path d="m6 13 5 5-4 3-5-5 4-3Z" />
      <path d="m4 17 3 3" />
    </>
  ),
  dice: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
    </>
  ),
  star: (
    <>
      <path d="m12 3 2.7 5.8 6.3.8-4.6 4.4 1.2 6.3-5.6-3.2-5.6 3.2 1.2-6.3L3 9.6l6.3-.8L12 3Z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.9 4.9 1.4 1.4" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m4.9 19.1 1.4-1.4" />
      <path d="m17.7 6.3 1.4-1.4" />
    </>
  ),
  moon: (
    <>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </>
  ),
  thermometer: (
    <>
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" />
      <path d="m8.5 11.5 2.5 2.5 4.5-5" />
    </>
  ),
  wrench: (
    <>
      <path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6L14 13l-3-3 3.7-3.7Z" />
    </>
  ),
  "file-text": (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </>
  ),
  camera: (
    <>
      <path d="M3 7h3l2-3h8l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  headphones: (
    <>
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
      <path d="M21 14h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-5Z" />
      <path d="M3 14v-3a9 9 0 0 1 18 0v3" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5" />
      <path d="M9 2h6" />
    </>
  ),
  "bracket-left": (
    <>
      <path d="M8 21H5V3h3" />
    </>
  ),
  "bracket-right": (
    <>
      <path d="M16 3h3v18h-3" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1" fill="currentColor" />
      <circle cx="15" cy="6" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="18" r="1" fill="currentColor" />
      <circle cx="15" cy="18" r="1" fill="currentColor" />
    </>
  ),
  captions: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M7 15h4" />
      <path d="M13 15h4" />
      <path d="M7 11h2" />
      <path d="M11 11h6" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </>
  ),
  "move-horizontal": (
    <>
      <path d="m18 8 4 4-4 4" />
      <path d="M2 12h20" />
      <path d="m6 8-4 4 4 4" />
    </>
  ),
  indent: (
    <>
      <path d="M21 12H11" />
      <path d="M21 18H11" />
      <path d="M21 6H11" />
      <path d="m7 8-4 4 4 4" />
    </>
  ),
  "music-note": (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {P[name]}
    </svg>
  );
}
