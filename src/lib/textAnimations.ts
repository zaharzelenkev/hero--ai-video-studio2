import type { TextClip, TextAnimation } from "./types";
import { uid } from "./id";

export function applyTextAnimation(clip: TextClip, animation: TextAnimation, yPos: number, clipDuration: number) {
  const tId = () => uid("k");
  
  // Base setup
  clip.y.value = yPos;
  clip.x.value = 0;
  clip.opacity.value = 1;
  clip.y.keyframes = [];
  clip.x.keyframes = [];
  clip.opacity.keyframes = [];
  
  const inDur = Math.min(0.3, clipDuration * 0.3); // Quick entry
  
  switch (animation) {
    case "fade":
      clip.opacity.value = 0;
      clip.opacity.keyframes = [
        { id: tId(), time: 0, value: 0, easing: "linear" },
        { id: tId(), time: inDur, value: 1, easing: "linear" }
      ];
      break;
      
    case "slide-up":
      clip.y.value = yPos + 0.3; // start lower
      clip.opacity.value = 0;
      clip.y.keyframes = [
        { id: tId(), time: 0, value: yPos + 0.3, easing: "easeOut" },
        { id: tId(), time: inDur, value: yPos, easing: "easeOut" }
      ];
      clip.opacity.keyframes = [
        { id: tId(), time: 0, value: 0, easing: "linear" },
        { id: tId(), time: inDur, value: 1, easing: "linear" }
      ];
      break;

    case "slide-down":
      clip.y.value = yPos - 0.3; // start higher
      clip.opacity.value = 0;
      clip.y.keyframes = [
        { id: tId(), time: 0, value: yPos - 0.3, easing: "easeOut" },
        { id: tId(), time: inDur, value: yPos, easing: "easeOut" }
      ];
      clip.opacity.keyframes = [
        { id: tId(), time: 0, value: 0, easing: "linear" },
        { id: tId(), time: inDur, value: 1, easing: "linear" }
      ];
      break;
      
    case "slide-left":
      clip.x.value = 1.0; // start right edge
      clip.x.keyframes = [
        { id: tId(), time: 0, value: 1.0, easing: "easeOut" },
        { id: tId(), time: inDur, value: 0, easing: "easeOut" }
      ];
      break;
      
    case "pop":
      // Simulated pop via fast Y-bump and opacity, since text scaling is limited in raw drawtext
      clip.y.value = yPos + 0.1;
      clip.opacity.value = 0;
      clip.y.keyframes = [
        { id: tId(), time: 0, value: yPos + 0.1, easing: "easeOut" },
        { id: tId(), time: inDur * 0.5, value: yPos - 0.05, easing: "easeOut" },
        { id: tId(), time: inDur, value: yPos, easing: "easeIn" }
      ];
      clip.opacity.keyframes = [
        { id: tId(), time: 0, value: 0, easing: "linear" },
        { id: tId(), time: inDur * 0.5, value: 1, easing: "linear" }
      ];
      break;
      
    case "bounce":
      clip.y.value = yPos - 0.4;
      clip.y.keyframes = [
        { id: tId(), time: 0, value: yPos - 0.4, easing: "easeIn" },
        { id: tId(), time: inDur * 0.5, value: yPos, easing: "easeOut" },
        { id: tId(), time: inDur * 0.75, value: yPos - 0.15, easing: "easeIn" },
        { id: tId(), time: inDur, value: yPos, easing: "easeOut" }
      ];
      break;
      
    case "blur-in":
      // Blur can't be directly animated on drawtext layer natively without separate stream. We fallback to fade + slide.
      clip.opacity.value = 0;
      clip.opacity.keyframes = [
        { id: tId(), time: 0, value: 0, easing: "easeOut" },
        { id: tId(), time: inDur, value: 1, easing: "easeOut" }
      ];
      clip.x.keyframes = [
        { id: tId(), time: 0, value: -0.1, easing: "easeOut" },
        { id: tId(), time: inDur, value: 0, easing: "easeOut" }
      ];
      break;

    case "scale-in":
    case "rotate-in":
    case "typewriter":
    case "none":
    default:
      // Fallback
      clip.y.value = yPos;
      break;
  }
}
