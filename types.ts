export type AspectRatio = '16:9' | '9:16';
export type Resolution = '720p' | '1080p';
export type GenerationMode = 'text' | 'image' | 'keyframes' | 'reference' | 'key_ref' | 'scenes';
export type VideoQuality = 'high' | 'standard' | 'low';

export interface VideoConfig {
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  mode: GenerationMode;
  quality?: VideoQuality;
  musicOn?: boolean;
  voiceOn?: boolean;
  language?: 'EN' | 'NL';
  sourceImageBase64?: string;
  endImageBase64?: string;
  referenceImagesBase64?: string[];
  singleImageRole?: 'start' | 'reference';
  customAudioName?: string;
  customAudioUrl?: string;
}

export interface VideoGenerationResult {
  blobUrl: string;
  serverUri: string;
  rawVideoObject?: any;
}

export interface VideoHistoryItem {
  id: string;
  prompt: string;
  timestamp: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  serverUri: string;
  mode: GenerationMode;
  quality?: VideoQuality;
  musicOn?: boolean;
  voiceOn?: boolean;
  language?: 'EN' | 'NL';
  singleImageRole?: 'start' | 'reference';
  customAudioName?: string;
  customAudioUrl?: string;
  rawVideoObject?: any;
}

export interface TimelineClip {
  id: string;
  url: string;
  duration: number; // Original native duration
  trimStart: number; // In-point relative to original video
  trimEnd: number;   // Out-point relative to original video
  aspectRatio?: string;
  rawVideoObject?: any; // Required to extend the video from the timeline
}
