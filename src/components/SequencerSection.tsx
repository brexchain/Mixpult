import React from 'react';
import { songsData, rhythmOrder, rhythmLabels, rhythmTags, instOrder, instNames } from '../songsData';
import { CompositionBlock } from '../types';

interface SequencerSectionProps {
  composition: CompositionBlock[];
  setComposition: React.Dispatch<React.SetStateAction<CompositionBlock[]>>;
  compPlaybackActive: boolean;
  setCompPlaybackActive: React.Dispatch<React.SetStateAction<boolean>>;
  loopCompActive: boolean;
  setLoopCompActive: React.Dispatch<React.SetStateAction<boolean>>;
  activeSongKey: string;
  removeTimelineBlock: (id: number) => void;
  updateTimelineBlock: (id: number, updates: Partial<CompositionBlock>) => void;
  addToTimeline: (songKey: string) => void;
  setTransDisplayMessage: React.Dispatch<React.SetStateAction<string>>;
  compActiveBlockId?: number | null;
}

export default function SequencerSection({
  composition,
  setComposition,
  compPlaybackActive,
  setCompPlaybackActive,
  loopCompActive,
  setLoopCompActive,
  activeSongKey,
  removeTimelineBlock,
  updateTimelineBlock,
  addToTimeline,
  setTransDisplayMessage,
  compActiveBlockId
}: SequencerSectionProps) {
  const moveBlock = (index: number, direction: 'left' | 'right') => {
    if (direction === 'left' && index === 0) return;
    if (direction === 'right' && index === composition.length - 1) return;
    
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    const newComposition = [...composition];
    const temp = newComposition[index];
    newComposition[index] = newComposition[targetIndex];
    newComposition[targetIndex] = temp;
    setComposition(newComposition);
    
    const songName = songsData[temp.songKey]?.label || 'Song';
    setTransDisplayMessage(`↕ Umgereiht: "${songName}" rutscht nach ${direction === 'left' ? 'vorne' : 'hinten'}!`);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* SEQUENCER TIMELINE */}
      <div className="bg-zinc-90 w-full bg-zinc-905 bg-opacity-90 border border-zinc-800 rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-black tracking-wider text-yellow-400 uppercase font-sans">
              🎼 HADERN-REIHUNG (Spielistn)
            </h2>
          </div>

          <button
            id="seq-clear-btn-tab"
            onClick={() => {
              setComposition([]);
              setCompPlaybackActive(false);
              setTransDisplayMessage('Spielistn glöscht, gähnende Leere!');
            }}
            className="bg-zinc-950 text-red-500 border border-zinc-850 px-2.5 py-1 text-[9px] rounded-lg transition-all font-bold cursor-pointer font-sans"
          >
            OIS LÖSCHN
          </button>
        </div>

        {/* Set list options */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            id="seq-playback-toggle-tab"
            disabled={composition.length === 0}
            onClick={() => {
              const nextPlaying = !compPlaybackActive;
              setCompPlaybackActive(nextPlaying);
              if (nextPlaying) {
                setTransDisplayMessage('🎼 HADERN-REIHUNG GESTARTET, SPÜ MA AUF!');
              } else {
                setTransDisplayMessage('Hadern-Maschin pausiert, gemma eahm a Ruh!');
              }
            }}
            className={`text-[10px] font-mono p-3 rounded-lg font-black transition-all cursor-pointer border flex items-center justify-center gap-1
              ${compPlaybackActive 
                ? 'bg-amber-500 border-amber-400 text-black shadow-md' 
                : 'bg-zinc-950 border-zinc-850 text-zinc-400'
              }`}
          >
            <span>{compPlaybackActive ? '⏹' : '▶'}</span>
            <span>{compPlaybackActive ? 'SET STAD STÖN' : 'SPIELISTN STARTN'}</span>
          </button>

          <button
            id="seq-loop-toggle-tab"
            onClick={() => setLoopCompActive(!loopCompActive)}
            className={`text-[10px] font-mono p-3 rounded-lg font-bold transition-all cursor-pointer border flex items-center justify-center gap-1.5
              ${loopCompActive 
                ? 'bg-purple-950 text-purple-400 border-purple-800' 
                : 'bg-zinc-950 border-zinc-850 text-zinc-550'
              }`}
          >
            <span>🔁</span>
            <span>Dauerschleifn: {loopCompActive ? 'JA' : 'NEIN'}</span>
          </button>
        </div>

        {/* Quick add elements list */}
        <div className="mb-4 bg-zinc-950 p-3 border border-zinc-900 rounded-lg">
          <span className="text-[8px] font-mono text-zinc-550 uppercase tracking-widest block mb-2 font-black">
            + KACHELN ZUM SOFORTANREIHEN:
          </span>
          <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
            {Object.keys(songsData).map(key => (
              <button
                id={`direct-seq-add-tab-${key}`}
                key={key}
                onClick={() => addToTimeline(key)}
                className="w-28 bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-zinc-350 px-2.5 py-1.5 rounded-lg text-[9.5px] font-sans transition-all flex items-center gap-1 justify-center cursor-pointer shrink-0"
              >
                <span>{songsData[key].emoji}</span>
                <span className="truncate">{songsData[key].label}</span>
                <span className="text-[7.5px] font-mono font-black text-amber-400 shrink-0">({songsData[key].bpm})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic slots list */}
        <div className="flex flex-row gap-3 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-zinc-950">
          {composition.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-zinc-800/60 rounded-xl w-full min-h-[140px]">
              <span className="text-zinc-500 text-[10.5px] font-sans">Geh herst, deine Spielistn is noch staubtrockn und leer!</span>
              <span className="text-zinc-600 text-[8px] mt-1 font-mono max-w-[210px] leading-relaxed mx-auto uppercase">Druck do oben auf de Kacheln, um de Spielistn mit feinem Gequetsche aufzufülln!</span>
            </div>
          ) : (
            composition.map((block, idx) => {
              const song = songsData[block.songKey];
              if (!song) return null;
              const isCurrentlyPlayingBlock = compPlaybackActive && block.id === compActiveBlockId;

              return (
                <div
                  key={`${block.id}-${idx}`}
                  style={{ borderTopColor: song.color }}
                  className={`w-[195px] shrink-0 bg-zinc-950 border border-zinc-850 rounded-lg p-3 border-t-[3.5px] transition-all flex flex-col justify-between
                    ${isCurrentlyPlayingBlock 
                      ? 'border-yellow-400 bg-yellow-950/15 shadow-[0_0_12px_rgba(234,179,8,0.22)]' 
                      : 'hover:border-zinc-750'
                    }`}
                >
                  {/* Slots card header with indices, reordering shifts and remove controls */}
                  <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-zinc-900/60">
                    <span className="text-[8.5px] font-mono text-zinc-400 font-extrabold tracking-wide uppercase">HADERN {idx + 1}</span>
                    <div className="flex items-center gap-1">
                      {/* Shifting sequence block rearrange */}
                      <button
                        id={`block-move-left-${block.id}`}
                        onClick={() => moveBlock(idx, 'left')}
                        disabled={idx === 0}
                        className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-mono font-black border transition-all active:scale-90 cursor-pointer
                          ${idx === 0 
                            ? 'border-zinc-900 text-zinc-700 cursor-not-allowed opacity-20' 
                            : 'border-zinc-800 text-cyan-400 bg-zinc-90 w-full bg-zinc-900 hover:bg-zinc-800'
                          }`}
                        title="Nach links schliafn"
                      >
                        ←
                      </button>
                      <button
                        id={`block-move-right-${block.id}`}
                        onClick={() => moveBlock(idx, 'right')}
                        disabled={idx === composition.length - 1}
                        className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-mono font-black border transition-all active:scale-90 cursor-pointer
                          ${idx === composition.length - 1 
                            ? 'border-zinc-900 text-zinc-700 cursor-not-allowed opacity-20' 
                            : 'border-zinc-800 text-cyan-400 bg-zinc-90 w-full bg-zinc-900 hover:bg-zinc-800'
                          }`}
                        title="Nach rechts schliafn"
                      >
                        →
                      </button>
                      <button
                        id={`remove-block-tab-${block.id}`}
                        onClick={() => removeTimelineBlock(block.id)}
                        className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold border border-red-950 text-red-500 bg-red-950/10 hover:bg-red-950/40 hover:border-red-800 transition active:scale-90 cursor-pointer"
                        title="Ausm Set werfen"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Title row */}
                  <div className="flex items-center gap-1.5 my-1">
                    <span className="text-sm shrink-0">{song.emoji}</span>
                    <span className="font-sans font-black text-[11.5px] text-white truncate max-w-[135px]" style={{ color: song.color || '#fff' }}>
                      {song.label}
                    </span>
                  </div>

                  {/* Custom parameters layout inside the card */}
                  <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-zinc-900/60 text-[8.5px] font-mono">
                    {/* Interactive BPM Setter */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[7.5px] text-zinc-500 uppercase font-bold">GESCHWIND:</span>
                      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-850 px-1 py-0.5 rounded">
                        <button
                          id={`block-bpm-dec-tab-${block.id}`}
                          onClick={() => updateTimelineBlock(block.id, { bpm: Math.max(60, block.bpm - 5) })}
                          className="text-zinc-400 hover:text-white font-black cursor-pointer px-1 active:scale-90 transition-all text-[8px]"
                        >
                          -
                        </button>
                        <span className="font-bold text-zinc-350 text-[8px] min-w-[34px] text-center">{block.bpm} BPM</span>
                        <button
                          id={`block-bpm-inc-tab-${block.id}`}
                          onClick={() => updateTimelineBlock(block.id, { bpm: Math.min(220, block.bpm + 5) })}
                          className="text-zinc-400 hover:text-white font-black cursor-pointer px-1 active:scale-90 transition-all text-[8px]"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Custom Duration BARS Controller */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[7.5px] text-zinc-500 uppercase font-bold">TAKTE:</span>
                      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-850 px-1 py-0.5 rounded">
                        <button
                          id={`block-bars-dec-tab-${block.id}`}
                          onClick={() => updateTimelineBlock(block.id, { bars: Math.max(1, block.bars - 1) })}
                          className="text-zinc-400 hover:text-white font-black cursor-pointer px-1 active:scale-90 transition-all text-[8px]"
                          title="Zruckdrehn"
                        >
                          -
                        </button>
                        <span className="font-bold text-zinc-350 text-[8px] min-w-[34px] text-center">{block.bars} TAKTE</span>
                        <button
                          id={`block-bars-inc-tab-${block.id}`}
                          onClick={() => updateTimelineBlock(block.id, { bars: Math.min(32, block.bars + 1) })}
                          className="text-zinc-400 hover:text-white font-black cursor-pointer px-1 active:scale-90 transition-all text-[8px]"
                          title="Fuaß aufs Gas"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Lead Solo Selection */}
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="text-[7.5px] text-zinc-500 uppercase font-bold shrink-0">SOLO-STIMM:</span>
                      <select
                        id={`block-inst-select-${block.id}`}
                        value={block.instIndex !== undefined ? block.instIndex : 0}
                        onChange={(e) => updateTimelineBlock(block.id, { instIndex: parseInt(e.target.value) })}
                        className="bg-zinc-900 text-cyan-400 border border-zinc-850 text-[8px] font-mono font-bold rounded px-1.5 py-0.5 outline-none cursor-pointer focus:border-cyan-500 hover:border-zinc-700 transition flex-1 max-w-[110px] truncate"
                      >
                        {instNames.map((name, i) => (
                          <option key={i} value={i} className="bg-zinc-950 text-zinc-300 font-mono text-[8px]">
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
