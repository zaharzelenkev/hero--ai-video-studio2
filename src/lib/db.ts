"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Project } from "./types";

export interface ExperienceLesson {
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


export async function saveBlob(key: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put("assets", blob, key);
}

export async function loadBlob(key: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get("assets", key);
}

export async function deleteBlob(key: string): Promise<void> {
  const db = await getDb();
  await db.delete("assets", key);
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDb();
  await db.put("projects", project);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const db = await getDb();
  return db.get("projects", id);
}

export async function listProjects(): Promise<Project[]> {
  const db = await getDb();
  const all = await db.getAll("projects");
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  const proj = await db.get("projects", id);
  if (proj) {
    // Delete associated blobs
    for (const asset of proj.assets) {
      if (asset.blobKey) await db.delete("assets", asset.blobKey);
    }
    if (proj.previewBlobKey) {
      await db.delete("assets", proj.previewBlobKey);
    }
  }
  await db.delete("projects", id);
}
