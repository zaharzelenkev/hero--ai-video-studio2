import { createProductionPlan } from "../src/lib/production";

let failures = 0;
function check(label: string, value: boolean) {
  if (value) console.log(`  ✅ ${label}`);
  else { failures++; console.error(`  ❌ ${label}`); }
}

const plan = createProductionPlan({
  idea: "Динамичный TikTok о запуске новой кофейни с призывом сохранить адрес",
  templateId: "tiktok",
  assets: [
    { kind: "video", duration: 12 }, { kind: "video", duration: 8 }, { kind: "audio", duration: 30 },
  ],
});

check("vertical format is selected for short-form", plan.aspectRatio === "9:16");
check("five editorial beats are generated", plan.scenes.length === 5);
check("each scene has actionable shots", plan.scenes.every((scene) => scene.shots.length > 0 && scene.narration.length > 0));
check("source inventory is retained", plan.sourceSummary.video === 2 && plan.sourceSummary.audio === 1);
check("plan is serializable for IndexedDB", JSON.parse(JSON.stringify(plan)).workingTitle === plan.workingTitle);

if (failures) process.exit(1);
console.log("Production plan checks passed.");
