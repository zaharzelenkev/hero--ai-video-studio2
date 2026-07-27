"use client";

/**
 * MONTIQ Image Processing Utilities
 * 
 * Базовые инструменты обработки изображений без внешних API.
 * Все операции выполняются локально в браузере через Canvas API.
 */

/**
 * Применить базовые фильтры к изображению через Canvas
 */
export async function applyCanvasFilter(
  imageBlob: Blob,
  filterType: "brightness" | "contrast" | "saturation" | "blur" | "sharpen"
): Promise<Blob> {
  const img = await loadImage(imageBlob);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  
  // Apply CSS filter
  const filters = {
    brightness: "brightness(1.2)",
    contrast: "contrast(1.2)",
    saturation: "saturate(1.3)",
    blur: "blur(2px)",
    sharpen: "contrast(1.3) brightness(1.1)",
  };
  
  ctx.filter = filters[filterType];
  ctx.drawImage(img, 0, 0);
  
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

/**
 * Изменить размер изображения (простой upscale через Canvas)
 */
export async function resizeImage(
  imageBlob: Blob,
  scale: number
): Promise<Blob> {
  const img = await loadImage(imageBlob);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  
  // Smooth scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

/**
 * Конвертировать изображение в черно-белое
 */
export async function convertToGrayscale(imageBlob: Blob): Promise<Blob> {
  const img = await loadImage(imageBlob);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

/**
 * Обрезать изображение
 */
export async function cropImage(
  imageBlob: Blob,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<Blob> {
  const img = await loadImage(imageBlob);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
  
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

/**
 * Повернуть изображение
 */
export async function rotateImage(
  imageBlob: Blob,
  degrees: number
): Promise<Blob> {
  const img = await loadImage(imageBlob);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  
  canvas.width = img.width * cos + img.height * sin;
  canvas.height = img.width * sin + img.height * cos;
  
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

// Helper function
async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}
