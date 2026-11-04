import React, { useState } from 'react';

interface ApiKeySelectorProps {
  onKeySelected: () => void;
}

const ApiKeySelector: React.FC<ApiKeySelectorProps> = ({ onKeySelected }) => {
  const [token, setToken] = useState(() => localStorage.getItem('vg_hf_token') || '');

  const handleSaveToken = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedToken = token.trim();
    if (!trimmedToken) return;
    localStorage.setItem('vg_hf_token', trimmedToken);
    localStorage.removeItem('vg_hf_skip');
    onKeySelected();
  };

  const handleContinueWithoutToken = () => {
    localStorage.setItem('vg_hf_skip', '1');
    onKeySelected();
  };

  return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        {/* Decorative background blob */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center mb-6 shadow-lg shadow-black/50">
            <i className="fa-solid fa-key text-3xl text-indigo-400"></i>
          </div>

          <h2 className="text-3xl font-bold mb-4 text-white">Unlock Video Generation</h2>

          <p className="text-slate-300 mb-6 leading-relaxed max-w-lg">
            Free public Hugging Face Spaces on ZeroGPU run video generation. A token is optional, but gives you more daily GPU quota. Your token is stored only in this browser.
          </p>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-8 text-left max-w-lg w-full">
            <div className="flex items-start gap-3">
              <i className="fa-solid fa-circle-info text-amber-500 mt-1"></i>
              <div>
                <h4 className="text-amber-500 font-medium mb-1">Optional Hugging Face token</h4>
                <p className="text-sm text-amber-200/80">
                  Create a token with read access on Hugging Face. You can also continue without one.
                  <a
                    href="https://huggingface.co/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:text-amber-300 underline ml-1 inline-flex items-center gap-1"
                  >
                    Create a token
                    <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                  </a>
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveToken} className="w-full max-w-lg flex flex-col items-center gap-3">
            <input
              type="password"
              value={token}
              onChange={event => setToken(event.target.value)}
              placeholder="hf_..."
              aria-label="Hugging Face token"
              autoComplete="off"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={!token.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 px-8 rounded-xl shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Save token and continue
              <i className="fa-solid fa-arrow-right"></i>
            </button>
            <button
              type="button"
              onClick={handleContinueWithoutToken}
              className="text-slate-300 hover:text-white text-sm underline underline-offset-4"
            >
              Continue without token
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ApiKeySelector;
