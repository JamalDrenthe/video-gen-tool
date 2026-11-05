import React, { useState, useRef, useEffect } from 'react';
import { AspectRatio, GenerationMode, Resolution, VideoConfig, VideoHistoryItem, VideoQuality } from '../types';
import { generateVeoVideo, extendVeoVideo, downloadVideoUri } from '../services/huggingfaceService';
import VideoEditor from './VideoEditor';
import SceneBuilder from './SceneBuilder';

type SortOption = 'date-desc' | 'date-asc' | 'prompt-desc' | 'prompt-asc';

// Helper component for Image Upload Box
const ImageUploadBox = ({ title, preview, onUpload, onClear }: { title: string, preview: string | null, onUpload: (e: any) => void, onClear: () => void }) => (
  <div className="relative border-2 border-dashed border-slate-600 rounded-xl bg-slate-900/50 hover:border-indigo-500 transition-colors flex flex-col items-center justify-center h-28 sm:h-32 overflow-hidden group">
    {preview ? (
       <>
         <img src={preview} alt="preview" className="absolute inset-0 w-full h-full object-cover opacity-80" />
         <button onClick={(e) => { e.preventDefault(); onClear(); }} className="absolute top-2 right-2 bg-slate-900/80 hover:bg-red-500 text-white rounded-full w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center z-10 transition-colors shadow-lg border border-white/10">
            <i className="fa-solid fa-xmark text-xs sm:text-base"></i>
         </button>
         <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded text-[10px] sm:text-xs font-bold text-white z-10 border border-white/10 shadow-lg">{title}</div>
       </>
    ) : (
       <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full text-slate-400 group-hover:text-indigo-400 transition-colors p-2 sm:p-4 text-center">
          <i className="fa-solid fa-cloud-arrow-up text-xl sm:text-2xl mb-1 sm:mb-2 opacity-70"></i>
          <span className="text-[10px] sm:text-xs font-medium px-2 leading-tight">{title}</span>
          <input type="file" accept="image/jpeg, image/png" onChange={onUpload} className="hidden" />
       </label>
    )}
  </div>
);

const VideoGenerator: React.FC = () => {
  const [mode, setMode] = useState<GenerationMode>('text');
  const [singleImageRole, setSingleImageRole] = useState<'start' | 'reference'>('start');
  const [prompt, setPrompt] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [resolution, setResolution] = useState<Resolution>('1080p');

  // Audio & Language Settings
  const [musicOn, setMusicOn] = useState<boolean>(true);
  const [voiceOn, setVoiceOn] = useState<boolean>(true);
  const [language, setLanguage] = useState<'EN' | 'NL'>('EN');

  // Custom Audio Track
  const [customAudioName, setCustomAudioName] = useState<string | null>(null);
  const [customAudioUrl, setCustomAudioUrl] = useState<string | null>(null);

  // Advanced Settings
  const [quality, setQuality] = useState<VideoQuality>('standard');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Image Upload States
  const [sourceImagePreview, setSourceImagePreview] = useState<string | null>(null);
  const [endImagePreview, setEndImagePreview] = useState<string | null>(null);
  const [refImagePreviews, setRefImagePreviews] = useState<string[]>([]);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null); // Acts as the initial clip injector
  const [currentRawVideoObject, setCurrentRawVideoObject] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState<string>('');

  const [history, setHistory] = useState<VideoHistoryItem[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const blobCache = useRef<Record<string, string>>({});

  // Unified lock check based on active mode config for RESOLUTION only
  const isResLocked = mode === 'reference' || mode === 'key_ref' || (mode === 'image' && singleImageRole === 'reference');

  // Load history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('veo_video_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history from localStorage", e);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    // Omit blob URLs from localStorage to prevent crashing or stale references
    const historyToSave = history.map(item => ({...item, customAudioUrl: undefined}));
    localStorage.setItem('veo_video_history', JSON.stringify(historyToSave));
  }, [history]);

  // Adjust resolution automatically when switching to constrained modes
  useEffect(() => {
    if (isResLocked) {
      setResolution('720p');
    }
  }, [isResLocked]);

  const handleSingleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setter(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleMultipleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    // Calculate how many more we can add (max 3 total)
    const spaceLeft = 3 - refImagePreviews.length;
    const filesToProcess = files.slice(0, spaceLeft);

    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setRefImagePreviews(prev => [...prev, event.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create a local blob URL for immediate use without crashing memory limits
    const url = URL.createObjectURL(file);
    setCustomAudioName(file.name);
    setCustomAudioUrl(url);
  };

  const removeRefImage = (index: number) => {
    setRefImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const getBase64Data = (dataUrl: string) => dataUrl.split(',')[1];

  const validateInputs = (): boolean => {
    if (isGenerating) return false;
    if (mode === 'text' && !prompt.trim()) return false;
    if (mode === 'image') {
      if (!sourceImagePreview) return false;
      if (singleImageRole === 'reference' && !prompt.trim()) return false;
    }
    if (mode === 'keyframes' && (!sourceImagePreview || !endImagePreview)) return false;
    if (mode === 'reference' && (!prompt.trim() || refImagePreviews.length === 0)) return false;
    if (mode === 'key_ref' && (!sourceImagePreview || !endImagePreview || !prompt.trim() || refImagePreviews.length === 0)) return false;
    return true;
  };

  const handleGenerate = async () => {
    if (!validateInputs()) {
      setError("Please provide the required inputs for this mode.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setVideoUrl(null); // Clear to trigger editor effect
    setCurrentRawVideoObject(null);

    try {
      const config: VideoConfig = {
        prompt,
        aspectRatio,
        resolution,
        mode,
        singleImageRole: mode === 'image' ? singleImageRole : undefined,
        quality,
        musicOn,
        voiceOn,
        language,
        customAudioName: customAudioName || undefined,
        customAudioUrl: customAudioUrl || undefined
      };

      if (mode === 'image' || mode === 'keyframes' || mode === 'key_ref') {
        if (sourceImagePreview) config.sourceImageBase64 = getBase64Data(sourceImagePreview);
        if ((mode === 'keyframes' || mode === 'key_ref') && endImagePreview) config.endImageBase64 = getBase64Data(endImagePreview);
      }

      if (mode === 'reference' || mode === 'key_ref') {
        config.referenceImagesBase64 = refImagePreviews.map(getBase64Data);
      }

      const { blobUrl, serverUri, rawVideoObject } = await generateVeoVideo(config, (status) => setLoadingStatus(status));
      setVideoUrl(blobUrl);
      setCurrentRawVideoObject(rawVideoObject);

      const newItem: VideoHistoryItem = {
        id: Date.now().toString(),
        prompt,
        timestamp: Date.now(),
        aspectRatio: aspectRatio,
        resolution: isResLocked ? '720p' : resolution,
        serverUri,
        mode,
        singleImageRole: mode === 'image' ? singleImageRole : undefined,
        quality,
        musicOn,
        voiceOn,
        language,
        customAudioName: customAudioName || undefined,
        customAudioUrl: customAudioUrl || undefined,
        rawVideoObject: rawVideoObject
      };

      blobCache.current[newItem.id] = blobUrl;
      setHistory(prev => [newItem, ...prev]);

    } catch (err: any) {
      console.error("Generation error:", err);
      const errorMessage = err.message || "An unexpected error occurred.";
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExtendVideo = async (extensionPrompt: string, targetRawObj?: any) => {
    const objToExtend = targetRawObj || currentRawVideoObject;
    if (!objToExtend) return;

    setIsGenerating(true);
    setError(null);

    try {
      const { blobUrl, serverUri, rawVideoObject } = await extendVeoVideo(
        extensionPrompt,
        objToExtend,
        aspectRatio,
        (status) => setLoadingStatus(status)
      );

      // Sending extended URL triggers editor to append it
      setVideoUrl(blobUrl);
      setCurrentRawVideoObject(rawVideoObject);

      const newItem: VideoHistoryItem = {
        id: Date.now().toString(),
        prompt: `(Extended: ${extensionPrompt})`,
        timestamp: Date.now(),
        aspectRatio,
        resolution: '720p',
        serverUri,
        mode: 'text',
        quality,
        musicOn,
        voiceOn,
        language,
        customAudioName: customAudioName || undefined,
        customAudioUrl: customAudioUrl || undefined,
        rawVideoObject: rawVideoObject
      };

      blobCache.current[newItem.id] = blobUrl;
      setHistory(prev => [newItem, ...prev]);

    } catch (err: any) {
      console.error("Extension error:", err);
      setError(err.message || "Failed to extend video.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLoadHistory = async (item: VideoHistoryItem) => {
    if (blobCache.current[item.id]) {
       setVideoUrl(blobCache.current[item.id]);
       setCurrentRawVideoObject(item.rawVideoObject || null);
       setError(null);
       window.scrollTo({ top: 0, behavior: 'smooth' });
       return;
    }

    setIsGenerating(true);
    setLoadingStatus("Fetching past video...");
    setError(null);
    setVideoUrl(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const url = await downloadVideoUri(item.serverUri);
      blobCache.current[item.id] = url;
      setVideoUrl(url);
      setCurrentRawVideoObject(item.rawVideoObject || null);
    } catch (err: any) {
      console.error("Failed to load history video:", err);
      setError("Failed to load past video. The server link may have expired.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteHistory = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));

    if (blobCache.current[id]) {
      URL.revokeObjectURL(blobCache.current[id]);
      delete blobCache.current[id];
    }
  };

  const handleDragStart = async (e: React.DragEvent, item: VideoHistoryItem) => {
     let url = blobCache.current[item.id];
     if (!url) {
        const payload = JSON.stringify({
          type: 'history_item',
          id: item.id,
          uri: item.serverUri,
          rawVideoObject: item.rawVideoObject
        });
        e.dataTransfer.setData('application/json', payload);
     } else {
        const payload = JSON.stringify({
          type: 'cached_blob',
          url: url,
          rawVideoObject: item.rawVideoObject
        });
        e.dataTransfer.setData('application/json', payload);
     }

     // Visual drag image
     const dragGhost = document.createElement('div');
     dragGhost.innerHTML = `<div style="background:#6366f1;color:white;padding:4px 8px;border-radius:4px;font-size:12px;font-family:sans-serif;"><i class="fa-solid fa-film mr-2"></i>Clip</div>`;
     document.body.appendChild(dragGhost);
     e.dataTransfer.setDragImage(dragGhost, 0, 0);
     setTimeout(() => document.body.removeChild(dragGhost), 0);
  };

  const clearVideo = () => {
    setVideoUrl(null);
    setCurrentRawVideoObject(null);
  };

  const getIconForPrompt = (p: string) => {
    const text = p.toLowerCase();
    if (text.includes('cat') || text.includes('kitten')) return 'fa-cat';
    if (text.includes('dog') || text.includes('puppy')) return 'fa-dog';
    if (text.includes('car') || text.includes('drive')) return 'fa-car';
    if (text.includes('city') || text.includes('tokyo')) return 'fa-city';
    if (text.includes('space') || text.includes('galaxy')) return 'fa-rocket';
    return 'fa-film';
  };

  const getQualityBadgeText = (q?: VideoQuality) => {
    if (q === 'high') return 'HQ';
    if (q === 'low') return 'LQ';
    return 'SQ';
  };

  const sortedHistory = [...history].sort((a, b) => {
    if (sortBy === 'date-desc') return b.timestamp - a.timestamp;
    if (sortBy === 'date-asc') return a.timestamp - b.timestamp;
    if (sortBy === 'prompt-desc') return b.prompt.length - a.prompt.length;
    if (sortBy === 'prompt-asc') return a.prompt.length - b.prompt.length;
    return 0;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative items-start">

      {/* Left Column: Generation Controls */}
      <div className="lg:col-span-5 flex flex-col gap-6 lg:sticky lg:top-24">

        <div className="bg-slate-800 rounded-2xl p-4 sm:p-6 border border-slate-700 shadow-xl flex flex-col h-full">

          {/* Mode Selector - Mobile horizontally scrollable */}
          <div className="flex bg-slate-900 rounded-xl p-1 mb-6 border border-slate-700 shadow-inner overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {(['scenes', 'text', 'image', 'keyframes', 'reference', 'key_ref'] as GenerationMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={isGenerating}
                className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 px-3 sm:px-4 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                  mode === m
                    ? 'bg-indigo-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                } disabled:opacity-50`}
              >
                {m === 'scenes' && <i className="fa-solid fa-clapperboard"></i>}
                {m === 'text' && <i className="fa-solid fa-align-left"></i>}
                {m === 'image' && <i className="fa-solid fa-image"></i>}
                {m === 'keyframes' && <i className="fa-solid fa-film"></i>}
                {m === 'reference' && <i className="fa-solid fa-images"></i>}
                {m === 'key_ref' && <i className="fa-solid fa-layer-group"></i>}
                <span className="capitalize">{m === 'key_ref' ? 'Key+Ref' : m}</span>
              </button>
            ))}
          </div>

          {mode === 'scenes' && (
            <SceneBuilder
              aspectRatio={aspectRatio}
              resolution={resolution}
              disabled={isGenerating}
              onStatus={setLoadingStatus}
              onError={setError}
              onVideo={(url, label) => {
                setVideoUrl(url);
                setCurrentRawVideoObject(null);
                const newItem: VideoHistoryItem = {
                  id: Date.now().toString(),
                  prompt: label,
                  timestamp: Date.now(),
                  aspectRatio,
                  resolution,
                  serverUri: '',
                  mode: 'scenes',
                  quality,
                  customAudioName: customAudioName || undefined,
                  customAudioUrl: customAudioUrl || undefined,
                };
                blobCache.current[newItem.id] = url;
                setHistory(prev => [newItem, ...prev]);
              }}
            />
          )}

          {/* Dynamic File Upload Zones */}
          {mode === 'image' && (
             <div className="mb-6 space-y-3">
               <ImageUploadBox
                 title={singleImageRole === 'start' ? "Upload Starting Frame" : "Upload Reference Image"}
                 preview={sourceImagePreview}
                 onUpload={(e) => handleSingleImageUpload(e, setSourceImagePreview)}
                 onClear={() => setSourceImagePreview(null)}
               />
               <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                  <button
                    onClick={() => setSingleImageRole('start')}
                    disabled={isGenerating}
                    className={`flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold rounded-md transition-all ${singleImageRole === 'start' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    Exact Starting Frame
                  </button>
                  <button
                    onClick={() => setSingleImageRole('reference')}
                    disabled={isGenerating}
                    className={`flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold rounded-md transition-all ${singleImageRole === 'reference' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    General Reference
                  </button>
               </div>
             </div>
          )}

          {(mode === 'keyframes' || mode === 'key_ref') && (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
               <ImageUploadBox
                 title="Starting Frame"
                 preview={sourceImagePreview}
                 onUpload={(e) => handleSingleImageUpload(e, setSourceImagePreview)}
                 onClear={() => setSourceImagePreview(null)}
               />
               <ImageUploadBox
                 title="Ending Frame"
                 preview={endImagePreview}
                 onUpload={(e) => handleSingleImageUpload(e, setEndImagePreview)}
                 onClear={() => setEndImagePreview(null)}
               />
             </div>
          )}

          {(mode === 'reference' || mode === 'key_ref') && (
             <div className="mb-6 space-y-3">
               <div className="flex justify-between items-center text-xs sm:text-sm font-semibold text-slate-300">
                  <span>Reference Images</span>
                  <span className="text-[10px] sm:text-xs bg-slate-900 px-2 py-0.5 rounded text-slate-500 border border-slate-700">{refImagePreviews.length} / 3</span>
               </div>
               <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {refImagePreviews.map((preview, idx) => (
                    <div key={idx} className="relative aspect-square border border-slate-600 rounded-lg overflow-hidden group">
                       <img src={preview} alt={`ref-${idx}`} className="w-full h-full object-cover opacity-80" />
                       <button onClick={() => removeRefImage(idx)} className="absolute top-1 right-1 bg-slate-900/80 hover:bg-red-500 text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center z-10 transition-colors shadow-lg border border-white/10">
                          <i className="fa-solid fa-xmark text-[10px] sm:text-xs"></i>
                       </button>
                    </div>
                  ))}
                  {refImagePreviews.length < 3 && (
                    <label className="cursor-pointer border-2 border-dashed border-slate-600 rounded-lg bg-slate-900/50 hover:border-indigo-500 transition-colors flex flex-col items-center justify-center aspect-square text-slate-500 hover:text-indigo-400">
                      <i className="fa-solid fa-plus text-lg sm:text-xl mb-1"></i>
                      <span className="text-[9px] sm:text-[10px] font-medium uppercase">Add</span>
                      <input type="file" multiple accept="image/jpeg, image/png" onChange={handleMultipleRefUpload} className="hidden" />
                    </label>
                  )}
               </div>
             </div>
          )}

          {/* Prompt Input Area */}
          {mode !== 'scenes' && (
          <div className="mb-6 flex flex-col flex-grow">
            <label className="text-xs sm:text-sm font-semibold text-slate-300 mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <i className="fa-solid fa-pen-nib text-indigo-400"></i>
                Video Prompt
              </div>
              {(mode === 'image' && singleImageRole === 'start') || mode === 'keyframes' ? (
                <span className="text-[10px] sm:text-xs text-slate-500 font-normal">Optional</span>
              ) : null}
            </label>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              placeholder={
                mode === 'text' ? "A cinematic neon hologram of a cybernetic cat driving a hover-car..." :
                (mode === 'reference' || mode === 'key_ref' || (mode === 'image' && singleImageRole === 'reference')) ? "Describe the action, environment, and how the reference items interact..." :
                "Describe the motion, camera movement, or action (leave blank to let the model decide)..."
              }
              className="w-full h-28 sm:h-32 lg:h-48 bg-slate-900 border border-slate-700 rounded-xl p-3 sm:p-4 text-sm sm:text-base text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:opacity-50 transition-shadow"
            />
          </div>
          )}

          <div className="space-y-5 mb-6">

            {/* Audio & Language Toggles */}
            {mode !== 'scenes' && (
            <div>
              <label className="text-xs sm:text-sm font-semibold text-slate-300 mb-2 flex justify-between items-center">
                Audio & Language
              </label>

              <div className="mb-3 sm:mb-4 text-[9px] sm:text-[10px] text-slate-400 flex gap-2 items-start bg-slate-900/50 p-2 sm:p-2.5 rounded-lg border border-slate-800 shadow-inner">
                <i className="fa-solid fa-circle-info mt-0.5 text-indigo-400"></i>
                <p>AI generation produces <b>silent</b> videos. To hear sound, upload a <b>Custom Soundtrack</b> below which will be bundled into your final export.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">

                <button
                  onClick={() => setMusicOn(!musicOn)}
                  disabled={isGenerating}
                  className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border transition-all ${
                    musicOn
                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                  } disabled:opacity-50`}
                >
                  <span className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                    <i className="fa-solid fa-music"></i> Music
                  </span>
                  <div className={`w-7 sm:w-8 h-3.5 sm:h-4 rounded-full relative transition-colors shadow-inner ${musicOn ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                    <span className={`absolute top-[2px] w-2.5 sm:w-3 h-2.5 sm:h-3 bg-white rounded-full transition-all shadow-sm ${musicOn ? 'left-[16px] sm:left-[18px]' : 'left-[2px]'}`}></span>
                  </div>
                </button>

                <button
                  onClick={() => setVoiceOn(!voiceOn)}
                  disabled={isGenerating}
                  className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border transition-all ${
                    voiceOn
                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                  } disabled:opacity-50`}
                >
                  <span className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                    <i className="fa-solid fa-microphone"></i> Voice
                  </span>
                  <div className={`w-7 sm:w-8 h-3.5 sm:h-4 rounded-full relative transition-colors shadow-inner ${voiceOn ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                    <span className={`absolute top-[2px] w-2.5 sm:w-3 h-2.5 sm:h-3 bg-white rounded-full transition-all shadow-sm ${voiceOn ? 'left-[16px] sm:left-[18px]' : 'left-[2px]'}`}></span>
                  </div>
                </button>

                <div className="flex bg-slate-900 rounded-xl p-1 border border-slate-700 h-full min-h-[40px] sm:min-h-[46px]">
                  <button
                    onClick={() => setLanguage('EN')}
                    disabled={isGenerating}
                    className={`flex-1 flex items-center justify-center text-xs sm:text-sm font-bold rounded-lg transition-all disabled:opacity-50 ${
                      language === 'EN' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    EN
                  </button>
                  <button
                    onClick={() => setLanguage('NL')}
                    disabled={isGenerating}
                    className={`flex-1 flex items-center justify-center text-xs sm:text-sm font-bold rounded-lg transition-all disabled:opacity-50 ${
                      language === 'NL' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    NL
                  </button>
                </div>

              </div>

              {/* Custom Audio Upload */}
              <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-slate-900 border border-slate-700 rounded-xl relative overflow-hidden group">
                <div className="flex justify-between items-center mb-1.5 sm:mb-2">
                  <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Custom Soundtrack</span>
                  {customAudioName && (
                    <button
                      onClick={() => { setCustomAudioName(null); setCustomAudioUrl(null); }}
                      className="text-[9px] sm:text-xs text-red-400 hover:text-red-300 transition-colors bg-red-400/10 hover:bg-red-400/20 px-1.5 py-0.5 rounded border border-red-500/20"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <label className="cursor-pointer flex items-center justify-center gap-2 p-2.5 sm:p-3 rounded-lg border border-dashed border-slate-600 bg-slate-800/50 hover:border-indigo-500 hover:bg-slate-800 transition-all">
                  {customAudioName ? (
                    <span className="text-indigo-400 font-medium text-xs sm:text-sm truncate w-full text-center flex items-center justify-center px-2">
                      <i className="fa-solid fa-file-audio mr-1.5 sm:mr-2 text-indigo-500"></i>
                      {customAudioName}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-xs sm:text-sm flex items-center justify-center">
                      <i className="fa-solid fa-cloud-arrow-up mr-1.5 sm:mr-2"></i>
                      Select Audio File...
                    </span>
                  )}
                  <input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
                </label>
              </div>
            </div>
            )}

            {/* Aspect Ratio Toggle */}
            <div>
              <label className="text-xs sm:text-sm font-semibold text-slate-300 mb-2 sm:mb-3 flex justify-between items-center">
                Aspect Ratio
              </label>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <button
                  onClick={() => setAspectRatio('16:9')}
                  disabled={isGenerating}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 rounded-xl border transition-all text-xs sm:text-base ${
                    aspectRatio === '16:9'
                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                  } disabled:opacity-50`}
                >
                  <i className="fa-solid fa-display"></i>
                  Landscape (16:9)
                </button>
                <button
                  onClick={() => setAspectRatio('9:16')}
                  disabled={isGenerating}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 rounded-xl border transition-all text-xs sm:text-base ${
                    aspectRatio === '9:16'
                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                  } disabled:opacity-50`}
                >
                  <i className="fa-solid fa-mobile-screen"></i>
                  Portrait (9:16)
                </button>
              </div>
            </div>

            {/* Resolution Toggle */}
            <div className={isResLocked ? 'opacity-40 pointer-events-none relative' : ''}>
              <label className="text-xs sm:text-sm font-semibold text-slate-300 mb-2 sm:mb-3 flex justify-between items-center">
                Resolution
                {isResLocked && <span className="text-[10px] sm:text-xs text-amber-500 font-normal"><i className="fa-solid fa-lock mr-1"></i>Locked by API rules</span>}
              </label>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <button
                  onClick={() => setResolution('1080p')}
                  disabled={isGenerating}
                  className={`flex items-center justify-center gap-1 sm:gap-2 py-2 px-2 sm:px-4 rounded-xl border transition-all ${
                    resolution === '1080p'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                  } disabled:opacity-50`}
                >
                  <span className="font-bold text-sm sm:text-base">1080p</span>
                  <span className="text-[10px] sm:text-xs opacity-70">FHD</span>
                </button>
                <button
                  onClick={() => setResolution('720p')}
                  disabled={isGenerating}
                  className={`flex items-center justify-center gap-1 sm:gap-2 py-2 px-2 sm:px-4 rounded-xl border transition-all ${
                    resolution === '720p'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                  } disabled:opacity-50`}
                >
                  <span className="font-bold text-sm sm:text-base">720p</span>
                  <span className="text-[10px] sm:text-xs opacity-70">HD</span>
                </button>
              </div>
              <div className="mt-2 sm:mt-3 text-[9px] sm:text-[10px] text-slate-500 flex gap-1.5 sm:gap-2 items-start bg-slate-900/50 p-2 sm:p-2.5 rounded-lg border border-slate-800 shadow-inner">
                <i className="fa-solid fa-circle-info mt-0.5 text-indigo-400"></i>
                <p>Standard videos generate at ~5 seconds length. To create longer videos, please generate in <b className="text-indigo-300">720p</b>, then use the "Extend Video" feature.</p>
              </div>
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          {mode !== 'scenes' && (
          <div className="mb-6 sm:mb-8">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-400 hover:text-indigo-400 transition-colors w-full focus:outline-none"
            >
              <i className={`fa-solid fa-chevron-${showAdvanced ? 'up' : 'down'} transition-transform w-3 sm:w-4`}></i>
              Advanced Generation Settings
              <div className="h-px bg-slate-700 flex-grow ml-2"></div>
            </button>

            {showAdvanced && (
              <div className="mt-3 sm:mt-4 p-4 sm:p-5 bg-slate-900/80 border border-slate-700 rounded-xl transition-all duration-300">
                <label className="text-xs sm:text-sm font-semibold text-slate-300 mb-1.5 sm:mb-2 flex items-center gap-2">
                  <i className="fa-solid fa-compress text-slate-400"></i>
                  Compression Level / Bitrate
                </label>
                <p className="text-[10px] sm:text-xs text-slate-500 mb-3 sm:mb-4 leading-relaxed">
                  Balance visual fidelity against output file size. High quality preserves maximum detail but increases generation bounds.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['high', 'standard', 'low'] as VideoQuality[]).map(q => (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      disabled={isGenerating}
                      className={`py-2 px-2 rounded-lg border text-xs font-semibold transition-all capitalize flex sm:flex-col items-center justify-between sm:justify-center gap-1 ${
                        quality === q
                          ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                      } disabled:opacity-50`}
                    >
                      <span>{q}</span>
                      <span className="text-[9px] sm:text-[10px] opacity-60 font-normal">
                        {q === 'high' && '(Max Detail)'}
                        {q === 'standard' && '(Balanced)'}
                        {q === 'low' && '(Small Size)'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          <div className="mt-auto">
            {error && (
              <div className="mb-4 p-3 sm:p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs sm:text-sm flex items-start gap-2">
                <i className="fa-solid fa-triangle-exclamation mt-0.5 sm:mt-1"></i>
                <p>{error}</p>
              </div>
            )}

            {mode !== 'scenes' && (
            <button
              onClick={handleGenerate}
              disabled={!validateInputs()}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-xl shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              {isGenerating && !loadingStatus.includes("extend") ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  {loadingStatus.includes("Fetching") ? "Loading..." : "Generating..."}
                </>
              ) : (
                <>
                  <i className="fa-solid fa-wand-magic-sparkles"></i>
                  Generate Video
                </>
              )}
            </button>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Output & Integrated Editor */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        <VideoEditor
          videoUrl={videoUrl}
          customAudioUrl={customAudioUrl}
          isGenerating={isGenerating}
          loadingStatus={loadingStatus}
          generationAspectRatio={aspectRatio}
          generationResolution={resolution}
          rawVideoObject={currentRawVideoObject}
          onExtend={handleExtendVideo}
          onClear={clearVideo}
        />
      </div>

      {/* Generation History Section */}
      {history.length > 0 && (
        <div className="col-span-1 lg:col-span-12 mt-4 sm:mt-6 pt-6 sm:pt-8 border-t border-slate-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3 sm:gap-4">
            <h3 className="text-lg sm:text-xl font-bold text-slate-200 flex items-center gap-2">
              <i className="fa-solid fa-photo-film text-indigo-400"></i>
              Media Library & History
            </h3>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <span className="text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-3 py-1.5 rounded-lg hidden md:block">
                 <i className="fa-solid fa-hand-pointer mr-1.5"></i> Drag clips to timeline
              </span>
              <label className="text-xs sm:text-sm text-slate-400 font-medium hidden sm:block">Sort:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-slate-900 border border-slate-700 text-slate-300 text-xs sm:text-sm rounded-lg px-2 py-1.5 sm:px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent cursor-pointer flex-grow sm:flex-grow-0"
              >
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="prompt-desc">Prompt Length (Longest)</option>
                <option value="prompt-asc">Prompt Length (Shortest)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {sortedHistory.map(item => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                onClick={() => handleLoadHistory(item)}
                className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden hover:bg-slate-800 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/20 transition-all cursor-grab active:cursor-grabbing group flex flex-col h-full"
                title="Click to load, or drag to timeline"
              >
                {/* Visual Preview Header */}
                <div className="h-24 sm:h-28 bg-slate-900 relative flex items-center justify-center border-b border-slate-700/50 overflow-hidden">
                  {blobCache.current[item.id] ? (
                    <video
                      src={blobCache.current[item.id]}
                      className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity duration-300"
                      muted
                      loop
                      playsInline
                      onMouseEnter={e => e.currentTarget.play()}
                      onMouseLeave={e => e.currentTarget.pause()}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center">
                      <i className={`fa-solid ${getIconForPrompt(item.prompt)} text-2xl sm:text-3xl text-slate-700 group-hover:text-indigo-400 transition-all duration-300 group-hover:scale-110 drop-shadow-md`}></i>
                    </div>
                  )}

                  {/* Overlays */}
                  <div className="absolute top-1.5 left-1.5 flex gap-1">
                    <span className="text-[8px] sm:text-[9px] font-bold bg-indigo-500/80 backdrop-blur-sm px-1 sm:px-1.5 py-0.5 rounded text-white shadow-sm border border-indigo-400/30 uppercase tracking-wide">
                      {item.mode === 'key_ref' ? 'Key+Ref' :
                       (item.mode === 'image' && item.singleImageRole === 'reference') ? 'Img (Ref)' :
                       item.mode || 'text'}
                    </span>
                  </div>

                  <div className="absolute bottom-1.5 right-1.5 flex flex-wrap gap-1 justify-end max-w-[80%]">
                    <span className="text-[8px] sm:text-[9px] font-bold bg-black/60 backdrop-blur-sm px-1 sm:px-1.5 py-0.5 rounded text-white shadow-sm border border-white/10" title="Resolution">
                      {item.resolution}
                    </span>
                  </div>

                  {/* Delete Action (visible on hover) */}
                  <button
                    onClick={(e) => handleDeleteHistory(e, item.id)}
                    className="absolute top-1.5 right-1.5 text-white/50 hover:text-red-400 hover:bg-black/50 p-1 rounded-md transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm border border-transparent hover:border-red-500/30"
                    title="Delete from history"
                  >
                    <i className="fa-solid fa-trash-can text-xs"></i>
                  </button>
                </div>

                {/* Details Body */}
                <div className="p-2 sm:p-3 flex flex-col flex-grow">
                  <p className="text-[10px] sm:text-xs text-slate-300 line-clamp-2 italic leading-relaxed font-medium">
                    "{item.prompt || 'No prompt provided'}"
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoGenerator;
