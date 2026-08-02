/**
 * Транзиентное состояние кисти VFX (удаление объекта): панель включает кисть,
 * превью-канвас рисует ей и складывает штрихи во временное хранилище, а при
 * отпускании мыши штрихи сохраняются в клип через store.updateClip.
 *
 * Модуль без React — чтобы и панель, и канвас могли им пользоваться.
 */

export interface BrushStroke {
  x: number;
  y: number;
  radius: number;
}

export interface VfxBrushState {
  /** id клипа, для которого активна кисть. */
  clipId: string | null;
  /** Текущий радиус кисти (нормализован к ширине кадра). */
  radius: number;
  /** Штрихи текущего «мазка» (до отпускания кнопки). */
  liveStroke: BrushStroke[] | null;
  /** id клипа, ожидающего AI-клик (интерактивная сегментация). */
  aiPickClipId: string | null;
  /** Слушатели для перерисовки курсора/оверлея. */
  listeners: Set<() => void>;
}

const state: VfxBrushState = {
  clipId: null,
  radius: 0.04,
  liveStroke: null,
  aiPickClipId: null,
  listeners: new Set(),
};

export const vfxBrush = {
  state,

  isActive(clipId: string): boolean {
    return state.clipId === clipId;
  },

  setActive(clipId: string | null): void {
    state.clipId = clipId;
    state.liveStroke = null;
    emit();
  },

  setRadius(r: number): void {
    state.radius = Math.max(0.002, Math.min(0.5, r));
    emit();
  },

  beginStroke(x: number, y: number): void {
    state.liveStroke = [{ x, y, radius: state.radius }];
    emit();
  },

  addPoint(x: number, y: number): void {
    if (!state.liveStroke) return;
    const last = state.liveStroke[state.liveStroke.length - 1];
    // Не дублируем соседние точки слишком часто.
    const dx = (last.x - x) * 1000;
    const dy = (last.y - y) * 1000;
    if (dx * dx + dy * dy < 4) return;
    state.liveStroke.push({ x, y, radius: state.radius });
    emit();
  },

  /** Завершает мазок и возвращает штрихи для сохранения в клип. */
  endStroke(): { x: number; y: number; radius: number }[] | null {
    const stroke = state.liveStroke;
    state.liveStroke = null;
    emit();
    return stroke;
  },

  subscribe(fn: () => void): () => void {
    state.listeners.add(fn);
    return () => state.listeners.delete(fn);
  },
};

function emit(): void {
  for (const fn of state.listeners) fn();
}
