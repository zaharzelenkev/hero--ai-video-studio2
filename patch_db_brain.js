const fs = require('fs');
const file = './src/lib/db.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /interface StudioDB extends DBSchema \{/,
  `export interface ExperienceLesson {
  id: string;
  genre: string;
  lesson: string;
  createdAt: number;
}

interface StudioDB extends DBSchema {
  experience: {
    key: string;
    value: ExperienceLesson;
    indexes: { byGenre: string };
  };`
);

code = code.replace(
  /dbPromise = openDB<StudioDB>\("ai-video-studio", 1, \{[\s\S]*?upgrade\(db\) \{/m,
  `dbPromise = openDB<StudioDB>("ai-video-studio", 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("assets");
          const store = db.createObjectStore("projects", { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("experience")) {
             const expStore = db.createObjectStore("experience", { keyPath: "id" });
             expStore.createIndex("byGenre", "genre");
          }
        }`
);

// We need to clean up the existing old lines:
code = code.replace(
  /if \(!db\.objectStoreNames\.contains\("assets"\)\) \{[\s\S]*?store\.createIndex\("updatedAt", "updatedAt"\);\n\s*\}/m,
  ''
);

// Actually, doing this with regex might be fragile if there's overlap. Let's do it cleanly.
