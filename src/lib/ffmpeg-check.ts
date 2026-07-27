/**
 * Utility to check FFmpeg availability and provide fallback
 */

export function getFFmpegConfig() {
  const isDev = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Try to detect if FFmpeg files are available locally
  const hasLocalFFmpeg = typeof window !== 'undefined' 
    ? window.location.protocol === 'file:' || // Local file
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1'
    : false;

  return {
    useCDN: !hasLocalFFmpeg && isProduction,
    cdnUrl: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
    localPath: '/ffmpeg/ffmpeg-core.js',
    debug: isDev
  };
}

export async function loadFFmpegWithFallback() {
  const config = getFFmpegConfig();
  
  if (config.useCDN) {
    console.log('[FFmpeg] Using CDN fallback for production');
    return {
      corePath: config.cdnUrl,
      wasmPath: config.cdnUrl.replace('.js', '.wasm'),
      workerPath: config.cdnUrl.replace('.js', '.worker.js')
    };
  }
  
  console.log('[FFmpeg] Using local files');
  return {
    corePath: config.localPath,
    wasmPath: config.localPath.replace('.js', '.wasm'),
    workerPath: config.localPath.replace('.js', '.worker.js')
  };
}