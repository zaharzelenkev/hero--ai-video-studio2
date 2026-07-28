import type { Project } from "../types";
import { getKnowledgeForGenre, saveLearnedLesson, BASE_KNOWLEDGE } from "./knowledge";

export class DirectorBrain {
  
  static async defineStrategy(userPrompt: string): Promise<{ genre: string, targetDuration: number, instructions: string }> {
    const prompt = userPrompt.toLowerCase();
    let detectedGenre = "tiktok";
    if (prompt.match(/(подкаст|интервью|podcast|interview)/)) detectedGenre = "podcast";
    else if (prompt.match(/(реклам|ad|промо|коммерц)/)) detectedGenre = "ad";
    else if (prompt.match(/(тревел|travel|свадьб|wedding|влог|vlog)/)) detectedGenre = "travel";

    const baseInfo = BASE_KNOWLEDGE.find(k => k.genreId === detectedGenre)!;
    
    let targetDuration = baseInfo.targetDurationMin;
    const durMatch = prompt.match(/(\\d+)\\s*(сек|мин)/);
    if (durMatch) {
       const num = parseInt(durMatch[1]);
       targetDuration = durMatch[2].startsWith("мин") ? num * 60 : num;
    }

    const instructions = await getKnowledgeForGenre(detectedGenre);

    return {
      genre: detectedGenre,
      targetDuration,
      instructions
    };
  }

  // Self-Correction Engine: Reviews the generated project before finalizing
  static async critiqueAndLearn(project: Project, genre: string): Promise<Project> {
    const videoTrack = project.tracks.find(t => t.type === "video");
    if (!videoTrack || videoTrack.clips.length < 2) return project; // Nothing to critique

    let hasErrors = false;
    let newLessons: string[] = [];

    // Rule 1: Check pacing
    const avgDuration = videoTrack.clips.reduce((sum, c) => sum + c.duration, 0) / videoTrack.clips.length;
    if (genre === "tiktok" || genre === "ad") {
      if (avgDuration > 4) {
        hasErrors = true;
        newLessons.push("Кадры получились слишком длинными. Зритель быстро заскучает. В следующий раз делай нарезку короче (до 3 сек).");
        
        // Auto-fix: aggressively cut long clips
        videoTrack.clips = videoTrack.clips.map(c => {
           if (c.duration > 3.5) {
             c.duration = 3;
             (c as any).outPoint = (c as any).inPoint + 3 * ((c as any).speed || 1);
           }
           return c;
        });
      }
    }

    // Reposition clips after auto-fix
    if (hasErrors) {
      let cursor = 0;
      for (const c of videoTrack.clips) {
        c.start = cursor;
        cursor += c.duration;
      }
      project.duration = cursor;
    }

    // Save lessons to Database for next time
    for (const lesson of newLessons) {
      await saveLearnedLesson(genre, lesson);
    }

    return project;
  }
}
