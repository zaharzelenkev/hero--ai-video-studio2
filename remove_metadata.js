const fs = require('fs');

let successCode = fs.readFileSync('src/app/success/[id]/page.tsx', 'utf8');

const metadataBlock = `<div className="flex flex-wrap gap-4 text-sm text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>⏱️</span>
                    <span>
                      {Math.floor(project.duration / 60)}:{String(Math.floor(project.duration % 60)).padStart(2, "0")} мин
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🎬</span>
                    <span>{project.tracks.reduce((n, t) => n + t.clips.length, 0)} клипов</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>📐</span>
                    <span>{project.exportSettings.width}×{project.exportSettings.height}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🎨</span>
                    <span>{project.exportSettings.fps} FPS</span>
                  </div>
                </div>`;

successCode = successCode.replace(metadataBlock, '');

fs.writeFileSync('src/app/success/[id]/page.tsx', successCode);
