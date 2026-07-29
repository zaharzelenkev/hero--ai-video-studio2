const fs = require('fs');
const file = './src/lib/ai/aiService.ts';
let code = fs.readFileSync(file, 'utf8');

const ruleBasedRegex = /function generateRuleBasedDecision\(request: AIAnalysisRequest\): AIEditDecision \{[\s\S]*?\}\n/m;

const newRuleBased = `import { DirectorBrain } from "../brain/director";

async function generateRuleBasedDecision(request: AIAnalysisRequest): Promise<AIEditDecision> {
  const strategy = await DirectorBrain.defineStrategy(request.userPrompt);
  const targetDuration = strategy.targetDuration;
  const contentType = strategy.genre as any;
  const pace = contentType === "tiktok" || contentType === "ad" ? "fast" : contentType === "travel" ? "slow" : "medium";
  
  let colorGrade = "cinematic";
  const prompt = request.userPrompt.toLowerCase();
  const gradeMatchers: Array<[string, string[]]> = [
    ["bw", ["черн", "бел", "b&w", "ч/б", "чб"]],
    ["vintage", ["винтаж", "ретро", "старый", "retro"]],
    ["warm", ["тепл", "warm", "уют", "закат"]],
    ["cool", ["холодн", "cool", "мрачн"]],
    ["dramatic", ["драматич", "темн", "dramatic"]],
    ["vivid", ["ярк", "vivid", "сочн", "красочн"]],
  ];
  for (const [grade, keywords] of gradeMatchers) {
    if (keywords.some(kw => prompt.includes(kw))) { colorGrade = grade; break; }
  }
  
  const allVisuals = request.assets.filter(a => a.type === "video" || a.type === "image");
  if (allVisuals.length === 0) {
    return { contentType, targetDuration, pace, colorGrade, clips: [], musicSync: true, transitions: "crossfade", suggestions: [], analysisQuality: "rule-based" };
  }

  interface PoolItem {
    assetId: string;
    startTime: number;
    duration: number;
    quality: number;
    motion: string;
    hasFaces: boolean;
    isImage: boolean;
    hasAction: boolean;
  }
  const pool: PoolItem[] = [];

  for (const asset of allVisuals) {
    if (asset.type === "image") {
      pool.push({ assetId: asset.id, startTime: 0, duration: asset.duration || 5, quality: 10, motion: "static", hasFaces: false, isImage: true, hasAction: false });
    } else if (asset.segments && asset.segments.length > 0) {
      for (const seg of asset.segments) {
        if (seg.isDark || seg.isBlurry || seg.motionLevel === "shake" || seg.qualityScore < 4) continue;
        const dur = seg.endTime - seg.startTime;
        if (dur < 0.5) continue;
        pool.push({ assetId: asset.id, startTime: seg.startTime, duration: dur, quality: seg.qualityScore, motion: seg.motionLevel, hasFaces: seg.hasFaces, isImage: false, hasAction: seg.hasAction || false });
      }
    } else {
      pool.push({ assetId: asset.id, startTime: 0, duration: asset.duration || 5, quality: 5, motion: "medium", hasFaces: false, isImage: false, hasAction: false });
    }
  }

  if (pool.length === 0) {
    for (const asset of allVisuals) {
      pool.push({ assetId: asset.id, startTime: 0, duration: asset.duration || 5, quality: 5, motion: "medium", hasFaces: false, isImage: asset.type === "image", hasAction: false });
    }
  }

  const clips: AIEditDecision["clips"] = [];
  let currentTime = 0;
  let phase = "hook"; 
  let usedClipCount = 0;

  const getCandidates = (phase: string) => {
    return [...pool].sort((a, b) => {
      let scoreA = a.quality * 10;
      let scoreB = b.quality * 10;
      if (phase === "hook") {
        if (a.hasFaces) scoreA += 50;
        if (a.hasAction) scoreA += 30;
        if (b.hasFaces) scoreB += 50;
        if (b.hasAction) scoreB += 30;
      } else if (phase === "climax") {
        if (a.hasAction) scoreA += 40;
        if (a.motion === "high") scoreA += 50;
        if (b.hasAction) scoreB += 40;
        if (b.motion === "high") scoreB += 50;
      }
      scoreA += Math.random() * 15;
      scoreB += Math.random() * 15;
      return scoreB - scoreA;
    });
  };

  while (currentTime < targetDuration) {
    const progress = currentTime / targetDuration;
    if (progress < 0.15) phase = "hook";
    else if (progress < 0.70) phase = "buildup";
    else if (progress < 0.90) phase = "climax";
    else phase = "outro";

    const candidates = getCandidates(phase);
    let best = candidates[0];
    if (usedClipCount > 0 && clips[clips.length - 1].assetId === best.assetId && candidates.length > 1) {
       best = candidates[1];
    }

    let shotDur = 3;
    if (phase === "hook") shotDur = pace === "slow" ? 4 : 2;
    else if (phase === "buildup") shotDur = pace === "fast" ? 3 : 5;
    else if (phase === "climax") shotDur = pace === "slow" ? 2.5 : 1.2;
    else if (phase === "outro") shotDur = 4;
    
    shotDur += (Math.random() - 0.5) * 1.5;
    shotDur = Math.max(0.8, Math.min(shotDur, targetDuration - currentTime, best.duration));

    const maxStart = best.duration - shotDur;
    const actualStart = best.startTime + (maxStart > 0 ? Math.random() * maxStart : 0);

    clips.push({
      assetId: best.assetId,
      trackType: "main",
      startTime: actualStart,
      endTime: actualStart + shotDur,
      duration: shotDur,
      importance: (phase === "climax" || phase === "hook") ? 0.9 : 0.6,
      emotion: phase === "climax" ? "energetic" : phase === "outro" ? "calm" : "neutral",
      zoom: best.isImage || (!best.hasAction && Math.random() > 0.4),
      reason: \`[\${phase.toUpperCase()}] Качество: \${best.quality}\`
    });

    currentTime += shotDur;
    usedClipCount++;
    if (shotDur < 0.5) break;
  }
  
  let transitions: AIEditDecision["transitions"] = "crossfade";
  if (pace === "fast" || contentType === "shorts" || contentType === "tiktok") transitions = "cut";
  
  return {
    contentType, targetDuration, pace, colorGrade, clips, musicSync: true, transitions, textOverlays: [],
    audioEnhancements: { normalize: true, denoise: contentType === "podcast", voiceEnhance: contentType === "podcast", removeSilence: pace === "fast", ducking: true },
    suggestions: [strategy.instructions],
    analysisQuality: "rule-based",
  };
}
`;

if (!code.includes('import { DirectorBrain }')) {
  code = code.replace(
    /export async function analyzeWithAI\(request: AIAnalysisRequest\): Promise<AIEditDecision> \{/,
    `import { DirectorBrain } from "../brain/director";\n\nexport async function analyzeWithAI(request: AIAnalysisRequest): Promise<AIEditDecision> {`
  );
}

code = code.replace(ruleBasedRegex, newRuleBased);
fs.writeFileSync(file, code);
