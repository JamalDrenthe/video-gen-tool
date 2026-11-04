import React, { useState, useRef, useEffect } from 'react';
import LoadingOverlay from './LoadingOverlay';
import { AspectRatio, Resolution, TimelineClip } from '../types';
import { downloadVideoUri } from '../services/huggingfaceService';

interface VideoEditorProps {
  videoUrl: string | null;
  customAudioUrl?: string | null;
  isGenerating?: boolean;
  loadingStatus?: string;
  generationAspectRatio?: AspectRatio;
  generationResolution?: Resolution;
  rawVideoObject?: any;
  onExtend?: (prompt: string, rawObj: any) => void;
  onClear: () => void;
}

type TransitionType = 'none' | 'fade' | 'slide' | 'glitch';

interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  vignette: number;
}

const DEFAULT_FILTERS: FilterSettings = {
  brightness: 100, contrast: 100, saturation: 100, blur: 0, vignette: 0
};

interface TimelineHistoryState {
  stack: { clips: TimelineClip[], selectedClipId: string | null }[];
  pointer: number;
}

interface DragState {
  clipId: string;
  side: 'start' | 'end';
  startX: number;
  originalTrimStart: number;
  originalTrimEnd: number;
}

const VideoEditor: React.FC<VideoEditorProps> = ({
  videoUrl, customAudioUrl, isGenerating, loadingStatus,
  generationAspectRatio, generationResolution, rawVideoObject, onExtend, onClear
}) => {

  // NLE State
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [globalTime, setGlobalTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // History State (Undo / Redo)
  const [historyState, setHistoryState] = useState<TimelineHistoryState>({
    stack: [{ clips: [], selectedClipId: null }],
    pointer: 0
  });

  // Editor Effects State
  const [filterSettings, setFilterSettings] = useState<FilterSettings>(DEFAULT_FILTERS);
  const [introTransition, setIntroTransition] = useState<TransitionType>('none');
  const [outroTransition, setOutroTransition] = useState<TransitionType>('none');

  // UI States
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [isExtendMode, setIsExtendMode] = useState<boolean>(false);
  const [extendPrompt, setExtendPrompt] = useState<string>('');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(10); // pixels per second
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const requestRef = useRef<number>(0);

  // State Refs for event listeners to avoid stale closures
  const clipsRef = useRef(clips);
  const selectedClipIdRef = useRef(selectedClipId);
  const dragStateRef = useRef(dragState);

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { selectedClipIdRef.current = selectedClipId; }, [selectedClipId]);
  useEffect(() => { dragStateRef.current = dragState; }, [dragState]);

  // Hidden video elements pool for frame extraction
  const videoPoolRef = useRef<{ [id: string]: HTMLVideoElement }>({});

  const totalDuration = clips.reduce((acc, clip) => acc + (clip.trimEnd - clip.trimStart), 0);
  const isDisabled = isGenerating || isExporting;

  // Sync video pool with current clips (re-create if missing due to undo/redo)
  useEffect(() => {
    clips.forEach(clip => {
      if (!videoPoolRef.current[clip.id]) {
        const poolVideo = document.createElement('video');
        poolVideo.src = clip.url;
        poolVideo.crossOrigin = 'anonymous';
        poolVideo.muted = true;
        poolVideo.playsInline = true;
        videoPoolRef.current[clip.id] = poolVideo;
      }
    });
  }, [clips]);

  // --- 1. HISTORY MANAGEMENT ---

  const commitTimelineChange = (newClips: TimelineClip[], newSelectedId: string | null) => {
    setClips(newClips);
    setSelectedClipId(newSelectedId);

    setHistoryState(prev => {
      const newStack = prev.stack.slice(0, prev.pointer + 1);
      newStack.push({ clips: newClips, selectedClipId: newSelectedId });
      return { stack: newStack, pointer: newStack.length - 1 };
    });
  };

  const handleUndo = () => {
    setHistoryState(prev => {
      if (prev.pointer > 0) {
        const newPointer = prev.pointer - 1;
        const state = prev.stack[newPointer];
        setClips(state.clips);
        setSelectedClipId(state.selectedClipId);
        return { ...prev, pointer: newPointer };
      }
      return prev;
    });
  };

  const handleRedo = () => {
    setHistoryState(prev => {
      if (prev.pointer < prev.stack.length - 1) {
        const newPointer = prev.pointer + 1;
        const state = prev.stack[newPointer];
        setClips(state.clips);
        setSelectedClipId(state.selectedClipId);
        return { ...prev, pointer: newPointer };
      }
      return prev;
    });
  };

  // --- 2. CLIP MANAGEMENT ---

  // Auto-add generated video to timeline
  useEffect(() => {
    if (videoUrl) {
      addClipToTimeline(videoUrl, rawVideoObject);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl]); // Intentionally omitting rawVideoObject from deps to prevent duplicate adding if they update independently.

  const addClipToTimeline = (url: string, rawObj?: any) => {
    const video = document.createElement('video');
    video.src = url;
    video.crossOrigin = 'anonymous';
    video.onloadedmetadata = () => {
      const newClip: TimelineClip = {
        id: `clip_${Date.now()}_${Math.random().toString(36).substring(2,9)}`,
        url: url,
        duration: video.duration,
        trimStart: 0,
        trimEnd: video.duration,
        aspectRatio: video.videoWidth > video.videoHeight ? '16:9' : '9:16',
        rawVideoObject: rawObj
      };

      const newClips = [...clipsRef.current, newClip];
      commitTimelineChange(newClips, newClip.id);
    };
  };

  const removeClip = (id: string) => {
    const newClips = clipsRef.current.filter(c => c.id !== id);
    const newSelectedId = selectedClipIdRef.current === id ? null : selectedClipIdRef.current;
    commitTimelineChange(newClips, newSelectedId);
  };

  const clearAll = () => {
    commitTimelineChange([], null);
    setGlobalTime(0);
    setIsPlaying(false);
    Object.values(videoPoolRef.current).forEach((v) => {
      const video = v as HTMLVideoElement;
      video.pause();
      video.removeAttribute('src');
    });
    videoPoolRef.current = {};
    onClear();
  };

  // --- 3. DRAG AND DROP ---

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;

      const payload = JSON.parse(data);
      if (payload.type === 'cached_blob' && payload.url) {
        addClipToTimeline(payload.url, payload.rawVideoObject);
      } else if (payload.type === 'history_item' && payload.uri) {
        const blobUrl = await downloadVideoUri(payload.uri);
        addClipToTimeline(blobUrl, payload.rawVideoObject);
      }
    } catch (err) {
      console.error("Failed to parse dropped item", err);
    }
  };

  // --- 4. THE RAZOR / SPLIT TOOL ---

  const handleSplit = () => {
    const currentClips = clipsRef.current;
    const selectedId = selectedClipIdRef.current;

    if (!selectedId || currentClips.length === 0) return;

    let clipGlobalStart = 0;
    const clipIndex = currentClips.findIndex(c => {
      const dur = c.trimEnd - c.trimStart;
      if (c.id === selectedId) return true;
      clipGlobalStart += dur;
      return false;
    });

    if (clipIndex === -1) return;
    const targetClip = currentClips[clipIndex];

    const clipGlobalEnd = clipGlobalStart + (targetClip.trimEnd - targetClip.trimStart);
    if (globalTime <= clipGlobalStart || globalTime >= clipGlobalEnd) {
      alert("Playhead must be positioned within the selected clip to split it.");
      return;
    }

    const timeIntoClip = globalTime - clipGlobalStart;
    const localSplitTime = targetClip.trimStart + timeIntoClip;

    const clipLeft: TimelineClip = {
      ...targetClip,
      trimEnd: localSplitTime
    };

    const clipRight: TimelineClip = {
      ...targetClip,
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2,9)}`,
      trimStart: localSplitTime
    };

    const poolVideo = document.createElement('video');
    poolVideo.src = clipRight.url;
    poolVideo.crossOrigin = 'anonymous';
    poolVideo.muted = true;
    poolVideo.playsInline = true;
    videoPoolRef.current[clipRight.id] = poolVideo;

    const newClips = [...currentClips];
    newClips.splice(clipIndex, 1, clipLeft, clipRight);
    commitTimelineChange(newClips, clipRight.id);
  };

  // --- 5. TIMELINE SCRUBBING & DRAGGING ---

  const handleTimelinePointerDown = (e: React.PointerEvent) => {
    if (totalDuration === 0 || !timelineRef.current) return;

    // Pause playback while scrubbing
    setIsPlaying(false);
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }

    const updateTime = (clientX: number) => {
      const rect = timelineRef.current!.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setGlobalTime(percent * totalDuration);
    };

    updateTime(e.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateTime(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleTrimPointerDown = (e: React.PointerEvent, clipId: string, side: 'start'|'end') => {
    e.stopPropagation();
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;

    setDragState({
      clipId,
      side,
      startX: e.clientX,
      originalTrimStart: clip.trimStart,
      originalTrimEnd: clip.trimEnd
    });
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStateRef.current) return;
      const ds = dragStateRef.current;
      const deltaX = e.clientX - ds.startX;
      const deltaTime = deltaX / zoomLevel;

      setClips(prev => prev.map(c => {
        if (c.id !== ds.clipId) return c;
        if (ds.side === 'start') {
           const newStart = Math.max(0, Math.min(ds.originalTrimStart + deltaTime, c.trimEnd - 0.5));
           return { ...c, trimStart: newStart };
        } else {
           const newEnd = Math.max(c.trimStart + 0.5, Math.min(ds.originalTrimEnd + deltaTime, c.duration));
           return { ...c, trimEnd: newEnd };
        }
      }));
    };

    const handlePointerUp = () => {
      if (dragStateRef.current) {
         commitTimelineChange(clipsRef.current, selectedClipIdRef.current);
         setDragState(null);
      }
    };

    if (dragState) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState, zoomLevel]);

  // --- 6. PLAYBACK & RENDER ENGINE (CANVAS) ---

  const getActiveClip = (time: number) => {
    let accumulated = 0;
    for (let i = 0; i < clips.length; i++) {
      const dur = clips[i].trimEnd - clips[i].trimStart;
      if (time >= accumulated && time < accumulated + dur) {
        return { clip: clips[i], localTime: clips[i].trimStart + (time - accumulated), isLast: i === clips.length - 1, isFirst: i === 0 };
      }
      accumulated += dur;
    }
    if (clips.length > 0 && time >= totalDuration) {
       const last = clips[clips.length - 1];
       return { clip: last, localTime: last.trimEnd, isLast: true, isFirst: clips.length === 1 };
    }
    return null;
  };

  const getComputedCSSFilter = () => {
    return `brightness(${filterSettings.brightness}%) contrast(${filterSettings.contrast}%) saturate(${filterSettings.saturation}%) blur(${filterSettings.blur}px)`;
  };

  useEffect(() => {
    let lastRenderTime = performance.now();

    const renderLoop = (now: DOMHighResTimeStamp) => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      const dt = (now - lastRenderTime) / 1000;
      lastRenderTime = now;

      let newTime = globalTime;

      if (isPlaying) {
        // If we have a custom audio track, let its hardware clock drive the timeline for perfect sync
        if (customAudioUrl && audioRef.current && audioRef.current.readyState >= 1) {
          if (audioRef.current.paused) {
            audioRef.current.play().catch(() => {});
          }
          newTime = audioRef.current.currentTime;
        } else {
          newTime += dt;
        }

        if (newTime >= totalDuration) {
          newTime = 0;
          if (audioRef.current) audioRef.current.currentTime = 0;
        }
        setGlobalTime(newTime);
      } else {
        // Sync audio when paused (e.g. scrubbing timeline)
        if (customAudioUrl && audioRef.current) {
           if (!audioRef.current.paused) audioRef.current.pause();
           if (Math.abs(audioRef.current.currentTime - newTime) > 0.05) {
              audioRef.current.currentTime = newTime;
           }
        }
      }

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      if (clips.length === 0) {
        requestRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      const activeData = getActiveClip(newTime);

      if (activeData) {
         const { clip, localTime, isFirst, isLast } = activeData;
         const videoEl = videoPoolRef.current[clip.id];

         if (videoEl) {
            if (isPlaying && videoEl.paused) {
               videoEl.currentTime = localTime;
               videoEl.play().catch(()=>{});
            } else if (!isPlaying) {
               videoEl.pause();
               if (Math.abs(videoEl.currentTime - localTime) > 0.05) {
                 videoEl.currentTime = localTime;
               }
            }

            const isVertical = clip.aspectRatio === '9:16';
            const targetWidth = isVertical ? 720 : 1280;
            const targetHeight = isVertical ? 1280 : 720;

            if (canvasRef.current.width !== targetWidth || canvasRef.current.height !== targetHeight) {
                canvasRef.current.width = targetWidth;
                canvasRef.current.height = targetHeight;
            }

            const transDur = Math.min(1.0, totalDuration / 3);
            let p = 1.0;
            let activeEffect: TransitionType = 'none';
            let isIntroStage = false;

            if (isFirst && newTime < transDur) {
              p = newTime / transDur;
              activeEffect = introTransition;
              isIntroStage = true;
            } else if (isLast && newTime > totalDuration - transDur) {
              p = (totalDuration - newTime) / transDur;
              activeEffect = outroTransition;
            }

            ctx.save();

            if (activeEffect === 'slide') {
              const offset = canvasRef.current.width * (1 - p) * (isIntroStage ? -1 : 1);
              ctx.translate(offset, 0);
            }

            ctx.filter = getComputedCSSFilter();
            if (activeEffect === 'glitch' && p < 1) {
              ctx.filter += ` hue-rotate(${Math.floor(Math.random() * 90)}deg) contrast(150%)`;
            }

            if (videoEl.readyState >= 2) {
               ctx.drawImage(videoEl, 0, 0, canvasRef.current.width, canvasRef.current.height);
            }

            if (activeEffect === 'glitch' && p < 1) {
              const intensity = 1 - p;
              const slices = Math.floor(Math.random() * 5) + 2;
              for (let i = 0; i < slices; i++) {
                const sliceY = Math.random() * canvasRef.current.height;
                const sliceH = Math.random() * (canvasRef.current.height / 4);
                const offsetX = (Math.random() - 0.5) * 100 * intensity;
                ctx.drawImage(canvasRef.current, 0, sliceY, canvasRef.current.width, sliceH, offsetX, sliceY, canvasRef.current.width, sliceH);
              }
            }

            ctx.restore();

            if (filterSettings.vignette > 0) {
              const radiusInner = Math.max(canvasRef.current.width, canvasRef.current.height) * 0.2;
              const radiusOuter = Math.max(canvasRef.current.width, canvasRef.current.height) * 0.7;
              const gradient = ctx.createRadialGradient(
                canvasRef.current.width / 2, canvasRef.current.height / 2, radiusInner,
                canvasRef.current.width / 2, canvasRef.current.height / 2, radiusOuter
              );
              gradient.addColorStop(0, 'rgba(0,0,0,0)');
              gradient.addColorStop(1, `rgba(0,0,0,${filterSettings.vignette / 100})`);
              ctx.fillStyle = gradient;
              ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }

            if (activeEffect === 'fade' && p < 1) {
              ctx.fillStyle = `rgba(0, 0, 0, ${1 - p})`;
              ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
         }
      }

      if (playheadRef.current && totalDuration > 0) {
         playheadRef.current.style.left = `${(newTime / totalDuration) * 100}%`;
      }

      requestRef.current = requestAnimationFrame(renderLoop);
    };

    requestRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [globalTime, isPlaying, clips, filterSettings, introTransition, outroTransition, totalDuration, customAudioUrl]);

  // --- 7. PLAYBACK CONTROLS ---

  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
    if (isPlaying && audioRef.current) audioRef.current.pause();
  };

  // --- 8. EXPORT LOGIC ---
  const handleExport = async () => {
    if (clips.length === 0) return;
    setIsExporting(true);
    setExportProgress(0);

    setIsPlaying(false);
    cancelAnimationFrame(requestRef.current);

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;

    const isVertical = clips[0].aspectRatio === '9:16';
    canvasRef.current.width = isVertical ? 720 : 1280;
    canvasRef.current.height = isVertical ? 1280 : 720;

    // Prioritize MP4 formats. Modern browsers like Chrome 107+ and Safari support MP4 wrapping in MediaRecorder.
    const mimeTypes = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=h264,aac',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];

    let selectedMimeType = '';
    for (const type of mimeTypes) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        selectedMimeType = type;
        break;
      }
    }

    // Fallback if none detect as supported (some older OSes might still record to mp4 natively if forced)
    if (!selectedMimeType) {
      selectedMimeType = 'video/mp4';
    }

    // Dynamically assign the correct container extension
    const fileExtension = selectedMimeType.includes('mp4') ? 'mp4' : 'webm';

    const stream = canvasRef.current.captureStream(30);
    let exportAudioEl: HTMLAudioElement | null = null;

    if (customAudioUrl) {
      exportAudioEl = document.createElement('audio');
      exportAudioEl.src = customAudioUrl;
      exportAudioEl.crossOrigin = 'anonymous';
      await new Promise(r => exportAudioEl!.onloadedmetadata = r);
      exportAudioEl.currentTime = 0;
      exportAudioEl.play();
      try {
        const aStream = (exportAudioEl as any).captureStream ? (exportAudioEl as any).captureStream() : null;
        if (aStream && aStream.getAudioTracks().length > 0) stream.addTrack(aStream.getAudioTracks()[0]);
      } catch (e) {}
    }

    const recorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: selectedMimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Output as the optimal container (.mp4 when possible)
      a.download = `veo_studio_export_${Date.now()}.${fileExtension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      setIsExporting(false);
      setGlobalTime(0);
    };

    recorder.start();

    let exportTime = 0;
    const renderFrame = async () => {
      if (exportTime >= totalDuration) {
        recorder.stop();
        if (exportAudioEl) { exportAudioEl.pause(); exportAudioEl.src=""; }
        return;
      }

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);

      const activeData = getActiveClip(exportTime);
      if (activeData) {
         const { clip, localTime } = activeData;
         const videoEl = videoPoolRef.current[clip.id];

         if (videoEl) {
            videoEl.currentTime = localTime;
            ctx.filter = getComputedCSSFilter();
            ctx.drawImage(videoEl, 0, 0, canvasRef.current!.width, canvasRef.current!.height);
         }
      }

      setExportProgress(Math.floor((exportTime / totalDuration) * 100));
      exportTime += (1/30);

      setTimeout(renderFrame, 0);
    };

    renderFrame();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6 w-full h-full">

      {/* --- 1. PREVIEW MONITOR --- */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-xl overflow-hidden flex flex-col relative z-0">

        {/* Header Toolbar */}
        <div className="p-3 sm:p-4 flex flex-wrap justify-between items-center bg-slate-800 border-b border-slate-700 gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
             <span className="bg-indigo-500 text-white text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 tracking-wide uppercase">
               <i className="fa-solid fa-clapperboard"></i> <span className="hidden sm:inline">Composition</span>
             </span>

             {/* History Undo / Redo Tools */}
             <div className="flex items-center gap-1 bg-slate-900/60 px-1.5 py-1 rounded-xl border border-slate-700 shadow-inner">
               <button
                 onClick={handleUndo}
                 disabled={historyState.pointer <= 0 || isDisabled}
                 className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                 title="Undo"
               >
                 <i className="fa-solid fa-rotate-left text-xs"></i>
               </button>
               <div className="w-px h-3 bg-slate-700 mx-0.5"></div>
               <button
                 onClick={handleRedo}
                 disabled={historyState.pointer >= historyState.stack.length - 1 || isDisabled}
                 className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                 title="Redo"
               >
                 <i className="fa-solid fa-rotate-right text-xs"></i>
               </button>
             </div>

             {clips.length > 0 && (
               <div className="text-xs text-slate-400 font-mono bg-slate-900 px-2 py-1 rounded-lg border border-slate-700">
                  {formatTime(globalTime)} / {formatTime(totalDuration)}
               </div>
             )}
          </div>

          <div className="flex gap-2">
             <button onClick={clearAll} disabled={isDisabled || clips.length === 0} className="h-8 sm:h-9 px-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white flex items-center justify-center transition-colors text-xs font-medium disabled:opacity-50">
               <i className="fa-solid fa-trash-can sm:mr-1.5"></i> <span className="hidden sm:inline">Clear Timeline</span>
             </button>
          </div>
        </div>

        {/* Canvas Player Area */}
        <div className="relative bg-slate-950 flex flex-col items-center justify-center p-2 sm:p-6 overflow-hidden min-h-[300px] sm:min-h-[450px]">
          {isGenerating ? (
            <div className="w-full h-full flex items-center justify-center">
              <LoadingOverlay status={loadingStatus || ''} aspectRatio={generationAspectRatio || '16:9'} />
            </div>
          ) : clips.length === 0 ? (
            <div
               className="w-full max-w-lg aspect-video rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/50 flex flex-col items-center justify-center text-slate-500 z-10 transition-colors hover:border-indigo-500 hover:bg-slate-800/50"
               onDragOver={handleDragOver}
               onDrop={handleDrop}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 mb-4 rounded-full bg-slate-800 flex items-center justify-center shadow-inner">
                <i className="fa-solid fa-download text-2xl sm:text-3xl text-indigo-400"></i>
              </div>
              <h3 className="text-base sm:text-lg font-medium text-slate-300 mb-1">Drag clips here</h3>
              <p className="text-xs sm:text-sm px-4 text-center">Drag history items from the library below into the timeline to start building your sequence.</p>
            </div>
          ) : (
            <div
              className="relative shadow-2xl rounded-xl transition-all duration-300 bg-black flex-shrink-0 flex items-center justify-center cursor-pointer group w-full max-w-4xl max-h-[60vh]"
              onClick={togglePlayback}
            >
               {/* Main Rendering Canvas */}
               <canvas
                 ref={canvasRef}
                 className="w-full h-full object-contain rounded-xl max-h-[60vh]"
               />

               {customAudioUrl && <audio ref={audioRef} src={customAudioUrl} loop preload="auto" muted={isMuted} />}

               {/* Play/Pause Overlay */}
               {!isPlaying && !isExporting && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] z-30 transition-all pointer-events-none rounded-xl">
                   <div className="w-16 h-16 rounded-full bg-indigo-500/80 backdrop-blur-md flex items-center justify-center border border-white/20 text-white shadow-xl">
                     <i className="fa-solid fa-play text-2xl ml-1"></i>
                   </div>
                 </div>
               )}
            </div>
          )}

          {isExporting && (
             <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4 text-center rounded-2xl">
                <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                <h3 className="text-xl font-bold text-white mb-2">Rendering Composition...</h3>
                <div className="w-full max-w-[256px] h-2 bg-slate-800 rounded-full overflow-hidden">
                   <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out" style={{ width: `${exportProgress}%` }}></div>
                </div>
                <p className="text-slate-400 text-sm mt-2">{exportProgress}%</p>
             </div>
          )}
        </div>
      </div>

      {/* --- 2. MULTI-TRACK TIMELINE --- */}
      <div className="bg-slate-800 p-4 sm:p-5 rounded-2xl border border-slate-700 shadow-xl flex flex-col gap-3 relative z-10">

        {/* Timeline Tools */}
        <div className="flex justify-between items-center mb-2">
           <div className="flex items-center gap-2">
              <button
                onClick={() => setIsExtendMode(!isExtendMode)}
                disabled={!selectedClipId || !clips.find(c => c.id === selectedClipId)?.rawVideoObject || isDisabled}
                className={`h-8 px-3 rounded-lg text-white flex items-center justify-center transition-colors text-xs font-medium shadow-sm disabled:opacity-50 disabled:hover:bg-slate-700 ${isExtendMode ? 'bg-indigo-600' : 'bg-slate-700 hover:bg-indigo-500'}`}
                title={!selectedClipId || !clips.find(c => c.id === selectedClipId)?.rawVideoObject ? "Select a valid generated clip to extend" : "Extend selected clip"}
              >
                <i className="fa-solid fa-wand-magic-sparkles mr-1.5"></i> Extend
              </button>
              <button
                onClick={handleSplit}
                disabled={!selectedClipId || isDisabled}
                className="h-8 px-3 rounded-lg bg-slate-700 hover:bg-indigo-500 text-white flex items-center justify-center transition-colors text-xs font-medium disabled:opacity-50 disabled:hover:bg-slate-700 shadow-sm"
                title="Split selected clip at playhead"
              >
                <i className="fa-solid fa-scissors mr-1.5"></i> Split
              </button>
              <button
                onClick={() => removeClip(selectedClipId!)}
                disabled={!selectedClipId || isDisabled}
                className="h-8 px-3 rounded-lg bg-slate-700 hover:bg-red-500 text-white flex items-center justify-center transition-colors text-xs font-medium disabled:opacity-50 disabled:hover:bg-slate-700 shadow-sm"
              >
                <i className="fa-solid fa-trash mr-1.5"></i> Delete
              </button>
           </div>

           <div className="flex items-center gap-2 text-xs text-slate-400">
             <i className="fa-solid fa-magnifying-glass-minus cursor-pointer hover:text-white" onClick={()=>setZoomLevel(Math.max(2, zoomLevel-2))}></i>
             <input type="range" min="2" max="30" value={zoomLevel} onChange={e=>setZoomLevel(parseInt(e.target.value))} className="w-20 accent-indigo-500" />
             <i className="fa-solid fa-magnifying-glass-plus cursor-pointer hover:text-white" onClick={()=>setZoomLevel(Math.min(30, zoomLevel+2))}></i>
           </div>
        </div>

        {/* Extend Input Panel */}
        {isExtendMode && selectedClipId && (
          <div className="mb-2 bg-indigo-900/30 p-3 rounded-xl border border-indigo-500/30 flex gap-2 items-center transition-all">
             <i className="fa-solid fa-wand-magic-sparkles text-indigo-400 ml-2"></i>
             <input
               type="text"
               value={extendPrompt}
               onChange={e => setExtendPrompt(e.target.value)}
               placeholder="Describe what happens next in the extension (+7s)..."
               className="flex-grow bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
               disabled={isDisabled}
             />
             <button
               onClick={() => {
                 const clip = clips.find(c => c.id === selectedClipId);
                 if (clip && onExtend) {
                   onExtend(extendPrompt, clip.rawVideoObject);
                   setIsExtendMode(false);
                   setExtendPrompt('');
                 }
               }}
               disabled={!extendPrompt.trim() || isDisabled}
               className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 whitespace-nowrap transition-colors"
             >
               Generate Extension
             </button>
          </div>
        )}

        {/* Tracks Area Container */}
        <div
           className={`relative bg-slate-900 border border-slate-700 rounded-xl overflow-x-auto overflow-y-hidden shadow-inner flex flex-col min-h-[140px] ${dragState ? 'cursor-ew-resize select-none touch-none' : ''}`}
           onDragOver={handleDragOver}
           onDrop={handleDrop}
        >
           {clips.length === 0 && (
             <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm font-medium pointer-events-none">
                Drop video clips here to add to Track V1
             </div>
           )}

           {/* Time Ruler (Header) */}
           <div
             className="h-6 border-b border-slate-700/50 flex relative shrink-0 overflow-hidden text-[10px] text-slate-500 select-none bg-slate-800/50 cursor-ew-resize hover:bg-slate-700/50 transition-colors"
             onPointerDown={handleTimelinePointerDown}
             ref={timelineRef}
           >
              <div style={{ width: `${totalDuration * zoomLevel}px` }} className="relative h-full"></div>
           </div>

           {/* V1: Video Track */}
           <div className="relative h-20 border-b border-slate-700/50 flex shrink-0 group">
              <div className="absolute left-0 top-0 bottom-0 w-10 bg-slate-800 border-r border-slate-700 flex items-center justify-center z-20 text-xs font-bold text-slate-500 shadow-md">
                V1
              </div>
              <div className="ml-10 relative h-full flex items-center" style={{ width: `${totalDuration * zoomLevel}px` }}>

                 {/* Render Clip Blocks */}
                 {clips.map((clip, index) => {
                    const dur = clip.trimEnd - clip.trimStart;
                    const prevDuration = clips.slice(0, index).reduce((acc, c) => acc + (c.trimEnd - c.trimStart), 0);
                    const leftPx = prevDuration * zoomLevel;
                    const widthPx = dur * zoomLevel;
                    const isSelected = selectedClipId === clip.id;

                    return (
                      <div
                        key={clip.id}
                        onClick={() => setSelectedClipId(clip.id)}
                        className={`absolute h-16 rounded-md overflow-hidden transition-all shadow-sm flex group/clip ${isSelected ? 'border-2 border-indigo-400 z-10 scale-y-105 shadow-indigo-500/20' : 'border border-slate-600 hover:border-slate-500 opacity-90 hover:opacity-100'} bg-indigo-900/40`}
                        style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                      >
                         <video src={clip.url} className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-50 pointer-events-none" />
                         <div className="absolute top-1 left-2 text-[9px] font-bold text-white bg-black/50 px-1 rounded truncate max-w-[80%] pointer-events-none">Clip {index+1}</div>

                         {/* Trim Handles */}
                         {isSelected && (
                           <>
                             <div className="absolute left-0 top-0 bottom-0 w-3 bg-indigo-500 cursor-ew-resize hover:bg-white transition-colors flex items-center justify-center"
                                  onPointerDown={(e) => handleTrimPointerDown(e, clip.id, 'start')}
                             >
                               <div className="w-0.5 h-4 bg-black/30 rounded-full pointer-events-none"></div>
                             </div>
                             <div className="absolute right-0 top-0 bottom-0 w-3 bg-indigo-500 cursor-ew-resize hover:bg-white transition-colors flex items-center justify-center"
                                  onPointerDown={(e) => handleTrimPointerDown(e, clip.id, 'end')}
                             >
                               <div className="w-0.5 h-4 bg-black/30 rounded-full pointer-events-none"></div>
                             </div>
                           </>
                         )}
                      </div>
                    );
                 })}
              </div>
           </div>

           {/* A1: Audio Track (Overlay/Custom) */}
           <div className="relative h-12 flex shrink-0 bg-slate-900/50">
              <div className="absolute left-0 top-0 bottom-0 w-10 bg-slate-800 border-r border-slate-700 flex items-center justify-center z-20 text-xs font-bold text-slate-500 shadow-md">
                A1
              </div>
              <div className="ml-10 relative h-full flex items-center p-1" style={{ width: `${totalDuration * zoomLevel}px` }}>
                 {customAudioUrl ? (
                    <div className="w-full h-8 bg-emerald-900/40 border border-emerald-700/50 rounded-md flex items-center px-2 text-[10px] text-emerald-400 overflow-hidden">
                       <i className="fa-solid fa-wave-square mr-2"></i> Custom Soundtrack
                    </div>
                 ) : (
                    <div className="w-full text-center text-[10px] text-slate-600 italic pointer-events-none">No custom audio track added</div>
                 )}
              </div>
           </div>

           {/* Master Playhead Line */}
           <div
             ref={playheadRef}
             className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none transition-transform duration-75"
             style={{ left: `calc(40px + ${(globalTime * zoomLevel)}px)` }}
           >
              <div className="absolute -top-1 -left-1.5 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500"></div>
           </div>
        </div>
      </div>

      {/* --- 3. EFFECTS & EXPORT PANEL --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 relative z-10">

        {/* Global Transitions */}
        <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-xl">
           <h3 className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
             <i className="fa-solid fa-wand-magic-sparkles"></i> Global Transitions
           </h3>
           <div className="space-y-3">
             <div>
               <label className="text-[10px] text-slate-400 mb-1 block">Intro (Start of Sequence)</label>
               <select value={introTransition} onChange={(e) => setIntroTransition(e.target.value as TransitionType)} disabled={isDisabled} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-medium text-slate-300">
                 <option value="none">None</option><option value="fade">Fade In</option><option value="slide">Slide In</option><option value="glitch">Glitch In</option>
               </select>
             </div>
             <div>
               <label className="text-[10px] text-slate-400 mb-1 block">Outro (End of Sequence)</label>
               <select value={outroTransition} onChange={(e) => setOutroTransition(e.target.value as TransitionType)} disabled={isDisabled} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-medium text-slate-300">
                 <option value="none">None</option><option value="fade">Fade Out</option><option value="slide">Slide Out</option><option value="glitch">Glitch Out</option>
               </select>
             </div>
           </div>
        </div>

        {/* Color Grading */}
        <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-xl md:col-span-2">
          <div className="flex justify-between items-center mb-4">
             <h3 className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
               <i className="fa-solid fa-sliders text-indigo-400"></i> Global Look & Feel
             </h3>
             <button onClick={()=>setFilterSettings(DEFAULT_FILTERS)} className="text-[10px] text-indigo-400 hover:text-white px-2 py-1 bg-indigo-500/10 rounded">Reset</button>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
             <div>
               <div className="flex justify-between text-[10px] text-slate-400 mb-1"><span>Brightness</span><span>{filterSettings.brightness}%</span></div>
               <input type="range" min={0} max={200} value={filterSettings.brightness} onChange={e => setFilterSettings(p=>({...p, brightness: parseInt(e.target.value)}))} className="w-full h-1 bg-slate-900 rounded-lg appearance-none accent-indigo-500" />
             </div>
             <div>
               <div className="flex justify-between text-[10px] text-slate-400 mb-1"><span>Contrast</span><span>{filterSettings.contrast}%</span></div>
               <input type="range" min={0} max={200} value={filterSettings.contrast} onChange={e => setFilterSettings(p=>({...p, contrast: parseInt(e.target.value)}))} className="w-full h-1 bg-slate-900 rounded-lg appearance-none accent-indigo-500" />
             </div>
             <div>
               <div className="flex justify-between text-[10px] text-slate-400 mb-1"><span>Saturation</span><span>{filterSettings.saturation}%</span></div>
               <input type="range" min={0} max={200} value={filterSettings.saturation} onChange={e => setFilterSettings(p=>({...p, saturation: parseInt(e.target.value)}))} className="w-full h-1 bg-slate-900 rounded-lg appearance-none accent-indigo-500" />
             </div>
             <div>
               <div className="flex justify-between text-[10px] text-slate-400 mb-1"><span>Vignette</span><span>{filterSettings.vignette}%</span></div>
               <input type="range" min={0} max={100} value={filterSettings.vignette} onChange={e => setFilterSettings(p=>({...p, vignette: parseInt(e.target.value)}))} className="w-full h-1 bg-slate-900 rounded-lg appearance-none accent-indigo-500" />
             </div>
          </div>
        </div>

      </div>

      <button
        onClick={handleExport}
        disabled={isDisabled || clips.length === 0}
        className="mt-2 w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-base sm:text-lg font-bold py-4 rounded-xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isExporting ? <><i className="fa-solid fa-spinner fa-spin"></i> Rendering Output...</> : <><i className="fa-solid fa-file-export"></i> Render & Export Final Composition</>}
      </button>
    </div>
  );
};

export default VideoEditor;
