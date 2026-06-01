/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowUp, ArrowDown, Trash2, Music, Zap, Play, Sparkles
} from 'lucide-react';
import { QueuedMix } from '../types';
import { songsData, rhythmOrder, rhythmLabels, rhythmTags } from '../songsData';

interface MixQueuePlannerProps {
  queue: QueuedMix[];
  setQueue: React.Dispatch<React.SetStateAction<QueuedMix[]>>;
  activeSongKey: string;
  globalRhythm: string;
  tempo: number;
  onExecuteNextTransition: (next: QueuedMix) => void;
  transitionActive: boolean;
}

export default function MixQueuePlanner({
  queue,
  setQueue,
  activeSongKey,
  globalRhythm,
  tempo,
  onExecuteNextTransition,
  transitionActive,
}: MixQueuePlannerProps) {
  // Calculate dynamic rhythm & tempo compatibility for all other songs
  const currentSong = songsData[activeSongKey] || songsData.house || Object.values(songsData)[0];

  const [activeFamily, setActiveFamily] = useState<'all' | 'club' | 'vintage' | 'reggae' | 'latin'>('all');

  const families = [
    { id: 'all', label: '🌐 OIS WOS SCHEPPERT' },
    { id: 'club', label: '🔥 DISKO-WURSCHT' },
    { id: 'vintage', label: '🎸 KLAMPFN-HADERN' },
    { id: 'reggae', label: '🇯🇲 KRAUT-MUTI' },
    { id: 'latin', label: '💃 HINDN-WACKLER' },
  ] as const;

  const activeFamilySongs = useMemo(() => {
    const familiar: string[] = [];
    const contrasting: string[] = [];

    const catsToInclude = activeFamily === 'all' 
      ? ['club', 'vintage', 'reggae', 'latin', 'world'] 
      : (activeFamily === 'latin' ? ['latin', 'world'] : [activeFamily]);

    Object.keys(songsData).forEach((key) => {
      if (key === activeSongKey) return;
      const s = songsData[key];
      if (!s || !catsToInclude.includes(s.cat)) return;

      const bpmDelta = Math.abs(s.bpm - tempo);
      const sameCat = s.cat === currentSong.cat;
      const sameRhythmTag = s.tags[0] === currentSong.tags[0];

      // Aligns with rhythm: Close tempo threshold (<= 15 bpm difference) OR same category & rhythm tags
      const aligns = bpmDelta <= 15 || (sameCat && bpmDelta <= 25) || sameRhythmTag;

      if (aligns) {
        familiar.push(key);
      } else {
        contrasting.push(key);
      }
    });

    return { familiar, contrasting };
  }, [activeFamily, activeSongKey, tempo, currentSong]);

  const handleQuickAdd = (songKey: string) => {
    const s = songsData[songKey];
    if (!s) return;
    const newItem: QueuedMix = {
      id: `mix-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      songKey,
      transitionType: 'mix',
      bars: 8,
      customRhythm: s.tags[0]?.includes('/') ? s.tags[0] : '4/4',
    };
    setQueue((prev) => [...prev, newItem]);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newQueue = [...queue];
    const temp = newQueue[index - 1];
    newQueue[index - 1] = newQueue[index];
    newQueue[index] = temp;
    setQueue(newQueue);
  };

  const moveDown = (index: number) => {
    if (index === queue.length - 1) return;
    const newQueue = [...queue];
    const temp = newQueue[index + 1];
    newQueue[index + 1] = newQueue[index];
    newQueue[index] = temp;
    setQueue(newQueue);
  };

  const removeItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<QueuedMix>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  return (
    <div id="mix-queue-planner" className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 shadow-lg bg-zinc-950/90 relative overflow-hidden">
      
      {/* 1. HORIZONTAL PREMIUM HUD HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-zinc-850 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 px-1.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
            <Zap className="w-4 h-4 fill-current animate-pulse" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[11.5px] font-black tracking-wider text-zinc-100 uppercase font-sans leading-none flex items-center gap-1.5 flex-wrap">
              DUDLER-REIHUNG (Mix-Rezept)
              <span className="text-[7.5px] bg-cyan-950 text-cyan-400 border border-cyan-900 px-1 py-0.5 rounded uppercase font-mono font-black">
                TAKT-SPION (Live)
              </span>
            </h3>
            <p className="text-[9.5px] text-zinc-500 truncate leading-relaxed mt-1">
              Laubm: {currentSong.emoji} <span className="text-zinc-350 font-bold">{currentSong.label}</span> ({tempo} BPM · {globalRhythm})
            </p>
          </div>
        </div>

        {/* Action controls right in the header (saves lots of space) */}
        <div className="flex items-center gap-2 shrink-0">
          {transitionActive ? (
            <div className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[8.5px] px-2.5 py-1.5 rounded font-mono flex items-center gap-1.5 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>ACHTUNG: SCHIEB DE KISTN GSCHEIT RÜBER...!</span>
            </div>
          ) : (
            <button
              id="execute-automated-mix-btn"
              disabled={queue.length === 0}
              onClick={() => onExecuteNextTransition(queue[0])}
              className={`flex items-center justify-center gap-1.5 px-4 py-1.5 rounded font-mono font-bold text-[9.5px] tracking-wide transition-all shadow-md uppercase border cursor-pointer
                ${queue.length === 0
                  ? 'bg-zinc-900/60 border-zinc-800 text-zinc-650 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-400 hover:to-pink-400 text-white border-cyan-400 hover:animate-none hover:scale-102 active:scale-95'
                }`}
              title="Den künftigen Heurigen-Hadern einklinken"
            >
              <Play className="w-2.5 h-2.5 fill-current shrink-0 text-amber-300 animate-bounce" />
              ÜBERBLENDER STARTN, OIDA!
            </button>
          )}
        </div>
      </div>

      {/* DYNAMIC BEAT FAMILY CATEGORIZATION BAR */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-none border-b border-zinc-900/80 mb-2.5">
        {families.map((f) => (
          <button
            key={f.id}
            id={`tab-family-${f.id}`}
            onClick={() => setActiveFamily(f.id)}
            className={`shrink-0 text-[8px] font-sans font-black tracking-wider px-2 py-1 rounded transition-all cursor-pointer border uppercase
              ${activeFamily === f.id
                ? 'bg-zinc-800 text-white border-zinc-700 shadow-inner'
                : 'bg-zinc-950/40 text-zinc-450 border-zinc-900/40 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 2. COMPACT RHYTHMIC MATCHING BOARD */}
      <div className="bg-zinc-950/60 p-2 rounded-lg border border-zinc-850/60 mb-3 text-[9px]">
        <div className="flex flex-col gap-2">
          {/* Familiar Matches row */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-1.5">
            <span className="text-[7.5px] font-mono uppercase tracking-widest text-emerald-400 font-extrabold shrink-0 w-[120px] pt-1 flex items-center gap-1 select-none">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
              🟢 Passt ins Gspür:
            </span>
            <div className="flex flex-wrap items-center gap-1 min-w-0 pr-1">
              {activeFamilySongs.familiar.length > 0 ? (
                activeFamilySongs.familiar.map((key) => {
                  const s = songsData[key];
                  const bpmDiff = s.bpm - tempo;
                  const diffText = bpmDiff === 0 ? '±0' : (bpmDiff > 0 ? `+${bpmDiff}` : bpmDiff);
                  return (
                    <button
                      id={`cue-familiar-${key}`}
                      key={key}
                      onClick={() => handleQuickAdd(key)}
                      style={{ borderLeftColor: s.color }}
                      className="shrink-0 flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-350 border border-zinc-800 border-l-[3px] rounded px-1.5 py-0.5 hover:text-white transition-all text-[8px] cursor-pointer font-sans font-medium shadow-sm select-none"
                      title={`Klick direkt zum schnellen Einreihen von: ${s.label} (${s.bpm} BPM, delta: ${diffText})`}
                    >
                      <span className="text-[8.5px]">{s.emoji}</span>
                      <span className="font-extrabold">{s.label}</span>
                      <span className="text-[7.5px] text-emerald-400 font-mono font-bold">({s.bpm})</span>
                    </button>
                  );
                })
              ) : (
                <span className="text-[7px] text-zinc-650 font-mono uppercase italic py-0.5 select-none">Ka anziger Hadern unter de Familienmitglieder passt gscheit voms Tempo her!</span>
              )}
            </div>
          </div>

          <div className="h-px bg-zinc-900/60" />

          {/* Contrasting Matches row */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-1.5">
            <span className="text-[7.5px] font-mono uppercase tracking-widest text-pink-400 font-extrabold shrink-0 w-[120px] pt-1 flex items-center gap-1 select-none">
              <span className="w-1.5 h-1.5 bg-pink-500 rounded-full shrink-0" />
              🌀 Gscheiter Takt-Wechsel:
            </span>
            <div className="flex flex-wrap items-center gap-1 min-w-0 pr-1">
              {activeFamilySongs.contrasting.length > 0 ? (
                activeFamilySongs.contrasting.map((key) => {
                  const s = songsData[key];
                  const bpmDiff = s.bpm - tempo;
                  const diffText = bpmDiff > 0 ? `+${bpmDiff}` : bpmDiff;
                  return (
                    <button
                      id={`cue-contrast-${key}`}
                      key={key}
                      onClick={() => handleQuickAdd(key)}
                      style={{ borderLeftColor: s.color }}
                      className="shrink-0 flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-350 border border-zinc-800 border-l-[3px] rounded px-1.5 py-0.5 hover:text-white transition-all text-[8px] cursor-pointer font-sans font-medium shadow-sm select-none"
                      title={`Klick direkt für schrägen Takt-Hadern: ${s.label} (${s.bpm} BPM, delta: ${diffText})`}
                    >
                      <span className="text-[8.5px]">{s.emoji}</span>
                      <span className="font-bold">{s.label}</span>
                      <span className="text-[7.5px] text-pink-400 font-mono font-bold">({s.bpm})</span>
                    </button>
                  );
                })
              ) : (
                <span className="text-[7px] text-zinc-650 font-mono uppercase italic py-0.5 select-none">Alles staad hier, alle Takte passn zamm</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. SEQUENCE PLANNER BLOCKS (Full width) */}
      <div className="bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-850/80">
        <span className="text-[8px] font-mono uppercase tracking-widest text-zinc-500 block mb-2 select-none">
          KÜNFTIGE ÜBERBLEND-REIHUNG ({queue.length} KACHELN KLAR)
        </span>

        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-7 text-center">
            <Music className="w-5 h-5 text-zinc-700 mb-1.5" />
            <p className="text-zinc-500 text-[10px] font-sans">Geh oida, do is gäähnende Leere in de Warteschlang!</p>
            <p className="text-[8.5px] text-zinc-600 max-w-[360px] mt-0.5 leading-relaxed">
              Druck do oben auf de passende <span className="text-emerald-400 font-bold">Takt-Auswohln</span> oder <span className="text-pink-400 font-bold">Gegen-Geklopfe</span>, um die Hadern in deinen Crossfader-Fahrplan einzuschleusn!
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {queue.map((item, idx) => {
                const song = songsData[item.songKey];
                if (!song) return null;

                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.12 }}
                    className={`flex flex-col border border-zinc-800 rounded bg-zinc-900/60 p-1.5 transition-colors text-zinc-300
                      ${idx === 0 
                        ? 'bg-cyan-950/20 border-cyan-500/40 shadow-sm' 
                        : 'bg-zinc-900 hover:bg-zinc-900/90'
                      }`}
                  >
                    {/* Block Info & Reordering header */}
                    <div className="flex items-center justify-between gap-2 border-b border-zinc-800/40 pb-1 mb-1.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-[8px] font-mono font-black text-cyan-400 w-4 bg-zinc-950 text-center rounded leading-tight py-0.5">
                          {idx + 1}
                        </span>
                        <span className="text-[10px] font-bold text-white truncate">
                          {song.emoji} {song.label}
                        </span>
                        <span className="text-[8px] text-zinc-400 font-mono px-1 rounded bg-zinc-950">
                          {song.bpm} BPM
                        </span>
                      </div>

                      {/* Sorting & Delete Controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          id={`move-up-item-${item.id}`}
                          onClick={() => moveUp(idx)}
                          disabled={idx === 0}
                          className={`p-0.5 rounded transition-colors ${idx === 0 ? 'text-zinc-800 cursor-not-allowed' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'}`}
                          title="Früher dazureihen"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          id={`move-down-item-${item.id}`}
                          onClick={() => moveDown(idx)}
                          disabled={idx === queue.length - 1}
                          className={`p-0.5 rounded transition-colors ${idx === queue.length - 1 ? 'text-zinc-800 cursor-not-allowed' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'}`}
                          title="Später dazureihen"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          id={`remove-item-${item.id}`}
                          onClick={() => removeItem(item.id)}
                          className="p-0.5 rounded text-zinc-650 hover:text-red-400 hover:bg-zinc-850 transition-colors ml-0.5"
                          title="Aus der Schlang werfen"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Transition Configuration Columns */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[8.5px]">
                      {/* Meter Selection */}
                      <div>
                        <span className="text-[7px] font-mono text-zinc-500 block mb-0.5 leading-none">TAKTEMPFINDUNG</span>
                        <select
                          id={`rhythm-manipulate-${item.id}`}
                          value={item.customRhythm}
                          onChange={(e) => updateItem(item.id, { customRhythm: e.target.value })}
                          className="w-full bg-zinc-950 text-zinc-300 border border-zinc-800 rounded p-0.5 font-mono text-[8px] outline-none focus:border-cyan-500"
                        >
                          {rhythmOrder.map((r) => (
                            <option key={r} value={r}>
                              {rhythmLabels[r]} ({rhythmTags[r]})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Duration count bars */}
                      <div>
                        <span className="text-[7px] font-mono text-zinc-500 block mb-0.5 leading-none">ÜBERBLEND-TAKTE</span>
                        <div className="flex items-center border border-zinc-800 rounded bg-zinc-950">
                          <button
                            id={`dec-bars-${item.id}`}
                            onClick={() => updateItem(item.id, { bars: Math.max(1, item.bars - 1) })}
                            className="w-1/4 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 py-0.5 rounded-l text-center font-black"
                          >
                            -
                          </button>
                          <span className="w-2/4 text-center text-zinc-100 font-mono font-bold text-[8.5px]">
                            {item.bars} Takte
                          </span>
                          <button
                            id={`inc-bars-${item.id}`}
                            onClick={() => updateItem(item.id, { bars: Math.min(16, item.bars + 1) })}
                            className="w-1/4 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 py-0.5 rounded-r text-center font-black"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Blend type selection */}
                      <div>
                        <span className="text-[7px] font-mono text-zinc-500 block mb-0.5 leading-none">WEG RÜBER (Crossfade)</span>
                        <select
                          id={`blend-mode-select-${item.id}`}
                          value={item.transitionType}
                          onChange={(e) => updateItem(item.id, { transitionType: e.target.value as any })}
                          className="w-full bg-zinc-950 text-zinc-350 border border-zinc-800 rounded p-0.5 text-[8px] outline-none focus:border-pink-500"
                        >
                          <option value="mix">🔄 GSCHEITER MIX</option>
                          <option value="fade">⬇️ RUHIGE KUGN</option>
                          <option value="rise">⬆️ HOCH-HUTZN</option>
                          <option value="drop">⚡ BASS-SCHELLE</option>
                        </select>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
