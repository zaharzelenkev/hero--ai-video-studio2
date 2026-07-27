import type { MediaKind } from "@/lib/types";

export interface UploadedItem {
  id: string;
  file: File;
  kind: MediaKind;
  name: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
}
