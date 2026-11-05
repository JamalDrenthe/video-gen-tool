import React, { useState } from 'react';
import { AspectRatio, Resolution } from '../types';

type MotionPreset = 'static' | 'zoom-in' | 'zoom-out' | 'pan-r' | 'pan-l' | 'pan-up' | 'pan-down' | 'drift';
type TextPos = 'left' | 'center' | 'right';
type TextVPos = 'top' | 'center' | 'bottom';

interface SceneText {
  text: string;
  pos: TextPos;
  vpos: TextVPos;
  size: number;
  color: string;
  rise: number;
  t0: number;
  t1: number;
}

interface SceneSpec {
  id: string;
  imageData: string | null; // dataURL
  bg: string;
  duration: number;
  motion: MotionPreset;
  texts: SceneText[];
}

const MOTIONS: { id: MotionPreset; label: string; icon: string }[] = [
  { id: 'static', label: 'Static', icon: 'fa-image' },
  { id: 'zoom-in', label: 'Zoom in', icon: 'fa-magnifying-glass-plus' },
  { id: 'zoom-out', label: 'Zoom out', icon: 'fa-magnifying-glass-minus' },
  { id: 'pan-r', label: 'Pan right', icon: 'fa-arrow-right' },
  { id: 'pan-l', label: 'Pan left', icon: 'fa-arrow-left' },
  { id: 'pan-up', label: 'Pan up', icon: 'fa-arrow-up' },
  { id: 'pan-down', label: 'Pan down', icon: 'fa-arrow-down' },
  { id: 'drift', label: 'Drift', icon: 'fa-wind' },
];

const keyframesFor = (m: MotionPreset) => {
  const ease = 'smooth';
  switch (m) {
    case 'zoom-in': return [{ t: 0, scale: 1.05, x: 0.5, y: 0.5, ease }, { t: 1, scale: 1.35, x: 0.5, y: 0.5 }];
    case 'zoom-out': return [{ t: 0, scale: 1.35, x: 0.5, y: 0.5, ease }, { t: 1, scale: 1.05, x: 0.5, y: 0.5 }];
    case 'pan-r': return [{ t: 0, scale: 1.25, x: 0, y: 0.5, ease }, { t: 1, scale: 1.25, x: 1, y: 0.5 }];
    case 'pan-l': return [{ t: 0, scale: 1.25, x: 1, y: 0.5, ease }, { t: 1, scale: 1.25, x: 0, y: 0.5 }];
    case 'pan-up': return [{ t: 0, scale: 1.25, x: 0.5, y: 1, ease }, { t: 1, scale: 1.25, x: 0.5, y: 0 }];
    case 'pan-down': return [{ t: 0, scale: 1.25, x: 0.5, y: 0, ease }, { t: 1, scale: 1.25, x: 0.5, y: 1 }];
    case 'drift': return [{ t: 0, scale: 1.1, x: 0.3, y: 0.4, ease }, { t: 1, scale: 1.3, x: 0.7, y: 0.6 }];
    default: return [{ t: 0, scale: 1.05, x: 0.5, y: 0.5, ease }];
  }
};

const newScene = (): SceneSpec => ({
  id: Math.random().toString(36).slice(2),
  imageData: null,
  bg: '#1e1b4b',
  duration: 4,
  motion: 'zoom-in',
  texts: [],
});

const strip = (dataUrl: string) => dataUrl.split(',')[1];

interface Props {
  aspectRatio: AspectRatio;
  resolution: Resolution;
  disabled: boolean;
  onStatus: (s: string) => void;
  onVideo: (blobUrl: string, label: string) => void;
  onError: (msg: string | null) => void;
}

const SceneBuilder: React.FC<Props> = ({ aspectRatio, resolution, disabled, onStatus, onVideo, onError }) => {
  const [scenes, setScenes] = useState<SceneSpec[]>([newScene()]);
  const [transition, setTransition] = useState<number>(0.6);
  const [rendering, setRendering] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const busy = disabled || rendering;

  const update = (id: string, patch: Partial<SceneSpec>) =>
    setScenes(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));

  const updateText = (id: string, idx: number, patch: Partial<SceneText>) =>
    setScenes(prev => prev.map(s =>
      s.id === id ? { ...s, texts: s.texts.map((t, i) => (i === idx ? { ...t, ...patch } : t)) } : s));

  const move = (idx: number, dir: -1 | 1) => {
    setScenes(prev => {
      const arr = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return arr;
    });
  };

  const uploadImage = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => update(id, { imageData: ev.target?.result as string });
    reader.readAsDataURL(file);
  };

  const addText = (id: string) =>
    setScenes(prev => prev.map(s => s.id === id ? {
      ...s,
      texts: [...s.texts, { text: '', pos: 'center', vpos: 'bottom', size: 64, color: '#ffffff', rise: 0, t0: 0.05, t1: 0.95 }],
    } : s));

  const buildJob = () => {
    const assets: Record<string, string> = {};
    const jobScenes = scenes.map((s, i) => {
      const spec: any = {
        duration: s.duration,
        keyframes: keyframesFor(s.motion),
        texts: s.texts.filter(t => t.text.trim()).map(t => ({
          text: t.text, pos: t.pos, vpos: t.vpos, size: t.size,
          color: t.color, rise: t.rise, t0: t.t0, t1: t1Clamp(t.t1),
        })),
      };
      if (s.imageData) {
        const key = `img${i}`;
        assets[key] = `b64:${strip(s.imageData)}`;
        spec.image = key;
      } else {
        spec.bg = s.bg;
      }
      return spec;
    });
    return { aspectRatio, resolution, fps: 30, transition_seconds: transition, scenes: jobScenes, assets };
  };

  const t1Clamp = (v: number) => Math.min(1, Math.max(0, v));

  const canRender = scenes.length > 0 && scenes.every(s => s.imageData || true) && scenes.some(s => s.imageData || s.texts.some(t => t.text.trim()));

  const handleRender = async () => {
    if (!canRender || busy) return;
    setRendering(true);
    onError(null);
    onStatus('Rendering scenes on Cloudflare...');
    try {
      const res = await fetch('/api/scene/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildJob()),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Render failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const label = scenes.map(s => s.texts.find(t => t.text.trim())?.text).find(Boolean) || `Scene render (${scenes.length} scenes)`;
      onVideo(url, label);
    } catch (err: any) {
      console.error('Scene render error:', err);
      onError(err.message || 'Scene render failed.');
    } finally {
      setRendering(false);
      onStatus('');
    }
  };

  const totalDuration = scenes.reduce((a, s) => a + s.duration, 0) - transition * Math.max(0, scenes.length - 1);

  return (
    <div className="mb-6 flex flex-col gap-4">
      <div className="text-[9px] sm:text-[10px] text-slate-400 flex gap-2 items-start bg-slate-900/50 p-2 sm:p-2.5 rounded-lg border border-slate-800 shadow-inner">
        <i className="fa-solid fa-circle-info mt-0.5 text-indigo-400"></i>
        <p>Build your video scene by scene: an image with camera motion, text overlays and transitions. Rendered on Cloudflare, no daily limit.</p>
      </div>

      {scenes.map((s, i) => (
        <div key={s.id} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div
            className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-800/60"
            onClick={() => setExpanded(expanded === s.id ? null : s.id)}
          >
            <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5">S{i + 1}</span>
            <span className="text-xs text-slate-300 truncate flex-1">
              {s.imageData ? 'Image' : 'Color'} · {s.duration}s · {MOTIONS.find(m => m.id === s.motion)?.label}
              {s.texts.length > 0 && ` · ${s.texts.length} text${s.texts.length > 1 ? 's' : ''}`}
            </span>
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <button onClick={() => move(i, -1)} disabled={busy || i === 0} className="w-6 h-6 rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 text-xs"><i className="fa-solid fa-arrow-up"></i></button>
              <button onClick={() => move(i, 1)} disabled={busy || i === scenes.length - 1} className="w-6 h-6 rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 text-xs"><i className="fa-solid fa-arrow-down"></i></button>
              <button onClick={() => setScenes(prev => prev.filter(x => x.id !== s.id))} disabled={busy || scenes.length === 1} className="w-6 h-6 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 text-xs"><i className="fa-solid fa-trash"></i></button>
            </div>
            <i className={`fa-solid fa-chevron-${expanded === s.id ? 'up' : 'down'} text-slate-500 text-xs ml-1`}></i>
          </div>

          {expanded === s.id && (
            <div className="px-3 pb-3 pt-1 border-t border-slate-800 space-y-3">
              {/* Image or background */}
              {s.imageData ? (
                <div className="relative rounded-lg overflow-hidden border border-slate-700 h-24">
                  <img src={s.imageData} className="w-full h-full object-cover opacity-80" alt="" />
                  <button onClick={() => update(s.id, { imageData: null })} className="absolute top-1.5 right-1.5 bg-slate-900/80 hover:bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs border border-white/10"><i className="fa-solid fa-xmark"></i></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-slate-600 bg-slate-800/50 hover:border-indigo-500 text-slate-400 hover:text-indigo-400 text-xs">
                    <i className="fa-solid fa-cloud-arrow-up"></i> Upload image
                    <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => uploadImage(s.id, e)} />
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">or bg</span>
                    <input type="color" value={s.bg} onChange={e => update(s.id, { bg: e.target.value })} className="w-8 h-8 rounded cursor-pointer bg-transparent border border-slate-600" />
                  </div>
                </div>
              )}

              {/* Duration + motion */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 font-semibold uppercase">Duration: {s.duration}s</label>
                  <input type="range" min={1} max={12} step={0.5} value={s.duration} disabled={busy}
                    onChange={e => update(s.id, { duration: parseFloat(e.target.value) })} className="w-full accent-indigo-500" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-semibold uppercase">Camera motion</label>
                  <select value={s.motion} disabled={busy} onChange={e => update(s.id, { motion: e.target.value as MotionPreset })}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {MOTIONS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Texts */}
              {s.texts.map((t, ti) => (
                <div key={ti} className="bg-slate-800/60 border border-slate-700 rounded-lg p-2 space-y-2">
                  <div className="flex gap-2 items-center">
                    <input type="text" value={t.text} placeholder="Overlay text..." disabled={busy}
                      onChange={e => updateText(s.id, ti, { text: e.target.value })}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <input type="color" value={t.color} onChange={e => updateText(s.id, ti, { color: e.target.value })}
                      className="w-7 h-7 rounded cursor-pointer bg-transparent border border-slate-600" />
                    <button onClick={() => update(s.id, { texts: s.texts.filter((_, j) => j !== ti) })} disabled={busy}
                      className="w-6 h-6 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 text-xs"><i className="fa-solid fa-xmark"></i></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <span className="text-slate-500">Size {t.size}</span>
                      <input type="range" min={24} max={160} step={4} value={t.size} disabled={busy}
                        onChange={e => updateText(s.id, ti, { size: parseInt(e.target.value) })} className="w-full accent-indigo-500" />
                    </div>
                    <div>
                      <span className="text-slate-500">Rise {t.rise}px</span>
                      <input type="range" min={0} max={200} step={10} value={t.rise} disabled={busy}
                        onChange={e => updateText(s.id, ti, { rise: parseInt(e.target.value) })} className="w-full accent-indigo-500" />
                    </div>
                    <div className="flex gap-1">
                      <select value={t.vpos} disabled={busy} onChange={e => updateText(s.id, ti, { vpos: e.target.value as TextVPos })}
                        className="flex-1 bg-slate-900 border border-slate-700 text-slate-300 text-[10px] rounded px-1 py-1">
                        <option value="top">Top</option><option value="center">Mid</option><option value="bottom">Bottom</option>
                      </select>
                      <select value={t.pos} disabled={busy} onChange={e => updateText(s.id, ti, { pos: e.target.value as TextPos })}
                        className="flex-1 bg-slate-900 border border-slate-700 text-slate-300 text-[10px] rounded px-1 py-1">
                        <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={() => addText(s.id)} disabled={busy}
                className="w-full py-1.5 rounded-lg border border-dashed border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-400 text-xs transition-colors">
                <i className="fa-solid fa-plus mr-1"></i> Add text overlay
              </button>
            </div>
          )}
        </div>
      ))}

      <button onClick={() => setScenes(prev => [...prev, newScene()])} disabled={busy}
        className="w-full py-2.5 rounded-xl border border-dashed border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-400 text-sm font-semibold transition-colors">
        <i className="fa-solid fa-plus mr-1.5"></i> Add scene
      </button>

      <div className="grid grid-cols-2 gap-2 items-end">
        <div>
          <label className="text-[10px] text-slate-500 font-semibold uppercase">Transition: {transition}s</label>
          <input type="range" min={0} max={2} step={0.1} value={transition} disabled={busy}
            onChange={e => setTransition(parseFloat(e.target.value))} className="w-full accent-indigo-500" />
        </div>
        <div className="text-right text-[10px] text-slate-500 pb-1">
          Total: ~{totalDuration.toFixed(1)}s
        </div>
      </div>

      <button onClick={handleRender} disabled={!canRender || busy}
        className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm">
        {rendering ? (<><i className="fa-solid fa-spinner fa-spin"></i> Rendering...</>) : (<><i className="fa-solid fa-clapperboard"></i> Render Scenes</>)}
      </button>
    </div>
  );
};

export default SceneBuilder;
