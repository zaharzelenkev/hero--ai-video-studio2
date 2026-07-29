const fs = require('fs');
const file = './src/lib/db.ts';
let code = fs.readFileSync(file, 'utf8');

const newDbLogic = `export interface ExperienceLesson {
  id: string;
  genre: string;
  lesson: string;
  createdAt: number;
}

interface StudioDB extends DBSchema {
  experience: {
    key: string;
    value: ExperienceLesson;
    indexes: { "byGenre": string };
  };
  assets: {
    key: string;
    value: Blob;
  };
  projects: {
    key: string;
    value: Project;
    indexes: { updatedAt: number };
  };
}

let dbPromise: Promise<IDBPDatabase<StudioDB>> | null = null;

function getDb() {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!dbPromise) {
    dbPromise = openDB<StudioDB>("ai-video-studio", 2, {
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
        }
      },
    });
  }
  return dbPromise;
}

export async function saveExperienceLesson(lesson: ExperienceLesson): Promise<void> {
  const db = await getDb();
  await db.put("experience", lesson);
}

export async function loadLessonsByGenre(genre: string): Promise<ExperienceLesson[]> {
  const db = await getDb();
  return db.getAllFromIndex("experience", "byGenre", genre);
}
`;

code = code.replace(
  /interface StudioDB extends DBSchema \{[\s\S]*?return dbPromise;\n\}/m,
  newDbLogic
);

fs.writeFileSync(file, code);
