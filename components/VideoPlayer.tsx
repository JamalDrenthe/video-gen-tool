import React, { useRef, useEffect } from 'react';
import { AspectRatio } from '../types';

interface VideoPlayerProps {
  url: string;
  aspectRatio: AspectRatio;
  customAudioUrl?: string | null;
  onClear: () => void;
  onEdit: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ url, aspectRatio, customAudioUrl, onClear, onEdit }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    // Auto-play when loaded
    if (videoRef.current) {
      videoRef.current.play().catch(e => console.error("Autoplay prevented:", e));
    }
  }, [url]);

  const handleDownload = () => {
    // Note: This downloads the original raw generation. The custom audio is combined in the Editor export.
    const a = document.createElement('a');
    a.href = url;
    a.download = `veo_generated_${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const syncSeek = () => {
    if (audioRef.current && videoRef.current) {
      audioRef.current.currentTime = videoRef.current.currentTime;
    }
  };

  const containerClasses = aspectRatio === '16:9'
    ? "w-full aspect-[16/9] max-h-full"
    : "h-full aspect-[9/16] max-h-[80vh] mx-auto";

  return (
    <div className={`relative ${containerClasses} bg-black rounded-xl overflow-hidden shadow-2xl group`}>
      <video
        ref={videoRef}
        src={url}
        className="w-full h-full object-contain"
        controls
        loop
        playsInline
        onPlay={() => audioRef.current?.play()}
        onPause={() => audioRef.current?.pause()}
        onSeeked={syncSeek}
        onWaiting={() => audioRef.current?.pause()}
        onPlaying={() => audioRef.current?.play()}
      />

      {/* Hidden custom audio synced to video */}
      {customAudioUrl && (
        <audio
          ref={audioRef}
          src={customAudioUrl}
          loop
          preload="auto"
        />
      )}

      {/* Top action bar (visible on hover) */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-start z-10">
        <span className="bg-indigo-500/80 backdrop-blur text-white text-xs font-bold px-2 py-1 rounded shadow-sm flex items-center gap-1">
          <i className="fa-solid fa-check"></i>
          Generated
        </span>

        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-indigo-500 text-white backdrop-blur flex items-center justify-center transition-colors shadow-lg"
            title="Edit Video"
          >
            <i className="fa-solid fa-wand-magic-sparkles text-sm"></i>
          </button>
           <button
            onClick={handleDownload}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white backdrop-blur flex items-center justify-center transition-colors shadow-lg"
            title="Download Original"
          >
            <i className="fa-solid fa-download text-sm"></i>
          </button>
          <button
            onClick={onClear}
            className="w-8 h-8 rounded-full bg-red-500/80 hover:bg-red-500 text-white backdrop-blur flex items-center justify-center transition-colors shadow-lg"
            title="Clear"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;