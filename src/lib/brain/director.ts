import type { Project, VideoClip } from "../types";
import { getKnowledgeForGenre, saveLearnedLesson, BASE_KNOWLEDGE } from "./knowledge";

export class DirectorBrain {
  
  static async defineStrategy(userPrompt: string): Promise<{ genre: string, targetDuration: number, instructions: string }> {
    const prompt = userPrompt.toLowerCase();
    let detectedGenre = "tiktok";
    if (prompt.match(/(подкаст|интервью|podcast|interview)/)) detectedGenre = "podcast";
    else if (prompt.match(/(реклам|ad|промо|коммерц)/)) detectedGenre = "ad";
    else if (prompt.match(/(тревел|travel|свадьб|wedding|влог|vlog)/)) detectedGenre = "travel";
    else if (prompt.match(/(документал|doc|фильм)/)) detectedGenre = "documentary";

    const baseInfo = BASE_KNOWLEDGE.find(k => k.genreId === detectedGenre) || BASE_KNOWLEDGE[0];
    
    let targetDuration = baseInfo.targetDurationMin;
    const durMatch = prompt.match(/(\d+)\s*(сек|мин)/);
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
    const audioTrack = project.tracks.find(t => t.type === "audio");
    const bRollTrack = project.tracks.find(t => t.id === "b-roll") || project.tracks.find(t => t.type === "video" && t.id !== videoTrack?.id);

    if (!videoTrack || videoTrack.clips.length < 2) return project;

    let hasErrors = false;
    let newLessons: string[] = [];

    // Rule 1: Pacing for fast genres (TikTok, Ad)
    if (genre === "tiktok" || genre === "ad") {
      const avgDuration = videoTrack.clips.reduce((sum, c) => sum + c.duration, 0) / videoTrack.clips.length;
      if (avgDuration > 3.5) {
        hasErrors = true;
        newLessons.push("КРИТИЧЕСКАЯ ОШИБКА: Темп слишком медленный. В следующий раз режь кадры быстрее (до 2-3 сек), чтобы удержать внимание.");
        
        // Auto-fix: aggressively cut long clips and add zoom to simulate motion
        videoTrack.clips = videoTrack.clips.map(c => {
           const vc = c as VideoClip;
           if (vc.duration > 3.5) {
             vc.duration = 3;
             vc.outPoint = (vc.inPoint || 0) + 3;
             // Add artificial zoom/scale if it doesn't have animation
             if (vc.scale && vc.scale.keyframes.length === 0) {
                vc.scale.keyframes = [
                  { id: "anim_"+Date.now()+"_1", time: 0, value: 1, easing: "linear" },
                  { id: "anim_"+Date.now()+"_2", time: 3, value: 1.15, easing: "linear" }
                ];
             }
           }
           return vc;
        });
      }
    }

    // Rule 2: Cinematic pacing & Jump Cuts check for Travel / Documentary
    if (genre === "travel" || genre === "documentary") {
      // Check if there are too many rapid cuts which ruins the cinematic feel
      const fastCuts = videoTrack.clips.filter(c => c.duration < 1.5).length;
      if (fastCuts > videoTrack.clips.length * 0.4) {
         newLessons.push("ОШИБКА РИТМА: Для Cinematic стиля слишком много коротких кадров (<1.5с). Зритель не успевает насладиться визуалом. В следующий раз давай кадру 'подышать' 4-6 секунд.");
      }

      // Ensure Ken Burns is applied to static images in these genres
      videoTrack.clips = videoTrack.clips.map(c => {
         const vc = c as VideoClip;
         if (vc.assetId && vc.assetId.match(/\.(jpe?g|png|webp)$/i) && vc.scale && vc.scale.keyframes.length === 0) {
            vc.scale.keyframes = [
              { id: "kenburns_"+Date.now()+"_1", time: 0, value: 1, easing: "linear" },
              { id: "kenburns_"+Date.now()+"_2", time: vc.duration, value: 1.15, easing: "linear" }
            ];
         }
         return vc;
      });
    }

    // Rule 3: J-Cut & L-Cut suggestions (Advanced Editing)
    if (audioTrack && audioTrack.clips.length > 0) {
      let usesAdvancedCuts = false;
      for (const aClip of audioTrack.clips) {
         const matchingVideo = videoTrack.clips.find(v => Math.abs(v.start - aClip.start) < 0.1);
         if (!matchingVideo) {
           usesAdvancedCuts = true;
           break;
         }
      }
      if (!usesAdvancedCuts && (genre === "travel" || genre === "podcast")) {
         newLessons.push("МАСТЕР-КЛАСС: Звук и видео режутся синхронно. Это выглядит любительски. В следующий раз используй J-Cuts: звук новой сцены должен начинаться за 1-2 секунды до появления картинки.");
      }
    }

    // Rule 4: B-Roll overlay for podcasts
    if (genre === "podcast" && (!bRollTrack || bRollTrack.clips.length === 0)) {
       newLessons.push("ОШИБКА УДЕРЖАНИЯ: Подкаст без B-Roll (перебивок). Зритель уснет, глядя на одну говорящую голову. В следующий раз обязательно перекрывай лицо видеовставками (B-Roll).");
    }

    // Reposition clips after auto-fix (if durations changed)
    if (hasErrors) {
      let cursor = 0;
      for (const c of videoTrack.clips) {
        c.start = cursor;
        cursor += c.duration;
      }
      // Re-evaluate project duration
      project.duration = Math.max(cursor, audioTrack ? audioTrack.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0) : 0);
    }

    for (const lesson of newLessons) {
      await saveLearnedLesson(genre, lesson);
    }

    return project;
  }
}