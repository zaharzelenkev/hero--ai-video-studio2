import type { Project, VideoClip } from "../types";
import type { AIAnalysisRequest } from "../ai/aiService";
import { getKnowledgeForGenre, saveLearnedLesson, BASE_KNOWLEDGE } from "./knowledge";
import { detectProjectType, type ProjectTypeId, projectTypeToGenreFamily } from "./projectType";

export class DirectorBrain {
  
  static async defineStrategy(request: AIAnalysisRequest): Promise<{ genre: string, targetDuration: number, instructions: string, projectType?: ProjectTypeId }> {
    const prompt = (request.userPrompt || "").toLowerCase();

    // 0. Явный шаблон пользователя — высший приоритет: если человек выбрал
    // «Подкаст», монтируем по правилам подкаста, что бы ни было в промпте.
    const templateToGenre: Record<string, string> = {
      podcast: "podcast", interview: "interview", vlog: "vlog", gaming: "gaming",
      fitness: "fitness", wedding: "wedding", food: "food", musicvideo: "musicvideo",
      education: "education", realestate: "realestate", documentary: "documentary",
      cinematic: "travel", luxury: "travel", apple: "ad",
      tiktok: "tiktok", hormozi: "tiktok", mrbeast: "tiktok", tech: "education",
    };
    const forcedGenre = request.templateHint && request.templateHint !== "auto"
      ? templateToGenre[request.templateHint]
      : undefined;

    // ---- НОВАЯ ПРОФЕССИОНАЛЬНАЯ ДЕТЕКЦИЯ ТИПА ПРОЕКТА ----
    // Прогоняем через детектор 16 типов — учитывает промпт, материалы (речь, вертикаль, длительность)
    let detectedByType: ReturnType<typeof detectProjectType> | null = null;
    try {
      const detectionInput = {
        brief: {
          idea: request.userPrompt || "",
          goal: "",
          audience: "",
          platform: request.templateHint || "",
          duration: "",
          style: "",
          mood: "",
          tempo: "",
          references: "",
          keyMessage: "",
          callToAction: "",
        } as any,
        rawPrompt: request.userPrompt,
        assets: request.assets.map(a => ({
          kind: a.type as any,
          duration: a.duration,
          width: a.width,
          height: a.height,
          hasAudio: !!a.audioEnergy?.length || !!a.transcript,
          hasTranscript: !!(a.transcript && a.transcript.length > 20),
          transcriptLength: a.transcript?.length || 0,
          name: a.name,
        })),
        platformHint: request.templateHint,
        styleHint: request.userPrompt,
      };
      detectedByType = detectProjectType(detectionInput);
    } catch {
      // fallback ниже
    }

    let detectedGenre = "tiktok";
    let targetDuration = 30;
    let confidenceNote = "";

    if (detectedByType) {
      const family = projectTypeToGenreFamily(detectedByType.type as any);
      const knownGenre = BASE_KNOWLEDGE.some(k => k.genreId === detectedByType!.type) ? detectedByType!.type : family;
      detectedGenre = forcedGenre ?? knownGenre;
      targetDuration = detectedByType.expectedDurationSec;
      confidenceNote = `Определён тип проекта: ${detectedByType.profile.labelRu} (уверенность ${(detectedByType.confidence*100).toFixed(0)}%). ${detectedByType.reasoning.join(" | ")} Структура сцен: ${detectedByType.scenarioStructure.join(" → ")}.`;

      if (forcedGenre) {
        detectedGenre = forcedGenre;
      }
    }

    // Легаси фоллбек если детектор не сработал
    if (!detectedByType) {
      if (forcedGenre) detectedGenre = forcedGenre;
      else if (prompt.match(/(подкаст|podcast)/)) detectedGenre = "podcast";
      else if (prompt.match(/(интервью|interview)/)) detectedGenre = "interview";
      else if (prompt.match(/(реклам|\bad\b|промо|коммерц)/)) detectedGenre = "ad";
      else if (prompt.match(/(свадьб|wedding|венчан|невест)/)) detectedGenre = "wedding";
      else if (prompt.match(/(тревел|travel|путешеств)/)) detectedGenre = "travel";
      else if (prompt.match(/(влог|vlog)/)) detectedGenre = "vlog";
      else if (prompt.match(/(гейм|game|игров|летсплей|стрим|twitch)/)) detectedGenre = "gaming";
      else if (prompt.match(/(фитнес|fitness|трениров|спортзал|воркаут|workout|кроссфит)/)) detectedGenre = "fitness";
      else if (prompt.match(/(еда|рецепт|food|кулинар|готовк|ресторан)/)) detectedGenre = "food";
      else if (prompt.match(/(клип|music video|мьюзик|песн)/)) detectedGenre = "musicvideo";
      else if (prompt.match(/(урок|обучени|туториал|tutorial|курс|лекци|обзор|инструкц)/)) detectedGenre = "education";
      else if (prompt.match(/(недвижимост|квартир|дом на продаж|real estate|апартамент)/)) detectedGenre = "realestate";
      else if (prompt.match(/(документал|doc|фильм)/)) detectedGenre = "documentary";
      else if (!prompt || prompt.length < 5) {
          const hasSpeech = request.assets.some(a => (a.transcript || "").length > 20);
          const isPortrait = request.assets.some(a => (a.height || 0) > (a.width || 1));
          
          if (hasSpeech && isPortrait) detectedGenre = "tiktok";
          else if (hasSpeech && !isPortrait) detectedGenre = "podcast";
          else detectedGenre = "travel";
      }
    }

    const baseInfo = BASE_KNOWLEDGE.find(k => k.genreId === detectedGenre) || BASE_KNOWLEDGE[0];
    
    // Длительность
    const durMatch = prompt.match(/(\d+)\s*(сек|мин)/);
    if (durMatch) {
       const num = parseInt(durMatch[1]);
       targetDuration = durMatch[2].startsWith("мин") ? num * 60 : num;
    } else if (!detectedByType) {
       const totalVisualDur = request.assets.filter(a => a.type === "video" || a.type === "image").reduce((sum, a) => sum + (a.duration || 5), 0);
       if (totalVisualDur > 0) {
           targetDuration = totalVisualDur * 0.8; 
           targetDuration = Math.max(baseInfo.targetDurationMin, Math.min(targetDuration, baseInfo.targetDurationMax));
       } else {
           targetDuration = baseInfo.targetDurationMin;
       }
    } else {
       // Без ограничений: подкаст может быть 2 часа, минимум 10 сек, максимум 7200 (2 часа)
       // Для TikTok и коротких форматов всё равно стараемся не раздувать, но не режем жёстко
       const isLongForm = detectedByType && (detectedByType.type === "podcast" || detectedByType.type === "interview" || detectedByType.type === "documentary" || detectedByType.type === "educational");
       if (isLongForm) {
         targetDuration = Math.max(10, Math.min(targetDuration, 7200));
       } else {
         // Для остальных — мягкий кламп до 3600 (1 час), но минимум 10 сек
         targetDuration = Math.max(10, Math.min(targetDuration, 3600));
       }
    }

    const baseInstructions = await getKnowledgeForGenre(detectedGenre);
    let instructions = baseInstructions;

    if (detectedByType) {
      const prof = detectedByType.profile;
      const typeBlock = [
        `ТИП ПРОЕКТА: ${prof.labelRu} (${prof.id}) — ${prof.description}`,
        `Цель: ${detectedByType.goal.label} — ${detectedByType.goal.description}`,
        `Платформа: ${detectedByType.platform}, Темп: ${prof.pace.id} (${prof.pace.cutsPerMinute[0]}-${prof.pace.cutsPerMinute[1]} смен/мин, клип ${prof.pace.minClipSec}-${prof.pace.maxClipSec}с, цель ${prof.pace.targetClipSec}с)`,
        `Сценарий: ${detectedByType.scenarioStructure.join(" → ")}`,
        `Речь: сохранять целые предложения=${prof.speech.preserveFullSentences}, резать только по мыслям=${prof.speech.cutOnThoughtBoundaries}, запрет резки в середине фразы=${!prof.speech.allowMidSentenceCut}`,
        `B-Roll: частота=${prof.broll.frequency}, макс плана без перебивки=${prof.broll.maxConsecutiveMainSec}с, семантика обязательна=${prof.broll.semanticRequired}`,
        `Фото: длительность ${prof.photo.minDurationSec}-${prof.photo.maxDurationSec}с (цель ${prof.photo.targetDurationSec}с), Ken Burns=${prof.photo.preferKenBurns}, семантический подбор=${prof.photo.semanticMatching}`,
        `Переходы: предпочитаем ${prof.transition.preferred.join(", ")}, избегаем ${prof.transition.avoid.join(", ") || "—"}`,
        `Стратегия удержания: ${prof.retentionStrategy}`,
        confidenceNote,
      ].join("\n");
      instructions = `${typeBlock}\n\n${baseInstructions}`;
    }

    return {
      genre: detectedGenre,
      targetDuration,
      instructions,
      projectType: detectedByType?.type as any,
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
        
        videoTrack.clips = videoTrack.clips.map(c => {
           const vc = c as VideoClip;
           if (vc.duration > 3.5) {
             vc.duration = 3;
             vc.outPoint = (vc.inPoint || 0) + 3;
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
      const fastCuts = videoTrack.clips.filter(c => c.duration < 1.5).length;
      if (fastCuts > videoTrack.clips.length * 0.4) {
         newLessons.push("ОШИБКА РИТМА: Для Cinematic стиля слишком много коротких кадров (<1.5с). Зритель не успевает насладиться визуалом. В следующий раз давай кадру 'подышать' 4-6 секунд.");
      }

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
      project.duration = Math.max(cursor, audioTrack ? audioTrack.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0) : 0);
    }

    for (const lesson of newLessons) {
      await saveLearnedLesson(genre, lesson);
    }

    return project;
  }
}
