"use client";

import { getFFmpeg, fetchFileFromBlob } from "./ffmpeg";
import type { MediaAsset } from "./types";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptWord {
  start: number;
  end: number;
  word: string;
}

export interface TranscriptResult {
  segments: TranscriptSegment[];
  words: TranscriptWord[];
}

function extForMime(mime: string): string {
  const sub = (mime.split("/")[1] || "bin").split(";")[0];
  if (sub.includes("quicktime")) return "mov";
  if (sub === "jpeg") return "jpg";
  return sub;
}

/** Pulls a small, mono, 16kHz audio track out of any video/audio asset — ideal input size/format for speech recognition. */
export async function extractAudioForTranscription(sourceBlob: Blob, asset: MediaAsset): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  const inName = `ts_in_${asset.id}.${extForMime(asset.mime)}`;
  const outName = `ts_out_${asset.id}.mp3`;
  const bytes = await fetchFileFromBlob(sourceBlob);
  await ffmpeg.writeFile(inName, bytes);
  try {
    await ffmpeg.exec(["-i", inName, "-vn", "-ar", "16000", "-ac", "1", "-b:a", "64k", outName]);
    const data = await ffmpeg.readFile(outName);
    const out = typeof data === "string" ? new TextEncoder().encode(data) : data;
    return new Blob([new Uint8Array(out)], { type: "audio/mpeg" });
  } finally {
    try {
      await ffmpeg.deleteFile(inName);
    } catch {
      /* ignore */
    }
    try {
      await ffmpeg.deleteFile(outName);
    } catch {
      /* ignore */
    }
  }
}

/** Sends extracted audio to our server route, which forwards it to Groq's Whisper API. */
export async function transcribeAudio(audio: Blob): Promise<TranscriptResult> {
  const form = new FormData();
  form.append("audio", audio, "audio.mp3");
  const resp = await fetch("/api/transcribe", { method: "POST", body: form });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || "Не удалось распознать речь");
  }
  return {
    segments: Array.isArray(data.segments) ? data.segments : [],
    words: Array.isArray(data.words) ? data.words : []
  };
}
