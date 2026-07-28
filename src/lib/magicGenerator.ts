import { AI_CONFIG } from "@/config/ai";
import { createAudioClip, createTextClip, createVideoClip, createEmptyProject } from "./factories";
import type { Project, MediaAsset } from "./types";
import { uid } from "./id";
import { saveBlob } from "./db";

export async function generateMagicVideo(
  prompt: string,
  onProgress?: (msg: string) => void
): Promise<Project> {
  onProgress?.("📝 Пишем сценарий...");

  const systemPrompt = `Ты — профессиональный креативный директор и сценарист.
Твоя задача написать сценарий для короткого динамичного видео по запросу пользователя.
Сделай от 3 до 5 сцен. Каждая сцена должна быть 3-6 секунд.
Для каждой сцены напиши:
- voiceover: текст озвучки (на русском)
- imagePrompt: промпт для нейросети генерации картинок (ОБЯЗАТЕЛЬНО НА АНГЛИЙСКОМ, детальное описание, cinematic, photorealistic, 8k). Без текста на картинке!
Ответь строго в JSON формате:
{
  "title": "Название видео",
  "scenes": [
    { "voiceover": "Текст озвучки", "imagePrompt": "A cyberpunk city at night, neon lights, 8k resolution, photorealistic" }
  ]
}`;

  let scriptData;
  try {
    const res = await fetch(AI_CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AI_CONFIG.groqApiKey}`,
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    });
    if (!res.ok) throw new Error("API error");
    const json = await res.json();
    scriptData = JSON.parse(json.choices[0].message.content);
  } catch (e) {
    console.error("Script generation failed, using fallback.", e);
    scriptData = {
      title: "Генерация",
      scenes: [
        { voiceover: prompt.slice(0, 50), imagePrompt: "beautiful cinematic landscape, epic lighting, 8k" }
      ]
    };
  }

  const project = createEmptyProject(scriptData.title);
  project.resolution = { width: 1080, height: 1920 }; // Shorts format!
  project.exportSettings.width = 1080;
  project.exportSettings.height = 1920;
  
  const videoTrack = project.tracks.find(t => t.type === "video")!;
  const audioTrack = project.tracks.find(t => t.type === "audio")!;
  const textTrack = project.tracks.find(t => t.type === "text")!;

  let cursor = 0;
  
  for (let i = 0; i < scriptData.scenes.length; i++) {
    const scene = scriptData.scenes[i];
    onProgress?.(`✨ Генерация сцены ${i+1}/${scriptData.scenes.length}...`);

    // 1. Fetch TTS
    let audioDuration = 3;
    let audioKey = null;
    try {
      // Chunking if text is too long (Google TTS limit is ~200 chars, usually scene voiceover is short)
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ru&q=${encodeURIComponent(scene.voiceover)}`;
      const ttsRes = await fetch(ttsUrl);
      if (ttsRes.ok) {
        const audioBlob = await ttsRes.blob();
        audioKey = uid("blob");
        await saveBlob(audioKey, audioBlob);
        // Estimate duration based on Russian reading speed (~12 chars / sec)
        audioDuration = Math.max(2, scene.voiceover.length / 12);
      }
    } catch(e) { console.error("TTS failed", e); }

    // 2. Fetch Image
    let imgKey = null;
    try {
      const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(scene.imagePrompt)}?width=1080&height=1920&nologo=true&seed=${Math.floor(Math.random()*10000)}`;
      const imgRes = await fetch(imgUrl);
      if (imgRes.ok) {
        const imgBlob = await imgRes.blob();
        imgKey = uid("blob");
        await saveBlob(imgKey, imgBlob);
      }
    } catch(e) { console.error("Image gen failed", e); }

    const sceneDuration = audioDuration + 0.5;

    // Create Assets
    
    if (imgKey) {
      const vAsset: MediaAsset = { id: uid("asset"), name: `Сцена ${i+1}`, kind: "image", mime: "image/jpeg", blobKey: imgKey, duration: sceneDuration, width: 1080, height: 1920, createdAt: Date.now() };
      project.assets.push(vAsset);
      
      
      const vClip = createVideoClip({
        trackId: videoTrack.id,
        asset: vAsset,
        start: cursor,
        duration: sceneDuration
      });
      
      // Dynamic Ken Burns
      const zoomIn = Math.random() > 0.5;
      vClip.scale = {
        value: 1,
        keyframes: [
          { id: uid("k"), time: 0, value: zoomIn ? 1 : 1.15, easing: "linear" },
          { id: uid("k"), time: sceneDuration, value: zoomIn ? 1.15 : 1, easing: "linear" }
        ]
      };
      // Random Pan
      const panDir = Math.random() > 0.5 ? 1 : -1;
      vClip.x = {
        value: 0,
        keyframes: [
          { id: uid("k"), time: 0, value: panDir * 0.05, easing: "linear" },
          { id: uid("k"), time: sceneDuration, value: -panDir * 0.05, easing: "linear" }
        ]
      };
      
      vClip.transitionIn = i === 0 ? { type: "cut", duration: 0 } : { type: "crossfade", duration: 0.5 };
      videoTrack.clips.push(vClip);
    }

    if (audioKey) {
      const aAsset: MediaAsset = { id: uid("asset"), name: `Озвучка ${i+1}`, kind: "audio", mime: "audio/mpeg", blobKey: audioKey, duration: audioDuration, createdAt: Date.now() };
      project.assets.push(aAsset);
      
      const aClip = createAudioClip({
        trackId: audioTrack.id,
        asset: aAsset,
        start: cursor,
        duration: audioDuration
      });
      audioTrack.clips.push(aClip);
    }

    // Dynamic Subtitles
    const words = scene.voiceover.split(" ");
    let textStart = cursor;
    const timePerWord = audioDuration / words.length;
    
    // Group words into pairs for punchy subtitles
    for (let w = 0; w < words.length; w += 2) {
      const phrase = words[w] + (words[w+1] ? " " + words[w+1] : "");
      const phraseDur = timePerWord * (words[w+1] ? 2 : 1);
      
      const tClip = createTextClip({
        trackId: textTrack.id,
        start: textStart,
        duration: phraseDur,
        text: phrase.toUpperCase()
      });
      
      tClip.y.value = 0.2; // Lower third
      tClip.fontSize = 80;
      tClip.color = "#ffffff";
      tClip.backgroundColor = "transparent";
      tClip.animationIn = "pop";
      
      textTrack.clips.push(tClip);
      textStart += phraseDur;
    }

    cursor += sceneDuration;
  }

  project.duration = cursor;
  return project;
}
