import React from 'react';
import { rhythmOrder, rhythmLabels, rhythmTags, instOrder, instNames, instIcons } from '../songsData';
import { AudioEngine } from '../audioEngine';

interface PerformanceSectionProps {
  globalRhythm: string;
  setGlobalRhythm: React.Dispatch<React.SetStateAction<string>>;
  drumDensity: 'sparse' | 'normal' | 'full';
  setDrumDensity: React.Dispatch<React.SetStateAction<'sparse' | 'normal' | 'full'>>;
  drumHat: 'off' | 'mixed' | 'open';
  setDrumHat: React.Dispatch<React.SetStateAction<'off' | 'mixed' | 'open'>>;
  liveInstOverride: string | null;
  setLiveInstOverride: React.Dispatch<React.SetStateAction<string | null>>;
  adjustOctaveMultiplier: (offset: number) => void;
  playManualKick: () => void;
  playManualCowbell: () => void;
  playManualSiren: () => void;
  setTransDisplayMessage: React.Dispatch<React.SetStateAction<string>>;
}

export default function PerformanceSection({
  globalRhythm,
  setGlobalRhythm,
  drumDensity,
  setDrumDensity,
  drumHat,
  setDrumHat,
  liveInstOverride,
  setLiveInstOverride,
  adjustOctaveMultiplier,
  playManualKick,
  playManualCowbell,
  playManualSiren,
  setTransDisplayMessage
}: PerformanceSectionProps) {
  const [fillStyle, setFillStyle] = React.useState<'snare_build' | 'double_time' | 'syncopated_funk'>(AudioEngine.fillType || 'snare_build');

  return (
    <div className="flex flex-col gap-4">
      {/* MANUALLY TRIGGERED SOUNDPADS */}
      <div className="bg-zinc-90 w-full bg-zinc-905 bg-opacity-90 border border-zinc-800 rounded-xl p-4 shadow-lg">
        <h3 className="text-xs font-bold text-zinc-400 uppercase font-mono tracking-widest mb-3">
          🔥 KRACH-KNÖPFE (Sound-Triggerpads)
        </h3>
        
        <div className="grid grid-cols-4 gap-2">
          {/* KICK pad */}
          <button
            id="pad-kick-hit-tab"
            onTouchStart={playManualKick}
            onMouseDown={playManualKick}
            className="bg-zinc-950 hover:bg-zinc-850 active:bg-cyan-550 active:text-black border border-zinc-800 p-3 rounded-lg text-xs font-bold text-zinc-300 font-sans cursor-pointer flex flex-col items-center gap-1 transition-all h-20 justify-center"
          >
            <span className="text-lg">🥁</span>
            <span className="text-[8px] font-mono tracking-wider font-extrabold text-cyan-400">WOATSCHN</span>
          </button>
          
          {/* COWBELL pad */}
          <button
            id="pad-cowbell-hit-tab"
            onTouchStart={playManualCowbell}
            onMouseDown={playManualCowbell}
            className="bg-zinc-950 hover:bg-zinc-850 active:bg-pink-550 active:text-black border border-zinc-800 p-3 rounded-lg text-xs font-bold text-zinc-300 font-sans cursor-pointer flex flex-col items-center gap-1 transition-all h-20 justify-center"
          >
            <span className="text-lg">🐮</span>
            <span className="text-[8px] font-mono tracking-wider font-extrabold text-pink-400">KUHGLOCKN</span>
          </button>

          {/* BRASS pad */}
          <button
            id="pad-horn-hit-tab"
            onClick={() => {
              if (AudioEngine.ctx) {
                AudioEngine.playInstrumentPattern(AudioEngine.ctx.currentTime, 'brass', 261.63);
                setTransDisplayMessage('🎺 GÖ, DO HAST AN GUPF-BLÄSA!');
              }
            }}
            className="bg-zinc-950 hover:bg-zinc-850 active:bg-yellow-550 active:text-black border border-zinc-800 p-3 rounded-lg text-xs font-bold text-zinc-300 font-sans cursor-pointer flex flex-col items-center gap-1 transition-all h-20 justify-center"
          >
            <span className="text-lg">🎺</span>
            <span className="text-[8px] font-mono tracking-wider font-extrabold text-yellow-400">BLÄSA</span>
          </button>

          {/* ALARM pad */}
          <button
            id="pad-siren-alarm-tab"
            onTouchStart={playManualSiren}
            onMouseDown={playManualSiren}
            className="bg-zinc-950 hover:bg-red-950 active:bg-red-500 border border-zinc-800 p-3 rounded-lg text-xs font-bold text-red-400 font-sans cursor-pointer flex flex-col items-center gap-1 transition-all h-20 justify-center"
          >
            <span className="text-lg">🚨</span>
            <span className="text-[8px] font-mono tracking-wider font-extrabold text-red-500">TATÜ-TATA</span>
          </button>
        </div>
      </div>

      {/* LEAD SYNTH COUPLER */}
      <div className="bg-zinc-90 w-full bg-zinc-905 bg-opacity-90 border border-zinc-800 rounded-xl p-4 shadow-lg">
        <h3 className="text-xs font-bold text-zinc-400 uppercase font-mono tracking-widest mb-3">
          🎹 STIMMEN fia de GEQUETSCHN
        </h3>

        <div className="space-y-4">
          <div>
            <span className="text-[8.5px] font-mono text-zinc-500 uppercase tracking-widest block mb-2 font-bold">
              HAISSE MELODIE-STIMMEN
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {instOrder.map((instKey, idx) => {
                const isCurrent = (liveInstOverride === null && instKey === '') || liveInstOverride === instKey;
                const label = instNames[idx];
                return (
                  <button
                    id={`synth-override-tab-${instKey || 'default'}`}
                    key={instKey}
                    onClick={() => {
                      const nextOverride = instKey === '' ? null : instKey;
                      setLiveInstOverride(nextOverride);
                      AudioEngine.liveInstOverride = nextOverride;
                      setTransDisplayMessage(`Stimm gwechselt auf: ${label}`);
                    }}
                    className={`py-2.5 px-2 bg-zinc-950 rounded-lg border text-[10px] cursor-pointer transition-all duration-100 flex items-center justify-center gap-1.5 font-sans
                      ${isCurrent 
                        ? 'bg-cyan-950 border-cyan-400 font-black text-cyan-400' 
                        : 'border-zinc-850 text-zinc-400 hover:border-zinc-700'
                      }`}
                  >
                    <span className="text-xs">{idx === 0 ? '🎸' : instIcons[instKey]}</span>
                    <span className="truncate">{idx === 0 ? 'Ur-Gequetsche' : label.split(' ')[1]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800">
            <button
              id="octave-down-tab"
              onClick={() => adjustOctaveMultiplier(-1)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white p-2.5 text-[9px] rounded-lg hover:bg-zinc-850 cursor-pointer text-center font-bold font-mono uppercase"
            >
              ⬇️ OKTAVN RUNTA (Tiefer duden)
            </button>
            <button
              id="octave-up-tab"
              onClick={() => adjustOctaveMultiplier(1)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white p-2.5 text-[9px] rounded-lg hover:bg-zinc-850 cursor-pointer text-center font-bold font-mono uppercase"
            >
              ⬆️ OKTAVN AUFI (Quiekn lossn)
            </button>
          </div>
        </div>
      </div>

      {/* BEAT RHYTHMS & GRID DENSITIES */}
      <div className="bg-zinc-90 w-full bg-zinc-905 bg-opacity-90 border border-zinc-800 rounded-xl p-4 shadow-lg">
        <h3 className="text-xs font-bold text-zinc-400 uppercase font-mono tracking-widest mb-3">
          🥁 BEAT-AUSWOHL & DIE GRUND-TAKTUNG
        </h3>

        <div className="flex flex-wrap gap-1.5 mb-3.5 max-w-full">
          {rhythmOrder.map((r) => {
            const isActive = globalRhythm === r;
            return (
              <button
                id={`rhythm-preset-tab-${r}`}
                key={r}
                onClick={() => {
                  setGlobalRhythm(r);
                  AudioEngine.globalRhythm = r;
                  setTransDisplayMessage(`Takt umgstoßen auf: ${rhythmLabels[r]}`);
                }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all border text-[9px] cursor-pointer font-sans shadow-sm select-none
                  ${isActive 
                    ? 'bg-pink-950/50 border-pink-500 font-extrabold text-pink-400' 
                    : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
              >
                <span className="font-extrabold">{rhythmLabels[r]}</span>
                <span className={`text-[7px] font-mono font-bold tracking-wider uppercase px-1 py-px rounded
                  ${isActive ? 'bg-pink-900/30 text-pink-350' : 'bg-zinc-900 text-zinc-550'}
                `}>{rhythmTags[r]}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-3 p-2.5 bg-zinc-950 rounded-lg border border-zinc-900">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-zinc-500 font-mono uppercase tracking-widest text-[8px] font-bold">SCHLÄGA-DICHTE (Dichte):</span>
            <div className="flex gap-1">
              {(['sparse', 'normal', 'full'] as const).map(d => {
                const text = d === 'sparse' ? 'NUR AB UND ZU' : d === 'normal' ? 'STINKNORMAL' : 'VOLLGAS';
                return (
                  <button
                    id={`density-select-tab-${d}`}
                    key={d}
                    onClick={() => {
                      setDrumDensity(d);
                      AudioEngine.drumDensity = d;
                    }}
                    className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase cursor-pointer
                      ${drumDensity === d ? 'bg-pink-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] pt-2 border-t border-zinc-900">
            <span className="text-zinc-500 font-mono uppercase tracking-widest text-[8px] font-bold">DECKE-TSCHINÖLN (Hat):</span>
            <div className="flex gap-1">
              {(['off', 'mixed', 'open'] as const).map(h => {
                const text = h === 'off' ? 'STAAD POSTAT' : h === 'mixed' ? 'GMISCHT' : 'SPERRANGELWEIT';
                return (
                  <button
                    id={`hat-select-tab-${h}`}
                    key={h}
                    onClick={() => {
                      setDrumHat(h);
                      AudioEngine.drumHat = h;
                    }}
                    className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase cursor-pointer
                      ${drumHat === h ? 'bg-cyan-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] pt-2 border-t border-zinc-900">
            <span className="text-zinc-500 font-mono uppercase tracking-widest text-[8px] font-bold">WIRBEL-ARTEN:</span>
            <div className="flex gap-1">
              {(['snare_build', 'double_time', 'syncopated_funk'] as const).map(f => {
                const label = f === 'snare_build' ? 'TROMMEL-WIRBEL' : f === 'double_time' ? 'RULL-HACKER' : 'FUNKENFLUG';
                const isSelected = fillStyle === f;
                return (
                  <button
                    id={`fill-style-tab-${f}`}
                    key={f}
                    onClick={() => {
                      setFillStyle(f);
                      AudioEngine.fillType = f;
                      setTransDisplayMessage(`💡 Wirbler gändert auf: ${label}`);
                    }}
                    className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all cursor-pointer
                      ${isSelected ? 'bg-amber-500 text-zinc-950 font-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            id="sudden-fill-btn-tab"
            onClick={() => {
              AudioEngine.triggerFill();
              const label = fillStyle === 'snare_build' ? 'TROMMEL-WIRBEL' : fillStyle === 'double_time' ? 'RULL-HACKER' : 'FUNKENFLUG';
              setTransDisplayMessage(`💥 SPIEL JETZT DEN ${label}-SCHEIDA!`);
            }}
            className="w-full mt-1 bg-amber-950 text-amber-400 border border-amber-800 text-[10px] py-2 rounded-lg font-black tracking-widest uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:bg-amber-500 hover:text-zinc-950 hover:shadow-lg hover:shadow-amber-500/20 active:scale-95"
          >
            💥 SOFORT-WIRBEL EINSCHIEBN, OIDA!
          </button>
        </div>
      </div>
    </div>
  );
}
