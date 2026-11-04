import React from 'react';
import VideoGenerator from './components/VideoGenerator';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <i className="fa-solid fa-video text-white text-lg"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
              JD Video Studio
            </h1>
            <p className="text-xs text-slate-400">Powered by Wan2.2 on Hugging Face</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <VideoGenerator />
      </main>

      <footer className="max-w-6xl mx-auto px-4 py-6 border-t border-slate-800 text-center text-slate-500 text-sm mt-auto">
        Generative video models can occasionally produce unexpected results.
      </footer>
    </div>
  );
};

export default App;
