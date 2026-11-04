import React, { useState, useEffect } from 'react';
import { AspectRatio } from '../types';

interface LoadingOverlayProps {
  status: string;
  aspectRatio: AspectRatio;
}

const reassuranceMessages = [
  "Initializing Wan2.2 model...",
  "Analyzing scene semantics...",
  "Synthesizing spatial composition...",
  "Calculating temporal consistency...",
  "Generating complex lighting...",
  "Refining fine textures...",
  "Adding motion dynamics...",
  "Polishing high-resolution output...",
  "Finalizing video structure...",
  "Preparing for download... almost there!"
];

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ status, aspectRatio }) => {
  const [messageIndex, setMessageIndex] = useState(0);

  // Cycle through reassuring messages to keep the user engaged
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prevIndex) => {
        // Stop at the last message if generation takes very long
        if (prevIndex < reassuranceMessages.length - 1) {
          return prevIndex + 1;
        }
        return prevIndex;
      });
    }, 8000); // Change message every 8 seconds

    return () => clearInterval(interval);
  }, []);

  const containerClasses = aspectRatio === '16:9'
    ? "w-full aspect-video"
    : "w-full max-w-[260px] sm:max-w-[300px] lg:max-w-[340px] aspect-[9/16] mx-auto";

  return (
    <div className={`relative ${containerClasses} bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl flex flex-col items-center justify-center p-4 sm:p-8 z-10`}>
      {/* Animated gradient background */}
      <div className="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,transparent_25%,rgba(99,102,241,0.2)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%,100%_100%] animate-[bg-spin_10s_linear_infinite]"></div>

      <div className="relative z-10 flex flex-col items-center text-center w-full">
        {/* Progress indicator spinner */}
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 mb-6 sm:mb-8">
           <svg className="animate-spin w-full h-full text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"></circle>
             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
           </svg>
           <div className="absolute inset-0 flex items-center justify-center text-indigo-300">
              <i className="fa-solid fa-video text-lg sm:text-xl"></i>
           </div>
        </div>

        {/* Current status from API (if provided and specific) */}
        {status && (
          <div className="text-[10px] sm:text-xs font-mono text-indigo-400 mb-4 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 max-w-full truncate">
             {status}
          </div>
        )}

        {/* Reassuring cycling message */}
        <h3 className="text-base sm:text-xl font-medium text-slate-200 mb-3 min-h-[40px] sm:min-h-[32px] transition-opacity duration-500 flex items-center justify-center">
          {reassuranceMessages[messageIndex]}
        </h3>

        <p className="text-xs sm:text-sm text-slate-500 max-w-sm hidden sm:block">
          High-quality video generation is a complex process and typically takes several minutes. Feel free to leave this page open.
        </p>

        {/* Fake progress bar purely for visual feedback */}
        <div className="w-full max-w-[200px] sm:max-w-xs h-1 sm:h-1.5 bg-slate-800 rounded-full mt-6 sm:mt-8 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full w-1/3 animate-[pulse-width_2s_ease-in-out_infinite_alternate]"></div>
        </div>
      </div>

      <style>{`
        @keyframes bg-spin {
          100% { background-position: 100% 50%; }
        }
        @keyframes pulse-width {
          0% { width: 10%; transform: translateX(0); }
          100% { width: 40%; transform: translateX(150%); }
        }
      `}</style>
    </div>
  );
};

export default LoadingOverlay;
