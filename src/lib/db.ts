"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Project } from "./types";

interface StudioDB extends DBSchema {
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
    dbPromise = openDB<StudioDB>("ai-video-studio", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("assets")) {
          db.createObjectStore("assets");
        }
        if (!db.objectStoreNames.contains("projects")) {
          const store = db.createObjectStore("projects", { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      },
    });
  }
  return dbPromise;
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
  await db.delete("projects", id);
}
