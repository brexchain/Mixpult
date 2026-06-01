import React from 'react';
import { Zap, Radio, RefreshCw } from 'lucide-react';

interface MixerSectionProps {
  kickVol: number;
  snareVol: number;
  subVol: number;
  leadVol: number;
  masterVol: number;
  kickMute: boolean;
  snareMute: boolean;
  subMute: boolean;
  leadMute: boolean;
  masterMute: boolean;
  updateStemVolume: (ch: string, sliderVal: number) => void;
  toggleMuteStemState: (ch: string) => void;
  xyPos: { x: number; y: number };
  padRef: React.RefObject<HTMLDivElement | null>;
  handleXyPadGesture: (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => void;
  handleXyTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  subOverdrive: number;
  setSubOverdrive: React.Dispatch<React.SetStateAction<number>>;
  isDistorted: boolean;
  setIsDistorted: React.Dispatch<React.SetStateAction<boolean>>;
  isScreaming: boolean;
  setIsScreaming: React.Dispatch<React.SetStateAction<boolean>>;
  isEchoEnabled: boolean;
  setIsEchoEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  AudioEngine: any;
  zValue: number;
  handleZValueChange: (val: number) => void;
  tempo: number;
  handleBpmSlideChange: (val: number) => void;
  handleTapTempo: () => void;
}

export default function MixerSection({
  kickVol,
  snareVol,
  subVol,
  leadVol,
  masterVol,
  kickMute,
  snareMute,
  subMute,
  leadMute,
  masterMute,
  updateStemVolume,
  toggleMuteStemState,
  xyPos,
  padRef,
  handleXyPadGesture,
  handleXyTouchStart,
  subOverdrive,
  setSubOverdrive,
  isDistorted,
  setIsDistorted,
  isScreaming,
  setIsScreaming,
  isEchoEnabled,
  setIsEchoEnabled,
  AudioEngine,
  zValue,
  handleZValueChange,
  tempo,
  handleBpmSlideChange,
  handleTapTempo
}: MixerSectionProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const animationRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    // 3D Rotation helper
    const rotate3D = (x: number, y: number, z: number, pitch: number, yaw: number, roll: number) => {
      // 1. Pitch (X axis rotation)
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const y1 = y * cosP - z * sinP;
      const z1 = y * sinP + z * cosP;
      const x1 = x;

      // 2. Yaw (Y axis rotation)
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const x2 = x1 * cosY + z1 * sinY;
      const z2 = -x1 * sinY + z1 * cosY;
      const y2 = y1;

      // 3. Roll (Z axis rotation)
      const cosR = Math.cos(roll);
      const sinR = Math.sin(roll);
      const x3 = x2 * cosR - y2 * sinR;
      const y3 = x2 * sinR + y2 * cosR;
      const z3 = z2;

      return { x: x3, y: y3, z: z3 };
    };

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }
      
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
      
      const width = canvas.width;
      const height = canvas.height;
      
      // Clear with elegant high-tech background glow
      ctx.fillStyle = 'rgba(9, 9, 11, 0.22)'; 
      ctx.fillRect(0, 0, width, height);
      
      // Setup projection values
      const cx = width / 2;
      const cy = height / 2;
      const F = 155; // focal length scale
      const zOffset = 210; // offset back to prevent clipping/division by zero

      const time = Date.now() * 0.0015;
      
      // Pitch/Tilt representing panning around the horizontal plane
      // y-axis drives pitch: 0.1 to PI-0.1 radians
      const pitchTarget = 0.15 + (xyPos.y / 100) * (Math.PI - 0.3);
      const pitch = pitchTarget; 

      // x-axis drives yaw camera rotation
      const yaw = time * 0.28 + ((xyPos.x - 50) / 100) * Math.PI * 2;
      const roll = time * 0.08; 

      // Sortable projection list for Painter's algorithm
      interface RenderElement {
        type: 'line' | 'spark';
        z: number;
        x1?: number;
        y1?: number;
        x2?: number;
        y2?: number;
        color?: string;
        width?: number;
        cx?: number;
        cy?: number;
        radius?: number;
        hue?: number;
      }
      const queue: RenderElement[] = [];

      // Procedural formula for point in the 3D magnetic hourglass vortex
      const getVortexPoint = (t: number, phi: number) => {
        // t is height parameter from -1.0 to 1.0 (longitudinal flow)
        const z_coord = t * 70; 

        // R = hourglass magnetic flux tube geometry
        // pinch density / radius adjusts with zValue
        const baseR = 30 + (t * t) * 60;
        const multiplier = 0.35 + zValue * 1.35;
        const ripple = Math.sin(t * 8.0 - time * 7.5) * (5.5 * zValue);
        const R = Math.max(8, baseR * multiplier + ripple);

        // Twisting the field lines around the center core
        const twist = t * (4.0 + zValue * 8.0);
        const theta = phi + twist + time * 0.6;

        return {
          x: R * Math.cos(theta),
          y: R * Math.sin(theta),
          z: z_coord
        };
      };

      // 1. Add background magnetic orientation disks / rings
      const ringHeights = [-66, 0, 66];
      const ringSegments = 32;
      for (const rh of ringHeights) {
        // center ring matches core, upper/lower match standard expansion
        const ringRadius = (rh === 0 ? 35 : 90) * (0.35 + zValue * 1.35);
        let prevRProj: { x: number; y: number; z: number } | null = null;
        
        for (let s = 0; s <= ringSegments; s++) {
          const angle = (s / ringSegments) * Math.PI * 2;
          const px = ringRadius * Math.cos(angle);
          const py = ringRadius * Math.sin(angle);
          const pz = rh;

          const r3D = rotate3D(px, py, pz, pitch, yaw, roll);
          const zScreen = r3D.z + zOffset;
          if (zScreen <= 12) continue;

          const sx = cx + (r3D.x * F) / zScreen;
          const sy = cy + (r3D.y * F) / zScreen;
          const currRProj = { x: sx, y: sy, z: r3D.z };

          if (prevRProj !== null) {
            const midZ = (prevRProj.z + currRProj.z) / 2;
            const ringHue = rh === 0 ? 320 : (rh < 0 ? 195 : 280);
            queue.push({
              type: 'line',
              z: midZ,
              x1: prevRProj.x,
              y1: prevRProj.y,
              x2: currRProj.x,
              y2: currRProj.y,
              color: `hsla(${ringHue}, 90%, 55%, ${rh === 0 ? 0.08 : 0.04})`,
              width: Math.max(0.6, (1.8 * F) / zScreen)
            });
          }
          prevRProj = currRProj;
        }
      }

      // 2. Add 12 spiral magnetic flux tube strands
      const numStrands = 12;
      const pointsPerStrand = 26;
      for (let c = 0; c < numStrands; c++) {
        const phi = (c * Math.PI * 2) / numStrands;
        let prevProj: { x: number; y: number; z: number } | null = null;

        for (let i = 0; i < pointsPerStrand; i++) {
          const t = -1.0 + (i / (pointsPerStrand - 1)) * 2.0;
          const p3D = getVortexPoint(t, phi);
          const r3D = rotate3D(p3D.x, p3D.y, p3D.z, pitch, yaw, roll);

          const zScreen = r3D.z + zOffset;
          if (zScreen <= 12) continue;

          const sx = cx + (r3D.x * F) / zScreen;
          const sy = cy + (r3D.y * F) / zScreen;
          const currProj = { x: sx, y: sy, z: r3D.z };

          if (prevProj !== null) {
            const midZ = (prevProj.z + currProj.z) / 2;
            const hue = (Math.round((phi * 180) / Math.PI) + Math.round(time * 28)) % 360;
            // Lines closer to current foreground have more brightness
            const opacity = Math.min(0.65, (400 / zScreen) * 0.35);

            queue.push({
              type: 'line',
              z: midZ,
              x1: prevProj.x,
              y1: prevProj.y,
              x2: currProj.x,
              y2: currProj.y,
              color: `hsla(${hue}, 95%, 62%, ${opacity})`,
              width: Math.max(0.65, (2.6 * F) / zScreen)
            });
          }
          prevProj = currProj;
        }
      }

      // 3. Add magnetic floating spark particles flowing along the strands
      const particlesPerStrand = 1;
      for (let c = 0; c < numStrands; c++) {
        const phi = (c * Math.PI * 2) / numStrands;
        for (let p = 0; p < particlesPerStrand; p++) {
          const speed = 0.4 + zValue * 0.7; // flow matches Z velocity
          const offset = (c / numStrands) + (p / particlesPerStrand);
          const progress = (time * speed + offset) % 1.0;
          const t = -1.0 + progress * 2.0;

          const p3D = getVortexPoint(t, phi);
          const r3D = rotate3D(p3D.x, p3D.y, p3D.z, pitch, yaw, roll);

          const zScreen = r3D.z + zOffset;
          if (zScreen <= 12) continue;

          const sx = cx + (r3D.x * F) / zScreen;
          const sy = cy + (r3D.y * F) / zScreen;

          const hue = (Math.round((phi + time) * (180 / Math.PI)) + 140) % 360;
          const baseRadius = (8.5 * F) / zScreen;

          queue.push({
            type: 'spark',
            z: r3D.z,
            cx: sx,
            cy: sy,
            radius: Math.max(1.8, baseRadius * (1.0 + Math.sin(time * 14 + c) * 0.3)),
            hue: hue
          });
        }
      }

      // 4. Add dynamic glowing singularity core at coordinate center (0, 0, 0)
      const core3D = rotate3D(0, 0, 0, pitch, yaw, roll);
      const coreZScreen = core3D.z + zOffset;
      if (coreZScreen > 12) {
        const coreX = cx + (core3D.x * F) / coreZScreen;
        const coreY = cy + (core3D.y * F) / coreZScreen;
        const coreRad = Math.max(4, (28 * F) / coreZScreen) * (0.85 + Math.sin(time * 16) * 0.15);

        queue.push({
          type: 'spark',
          z: core3D.z + 1.5, // render core in front
          cx: coreX,
          cy: coreY,
          radius: coreRad * (1.0 + zValue * 0.5),
          hue: 332 // cosmic high-energy plasma magenta core
        });
      }

      // Painter's sorting algorithm: items furthest back (Z values smallest closer to -150)
      // wait! in our rotation, positive Z might depend on rotate3D.
      // Let's sort by item.z ascending: items with SMALLER z are further back (rendered first)
      queue.sort((a, b) => a.z - b.z);

      // Render all items in depth order
      for (const item of queue) {
        if (item.type === 'line') {
          ctx.strokeStyle = item.color!;
          ctx.lineWidth = item.width!;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(item.x1!, item.y1!);
          ctx.lineTo(item.x2!, item.y2!);
          ctx.stroke();
        } else if (item.type === 'spark') {
          ctx.beginPath();
          const pGrad = ctx.createRadialGradient(
            item.cx!, item.cy!, 0,
            item.cx!, item.cy!, item.radius!
          );
          pGrad.addColorStop(0, '#ffffff');
          pGrad.addColorStop(0.25, `hsla(${item.hue}, 100%, 72%, 1.0)`);
          pGrad.addColorStop(0.6, `hsla(${item.hue}, 95%, 55%, 0.35)`);
          pGrad.addColorStop(1, 'rgba(0,0,0,0)');
          
          ctx.fillStyle = pGrad;
          ctx.arc(item.cx!, item.cy!, item.radius!, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Subtle feedback crosshair locator marker
      const px = (xyPos.x / 100) * width;
      const py = (xyPos.y / 100) * height;
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Target Reticle
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.moveTo(px - 10, py); ctx.lineTo(px + 10, py);
      ctx.moveTo(px, py - 10); ctx.lineTo(px, py + 10);
      ctx.stroke();

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [xyPos, zValue]);
  return (
    <div className="flex flex-col gap-4">
      {/* MIXER TRACK STEMS SLIDERS GRID */}
      <div className="bg-zinc-90 w-full bg-zinc-905 bg-opacity-90 border border-zinc-800 rounded-xl p-4 shadow-lg">
        <h2 className="text-sm font-black tracking-wider text-pink-400 uppercase font-sans mb-3 flex items-center justify-between">
          <span>🎛️ MISCHPULT-MAESTRO</span>
          <span className="text-[8.5px] font-mono text-zinc-500 uppercase">PEGEL-REGLER FÜR DE BLUETOOTH-KISTN</span>
        </h2>

        {/* Live Tempo Slider Controller (moved here above rig channel mixer so no info is hidden in mobile view) */}
        <div className="flex items-center justify-between gap-2.5 bg-zinc-950 p-2.5 rounded-lg border border-zinc-90 w-full bg-zinc-905 bg-opacity-90 mb-3">
          <div className="flex items-center gap-1 text-[9.5px] font-mono shrink-0">
            <span className="text-zinc-550">GESCHWINDIGKEIT:</span>
            <span className="text-cyan-400 font-black">{tempo}</span>
            <span className="text-[7.5px] text-zinc-650">BPM</span>
          </div>

          <div className="flex-grow flex items-center min-w-[100px] px-1">
            <input
              id="bpm-slider"
              type="range"
              min="65"
              max="175"
              value={tempo}
              onChange={(e) => handleBpmSlideChange(Number(e.target.value))}
              className="accent-pink-500 w-full cursor-pointer h-1.5 rounded-lg appearance-none bg-zinc-800"
            />
          </div>

          <button
            id="tap-tempo-btn"
            onClick={handleTapTempo}
            className="bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-[8.5px] font-bold px-1.5 py-0.5 rounded border border-zinc-700 font-sans cursor-pointer transition-colors"
            title="Takt mitm Finger einklopfen, Oida!"
          >
            KLOPFN
          </button>
        </div>

        {/* Vertically constrained, spaced channels with explicit width to prevent overlap */}
        <div className="flex gap-1 justify-between bg-zinc-950 p-3 rounded-lg border border-zinc-900">
          
          {/* KICK */}
          <div className="flex flex-col items-center gap-2 flex-1 min-w-[38px] max-w-[52px]">
            <span className="text-[9px] text-zinc-400 font-mono uppercase font-bold text-center">BUMM</span>
            <div className="h-24 flex items-center justify-center">
              <input
                id="kick-volume-slider"
                type="range"
                min="0"
                max="1.5"
                step="0.01"
                value={kickVol}
                onChange={(e) => updateStemVolume('kick', parseFloat(e.target.value))}
                className="accent-cyan-400 w-6 h-24 mx-auto cursor-pointer touch-none"
                style={{ 
                  writingMode: 'bt-lr', 
                  WebkitAppearance: 'slider-vertical',
                  appearance: 'slider-vertical' as any,
                  width: '18px',
                  height: '90px'
                }}
                {...{ orient: "vertical" }}
              />
            </div>
            <button
              id="kick-mute-btn"
              onClick={() => toggleMuteStemState('kick')}
              className={`w-11 h-[22px] rounded text-[8.5px] font-bold leading-none select-none transition-all border cursor-pointer flex items-center justify-center font-mono active:scale-95
                ${!kickMute 
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800 shadow-[0_0_8px_rgba(16,185,129,0.30)] animate-pulse' 
                  : 'bg-red-950/80 text-red-500 border-red-920/80 hover:bg-red-900/30'
                }`}
            >
              {kickMute ? 'STILL' : `LAUT:${Math.round(kickVol * 10)}`}
            </button>
          </div>

          {/* SNARE */}
          <div className="flex flex-col items-center gap-2 flex-1 min-w-[38px] max-w-[52px]">
            <span className="text-[9px] text-zinc-400 font-mono uppercase font-bold text-center">TSCH</span>
            <div className="h-24 flex items-center justify-center">
              <input
                id="snare-volume-slider"
                type="range"
                min="0"
                max="1.5"
                step="0.01"
                value={snareVol}
                onChange={(e) => updateStemVolume('snare', parseFloat(e.target.value))}
                className="accent-pink-500 w-6 h-24 mx-auto cursor-pointer touch-none"
                style={{ 
                  writingMode: 'bt-lr', 
                  WebkitAppearance: 'slider-vertical',
                  appearance: 'slider-vertical' as any,
                  width: '18px',
                  height: '90px'
                }}
                {...{ orient: "vertical" }}
              />
            </div>
            <button
              id="snare-mute-btn"
              onClick={() => toggleMuteStemState('snare')}
              className={`w-11 h-[22px] rounded text-[8.5px] font-bold leading-none select-none transition-all border cursor-pointer flex items-center justify-center font-mono active:scale-95
                ${!snareMute 
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800 shadow-[0_0_8px_rgba(16,185,129,0.30)] animate-pulse' 
                  : 'bg-red-950/80 text-red-500 border-red-920/80 hover:bg-red-900/30'
                }`}
            >
              {snareMute ? 'STILL' : `LAUT:${Math.round(snareVol * 10)}`}
            </button>
          </div>

          {/* SUB BASS */}
          <div className="flex flex-col items-center gap-2 flex-1 min-w-[38px] max-w-[52px]">
            <span className="text-[9px] text-purple-400 font-mono uppercase font-bold text-center">WUMM</span>
            <div className="h-24 flex items-center justify-center">
              <input
                id="sub-volume-slider"
                type="range"
                min="0"
                max="1.5"
                step="0.01"
                value={subVol}
                onChange={(e) => updateStemVolume('sub', parseFloat(e.target.value))}
                className="accent-purple-500 w-6 h-24 mx-auto cursor-pointer touch-none"
                style={{ 
                  writingMode: 'bt-lr', 
                  WebkitAppearance: 'slider-vertical',
                  appearance: 'slider-vertical' as any,
                  width: '18px',
                  height: '90px'
                }}
                {...{ orient: "vertical" }}
              />
            </div>
            <button
              id="sub-mute-btn"
              onClick={() => toggleMuteStemState('sub')}
              className={`w-11 h-[22px] rounded text-[8.5px] font-bold leading-none select-none transition-all border cursor-pointer flex items-center justify-center font-mono active:scale-95
                ${!subMute 
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800 shadow-[0_0_8px_rgba(16,185,129,0.30)]' 
                  : 'bg-red-950/80 text-red-500 border-red-920/80 hover:bg-red-900/30'
                }`}
            >
              {subMute ? 'STILL' : `LAUT:${Math.round(subVol * 10)}`}
            </button>
          </div>

          {/* MELODY LEAD */}
          <div className="flex flex-col items-center gap-2 flex-1 min-w-[38px] max-w-[52px]">
            <span className="text-[9px] text-emerald-400 font-mono uppercase font-bold text-center">GIGL</span>
            <div className="h-24 flex items-center justify-center">
              <input
                id="lead-volume-slider"
                type="range"
                min="0"
                max="1.5"
                step="0.01"
                value={leadVol}
                onChange={(e) => updateStemVolume('lead', parseFloat(e.target.value))}
                className="accent-emerald-400 w-6 h-24 mx-auto cursor-pointer touch-none"
                style={{ 
                  writingMode: 'bt-lr', 
                  WebkitAppearance: 'slider-vertical',
                  appearance: 'slider-vertical' as any,
                  width: '18px',
                  height: '90px'
                }}
                {...{ orient: "vertical" }}
              />
            </div>
            <button
              id="lead-mute-btn"
              onClick={() => toggleMuteStemState('lead')}
              className={`w-11 h-[22px] rounded text-[8.5px] font-bold leading-none select-none transition-all border cursor-pointer flex items-center justify-center font-mono active:scale-95
                ${!leadMute 
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800 shadow-[0_0_8px_rgba(16,185,129,0.30)]' 
                  : 'bg-red-950/80 text-red-500 border-red-920/80 hover:bg-red-900/30'
                }`}
            >
              {leadMute ? 'STILL' : `LAUT:${Math.round(leadVol * 10)}`}
            </button>
          </div>

          {/* MASTER */}
          <div className="flex flex-col items-center gap-2 flex-1 min-w-[38px] max-w-[52px]">
            <span className="text-[9px] text-amber-500 font-mono uppercase font-bold text-center">SUMM</span>
            <div className="h-24 flex items-center justify-center">
              <input
                id="master-volume-slider"
                type="range"
                min="0"
                max="1.5"
                step="0.01"
                value={masterVol}
                onChange={(e) => updateStemVolume('master', parseFloat(e.target.value))}
                className="accent-amber-500 w-6 h-24 mx-auto cursor-pointer touch-none"
                style={{ 
                  writingMode: 'bt-lr', 
                  WebkitAppearance: 'slider-vertical',
                  appearance: 'slider-vertical' as any,
                  width: '18px',
                  height: '90px'
                }}
                {...{ orient: "vertical" }}
              />
            </div>
            <button
              id="master-mute-indicator"
              onClick={() => toggleMuteStemState('master')}
              className={`w-11 h-[22px] rounded text-[8.5px] font-bold leading-none select-none transition-all border cursor-pointer flex items-center justify-center font-mono active:scale-95
                ${!masterMute 
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800 shadow-[0_0_8px_rgba(16,185,129,0.30)]' 
                  : 'bg-red-950/80 text-red-500 border-red-920/80 hover:bg-red-900/30'
                }`}
            >
              {masterMute ? 'STILL' : `LAUT:${Math.round(masterVol * 10)}`}
            </button>
          </div>

        </div>
      </div>

      {/* FILTER COUPLER SWEEPER */}
      <div className="bg-zinc-90 w-full bg-zinc-905 bg-opacity-90 border border-zinc-800 rounded-xl p-4 shadow-lg">
        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block mb-1.5 font-bold">
          🎛️ XY-DUDEL-VORTEX (Filter & Resonanz)
        </span>
        
        <div
          id="xy-filter-pad"
          ref={padRef}
          onMouseDown={(e) => {
            handleXyPadGesture(e);
            const onMove = (ev: MouseEvent) => handleXyPadGesture(ev as any);
            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
          onTouchStart={handleXyTouchStart}
          onTouchMove={handleXyPadGesture}
          onWheel={(e) => {
            e.preventDefault();
            const delta = e.deltaY * -0.002;
            const nextZ = Math.max(0, Math.min(1.0, zValue + delta));
            handleZValueChange(nextZ);
          }}
          className="w-full h-[150px] bg-zinc-950 border border-pink-500 rounded-lg relative overflow-hidden cursor-crosshair touch-none shadow-inner"
        >
          {/* Fibonacci Vortex Canvas Layer */}
          <canvas 
            ref={canvasRef} 
            className="absolute inset-0 w-full h-full pointer-events-none" 
          />

          {/* Visual grid lines */}
          <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 opacity-[0.03] pointer-events-none">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="border border-white" />
            ))}
          </div>

          {/* Glowing cursor reticle */}
          <div 
            className="absolute w-5 h-5 bg-pink-500 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_15px_rgba(236,72,153,1)] border border-white"
            style={{ left: `${xyPos.x}%`, top: `${xyPos.y}%` }}
          />
          
          {/* Legend */}
          <div className="absolute inset-x-3 bottom-2 flex justify-between pointer-events-none text-[8.5px] text-zinc-300 font-mono bg-zinc-950/80 px-2 py-0.5 rounded backdrop-blur-sm border border-zinc-900/40">
            <span>X-DÄMPFUNG: {Math.round(xyPos.x * 160)} Hz</span>
            <span>Y-RESONANZ: {Math.round(xyPos.y)}%</span>
            <span>Z-WIRBELTIEFE: {Math.round(zValue * 100)}%</span>
          </div>
        </div>

        {/* Z-AXIS FIBONACCI CONTROLLER */}
        <div id="z-axis-panel" className="mt-3 bg-zinc-950 p-3 rounded-lg border border-zinc-900">
          <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 mb-2">
            <span className="flex items-center gap-1.5 text-zinc-300 font-bold uppercase tracking-wider">
              <span className="inline-block w-2 h-2 rounded-full bg-pink-500 animate-ping"></span>
              🌀 KOSMISCHE Z-ACHSE: WIRBELTIEFE
            </span>
            <span className="text-pink-500 font-black">
              {Math.round(zValue * 100)}% (ECHO-ABKLINGEN: {(zValue * 0.85).toFixed(2)})
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-mono text-zinc-600">STILL</span>
            <input
              id="z-axis-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={zValue}
              onChange={(e) => handleZValueChange(parseFloat(e.target.value))}
              className="flex-grow accent-pink-500 cursor-pointer h-2 bg-zinc-90 w-full bg-zinc-905 bg-opacity-90 rounded-full"
            />
            <span className="text-[9px] font-mono text-zinc-600">VUI</span>
          </div>
          <div className="mt-2 text-[8px] text-zinc-500 font-mono text-center leading-normal">
            💡 SCHMÄH-TIPP: Scroll mitn Mausradl direkt überm XY-Pad, um die Z-Vortex-Wirbeltiefe feinzujustiern!
          </div>
        </div>
      </div>

      {/* FX OVERDRIVE MATRIX */}
      <div className="bg-zinc-90 w-full bg-zinc-905 bg-opacity-90 border border-zinc-800 rounded-xl p-4 shadow-lg">
        <h3 className="text-xs font-bold text-zinc-400 uppercase font-mono tracking-widest mb-3">
          🔥 ANALOGE EFFEKT-KISTN
        </h3>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
              <span className="text-zinc-500">BASS-ZUNDER (Overdrive)</span>
              <span className="text-pink-400 font-bold">{subOverdrive}</span>
            </div>
            <input
              id="sub-overdrive"
              type="range"
              min="1"
              max="99"
              value={subOverdrive}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSubOverdrive(v);
                AudioEngine.updateSubDrive(v);
              }}
              className="w-full accent-pink-500 cursor-pointer h-2 bg-zinc-950 rounded"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              id="distortion-toggle"
              onClick={() => {
                setIsDistorted(!isDistorted);
                AudioEngine.isDistorted = !isDistorted;
                if (AudioEngine.masterDistWet) {
                  AudioEngine.masterDistWet.gain.value = !isDistorted ? 0.82 : 0;
                }
              }}
              className={`flex flex-col items-center justify-center py-2 border rounded-lg text-[10px] font-mono font-black cursor-pointer transition-colors
                ${isDistorted 
                  ? 'bg-red-950 text-red-400 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.2)]' 
                  : 'bg-zinc-950 border-zinc-850 text-zinc-550 hover:text-zinc-400'
                }`}
              title="Räudige Verzerrung für ordentlich Schmalz im Getriebe"
            >
              <Zap className="w-3.5 h-3.5 mb-1" />
              <span>DRECK-OCT</span>
              <span className="text-[7.5px] font-normal leading-none mt-0.5">{isDistorted ? 'BRENNT' : 'STILL'}</span>
            </button>

            <button
              id="scream-toggle"
              onClick={() => {
                setIsScreaming(!isScreaming);
                AudioEngine.isScreaming = !isScreaming;
                if (AudioEngine.masterFilter) {
                  AudioEngine.masterFilter.Q.value = !isScreaming ? 14 : 1;
                }
              }}
              className={`flex flex-col items-center justify-center py-2 border rounded-lg text-[10px] font-mono font-black cursor-pointer transition-colors
                ${isScreaming 
                  ? 'bg-amber-955 text-amber-400 border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.2)]' 
                  : 'bg-zinc-950 border-zinc-850 text-zinc-550 hover:text-zinc-400'
                }`}
              title="Filter-Kreischn fia de scharfn Soli"
            >
              <Radio className="w-3.5 h-3.5 mb-1" />
              <span>GURGL-Q</span>
              <span className="text-[7.5px] font-normal leading-none mt-0.5">{isScreaming ? 'YELLN' : 'STILL'}</span>
            </button>

            <button
              id="echo-toggle"
              onClick={() => {
                setIsEchoEnabled(!isEchoEnabled);
                AudioEngine.isEchoEnabled = !isEchoEnabled;
                if (AudioEngine.delayGain) {
                  AudioEngine.delayGain.gain.value = !isEchoEnabled ? 0.78 : 0;
                }
              }}
              className={`flex flex-col items-center justify-center py-2 border rounded-lg text-[10px] font-mono font-black cursor-pointer transition-colors
                ${isEchoEnabled 
                  ? 'bg-cyan-950 text-cyan-400 border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.2)]' 
                  : 'bg-zinc-950 border-zinc-850 text-zinc-550 hover:text-zinc-400'
                }`}
              title="Schallendes Echo wie in der U-Bahn-Station"
            >
              <RefreshCw className="w-3.5 h-3.5 mb-1" />
              <span>ECHOBRANT</span>
              <span className="text-[7.5px] font-normal leading-none mt-0.5">{isEchoEnabled ? 'SCHALLT' : 'STILL'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
