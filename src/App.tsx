/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, Pause, Zap, Disc, Trash, Plus, RotateCcw, Volume2, VolumeX,
  Star, Sliders, Music, Radio, Sparkles, AlertCircle, RefreshCw, Layers,
  Share2, Download, Check, Copy, Send, Sun, Moon, Save
} from 'lucide-react';

interface SavedRig {
  id: string;
  name: string;
  timestamp: string;
  payload: SharedRigData;
}

import { songsData, categories, rhythmOrder, rhythmLabels, rhythmTags, instOrder, instNames, instIcons } from './songsData';
import { Song, CompositionBlock, QueuedMix, FavoriteTile, MixerStems } from './types';
import { AudioEngine } from './audioEngine';
import FavoriteDeck from './components/FavoriteDeck';
import MixQueuePlanner from './components/MixQueuePlanner';
import MixerSection from './components/MixerSection';
import PerformanceSection from './components/PerformanceSection';
import SequencerSection from './components/SequencerSection';

interface SharedRigData {
  mixQueue: QueuedMix[];
  composition?: CompositionBlock[];
  tempo: number;
  activeSongKey: string;
  globalRhythm: string;
  drumDensity?: 'sparse' | 'normal' | 'full';
  drumHat?: 'off' | 'mixed' | 'open';
}

const encodeSession = (data: SharedRigData): string => {
  try {
    const compactQ = data.mixQueue.map(q => [
      q.id,
      q.songKey,
      q.transitionType,
      q.bars,
      q.customRhythm
    ]);
    const compactC = (data.composition || []).map(c => [
      c.id,
      c.songKey,
      c.bpm,
      c.bars,
      c.instIndex,
      c.rhythmIndex,
      c.kickMute ? 1 : 0,
      c.snareMute ? 1 : 0
    ]);

    const v2Payload = [
      "v2",
      data.tempo,
      data.activeSongKey,
      data.globalRhythm,
      data.drumDensity || 'normal',
      data.drumHat || 'mixed',
      compactQ,
      compactC
    ];

    const str = JSON.stringify(v2Payload);
    return btoa(unescape(encodeURIComponent(str)));
  } catch (e) {
    console.error("Failed to encode v2 payload, trying fallback", e);
    try {
      const str = JSON.stringify(data);
      return btoa(unescape(encodeURIComponent(str)));
    } catch (err) {
      console.error("Failed standard fallback encoding", err);
      return '';
    }
  }
};

const decodeSession = (inputRaw: string): SharedRigData | null => {
  try {
    let cleanCode = inputRaw.trim();
    
    // 1. Try to find a URL or parameter containing ?rig=... or &rig=...
    const rigParamMatch = cleanCode.match(/[?&]rig=([^&\s\n*)]+)/);
    if (rigParamMatch && rigParamMatch[1]) {
      cleanCode = rigParamMatch[1].trim();
    } else {
      // 2. See if there is a URL without parameters that might contain rig parameter
      // inside a formatted markdown/text copy
      const linkWithRigMatch = cleanCode.match(/https?:\/\/[^\s\n]+/);
      if (linkWithRigMatch && linkWithRigMatch[0]) {
        try {
          const urlStr = linkWithRigMatch[0].replace(/[*_~`]/g, ''); // strip markdown styling
          const urlObj = new URL(urlStr);
          const rigVal = urlObj.searchParams.get('rig');
          if (rigVal) {
            cleanCode = rigVal.trim();
          }
        } catch (_) {}
      }
    }

    // 3. Fallback: If cleanCode is not a valid Base64 yet, try to find the longest Base64-like word
    // in the text (which typically starts with letters like W or e for JSON data)
    if (!/^[A-Za-z0-9+/=]{10,}$/.test(cleanCode)) {
      const words = cleanCode.split(/[\s\n,;!|]/);
      let bestCandidate = '';
      for (let word of words) {
        word = word.replace(/[*_~`()]/g, '').trim();
        // Base64 chars can include A-Z, a-z, 0-9, +, /, and pad =
        const cleanedWord = word.replace(/[^A-Za-z0-9+/=]/g, '');
        if (cleanedWord.length >= 10) {
          if (cleanedWord.length > bestCandidate.length) {
            bestCandidate = cleanedWord;
          }
        }
      }
      if (bestCandidate) {
        cleanCode = bestCandidate;
      }
    }

    // Absolutely make sure we only have base64 alphabet characters
    cleanCode = cleanCode.replace(/[^A-Za-z0-9+/=]/g, '');

    if (!cleanCode) return null;

    // Decode base64
    const decodedBytes = atob(cleanCode);
    let str = decodeURIComponent(escape(decodedBytes));
    
    // Robust structural JSON slice to protect against trailing non-JSON data or control characters
    let jsonStr = str.trim();
    const firstBrace = jsonStr.indexOf('{');
    const firstBracket = jsonStr.indexOf('[');
    const lastBrace = jsonStr.lastIndexOf('}');
    const lastBracket = jsonStr.lastIndexOf(']');
    
    let startIdx = -1;
    let endIdx = -1;
    
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endIdx = lastBrace;
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      endIdx = lastBracket;
    }
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      jsonStr = jsonStr.substring(startIdx, endIdx + 1);
    }

    const parsed = JSON.parse(jsonStr);
    
    // Check if new super-compact version 2 array encoding is used
    if (Array.isArray(parsed) && parsed[0] === 'v2') {
      const [_, tempoVal, activeSongKeyVal, globalRhythmVal, drumDensityVal, drumHatVal, compactQ, compactC] = parsed;
      
      const mixQueue: QueuedMix[] = (compactQ || []).map((q: any) => ({
        id: String(q[0]),
        songKey: String(q[1]),
        transitionType: q[2] as any,
        bars: Number(q[3]),
        customRhythm: String(q[4])
      }));

      const composition: CompositionBlock[] = (compactC || []).map((c: any) => ({
        id: Number(c[0]),
        songKey: String(c[1]),
        bpm: Number(c[2]),
        bars: Number(c[3]),
        instIndex: Number(c[4]),
        rhythmIndex: Number(c[5]),
        kickMute: c[6] === 1,
        snareMute: c[7] === 1
      }));

      return {
        tempo: Number(tempoVal),
        activeSongKey: String(activeSongKeyVal),
        globalRhythm: String(globalRhythmVal),
        drumDensity: drumDensityVal as any,
        drumHat: drumHatVal as any,
        mixQueue,
        composition
      };
    }
    
    // Fallback support for older regular object encoding
    if (parsed && typeof parsed === 'object') {
      return parsed as SharedRigData;
    }
    return null;
  } catch (e) {
    console.error("Failed to decode session", e);
    // Let's try one last direct decode try, ignoring any custom parsing
    try {
      let directClean = inputRaw.replace(/[^A-Za-z0-9+/=]/g, '').trim();
      if (directClean) {
        const decodedBytes = atob(directClean);
        const str = decodeURIComponent(escape(decodedBytes));
        
        let jsonStr = str.trim();
        const firstBrace = jsonStr.indexOf('{');
        const firstBracket = jsonStr.indexOf('[');
        const lastBrace = jsonStr.lastIndexOf('}');
        const lastBracket = jsonStr.lastIndexOf(']');
        
        let startIdx = -1;
        let endIdx = -1;
        
        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
          startIdx = firstBrace;
          endIdx = lastBrace;
        } else if (firstBracket !== -1) {
          startIdx = firstBracket;
          endIdx = lastBracket;
        }
        
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          jsonStr = jsonStr.substring(startIdx, endIdx + 1);
        }

        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === 'object') {
          return parsed as SharedRigData;
        }
      }
    } catch (_) {}
    return null;
  }
};

// Real-time Sound-reactive Vortex background canvas component for the current active song played
const ActiveVortexCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;
    let angle = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animId = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(draw);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const w = canvas.width;
      const h = canvas.height;

      // Subtle background tail trails
      ctx.fillStyle = 'rgba(9, 9, 11, 0.25)';
      ctx.fillRect(0, 0, w, h);

      let amp = 0;
      try {
        amp = AudioEngine.getAverageAmplitude();
      } catch (e) {}

      const cx = w / 2;
      const cy = h / 2;

      // Rotation yaw speed
      angle += 0.015 + amp * 0.12;

      const rings = 6;
      const ringPoints = 24;
      const baseMaxRadius = Math.min(w, h) * 0.45;

      // Pitch is tilted (e.g., 74 degrees or ~1.3 radians) so we observe it from the sides (equatorial plane)
      const pitch = 1.30;
      const yaw = angle * 0.25;

      for (let r = 1; r <= rings; r++) {
        const normR = r / rings;
        const currentRad = normR * baseMaxRadius * (1.0 + amp * 0.3);

        ctx.beginPath();
        for (let p = 0; p <= ringPoints; p++) {
          const theta = (p / ringPoints) * Math.PI * 2 + angle * (r % 2 === 0 ? 1 : -1) * (0.3 + normR * 0.4);
          
          // Electric oscillation along the Z axis (making it dielectric / non-flat)
          const dielectricRippleZ = Math.sin(theta * 8 - angle * 4.5 + r) * (20 * normR) * (amp + 0.18);
          // Standard planar radius ripple
          const planarRipple = Math.sin(theta * 3 + angle * 2) * (amp * r * 1.5);
          const finalR = Math.max(2, currentRad + planarRipple);

          const px = finalR * Math.cos(theta);
          const py = finalR * Math.sin(theta);
          const pz = dielectricRippleZ;

          // Yaw rotation (Z-axis rotation)
          const cosY = Math.cos(yaw);
          const sinY = Math.sin(yaw);
          const x1 = px * cosY - py * sinY;
          const y1 = px * sinY + py * cosY;
          const z1 = pz;

          // Pitch rotation (X-axis rotation)
          const cosP = Math.cos(pitch);
          const sinP = Math.sin(pitch);
          const x2 = x1;
          const y2 = y1 * cosP - z1 * sinP;
          const z2 = y1 * sinP + z1 * cosP;

          // 3D Perspective projection
          const scale = 140 / (140 + z2);
          const rx = cx + x2 * scale;
          const ry = cy + y2 * scale;

          if (p === 0) {
            ctx.moveTo(rx, ry);
          } else {
            ctx.lineTo(rx, ry);
          }
        }
        ctx.closePath();

        const opacity = (1.0 - normR) * 0.28 + amp * 0.48;
        const hue = Math.round(180 + normR * 120 + amp * 70) % 360;
        ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${opacity})`;
        ctx.lineWidth = (0.7 + amp * 2.0) * (r === 1 ? 2.5 : 1.0); // Thick neon core/outer visual weight
        ctx.stroke();
      }

      // Live electric discharges along the equatorial plane
      if (amp > 0.12 && Math.random() < 0.25) {
        ctx.beginPath();
        const startRad = Math.random() * baseMaxRadius * 0.2;
        const targetRad = baseMaxRadius * (0.6 + Math.random() * 0.4);
        const randTheta = Math.random() * Math.PI * 2;
        
        ctx.strokeStyle = `rgba(34, 211, 238, ${0.4 + amp * 0.5})`;
        ctx.lineWidth = 1.0 + Math.random() * 1.5;

        let arcX = cx;
        let arcY = cy;

        const segments = 5;
        for (let j = 0; j <= segments; j++) {
          const ratio = j / segments;
          const currentR = startRad + ratio * (targetRad - startRad);
          const currentA = randTheta + (Math.random() - 0.5) * 0.3;
          const px = currentR * Math.cos(currentA);
          const py = currentR * Math.sin(currentA);
          const pz = (Math.random() - 0.5) * 16;

          const cosY = Math.cos(yaw);
          const sinY = Math.sin(yaw);
          const x1 = px * cosY - py * sinY;
          const y1 = px * sinY + py * cosY;

          const cosP = Math.cos(pitch);
          const sinP = Math.sin(pitch);
          const x2 = x1;
          const y2 = y1 * cosP - pz * sinP;
          const z2 = y1 * sinP + pz * cosP;

          const scale = 140 / (140 + z2);
          arcX = cx + x2 * scale;
          arcY = cy + y2 * scale;

          if (j === 0) ctx.moveTo(arcX, arcY);
          else ctx.lineTo(arcX, arcY);
        }
        ctx.stroke();
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-x-0 inset-y-0 w-full h-full pointer-events-none opacity-[0.38] z-0" 
    />
  );
};

// Miniature interactive X-Y Dudel-Vortex component rendered inside the sequence hud panel
const InteractiveHeaderVortex = ({
  xyPos,
  zValue,
  onGesture,
  onTouchStart,
  onZChange,
  miniPadRef
}: {
  xyPos: { x: number; y: number };
  zValue: number;
  onGesture: (e: any, isMini: boolean) => void;
  onTouchStart: (e: any, isMini: boolean) => void;
  onZChange: (v: number) => void;
  miniPadRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;
    let angle = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animId = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(draw);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const w = canvas.width;
      const h = canvas.height;

      // Draw subtle background dark space with grid
      ctx.fillStyle = 'rgba(9, 9, 11, 0.28)';
      ctx.fillRect(0, 0, w, h);

      let amp = 0;
      try {
        amp = AudioEngine.getAverageAmplitude();
      } catch (e) {}

      const cx = w / 2;
      const cy = h / 2;

      // Rotate over time based on amp and zValue
      angle += 0.012 + amp * 0.1 + zValue * 0.05;

      // Tilted side-view angle for equatorial plane representation (pitch around 1.25 rad)
      const pitch = 1.25; 
      const yaw = angle * 0.3;

      // 1. Draw 3D spiral strands
      const strands = 10;
      const points = 20;
      for (let s = 0; s < strands; s++) {
        const phi = (s * Math.PI * 2) / strands;
        ctx.beginPath();
        
        for (let p = 0; p < points; p++) {
          const t = p / (points - 1); // 0 to 1
          const r = t * Math.min(cx, cy) * (0.8 + amp * 0.15);
          
          const twist = t * (4.0 + zValue * 4.0) + angle;
          const theta = phi + twist;
          
          const px = r * Math.cos(theta);
          const py = r * Math.sin(theta);
          
          // High-voltage dielectric Z-axis oscillation wave
          const pz = Math.sin(t * 10 - angle * 5 + s) * (15 + zValue * 22) * (amp + 0.15);

          // Yaw rotation (around Z-axis)
          const cosY = Math.cos(yaw);
          const sinY = Math.sin(yaw);
          const x1 = px * cosY - py * sinY;
          const y1 = px * sinY + py * cosY;
          const z1 = pz;

          // Pitch rotation (around X-axis) View from side!
          const cosP = Math.cos(pitch);
          const sinP = Math.sin(pitch);
          const x2 = x1;
          const y2 = y1 * cosP - z1 * sinP;
          const z2 = y1 * sinP + z1 * cosP;

          // 3D Perspective scaling
          const scale = 120 / (120 + z2);
          const rx = cx + x2 * scale;
          const ry = cy + y2 * scale;

          if (p === 0) {
            ctx.moveTo(rx, ry);
          } else {
            ctx.lineTo(rx, ry);
          }
        }
        
        const hue = (Math.round((phi * 180) / Math.PI) + Math.round(yaw * 35)) % 360;
        ctx.strokeStyle = `hsla(${hue}, 100%, 62%, ${0.25 + amp * 0.4})`;
        ctx.lineWidth = 1.0 + amp * 2.0;
        ctx.stroke();
      }

      // 2. High-voltage lightning / electric arcs shooting out dynamically
      if (amp > 0.14) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.75)';
        ctx.lineWidth = 1.1;
        let arcX = cx;
        let arcY = cy;
        ctx.moveTo(arcX, arcY);
        const targetAngle = angle * 2 + Math.random() * Math.PI * 2;
        const targetRadius = Math.min(cx, cy) * 0.85;

        const segments = 6;
        for (let j = 1; j <= segments; j++) {
          const ratio = j / segments;
          const currentR = ratio * targetRadius;
          const currentA = targetAngle + (Math.random() - 0.5) * 0.35;

          const px = currentR * Math.cos(currentA);
          const py = currentR * Math.sin(currentA);
          const pz = (Math.random() - 0.5) * 18;

          const cosY = Math.cos(yaw);
          const sinY = Math.sin(yaw);
          const x1 = px * cosY - py * sinY;
          const y1 = px * sinY + py * cosY;

          const cosP = Math.cos(pitch);
          const sinP = Math.sin(pitch);
          const x2 = x1;
          const y2 = y1 * cosP - pz * sinP;
          const z2 = y1 * sinP + pz * cosP;

          const scale = 120 / (120 + z2);
          arcX = cx + x2 * scale;
          arcY = cy + y2 * scale;
          ctx.lineTo(arcX, arcY);
        }
        ctx.stroke();
      }

      // 3. Draw active sparks flowing from the vortex center on the 3D plane
      const particles = 6;
      for (let i = 0; i < particles; i++) {
        const progress = ((Date.now() * 0.001 * (0.5 + zValue)) + (i / particles)) % 1.0;
        const r = progress * Math.min(cx, cy) * (0.95 + amp * 0.15);
        const theta = progress * 6.5 + angle;
        
        const px = r * Math.cos(theta);
        const py = r * Math.sin(theta);
        const pz = Math.sin(progress * 15 - angle * 3) * (5 + zValue * 10);

        // Transform 3D coordinates to tilted screen coordinates
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);
        const x1 = px * cosY - py * sinY;
        const y1 = px * sinY + py * cosY;

        const cosP = Math.cos(pitch);
        const sinP = Math.sin(pitch);
        const x2 = x1;
        const y2 = y1 * cosP - pz * sinP;
        const z2 = y1 * sinP + pz * cosP;

        const scale = 120 / (120 + z2);
        const sx = cx + x2 * scale;
        const sy = cy + y2 * scale;

        ctx.beginPath();
        ctx.fillStyle = `hsla(${Math.round(180 + progress * 120) % 360}, 100%, 75%, ${0.5 + amp * 0.5})`;
        ctx.arc(sx, sy, (1.5 + amp * 1.5) * scale, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Draw neon center core
      ctx.beginPath();
      // Draw projected core
      const coreCosY = Math.cos(yaw);
      const coreSinY = Math.sin(yaw);
      const cx1 = 0;
      const cy1 = 0;
      
      const coreCosP = Math.cos(pitch);
      const coreSinP = Math.sin(pitch);
      const cx2 = cx1;
      const cy2 = cy1 * coreCosP;
      const cz2 = cy1 * coreSinP;

      const coreScale = 120 / (120 + cz2);
      const ccx = cx + cx2 * coreScale;
      const ccy = cy + cy2 * coreScale;

      const grad = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, (12 + amp * 9) * coreScale);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, 'rgba(236, 72, 153, 0.8)');
      grad.addColorStop(0.8, 'rgba(34, 211, 238, 0.2)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.arc(ccx, ccy, (12 + amp * 9) * coreScale, 0, Math.PI * 2);
      ctx.fill();

      // Dynamic cursor locator
      const cursorX = (xyPos.x / 100) * w;
      const cursorY = (xyPos.y / 100) * h;
      
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.55)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(cursorX, cursorY, 4, 0, Math.PI * 2);
      ctx.moveTo(cursorX - 7, cursorY); ctx.lineTo(cursorX + 7, cursorY);
      ctx.moveTo(cursorX, cursorY - 7); ctx.lineTo(cursorX, cursorY + 7);
      ctx.stroke();

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [xyPos, zValue]);

  return (
    <div
      ref={miniPadRef}
      onMouseDown={(e) => {
        onGesture(e, true);
        const onMove = (ev: MouseEvent) => onGesture(ev as any, true);
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      }}
      onTouchStart={(e) => onTouchStart(e, true)}
      onTouchMove={(e) => onGesture(e, true)}
      onWheel={(e) => {
        e.preventDefault();
        const delta = e.deltaY * -0.002;
        const nextZ = Math.max(0, Math.min(1.0, zValue + delta));
        onZChange(nextZ);
      }}
      className="w-full h-full min-h-[142px] bg-zinc-950 border border-zinc-800 rounded relative overflow-hidden cursor-crosshair touch-none shadow-inner"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.45] z-0" />
      
      {/* Mini Reticle */}
      <div 
        className="absolute w-2.5 h-2.5 bg-pink-500 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_8px_rgba(236,72,153,1)] border border-white z-10"
        style={{ left: `${xyPos.x}%`, top: `${xyPos.y}%` }}
      />

      <div className="absolute inset-x-1 top-1 flex justify-between pointer-events-none z-10">
        <span className="text-[6.5px] font-bold text-pink-500 tracking-wider">🌀 XY DUDEL-VORTEX</span>
      </div>

      <div className="absolute inset-x-1 bottom-1 flex justify-between pointer-events-none text-[6px] text-zinc-400 font-mono bg-zinc-950/85 px-1 py-[1px] rounded border border-zinc-900/50 z-10">
        <span>X:{Math.round(xyPos.x * 1.6)}</span>
        <span>Y:{Math.round(xyPos.y)}</span>
        <span>Z:{Math.round(zValue * 100)}%</span>
      </div>
    </div>
  );
};

export default function App() {
  // Audio state values synced to React for controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [tempo, setTempo] = useState(120);

  // Gradual shutdown / STOP fade state
  const [isGradualStopping, setIsGradualStopping] = useState(false);
  const gradualStopTimeoutsRef = useRef<number[]>([]);
  const originalMutesRef = useRef<{ kick: boolean; snare: boolean; sub: boolean; lead: boolean } | null>(null);
  const [globalRhythm, setGlobalRhythm] = useState('4/4');
  const [drumDensity, setDrumDensity] = useState<'sparse' | 'normal' | 'full'>('normal');
  const [drumHat, setDrumHat] = useState<'off' | 'mixed' | 'open'>('mixed');
  const [activeSongKey, setActiveSongKey] = useState('beatcatcher');
  const [pendingSongKey, setPendingSongKey] = useState<string | null>(null);
  
  // Custom FX Toggle state
  const [isDistorted, setIsDistorted] = useState(false);
  const [isScreaming, setIsScreaming] = useState(false);
  const [isEchoEnabled, setIsEchoEnabled] = useState(false);
  const [subOverdrive, setSubOverdrive] = useState(5);
  const [octaveMultiplier, setOctaveMultiplier] = useState(1.0);
  const [liveInstOverride, setLiveInstOverride] = useState<string | null>(null);

  // Mixer values
  const [kickVol, setKickVol] = useState(1.0);
  const [snareVol, setSnareVol] = useState(0.8);
  const [subVol, setSubVol] = useState(0.7);
  const [leadVol, setLeadVol] = useState(0.8);
  const [masterVol, setMasterVol] = useState(0.5);

  const [kickMute, setKickMute] = useState(false);
  const [snareMute, setSnareMute] = useState(false);
  const [subMute, setSubMute] = useState(true);
  const [leadMute, setLeadMute] = useState(false);
  const [masterMute, setMasterMute] = useState(false);

  // Visual sequencing steps
  const [activeStep, setActiveStep] = useState(0);
  const [currentPlaylistBlockId, setCurrentPlaylistBlockId] = useState<string | null>(null);

  // Transition & Interactive Sequence Status display
  const [transDisplayMessage, setTransDisplayMessage] = useState('Rig Standby · Press Play');
  const [transitionActive, setTransitionActive] = useState(false);
  const [transBars, setTransBars] = useState(4);

  // Camping/Outdoor Sharing system states
  const [incomingSharedRig, setIncomingSharedRig] = useState<SharedRigData | null>(null);
  const [shareInputText, setShareInputText] = useState('');
  const [showManualImport, setShowManualImport] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Local saves system states
  const [savedRigs, setSavedRigs] = useState<SavedRig[]>(() => {
    try {
      const data = localStorage.getItem('schrammel_saved_rigs');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  });
  const [localSaveName, setLocalSaveName] = useState('');
  const [showLocalSavesDropdown, setShowLocalSavesDropdown] = useState(false);

  // Selected browse category
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Mobile Navigation iOS Bottom Bar Active Tab
  const [activeTab, setActiveTab] = useState<'mixer' | 'library' | 'performance' | 'sequencer'>('mixer');

  // NEW FEATURES: Favorite pinned tiles + Automated Mix queue states
  const [favorites, setFavorites] = useState<string[]>(['beatcatcher', 'minimalist', 'ambientdrone', 'mesecina', 'techno', 'house', 'dub']);
  const [mixQueue, setMixQueue] = useState<QueuedMix[]>([
    {
      id: 'init-1',
      songKey: 'techno',
      transitionType: 'mix',
      bars: 4,
      customRhythm: '4/4'
    },
    {
      id: 'init-2',
      songKey: 'dub',
      transitionType: 'drop',
      bars: 2,
      customRhythm: '4/4'
    }
  ]);

  // Composition / Sequence Sequencer Timeline Array
  const [timelineBlockCounter, setTimelineBlockCounter] = useState(3);
  const [composition, setComposition] = useState<CompositionBlock[]>([
    { id: 0, songKey: 'beatcatcher', bpm: 120, bars: 8, instIndex: 0, rhythmIndex: 0, kickMute: false, snareMute: false },
    { id: 1, songKey: 'minimalist', bpm: 122, bars: 8, instIndex: 0, rhythmIndex: 0, kickMute: false, snareMute: false },
    { id: 2, songKey: 'ambientdrone', bpm: 100, bars: 8, instIndex: 0, rhythmIndex: 0, kickMute: false, snareMute: false }
  ]);
  const [compPlaybackActive, setCompPlaybackActive] = useState(false);
  const [compActiveBlockId, setCompActiveBlockId] = useState<number | null>(null);
  const [compActiveBlockStep, setCompActiveBlockStep] = useState(0);
  const [loopCompActive, setLoopCompActive] = useState(true);
  const [isHeaderStatusCardMinimized, setIsHeaderStatusCardMinimized] = useState(false);
  const [isVortexClosed, setIsVortexClosed] = useState(false);
  const [isTilesLayoutVertical, setIsTilesLayoutVertical] = useState(false);
  const [headerShowInput, setHeaderShowInput] = useState(false);
  const [headerInputText, setHeaderInputText] = useState('');
  const [daylightMode, setDaylightMode] = useState(true);

  // Desktop check to serve professional studio layout on larger viewports
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Handle visual canvas coordinates on filter sweep pad
  const padRef = useRef<HTMLDivElement>(null);
  const miniPadRef = useRef<HTMLDivElement>(null);
  const [xyPos, setXyPos] = useState({ x: 50, y: 50 }); // percentages
  const [zValue, setZValue] = useState(0.4); // cosmic default

  // Synchronized state refs for step sequencer callback
  const compRef = useRef(composition);
  const compPlaybackActiveRef = useRef(compPlaybackActive);
  const currentBlockIdRef = useRef<number | null>(null);
  const barCounterRef = useRef(0);
  const loopCompActiveRef = useRef(loopCompActive);

  // Sync refs to state changes
  useEffect(() => {
    compRef.current = composition;
  }, [composition]);

  useEffect(() => {
    compPlaybackActiveRef.current = compPlaybackActive;
    if (!compPlaybackActive) {
      barCounterRef.current = 0;
      currentBlockIdRef.current = null;
    }
  }, [compPlaybackActive]);

  useEffect(() => {
    loopCompActiveRef.current = loopCompActive;
  }, [loopCompActive]);

  // Auto-scroll active block into center view during horizontal layout
  useEffect(() => {
    if (!isTilesLayoutVertical && compPlaybackActive && compActiveBlockId !== null) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`header-song-card-${compActiveBlockId}`);
        if (el) {
          el.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [compActiveBlockId, compPlaybackActive, isTilesLayoutVertical]);

  // Load incoming rig coordinate if passed via WhatsApp shared URL parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rigParam = params.get('rig');
    if (rigParam) {
      const decoded = decodeSession(rigParam);
      if (decoded && decoded.mixQueue && typeof decoded.tempo === 'number') {
        setIncomingSharedRig(decoded);
        setTransDisplayMessage("📥 Received Shared Acoustic Session Rig. Review details below!");
      }
    }
  }, []);

  const handleImportSharedRig = (rig: SharedRigData) => {
    if (rig.mixQueue && Array.isArray(rig.mixQueue)) {
      setMixQueue(rig.mixQueue);
    }
    if (rig.composition && Array.isArray(rig.composition)) {
      setComposition(rig.composition);
    }
    if (typeof rig.tempo === 'number' && !isNaN(rig.tempo)) {
      setTempo(rig.tempo);
      AudioEngine.setBpm(rig.tempo);
    }
    if (rig.activeSongKey && songsData[rig.activeSongKey]) {
      handleSongPreloadSelect(rig.activeSongKey);
    }
    if (rig.globalRhythm) {
      setGlobalRhythm(rig.globalRhythm);
    }
    if (rig.drumDensity) setDrumDensity(rig.drumDensity);
    if (rig.drumHat) setDrumHat(rig.drumHat);

    setIncomingSharedRig(null);
    setTransDisplayMessage("⚡ Acoustic Rig imported successfully! Jam ready! 🏕️");
    
    // Clear URL query parameter to avoid infinite re-prompts on page updates
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const handleSaveRigLocally = (nameInput?: string) => {
    const defaultLabel = composition.length > 0 ? (songsData[activeSongKey]?.label || activeSongKey) : 'unbenannt';
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const finalName = nameInput?.trim() || `Rig ${defaultLabel} (${timeStr})`;
    const payload: SharedRigData = {
      mixQueue,
      composition,
      tempo,
      activeSongKey,
      globalRhythm,
      drumDensity,
      drumHat
    };
    const newSave: SavedRig = {
      id: 'rig-' + Date.now(),
      name: finalName,
      timestamp: new Date().toLocaleDateString('de-AT') + ' ' + timeStr,
      payload
    };
    const updated = [newSave, ...savedRigs];
    setSavedRigs(updated);
    localStorage.setItem('schrammel_saved_rigs', JSON.stringify(updated));
    setTransDisplayMessage(`💾 Jam "${finalName}" lokal gspeichert! 🏕️`);
  };

  const handleDeleteRigLocally = (id: string) => {
    const target = savedRigs.find(r => r.id === id);
    const updated = savedRigs.filter(r => r.id !== id);
    setSavedRigs(updated);
    localStorage.setItem('schrammel_saved_rigs', JSON.stringify(updated));
    if (target) {
      setTransDisplayMessage(`🗑️ Jam "${target.name}" außeghaun.`);
    }
  };

  const handleZValueChange = (val: number) => {
    setZValue(val);
    if (AudioEngine.feedbackGain && AudioEngine.ctx) {
      // Map smoothly into feedback decay to increase dynamic space echo
      AudioEngine.feedbackGain.gain.setValueAtTime(val * 0.88, AudioEngine.ctx.currentTime);
    }
  };

  // Initialize Audio Engine Callbacks
  useEffect(() => {
    AudioEngine.setCallbacks(
      // Step trigger callback
      (step, blockKey) => {
        setActiveStep(step);
        setActiveSongKey(blockKey);

        // Manage playlist timeline if sequencer playback is active
        if (compPlaybackActiveRef.current && compRef.current.length > 0) {
          if (currentBlockIdRef.current === null) {
            const firstBlock = compRef.current[0];
            currentBlockIdRef.current = firstBlock.id;
            barCounterRef.current = 0;
            setCompActiveBlockId(firstBlock.id);
            setCompActiveBlockStep(0);

            // Set instrument override on engine
            const firstBlockInst = instOrder[firstBlock.instIndex] || null;
            AudioEngine.liveInstOverride = firstBlockInst;
            setLiveInstOverride(firstBlockInst);
          }

          const currentBlock = compRef.current.find(b => b.id === currentBlockIdRef.current);
          if (currentBlock) {
            const bK = currentBlock.kickMute !== undefined ? currentBlock.kickMute : true;
            const bS = currentBlock.snareMute !== undefined ? currentBlock.snareMute : true;
            if (AudioEngine.stems.kick.mute !== bK) {
              AudioEngine.stems.kick.mute = bK;
              setKickMute(bK);
            }
            if (AudioEngine.stems.snare.mute !== bS) {
              AudioEngine.stems.snare.mute = bS;
              setSnareMute(bS);
            }
            // Sync rhythm Index dynamically to globalRhythm
            const blockRhythm = rhythmOrder[currentBlock.rhythmIndex !== undefined ? currentBlock.rhythmIndex : 0] || '4/4';
            if (AudioEngine.globalRhythm !== blockRhythm) {
              AudioEngine.globalRhythm = blockRhythm;
              setGlobalRhythm(blockRhythm);
            }
            AudioEngine.updateVolumes();
          }

          // Advance timeline block on bar break (step === 0)
          if (step === 0) {
            const currentBlock = compRef.current.find(b => b.id === currentBlockIdRef.current);
            if (currentBlock) {
              // Ensure liveInstOverride matches current block index
              const blockInst = instOrder[currentBlock.instIndex] || null;
              if (AudioEngine.liveInstOverride !== blockInst) {
                AudioEngine.liveInstOverride = blockInst;
                setLiveInstOverride(blockInst);
              }

              barCounterRef.current += 1;
              setCompActiveBlockStep(barCounterRef.current);

              const maxBars = currentBlock.bars || 4;
              if (barCounterRef.current >= maxBars) {
                const idx = compRef.current.findIndex(b => b.id === currentBlockIdRef.current);
                const nextIdx = idx + 1;

                if (nextIdx < compRef.current.length) {
                  const nextBlock = compRef.current[nextIdx];
                  currentBlockIdRef.current = nextBlock.id;
                  barCounterRef.current = 0;
                  setCompActiveBlockId(nextBlock.id);
                  setCompActiveBlockStep(0);

                  const nextInst = instOrder[nextBlock.instIndex] || null;
                  AudioEngine.liveInstOverride = nextInst;
                  setLiveInstOverride(nextInst);

                  // Set pending for beat-matched loading
                  AudioEngine.pendingSongKey = nextBlock.songKey;
                  setPendingSongKey(nextBlock.songKey);
                  setTransDisplayMessage(`🎼 Playlist Next: Slot ${nextIdx + 1}/${compRef.current.length} (${songsData[nextBlock.songKey].label})`);
                } else {
                  // End of playlist
                  if (loopCompActiveRef.current) {
                    // Repeat from the top
                    const firstBlock = compRef.current[0];
                    currentBlockIdRef.current = firstBlock.id;
                    barCounterRef.current = 0;
                    setCompActiveBlockId(firstBlock.id);
                    setCompActiveBlockStep(0);

                    const firstInst = instOrder[firstBlock.instIndex] || null;
                    AudioEngine.liveInstOverride = firstInst;
                    setLiveInstOverride(firstInst);

                    AudioEngine.pendingSongKey = firstBlock.songKey;
                    setPendingSongKey(firstBlock.songKey);
                    setTransDisplayMessage(`🔁 Playlist Looped: Restarting set with ${songsData[firstBlock.songKey].label}`);
                  } else {
                    // Terminate playback and clear active states
                    setCompPlaybackActive(false);
                    setCompActiveBlockId(null);
                    AudioEngine.stop();
                    setIsPlaying(false);
                    setTransDisplayMessage('🏁 Playlist Set Complete!');
                  }
                }
              }
            }
          }
        }
      },
      // BPM update callback
      (newBpm) => {
        setTempo(newBpm);
      },
      // Transition complete callback
      () => {
        setTransitionActive(false);
        setTransDisplayMessage('Auto-transit Successful! Deck Balanced.');
      }
    );
  }, []);

  // Listen for activeSongKey transformations to clear pending keys
  useEffect(() => {
    if (activeSongKey === pendingSongKey) {
      setPendingSongKey(null);
    }
  }, [activeSongKey, pendingSongKey]);

  // Setup initial mixer state values inside the core engine
  const handleTogglePlay = () => {
    // If gradual stopping is in progress, cancel it and just keep playing/resume normal status
    if (isGradualStopping) {
      gradualStopTimeoutsRef.current.forEach(timer => clearTimeout(timer));
      gradualStopTimeoutsRef.current = [];
      setIsGradualStopping(false);
      
      // Restore original mutes
      if (originalMutesRef.current) {
        setKickMute(originalMutesRef.current.kick);
        AudioEngine.stems.kick.mute = originalMutesRef.current.kick;
        setSnareMute(originalMutesRef.current.snare);
        AudioEngine.stems.snare.mute = originalMutesRef.current.snare;
        setSubMute(originalMutesRef.current.sub);
        AudioEngine.stems.sub.mute = originalMutesRef.current.sub;
        setLeadMute(originalMutesRef.current.lead);
        AudioEngine.stems.lead.mute = originalMutesRef.current.lead;
        AudioEngine.updateVolumes();
        originalMutesRef.current = null;
      }
      
      setTransDisplayMessage('🔊 RIG JAMMING LIVE ON-AIR (Shutdown Aborted)');
      return;
    }

    if (!isPlaying) {
      AudioEngine.start();
      setIsPlaying(true);
      setTransDisplayMessage('🔊 RIG JAMMING LIVE ON-AIR');
    } else {
      AudioEngine.stop();
      setIsPlaying(false);
      setCompPlaybackActive(false);
      setCompActiveBlockId(null);
      setTransDisplayMessage('Rig Paused · Press play safely');
    }
  };

  // Synchronous play controls for playlist timeline sequencer
  const handleToggleCompPlayback = (nextPlaying: boolean) => {
    if (composition.length === 0) {
      setTransDisplayMessage('⚠️ System: Playlist timeline empty. Create track nodes!');
      return;
    }

    // Clear gradual stopping if we are activating playback sequencer
    if (nextPlaying && isGradualStopping) {
      gradualStopTimeoutsRef.current.forEach(timer => clearTimeout(timer));
      gradualStopTimeoutsRef.current = [];
      setIsGradualStopping(false);
      
      if (originalMutesRef.current) {
        setKickMute(originalMutesRef.current.kick);
        AudioEngine.stems.kick.mute = originalMutesRef.current.kick;
        setSnareMute(originalMutesRef.current.snare);
        AudioEngine.stems.snare.mute = originalMutesRef.current.snare;
        setSubMute(originalMutesRef.current.sub);
        AudioEngine.stems.sub.mute = originalMutesRef.current.sub;
        setLeadMute(originalMutesRef.current.lead);
        AudioEngine.stems.lead.mute = originalMutesRef.current.lead;
        AudioEngine.updateVolumes();
        originalMutesRef.current = null;
      }
    }

    setCompPlaybackActive(nextPlaying);
    if (nextPlaying) {
      if (!isPlaying) {
        AudioEngine.start();
        setIsPlaying(true);
      }
      const firstBlock = composition[0];
      setCompActiveBlockId(firstBlock.id);
      currentBlockIdRef.current = firstBlock.id;
      barCounterRef.current = 0;
      setCompActiveBlockStep(0);

      AudioEngine.activeSongKey = firstBlock.songKey;
      AudioEngine.tempo = firstBlock.bpm;
      setActiveSongKey(firstBlock.songKey);
      setTempo(firstBlock.bpm);

      const firstInst = instOrder[firstBlock.instIndex] || null;
      AudioEngine.liveInstOverride = firstInst;
      setLiveInstOverride(firstInst);

      const firstRhythm = rhythmOrder[firstBlock.rhythmIndex !== undefined ? firstBlock.rhythmIndex : 0] || '4/4';
      AudioEngine.globalRhythm = firstRhythm;
      setGlobalRhythm(firstRhythm);
      
      setTransDisplayMessage(`🎼 Playlist Activated: Loop Slot 1 (${songsData[firstBlock.songKey].label})`);
    } else {
      setCompActiveBlockId(null);
      setTransDisplayMessage('Composition Playback Deactivated');
    }
  };

  // Smooth mix transition into next song preset over 2 bars fade-in / rise-in
  const handleTriggerNextSongTransition = () => {
    if (!isPlaying) {
      AudioEngine.start();
      setIsPlaying(true);
    }

    let targetSongKey = '';
    let isFromSequence = false;
    let nextBlockToActivate: any = null;

    if (composition.length > 0) {
      // Find current index
      let currentIdxInComp = -1;
      if (compActiveBlockId !== null) {
        currentIdxInComp = composition.findIndex(b => b.id === compActiveBlockId);
      } else {
        // Fallback: match currently playing song key
        currentIdxInComp = composition.findIndex(b => b.songKey === activeSongKey);
      }

      if (currentIdxInComp !== -1) {
        const nextIdxInComp = currentIdxInComp + 1;
        if (nextIdxInComp < composition.length) {
          nextBlockToActivate = composition[nextIdxInComp];
        } else if (loopCompActive) {
          nextBlockToActivate = composition[0];
        }
      } else {
        // If not in the sequence yet, start with the first block
        nextBlockToActivate = composition[0];
      }
    }

    if (nextBlockToActivate) {
      targetSongKey = nextBlockToActivate.songKey;
      isFromSequence = true;

      // Update sequencer states and sync-refs for smooth timeline transition
      setCompPlaybackActive(true);
      setCompActiveBlockId(nextBlockToActivate.id);
      currentBlockIdRef.current = nextBlockToActivate.id;
      barCounterRef.current = 0;
      setCompActiveBlockStep(0);

      // Apply instrument voice override from the block
      const blockInst = instOrder[nextBlockToActivate.instIndex] || null;
      AudioEngine.liveInstOverride = blockInst;
      setLiveInstOverride(blockInst);

      const blockRhythm = rhythmOrder[nextBlockToActivate.rhythmIndex !== undefined ? nextBlockToActivate.rhythmIndex : 0] || '4/4';
      AudioEngine.globalRhythm = blockRhythm;
      setGlobalRhythm(blockRhythm);
    } else {
      // Transition to a random song from songsData
      const songKeys = Object.keys(songsData);
      let availableKeys = songKeys.filter(k => k !== activeSongKey);
      if (availableKeys.length === 0) {
        availableKeys = songKeys;
      }
      targetSongKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    }

    const nextTrack = songsData[targetSongKey];
    if (!nextTrack) return;

    setTransitionActive(true);
    if (isFromSequence && nextBlockToActivate) {
      const displaySlotIdx = composition.findIndex(b => b.id === nextBlockToActivate.id) + 1;
      setTransDisplayMessage(`🌀 2-BAR SEQUENCE MIX: Blending to Slot ${displaySlotIdx} (${nextTrack.emoji} ${nextTrack.label}) over 2 bars...`);
    } else {
      setTransDisplayMessage(`🌀 2-BAR RANDOM MIX: Bleeding into random preset: ${nextTrack.emoji} ${nextTrack.label} over 2 bars...`);
    }

    // Call transition in engine
    AudioEngine.doSmoothMixPlan(2, targetSongKey, nextTrack.tags[0]?.includes('/') ? nextTrack.tags[0] : '4/4');
    
    // Smoothly update pending state
    setPendingSongKey(targetSongKey);
  };

  const handlePanicHardReset = () => {
    // If we are already doing gradual shutdown, or if it isn't playing, do instant hard stop
    if (!isPlaying || isGradualStopping) {
      // Clear any pending timeouts
      gradualStopTimeoutsRef.current.forEach(timer => clearTimeout(timer));
      gradualStopTimeoutsRef.current = [];
      
      // Restore original channel mutes if we recorded them
      if (originalMutesRef.current) {
        setKickMute(originalMutesRef.current.kick);
        AudioEngine.stems.kick.mute = originalMutesRef.current.kick;
        setSnareMute(originalMutesRef.current.snare);
        AudioEngine.stems.snare.mute = originalMutesRef.current.snare;
        setSubMute(originalMutesRef.current.sub);
        AudioEngine.stems.sub.mute = originalMutesRef.current.sub;
        setLeadMute(originalMutesRef.current.lead);
        AudioEngine.stems.lead.mute = originalMutesRef.current.lead;
        AudioEngine.updateVolumes();
        originalMutesRef.current = null;
      }

      AudioEngine.stop();
      AudioEngine.panicStop();
      setIsPlaying(false);
      setCompPlaybackActive(false);
      setCompActiveBlockId(null);
      setTransitionActive(false);
      setPendingSongKey(null);
      setIsGradualStopping(false);
      setTransDisplayMessage('🚨 PANIC IN-EFFECT: Sound Terminated');
      return;
    }

    // Otherwise, let's start the gradual stop!
    setIsGradualStopping(true);
    
    // Save original mutes
    const origMutes = {
      kick: kickMute,
      snare: snareMute,
      sub: subMute,
      lead: leadMute
    };
    originalMutesRef.current = origMutes;
    
    const beatDurationMs = (60 / tempo) * 1000;
    setTransDisplayMessage("📉 GRADUAL RETREAT CONFIGURING [Tap STOP again to force instant silence]");
    
    // Beat 0: IMMEDIATELY mute lead synth (unless it was already muted)
    setLeadMute(true);
    AudioEngine.stems.lead.mute = true;
    AudioEngine.updateVolumes();
    setTransDisplayMessage("📉 GRADUAL RETREAT: Lead Synthesizer Stopped... [Step 1/4]");

    // Step 2 (Beat 1): Mute sub bass
    const t2 = window.setTimeout(() => {
      setSubMute(true);
      AudioEngine.stems.sub.mute = true;
      AudioEngine.updateVolumes();
      setTransDisplayMessage("📉 GRADUAL RETREAT: Sub Bass Stopped... [Step 2/4]");
    }, beatDurationMs);

    // Step 3 (Beat 2): Mute snare & percussion
    const t3 = window.setTimeout(() => {
      setSnareMute(true);
      AudioEngine.stems.snare.mute = true;
      AudioEngine.updateVolumes();
      setTransDisplayMessage("📉 GRADUAL RETREAT: Snare & Percussion Stopped... [Step 3/4]");
    }, beatDurationMs * 2);

    // Step 4 (Beat 3): Mute kick drum
    const t4 = window.setTimeout(() => {
      setKickMute(true);
      AudioEngine.stems.kick.mute = true;
      AudioEngine.updateVolumes();
      setTransDisplayMessage("📉 GRADUAL RETREAT: Final Kick Drum Stopped... [Step 4/4]");
    }, beatDurationMs * 3);

    // Step 5 (Beat 4): Full shutdown and restore mutes
    const t5 = window.setTimeout(() => {
      // Stop engine
      AudioEngine.stop();
      AudioEngine.panicStop();
      setIsPlaying(false);
      setCompPlaybackActive(false);
      setCompActiveBlockId(null);
      setTransitionActive(false);
      setPendingSongKey(null);
      setIsGradualStopping(false);
      
      // Restore mutes for recovery on next play
      setKickMute(origMutes.kick);
      AudioEngine.stems.kick.mute = origMutes.kick;
      setSnareMute(origMutes.snare);
      AudioEngine.stems.snare.mute = origMutes.snare;
      setSubMute(origMutes.sub);
      AudioEngine.stems.sub.mute = origMutes.sub;
      setLeadMute(origMutes.lead);
      AudioEngine.stems.lead.mute = origMutes.lead;
      AudioEngine.updateVolumes();
      
      originalMutesRef.current = null;
      gradualStopTimeoutsRef.current = [];
      setTransDisplayMessage("🏁 GRADUAL RETREAT COMPLETE: Rig Silenced Safely");
    }, beatDurationMs * 4);

    gradualStopTimeoutsRef.current = [t2, t3, t4, t5];
  };

  const handleSongPreloadSelect = (key: string) => {
    if (!isPlaying) {
      setActiveSongKey(key);
      const song = songsData[key];
      setTempo(song.bpm);
      AudioEngine.tempo = song.bpm;
      AudioEngine.activeSongKey = key;
      setTransDisplayMessage(`Loaded Track: ${song.emoji} ${song.label}`);
    } else {
      setPendingSongKey(key);
      AudioEngine.pendingSongKey = key;
      setTransDisplayMessage(`Queued Next: ${songsData[key].emoji} ${songsData[key].label} (will load on bar break)`);
    }
  };

  // Star / Pin Favorites toggle handler
  const toggleFavoritePin = (key: string) => {
    if (favorites.includes(key)) {
      setFavorites(favorites.filter(f => f !== key));
    } else {
      setFavorites([...favorites, key]);
    }
  };

  // Add Song directly to the automated mix transition sequence state
  const handleAddSongToMixQueue = (key: string) => {
    const song = songsData[key];
    if (!song) return;
    const newItem: QueuedMix = {
      id: `mix-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      songKey: key,
      transitionType: 'mix',
      bars: 8,
      customRhythm: song.tags[0]?.includes('/') ? song.tags[0] : '4/4',
    };
    setMixQueue(prev => [...prev, newItem]);
    setTransDisplayMessage(`Queued Transit mix: ${song.emoji} ${song.label}`);
  };

  // Integrated Automated Transit executor of the next mix block
  const handleExecuteAutomatedTransit = (planned: QueuedMix) => {
    if (!isPlaying) {
      // Lazy-trigger live play context
      AudioEngine.start();
      setIsPlaying(true);
    }
    
    setTransitionActive(true);
    const targetSong = songsData[planned.songKey];
    setTransDisplayMessage(`🔄 Automated transition: Active blending to ${targetSong.emoji} ${targetSong.label} over ${planned.bars} BARS...`);

    // Call dynamic AudioEngine routing plans depending on chosen style
    if (planned.transitionType === 'fade') {
      AudioEngine.doDecrescendoPlan(planned.bars);
    } else if (planned.transitionType === 'rise') {
      AudioEngine.doCrescendoPlan(planned.bars);
    } else if (planned.transitionType === 'drop') {
      AudioEngine.doBreakPlan(planned.bars);
    } else {
      AudioEngine.doSmoothMixPlan(planned.bars, planned.songKey, planned.customRhythm);
    }

    // After triggering, we dequeue the first element to advance the playlist deck
    setMixQueue(prev => prev.filter(item => item.id !== planned.id));
  };

  // Custom live sliders hooks
  const handleBpmSlideChange = (val: number) => {
    setTempo(val);
    AudioEngine.setBpm(val);
  };

  const handleTapTempo = () => {
    const now = Date.now();
    let staticTapTimes = (window as any)._taps || [];
    
    // If last tap was more than 2 seconds ago, start a fresh tracking cycle
    if (staticTapTimes.length > 0 && now - staticTapTimes[staticTapTimes.length - 1] > 2000) {
      staticTapTimes = [];
    }
    
    staticTapTimes.push(now);
    if (staticTapTimes.length > 4) staticTapTimes.shift();
    (window as any)._taps = staticTapTimes;

    if (staticTapTimes.length === 1) {
      setTransDisplayMessage("⏱️ Tap again to calculate BPM...");
    } else {
      const avg = (staticTapTimes[staticTapTimes.length - 1] - staticTapTimes[0]) / (staticTapTimes.length - 1);
      const measuredBpm = Math.round(60000 / avg);
      if (measuredBpm >= 40 && measuredBpm <= 240) {
        setTempo(measuredBpm);
        AudioEngine.setBpm(measuredBpm);
        setTransDisplayMessage(`⏱️ Tempo Set: ${measuredBpm} BPM`);
      } else {
        setTransDisplayMessage("⏱️ Tap a steady, regular beat...");
      }
    }
  };

  // Sound channels volume triggers
  const updateStemVolume = (ch: string, sliderVal: number) => {
    if (ch === 'kick') { setKickVol(sliderVal); AudioEngine.updateStemVolume('kick', sliderVal); }
    if (ch === 'snare') { setSnareVol(sliderVal); AudioEngine.updateStemVolume('snare', sliderVal); }
    if (ch === 'sub') { setSubVol(sliderVal); AudioEngine.updateStemVolume('sub', sliderVal); }
    if (ch === 'lead') { setLeadVol(sliderVal); AudioEngine.updateStemVolume('lead', sliderVal); }
    if (ch === 'master') { 
      setMasterVol(sliderVal); 
      setMasterMute(false);
      AudioEngine.updateMasterVolume(sliderVal); 
    }
  };

  const toggleMuteStemState = (ch: string) => {
    if (ch === 'master') {
      const nextMute = !masterMute;
      setMasterMute(nextMute);
      AudioEngine.updateMasterVolume(nextMute ? 0 : masterVol);
      return;
    }
    const isMuted = AudioEngine.toggleStem(ch);
    const nextVal = !!isMuted;
    if (ch === 'kick') setKickMute(nextVal);
    if (ch === 'snare') setSnareMute(nextVal);
    if (ch === 'sub') setSubMute(nextVal);
    if (ch === 'lead') setLeadMute(nextVal);

    if (compPlaybackActive && compActiveBlockId !== null) {
      updateTimelineBlock(compActiveBlockId, { [ch + 'Mute']: nextVal });
    }
  };

  // X-Y Custom Filter Touch logic
  const handleXyPadGesture = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement> | MouseEvent | TouchEvent,
    isMini: boolean = false
  ) => {
    const currentRef = isMini ? miniPadRef.current : padRef.current;
    if (!currentRef) return;
    const rect = currentRef.getBoundingClientRect();
    let clientX = 0, clientY = 0;
    
    if ('touches' in e && e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('touches' in e && (e as TouchEvent).changedTouches && (e as TouchEvent).changedTouches.length > 0) {
      clientX = (e as TouchEvent).changedTouches[0].clientX;
      clientY = (e as TouchEvent).changedTouches[0].clientY;
    } else {
      const mouseEv = e as MouseEvent;
      clientX = mouseEv.clientX;
      clientY = mouseEv.clientY;
    }
    
    const xPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    
    setXyPos({ x: xPct, y: yPct });
    
    // Map percentages directly to Web Audio nodes
    AudioEngine.updateXyFx(xPct / 100, yPct / 100);
  };

  const handleXyTouchStart = (e: React.TouchEvent<HTMLDivElement>, isMini: boolean = false) => {
    e.preventDefault();
    handleXyPadGesture(e, isMini);
  };

  // Performance Sound Trigger manual hits
  const playManualKick = () => { AudioEngine.playKick(AudioEngine.ctx?.currentTime || 0); };
  const playManualCowbell = () => { AudioEngine.playCowbell(AudioEngine.ctx?.currentTime || 0); };
  const playManualSiren = () => {
    if (!AudioEngine.ctx) return;
    const now = AudioEngine.ctx.currentTime;
    const o = AudioEngine.ctx.createOscillator();
    const e = AudioEngine.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, now);
    o.frequency.linearRampToValueAtTime(1400, now + 0.45);
    o.frequency.linearRampToValueAtTime(320, now + 0.9);
    e.gain.setValueAtTime(0.5, now);
    e.gain.linearRampToValueAtTime(0.001, now + 0.9);
    o.connect(e);
    if (AudioEngine.stems.lead.gainNode) {
      e.connect(AudioEngine.stems.lead.gainNode);
    }
    o.start(now);
    o.stop(now + 0.92);
  };

  // Shift Octave pitch modifier
  const adjustOctaveMultiplier = (offset: number) => {
    let newVal = octaveMultiplier;
    if (offset === -1 && octaveMultiplier > 0.25) newVal = octaveMultiplier / 2;
    if (offset === 1 && octaveMultiplier < 4.0) newVal = octaveMultiplier * 2;
    setOctaveMultiplier(newVal);
    AudioEngine.octaveMultiplier = newVal;
    setTransDisplayMessage(`🎹 Keyboard synth shifted to: ${newVal}x octave`);
  };

  // Sequencer Timeline Custom Operations
  const addToTimeline = (songKey: string) => {
    const s = songsData[songKey];
    if (!s) return;
    const newBlock: CompositionBlock = {
      id: timelineBlockCounter,
      songKey,
      bpm: s.bpm,
      bars: 8,
      instIndex: 0,
      rhythmIndex: 0,
      kickMute: true,
      snareMute: true
    };
    setComposition([...composition, newBlock]);
    setTimelineBlockCounter(prev => prev + 1);
    setTransDisplayMessage(`Timeline Add: ${s.emoji} ${s.label} added`);
  };

  const removeTimelineBlock = (id: number) => {
    setComposition(prev => prev.filter(b => b.id !== id));
  };

  const updateTimelineBlock = (id: number, updates: Partial<CompositionBlock>) => {
    setComposition(prev => prev.map(block => block.id === id ? { ...block, ...updates } : block));
  };

  const getQueueInfo = () => {
    const activeSong = songsData[activeSongKey];
    let nowLabel = activeSong ? `${activeSong.emoji} ${activeSong.label}` : "None";
    let nextLabel = "None";

    if (compPlaybackActive && composition.length > 0) {
      const idx = composition.findIndex(b => b.id === compActiveBlockId);
      if (idx !== -1 && idx < composition.length - 1) {
        const nextBlock = composition[idx + 1];
        const nextSong = songsData[nextBlock.songKey];
        if (nextSong) {
          nextLabel = `${nextSong.emoji} ${nextSong.label}`;
        }
      } else if (loopCompActive) {
        const firstBlock = composition[0];
        const nextSong = songsData[firstBlock.songKey];
        if (nextSong) {
          nextLabel = `${nextSong.emoji} ${nextSong.label} 🔁`;
        }
      }
    } else {
      const keys = Object.keys(songsData);
      const currIdx = keys.indexOf(activeSongKey);
      if (currIdx !== -1) {
        const nextKey = keys[(currIdx + 1) % keys.length];
        const nextSong = songsData[nextKey];
        if (nextSong) {
          nextLabel = `${nextSong.emoji} ${nextSong.label}`;
        }
      }
    }
    return { now: nowLabel, next: nextLabel };
  };

  // Filter styles list according to selected Category
  const filteredSongs = Object.keys(songsData).filter(key => {
    if (selectedCategory === 'all') return true;
    return songsData[key].cat === selectedCategory;
  });

  const activeBlock = composition.find(b => b.id === compActiveBlockId) || composition[0];
  const activeIdx = activeBlock ? composition.findIndex(b => b.id === activeBlock.id) : -1;
  const prevBlock = activeIdx > 0 ? composition[activeIdx - 1] : null;
  const nextBlock = activeIdx !== -1 && activeIdx + 1 < composition.length ? composition[activeIdx + 1] : null;

  return (
    <div 
      id="pioneer-rig-container" 
      className={`min-h-screen ${daylightMode ? 'bg-gradient-to-b from-[#143d7c] via-indigo-950 to-zinc-950 transition-colors duration-1000' : 'bg-zinc-950 transition-colors duration-1000'} text-zinc-100 flex flex-col font-sans leading-relaxed relative ${isDesktop ? 'max-w-7xl mx-auto p-4 rounded-2xl shadow-2xl border border-zinc-800' : 'md:max-w-md md:mx-auto md:border-x pb-[90px]'} ${daylightMode ? 'md:border-blue-800' : 'md:border-zinc-900'} md:shadow-2xl`}
    >
      {/* PERSISTENT HEADER CONTROLS BAR (Sleek and space-saving for PWA Mobile) */}
      <header className={`sticky top-0 z-40 ${daylightMode ? 'bg-sky-950/90' : 'bg-zinc-900/90'} backdrop-blur-md border-b ${daylightMode ? 'border-sky-700/60' : 'border-zinc-850'} p-3 h-auto min-h-[140px] flex flex-col gap-1.5 transition-colors duration-1000 ${isDesktop ? 'rounded-t-2xl' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-400 via-pink-500 to-yellow-400 flex items-center justify-center text-[10px] font-black text-black shadow-lg">
              RIG
            </span>
            <div>
              <h1 className="text-xs font-black tracking-widest leading-none text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-500 to-yellow-400 uppercase">
                DIE SCHRAMMEL-KONSOLE
              </h1>
              <span className="text-[7.5px] text-zinc-500 font-mono uppercase tracking-wider flex flex-wrap items-center gap-1.5 mt-0.5">
                <span>V2.5 WIENER BLUETOOTH EDM-EDITION</span>
                {isDesktop && <span className="text-[7px] text-emerald-400 bg-emerald-950/80 px-1 border border-emerald-900 rounded font-bold font-mono">💻 DESKTOP WORKSPACE ACTIVATED</span>}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Play/Pause Button */}
            <button
              id="main-play-btn"
              onClick={handleTogglePlay}
              className={`h-7 px-2 rounded-lg font-mono font-black text-[9px] tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-sm
                ${isPlaying 
                  ? 'bg-emerald-500 text-zinc-950 shadow-[0_0_8px_rgba(16,185,129,0.3)]' 
                  : 'bg-zinc-800 border border-zinc-700 text-emerald-400'
                }`}
            >
              {isPlaying ? <Pause className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current" />}
              {isPlaying ? 'PAUSN' : 'O’SPÜN'}
            </button>

            {/* Sequence Play Button */}
            <button
              id="header-sequence-play-btn-top"
              onClick={() => handleToggleCompPlayback(!compPlaybackActive)}
              className={`h-7 px-2 rounded-lg font-mono font-black text-[9px] tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-sm border
                ${compPlaybackActive 
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-zinc-950 border-yellow-400 font-black shadow-[0_0_8px_rgba(245,158,11,0.4)]' 
                  : 'bg-zinc-800 border border-zinc-700 text-amber-500 hover:text-amber-400 hover:bg-zinc-700/80'
                }`}
              title={compPlaybackActive ? '🛑 REIHUNG STOPPN' : '▶️ SPIELISTN REINHACKN'}
            >
              {compPlaybackActive ? <span className="w-1.5 h-1.5 bg-zinc-950 rounded-xs animate-pulse inline-block" /> : <Play className="w-2 h-2 fill-current" />}
              {compPlaybackActive ? 'SEQ AUS' : 'SEQ EIN'}
            </button>

            {/* Next Mix 🌀 Button */}
            <button
              id="header-next-mix-btn"
              onClick={handleTriggerNextSongTransition}
              disabled={transitionActive}
              className={`h-7 px-2 rounded-lg font-mono font-black text-[9px] tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-sm border border-pink-500/80 text-pink-400 bg-zinc-950/40 hover:bg-pink-950/20 active:scale-95 disabled:opacity-40`}
              title="Gmiatlicher Übergang in de nächste Rundn"
            >
              <Sparkles className="w-2.5 h-2.5 text-pink-400 shrink-0" />
              NÄCHSTA HADERN
            </button>

            {/* Panic Stop Reset */}
            <button
              id="main-panic-btn"
              onClick={handlePanicHardReset}
              className={`h-7 px-2 bg-zinc-950 border rounded-lg flex items-center gap-1 text-[9px] font-mono font-black transition-all active:scale-95 cursor-pointer shadow-sm
                ${isGradualStopping 
                  ? 'border-amber-500/80 text-amber-400 hover:bg-amber-950/20 shadow-amber-950/20' 
                  : 'border-red-900 text-red-550 hover:bg-red-950/20 hover:border-red-500/80 shadow-red-950/20'
                }`}
              title={isGradualStopping ? 'Zupf di, glei is staad!' : 'Reissleine ziagn (Schnoidea-Stopp)'}
            >
              <span className={`w-1.5 h-1.5 rounded-xs inline-block shrink-0
                ${isGradualStopping ? 'bg-amber-400 animate-ping' : 'bg-red-500 animate-pulse'}
              `}></span>
              {isGradualStopping ? 'WIRD STAAD' : 'AUSDOA'}
            </button>

            {/* Daylight Mode Toggle Button */}
            <button
              id="header-daylight-mode-btn"
              onClick={() => setDaylightMode(!daylightMode)}
              className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-sm border shrink-0
                ${daylightMode 
                  ? 'bg-amber-400 border-amber-300 text-zinc-950 shadow-[0_0_8px_rgba(245,158,11,0.5)]' 
                  : 'bg-zinc-950 border-zinc-800 text-amber-500 hover:border-zinc-700'
                }`}
              title={daylightMode ? 'Switch to Dark Mode' : 'Switch to Daylight Theme'}
            >
              {daylightMode ? <Sun className="w-3.5 h-3.5 fill-current" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* LED Grid representing physical beat sequencer cycles (Dual-row Status Display & Custom Duration Visualizer) */}
        <div id="header-status-card" className="flex flex-col gap-1 mt-0.5 bg-zinc-950/45 p-1 rounded-lg border border-zinc-900/40">
          {/* New Horizontal Status Bar Row (separates info from controls so no information is hidden) */}
          <div className="flex items-center justify-between gap-2 bg-zinc-950/80 px-2 py-1 rounded-md border border-zinc-900 shadow-inner min-h-[22px]">
            <p id="system-status-text" className="text-[9px] text-cyan-400 font-extrabold font-mono tracking-wide flex items-center justify-between w-full leading-tight min-w-0">
              <span className="text-[7.5px] text-zinc-450 uppercase font-black tracking-widest truncate max-w-[32%] pr-1">
                {isHeaderStatusCardMinimized 
                  ? '📈 INFOS ZUAGEMACHT' 
                  : (transDisplayMessage.startsWith('Rig Paused') || transDisplayMessage.startsWith('Composition Playback') ? 'AKTUELL ➔ AS NÄCHSTAS' : transDisplayMessage)
                }
              </span>

              <span className="truncate text-[9.5px] font-black shrink-0 flex items-center gap-1 justify-center max-w-[32%] text-center mx-1">
                {getQueueInfo().now} <span className="text-zinc-650 font-black text-[8px] mx-0.5">➔</span> <span className="text-pink-400 font-black">{getQueueInfo().next}</span>
              </span>

              {/* Centered pulsing mini bar indicator to give that gorgeous physical pulsing feeling */}
              {activeBlock && !isHeaderStatusCardMinimized && (
                <span id="header-middle-bar-pulse" className="flex items-center justify-end gap-[2.5px] px-1.5 py-0.5 bg-zinc-900/50 rounded border border-zinc-800/65 ml-1 shrink-0">
                  {Array.from({ length: activeBlock.bars }).map((_, i) => {
                    const isPlayingTimeline = isPlaying && compPlaybackActive;
                    const isCurrent = isPlayingTimeline && i === compActiveBlockStep;
                    const isCompleted = isPlayingTimeline && i < compActiveBlockStep;

                    // Beautiful high-vibrancy sequential hue gradient matching active-bars-visualizer
                    const hue = Math.round((i / activeBlock.bars) * 120 + 200) % 360; 
                    const ledStyle = isCurrent 
                      ? `bg-cyan-400 shadow-[0_0_6px_hsla(${hue},100%,50%,1)] scale-y-125 animate-pulse` 
                      : isCompleted 
                        ? 'bg-emerald-500/80 shadow-[0_0_2px_rgba(16,185,129,0.3)]' 
                        : 'bg-zinc-805';

                    return (
                      <span 
                        key={i} 
                        className={`w-0.5 h-1.5 rounded-[0.5px] transition-all duration-150 ${ledStyle}`}
                        title={`Bar ${i + 1}/${activeBlock.bars}`}
                      />
                    );
                  })}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center justify-between gap-1.5 h-[30px] bg-zinc-950/40 px-1.5 rounded-lg border border-zinc-900/40">
            <div className="text-[7.5px] font-mono text-zinc-500 uppercase tracking-widest pl-0.5 font-black shrink-0">
              REIHUNG STEIAN
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* PLAY/STOP SEQUENCE BUTTON */}
              <button
                id="header-sequence-play-btn"
                onClick={() => handleToggleCompPlayback(!compPlaybackActive)}
                className={`h-[22px] px-2 rounded font-mono font-black text-[8px] tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95 border
                  ${compPlaybackActive 
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-zinc-950 border-yellow-400 font-black shadow-[0_0_8px_rgba(245,158,11,0.3)]' 
                    : 'bg-zinc-905 text-amber-500 border-zinc-800 hover:text-amber-400 hover:bg-zinc-800'
                  }`}
                title={compPlaybackActive ? '🛑 REIHUNG STOPPN' : '▶️ SPIELISTN REINHACKN'}
              >
                {compPlaybackActive ? <span className="w-1.5 h-1.5 bg-zinc-950 rounded-xs animate-pulse" /> : <Play className="w-2 h-2 fill-current" />}
                {compPlaybackActive ? 'SEQ AUS' : 'SEQ EIN'}
              </button>

              {/* Quick dropdown select to append / schedule next song in sequence */}
              <select
                id="header-direct-add-song"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    addToTimeline(e.target.value);
                    e.target.value = "";
                  }
                }}
                className="bg-zinc-950 text-emerald-400 border border-zinc-800 text-[8px] font-mono font-black rounded px-1.5 py-0.5 max-w-[110px] outline-none cursor-pointer focus:border-cyan-500 hover:bg-zinc-900 transition-colors h-[22px]"
              >
                <option value="" disabled className="text-zinc-650">➕ REIN</option>
                {Object.keys(songsData).map(key => (
                  <option key={key} value={key} className="bg-zinc-950 text-zinc-300 select-none">
                    {songsData[key].emoji} {songsData[key].label} ({songsData[key].bpm} BPM)
                  </option>
                ))}
              </select>

              {/* Show Vortex toggle button when closed */}
              {isVortexClosed && (
                <button
                  id="header-show-vortex-btn"
                  onClick={() => setIsVortexClosed(false)}
                  className="h-[22px] px-1.5 rounded bg-zinc-950 border border-pink-900/60 text-pink-400 hover:bg-pink-950/20 text-[7px] font-mono font-black tracking-wider flex items-center gap-0.5 active:scale-95 cursor-pointer"
                  title="Vortex-Pad wieder einblenden"
                >
                  🌀 DUDEL-VORTEX EIN
                </button>
              )}

              {/* TILES LAYOUT TOGGLE */}
              <button
                id="header-tiles-layout-toggle"
                onClick={() => {
                  setIsTilesLayoutVertical(!isTilesLayoutVertical);
                  setTransDisplayMessage(isTilesLayoutVertical ? "↔️ Kacheln horizontal aunordnet" : "↕️ Kacheln vertikal gstellt fia mobile Übersicht");
                }}
                className={`h-[22px] px-1.5 rounded flex items-center justify-center gap-1 transition-all cursor-pointer font-black select-none text-[8.5px] border
                  ${isTilesLayoutVertical 
                    ? 'bg-amber-400 border-amber-300 text-zinc-950 font-black shadow-[0_0_8px_rgba(245,158,11,0.3)]' 
                    : 'bg-zinc-950 border-zinc-805 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                title={isTilesLayoutVertical ? "Zu horizontaler Scroll-Aunordnung wechseln" : "Zu vertikaler Listn-Aunordnung wechseln"}
              >
                <span>{isTilesLayoutVertical ? '↕ VERT' : '↔ HORIZ'}</span>
              </button>

              {/* WHATSAPP SHARE BUTTON */}
              <button
                id="header-whatsapp-share-btn"
                onClick={() => {
                  const payload: SharedRigData = {
                    mixQueue,
                    composition,
                    tempo,
                    activeSongKey,
                    globalRhythm,
                    drumDensity,
                    drumHat
                  };
                  const code = encodeSession(payload);
                  const finalUrl = `${window.location.origin}${window.location.pathname}?rig=${code}`;
                  const songName = songsData[activeSongKey]?.label || activeSongKey;
                  
                  const shareText = `🎸 *Hütten-Schrammel Rig Share fia di!* 🏕️\n\nServas! Ich hab grad a richtig gmiatliche live Drum & Bass Backing-Reihung zusammengebastelt fia unsern Bluetooth-Jam!\n\n🔑 *IMPORT-CODE (Kopieren ➔ In App auf IMPORTIEREN klicken):*\n${code}\n\n🔗 *Oder direkt über Link:* ${finalUrl}\n\n*Specs:* ${tempo} BPM | Hadern: ${songName} | Taktung: ${globalRhythm} (${mixQueue.length} Hadern gspeichert)`;
                  
                  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
                  setTransDisplayMessage("📤 WhatsApp Link & Import-Code gschriem! Schicks dei Hawara.");
                }}
                className="h-[22px] px-1.5 rounded flex items-center justify-center gap-1 transition-all cursor-pointer font-black select-none text-[8.5px] border bg-emerald-950 border-emerald-800 text-emerald-400 hover:bg-emerald-900/60 hover:text-emerald-300"
                title="Rig-Konfiguration via WhatsApp teilen"
              >
                <Share2 className="w-3 h-3 text-emerald-400" />
                <span>TEILN</span>
              </button>

              {/* CODE IMPORT BUTTON */}
              <button
                id="header-code-import-btn"
                onClick={() => {
                  setHeaderShowInput(!headerShowInput);
                  setHeaderInputText('');
                }}
                className={`h-[22px] px-1.5 rounded flex items-center justify-center gap-1 transition-all cursor-pointer font-black select-none text-[8.5px] border
                  ${headerShowInput 
                    ? 'bg-cyan-400 border-cyan-300 text-zinc-950 font-black shadow-[0_0_8px_rgba(34,211,238,0.3)]' 
                    : 'bg-zinc-950 border-zinc-805 text-zinc-400 hover:text-white hover:border-zinc-705'
                  }`}
                title="Rig-Konfiguration per Code importieren"
              >
                <Download className="w-3 h-3 text-cyan-400" />
                <span>IMPORTIEREN</span>
              </button>

              {/* MINIMIZE / EXPAND TOGGLE */}
              <button
                id="header-status-card-toggle"
                onClick={() => setIsHeaderStatusCardMinimized(!isHeaderStatusCardMinimized)}
                className={`h-[22px] px-1.5 rounded flex items-center justify-center gap-1 transition-all cursor-pointer font-black select-none text-[8.5px] border
                  ${isHeaderStatusCardMinimized 
                    ? 'bg-emerald-500 border-emerald-800/80 text-emerald-400 hover:bg-emerald-900/60 hover:text-emerald-300' 
                    : 'bg-red-950 border-red-905 bg-opacity-95 border-red-900/80 text-red-400 hover:bg-red-900/60 hover:text-red-300'
                  }`}
                title={isHeaderStatusCardMinimized ? "Komplette Übersicht aufkloppn" : "HUD einklappen"}
              >
                <span>{isHeaderStatusCardMinimized ? '＋ AUFKLOAPPN' : '✕'}</span>
              </button>
            </div>
          </div>

          {/* Header Code Import Area */}
          {headerShowInput && (
            <div className="flex flex-col gap-1.5 p-2 bg-zinc-900/90 rounded border border-cyan-500/30 text-left my-1 mx-1">
              <label htmlFor="header-import-text-input" className="text-[7.5px] font-mono font-bold uppercase tracking-wider text-cyan-400 block">
                HAU DEN OBEREN RIG-CODE ODER KOMPLETTE WHATSAPP-MELDUNG DA REIN:
              </label>
              <div className="flex gap-1.5">
                <input
                  id="header-import-text-input"
                  type="text"
                  placeholder="In WhatsApp erhaltenen Code oder die gesamte Nachricht hier einfügen..."
                  value={headerInputText}
                  onChange={(e) => setHeaderInputText(e.target.value)}
                  className="flex-grow bg-zinc-950 text-zinc-100 text-[10px] p-1.5 px-2 rounded border border-zinc-800 focus:outline-none focus:border-cyan-500 font-sans font-mono"
                />
                <button
                  id="header-run-import-btn"
                  onClick={() => {
                    try {
                      const decoded = decodeSession(headerInputText);
                      if (decoded && decoded.mixQueue && typeof decoded.tempo === 'number') {
                        handleImportSharedRig(decoded);
                        setHeaderShowInput(false);
                        setHeaderInputText('');
                      } else {
                        setTransDisplayMessage("⚠️ Ungültiger Code/Format. Bitte check den Link oder de WhatsApp-Meldung nochamol.");
                      }
                    } catch (e) {
                      setTransDisplayMessage("⚠️ Fehler beim Ladn: Format hinich oder zerstückelt.");
                    }
                  }}
                  className="bg-cyan-950 hover:bg-cyan-500 hover:text-black hover:border-cyan-500 text-cyan-300 border border-cyan-800 text-[9.5px] p-1.5 px-3 rounded font-bold transition-all shrink-0 cursor-pointer active:scale-95"
                >
                  RIG LADEN
                </button>
              </div>
            </div>
          )}

          {!isHeaderStatusCardMinimized && (
            <>
              {/* Durable 3-Column current & all next/other songs visualizer and easy adjusts */}
              <div className="flex flex-col gap-2 mt-0.5" id="header-status-card-adjusters-container">
                <div 
                  onWheel={(e) => {
                    if (!isTilesLayoutVertical && e.deltaY !== 0) {
                      e.currentTarget.scrollLeft += e.deltaY * 1.2;
                    }
                  }}
                  className={isTilesLayoutVertical 
                    ? 'flex flex-col gap-1.5 overflow-y-auto max-h-[360px] pb-1' 
                    : 'flex overflow-x-auto scrollbar-none snap-x snap-mandatory gap-1.5 pb-1 w-full'
                  }
                >
                  {/* Miniature Interactive XY Vortex Pad */}
                  {!isVortexClosed ? (
                    <div className={`${isTilesLayoutVertical ? 'w-full shrink-0' : 'flex-shrink-0 w-[85%] sm:w-60 snap-center'} flex flex-col gap-1 min-w-[210px] bg-zinc-900/40 p-0.5 rounded border border-zinc-850 shadow-inner relative justify-between overflow-hidden`}>
                      <button
                        onClick={() => setIsVortexClosed(true)}
                        className="absolute right-1.5 top-1.5 z-20 w-3.5 h-3.5 rounded bg-zinc-950/80 hover:bg-red-500 hover:text-black hover:border-red-500 text-[8px] font-black text-zinc-400 flex items-center justify-center border border-zinc-800 transition-all cursor-pointer active:scale-90"
                        title="Vortex ausblenden"
                      >
                        ×
                      </button>
                      <InteractiveHeaderVortex
                        xyPos={xyPos}
                        zValue={zValue}
                        onGesture={handleXyPadGesture}
                        onTouchStart={handleXyTouchStart}
                        onZChange={handleZValueChange}
                        miniPadRef={miniPadRef}
                      />
                    </div>
                  ) : null}

                  {/* Empty state fallback */}
                  {composition.length === 0 && (
                    <div className={`${isTilesLayoutVertical ? 'w-full shrink-0' : 'flex-shrink-0 w-[85%] snap-center sm:flex-grow'} flex flex-col justify-center items-center bg-zinc-900/40 p-3 rounded border border-zinc-850 shadow-inner min-h-[140px] leading-tight text-center`}>
                      <span className="text-[7.5px] text-zinc-500 font-extrabold uppercase tracking-widest leading-none">GEKEINE HADERN IN REIHUNG</span>
                      <span className="text-[10px] text-zinc-400 mt-1.5">Trag oben einen Code ein oder hack unten Hadern rein!</span>
                    </div>
                  )}

                  {/* Render ALL sequencer blocks for direct editing */}
                  {composition.map((block, idx) => {
                    const isCurrentPlaying = compPlaybackActive && block.id === compActiveBlockId;
                    const isNextUp = compPlaybackActive && activeIdx !== -1 && idx === activeIdx + 1;
                    const song = songsData[block.songKey];
                    if (!song) return null;

                    return (
                      <div 
                        key={block.id}
                        id={`header-song-card-${block.id}`}
                        className={`${isTilesLayoutVertical ? 'w-full shrink-0' : 'flex-shrink-0 w-[85%] sm:w-64 snap-center'} flex flex-col gap-1 min-w-[210px] bg-zinc-900/60 p-1.5 rounded border shadow-inner relative overflow-hidden transition-all
                          ${isCurrentPlaying 
                            ? 'border-yellow-400 bg-yellow-950/15 shadow-[0_0_12px_rgba(234,179,8,0.22)]' 
                            : isNextUp
                              ? 'border-pink-500/50 bg-pink-950/5'
                              : 'border-zinc-850 hover:border-zinc-700'
                          }`}
                      >
                        {/* Interactive sound reactive background vortex animation only on playing block */}
                        {isCurrentPlaying && <ActiveVortexCanvas />}

                        <div className="relative z-10 flex items-center justify-between min-w-0">
                          <div className="flex items-center gap-0.5 truncate max-w-[85%] relative z-10">
                            <span className="text-zinc-500 font-mono text-[7.5px] font-bold shrink-0">#{idx + 1}</span>
                            <span className="text-[9.5px] shrink-0">{song.emoji}</span>
                            <select
                              id={`song-key-select-${block.id}`}
                              value={block.songKey}
                              onChange={(e) => {
                                const newKey = e.target.value;
                                updateTimelineBlock(block.id, { songKey: newKey });
                                setTransDisplayMessage(`✨ Slot #${idx + 1} geändert auf: ${songsData[newKey]?.label || newKey}`);
                              }}
                              className={`bg-transparent font-extrabold text-[9px] tracking-wide outline-none cursor-pointer border-none p-0 max-w-[120px] truncate appearance-none
                                ${isCurrentPlaying 
                                  ? 'text-yellow-400 hover:text-yellow-300' 
                                  : isNextUp 
                                    ? 'text-pink-400 hover:text-pink-300' 
                                    : 'text-cyan-400 hover:text-cyan-350'
                                }`}
                            >
                              {Object.keys(songsData).map((key) => (
                                <option key={key} value={key} className="bg-zinc-950 text-zinc-300 text-[8px] font-sans">
                                  {songsData[key].emoji} {songsData[key].label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-1.5 relative z-10">
                            {isCurrentPlaying && (
                              <span className="text-[6.5px] font-mono font-black text-yellow-400 bg-yellow-950/80 px-1 border border-yellow-800 rounded">AKTIV</span>
                            )}
                            {isNextUp && (
                              <span className="text-[6.5px] font-mono font-black text-pink-400 bg-pink-950/80 px-1 border border-pink-900 rounded">NÄCHST</span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeTimelineBlock(block.id);
                                setTransDisplayMessage(`🗑️ Reihung: Slot ${idx + 1} (${songsData[block.songKey]?.label || ''}) außeghaun`);
                              }}
                              className="w-3.5 h-3.5 rounded bg-red-950/50 hover:bg-red-500 hover:text-black text-[8px] font-black text-red-400 flex items-center justify-center border border-red-900/60 transition-all cursor-pointer active:scale-90 shrink-0"
                              title="Hadern aus sequence kicken"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {/* BPM & Lead Voice Changer */}
                        <div className="relative z-10 flex items-center gap-0.5 justify-between text-[7px] font-mono text-zinc-450 uppercase leading-none mt-0.5">
                          {/* BPM Controller */}
                          <div className="flex items-center gap-0.5 bg-zinc-950 border border-zinc-900 px-[3px] py-0.5 rounded select-none">
                            <button
                              onClick={() => updateTimelineBlock(block.id, { bpm: Math.max(60, block.bpm - 5) })}
                              className="text-zinc-500 hover:text-white font-extrabold cursor-pointer px-0.5 active:scale-80 transition-all text-[8px] leading-none"
                            >
                              -
                            </button>
                            <span className="font-extrabold text-zinc-300 min-w-[12px] text-center text-[7px]">{block.bpm}</span>
                            <button
                              onClick={() => updateTimelineBlock(block.id, { bpm: Math.min(220, block.bpm + 5) })}
                              className="text-zinc-500 hover:text-white font-extrabold cursor-pointer px-0.5 active:scale-80 transition-all text-[8px] leading-none"
                            >
                              +
                            </button>
                          </div>

                          {/* Lead voice selector */}
                          <div className="flex items-center gap-1 min-w-0 flex-1 pl-1" title="Lead Stimme wechseln">
                            <span className="text-zinc-550 text-[6.5px] font-mono font-bold shrink-0">STIMME:</span>
                            <select
                              value={block.instIndex !== undefined ? block.instIndex : 0}
                              onChange={(e) => updateTimelineBlock(block.id, { instIndex: parseInt(e.target.value) })}
                              className="bg-zinc-950 text-cyan-400 border border-zinc-850 hover:border-zinc-750 text-[7px] font-mono font-bold rounded px-1.5 py-0.5 outline-none cursor-pointer transition w-full max-w-[115px] truncate"
                            >
                              {instNames.map((name, i) => (
                                <option key={i} value={i} className="bg-zinc-950 text-zinc-300 text-[8px] font-mono">
                                  {name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        
                        {/* Bars visualizer */}
                        <div className="relative z-10 flex items-center gap-[3px] mt-1 overflow-x-auto py-0.5 scrollbar-none horizontal-leds">
                          {Array.from({ length: block.bars }).map((_, i) => {
                            const isPlayingTimeline = isPlaying && compPlaybackActive && isCurrentPlaying;
                            const isCurrent = isPlayingTimeline && i === compActiveBlockStep;
                            const isCompleted = isPlayingTimeline && i < compActiveBlockStep;

                            const hue = Math.round((i / block.bars) * 120 + 200) % 360; 
                            const ledStyle = isCurrent 
                              ? `bg-cyan-400 shadow-[0_0_8px_hsla(${hue},100%,50%,0.95)] scale-y-125 animate-pulse` 
                              : isCompleted 
                                ? 'bg-emerald-500/80 shadow-[0_0_3px_rgba(16,185,129,0.25)]' 
                                : 'bg-zinc-800 border border-zinc-700/50';

                            return (
                              <div 
                                key={i} 
                                className={`h-1.5 rounded-[2px] flex-grow min-w-[2px] max-w-[10px] transition-all duration-150 ${ledStyle}`}
                                title={`Bar ${i + 1}/${block.bars}`}
                              />
                            );
                          })}
                        </div>

                        {/* Bumm & Tsch switches */}
                        <div className="relative z-10 flex items-center justify-between mt-1 h-5 pt-0.5 border-t border-zinc-850/20">
                          <span className="text-[6.5px] font-mono text-zinc-500 uppercase tracking-widest font-black">BUMM & TSCH</span>
                          <div className="flex items-center gap-1 shrink-0 relative z-10">
                            <button
                              onClick={() => {
                                const nextVal = !(block.kickMute ?? true);
                                updateTimelineBlock(block.id, { kickMute: nextVal });
                              }}
                              className={`px-1.5 py-0.5 rounded text-[7px] font-black font-mono transition-all duration-150 select-none cursor-pointer border ${
                                !(block.kickMute ?? true)
                                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-[0_0_4px_rgba(34,211,238,0.2)] font-black' 
                                  : 'bg-zinc-950 text-zinc-500 border-zinc-850 font-normal'
                              }`}
                              title="Kick-Trommel (Bumm)"
                            >
                              BUMM {!(block.kickMute ?? true) ? '●' : '○'}
                            </button>
                            <button
                              onClick={() => {
                                const nextVal = !(block.snareMute ?? true);
                                updateTimelineBlock(block.id, { snareMute: nextVal });
                              }}
                              className={`px-1.5 py-0.5 rounded text-[7px] font-black font-mono transition-all duration-150 select-none cursor-pointer border ${
                                !(block.snareMute ?? true)
                                  ? 'bg-pink-500/20 text-pink-400 border-pink-500/40 shadow-[0_0_4px_rgba(244,63,94,0.2)] font-black' 
                                  : 'bg-zinc-950 text-zinc-500 border-zinc-850 font-normal'
                              }`}
                              title="Snare & Tschinöb (Tsch)"
                            >
                              TSCH {!(block.snareMute ?? true) ? '●' : '○'}
                            </button>
                          </div>
                        </div>

                        {/* Bars / length controller */}
                        <div className="relative z-10 flex items-center justify-between mt-1 h-5 pt-0.5 border-t border-zinc-850/20">
                          <span className="text-[6.5px] font-mono text-zinc-500 uppercase tracking-widest font-black">TAKTE</span>
                          <div className="flex items-center gap-0.5 shrink-0 relative z-10">
                            <button
                              onClick={() => updateTimelineBlock(block.id, { bars: Math.max(1, block.bars - 1) })}
                              className="w-3.5 h-3.5 rounded bg-zinc-950/85 hover:bg-zinc-805 text-[8px] font-black font-mono text-zinc-400 hover:text-white flex items-center justify-center active:scale-90 border border-zinc-800 select-none cursor-pointer"
                              title="Takt verkürzn"
                            >
                              -
                            </button>
                            <span className="text-[8px] font-bold font-mono text-white min-w-[8px] text-center">{block.bars}</span>
                            <button
                              onClick={() => updateTimelineBlock(block.id, { bars: Math.min(32, block.bars + 1) })}
                              className="w-3.5 h-3.5 rounded bg-zinc-950/85 hover:bg-zinc-805 text-[8px] font-black font-mono text-zinc-400 hover:text-white flex items-center justify-center active:scale-90 border border-zinc-800 select-none cursor-pointer"
                              title="Takt verlängern"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Rhythm changer dropdown select */}
                        <div className="relative z-10 flex items-center justify-between mt-1 h-5 pt-0.5 border-t border-zinc-850/20">
                          <span className="text-[6.5px] font-mono text-zinc-500 uppercase tracking-widest font-black">RHYTHMUS</span>
                          <select
                            id={`rhythm-select-${block.id}`}
                            value={block.rhythmIndex !== undefined ? block.rhythmIndex : 0}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateTimelineBlock(block.id, { rhythmIndex: val });
                              const rKey = rhythmOrder[val];
                              if (isCurrentPlaying && AudioEngine.globalRhythm !== rKey) {
                                AudioEngine.globalRhythm = rKey;
                                setGlobalRhythm(rKey);
                              }
                              setTransDisplayMessage(`🥁 Rhythmus für #${idx + 1} umgstoßen auf: ${rhythmLabels[rKey] || rKey}`);
                            }}
                            className="bg-zinc-950 text-emerald-400 border border-zinc-850 hover:border-zinc-750 text-[7px] font-mono font-bold rounded px-1.5 py-0.5 outline-none cursor-pointer transition max-w-[105px] truncate"
                            title="Taktung / Rhythmus-Kombination lada"
                          >
                            {rhythmOrder.map((r, itemIdx) => (
                              <option key={r} value={itemIdx} className="bg-zinc-950 text-zinc-300 text-[8px] font-mono">
                                {rhythmLabels[r] || r} ({rhythmTags[r] || 'Preset'})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* DYNAMIC TAB CONTROLLER TRANSITIONS */}
      <main className="flex-grow p-3 overflow-y-auto overflow-x-hidden min-h-0">
        {incomingSharedRig && (
          <div className="bg-gradient-to-r from-emerald-950 via-zinc-950 to-emerald-950 border-2 border-emerald-500/80 rounded-xl p-4 mb-4 shadow-[0_8px_32px_rgba(16,185,129,0.25)] relative overflow-hidden">
            <div className="absolute top-0 right-0 p-1 px-2.5 bg-emerald-500 text-zinc-950 text-[8px] font-black tracking-widest uppercase rounded-bl-lg">
              Hawara Jam-Verbindung
            </div>
            
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🏕️</span>
                  <div>
                    <h4 className="text-zinc-100 font-bold text-xs uppercase tracking-wider font-sans leading-none flex items-center gap-1.5">
                      FEINE MUSIK-KONFIGURATION ERHALTEN!
                    </h4>
                    <p className="text-[10px] text-emerald-400 font-mono">
                      Dein Jam-Hawara hat da via WhatsApp wos gschickt!
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2 text-[9px] font-mono text-zinc-400 mt-2 bg-zinc-900/60 p-2 rounded border border-emerald-950/40">
                  <div>🎯 Jetztiger Hadern: <span className="text-emerald-300 font-bold">{(songsData[incomingSharedRig.activeSongKey]?.label || incomingSharedRig.activeSongKey).toUpperCase()}</span></div>
                  <div className="w-px h-2.5 bg-zinc-800 self-center" />
                  <div>⏱️ Tempo: <span className="text-pink-400 font-bold">{incomingSharedRig.tempo} BPM</span></div>
                  <div className="w-px h-2.5 bg-zinc-850 self-center" />
                  <div>🥁 Rhythmus: <span className="text-cyan-400 font-bold">{incomingSharedRig.globalRhythm}</span></div>
                  <div className="w-px h-2.5 bg-zinc-850 self-center" />
                  <div>Hadern angereiht: <span className="text-yellow-400 font-bold">{incomingSharedRig.mixQueue?.length || 0} segments</span></div>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto shrink-0 mt-2 md:mt-0">
                <button
                  id="decline-shared-rig-btn"
                  onClick={() => {
                    setIncomingSharedRig(null);
                    window.history.replaceState({}, document.title, window.location.pathname);
                    setTransDisplayMessage("❌ Gschicktes Rig beiseite glegt.");
                  }}
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 rounded-lg text-[10px] uppercase font-bold shrink-0 transition-all cursor-pointer"
                >
                  Na, wegdoa
                </button>
                <button
                  id="confirm-import-shared-rig"
                  onClick={() => handleImportSharedRig(incomingSharedRig)}
                  className="flex-grow md:flex-grow-0 flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-black px-5 py-2 rounded-lg text-[11px] uppercase tracking-wide shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  LAD DE MASCHIN
                </button>
              </div>
            </div>
          </div>
        )}

        {isDesktop ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-4">
            {/* Left Column: Mixer & Performance Controls */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div className="bg-zinc-900/60 border border-zinc-850/80 p-5 rounded-2xl shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-zinc-800/65">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)] animate-pulse" />
                  <h3 className="text-[10px] font-black tracking-widest text-cyan-400 uppercase font-sans">🎛️ MISCHPULT & SOUNDWINDUNG (MIXER)</h3>
                </div>
                <MixerSection
                  kickVol={kickVol}
                  snareVol={snareVol}
                  subVol={subVol}
                  leadVol={leadVol}
                  masterVol={masterVol}
                  kickMute={kickMute}
                  snareMute={snareMute}
                  subMute={subMute}
                  leadMute={leadMute}
                  masterMute={masterMute}
                  updateStemVolume={updateStemVolume}
                  toggleMuteStemState={toggleMuteStemState}
                  xyPos={xyPos}
                  padRef={padRef}
                  handleXyPadGesture={handleXyPadGesture}
                  handleXyTouchStart={handleXyTouchStart}
                  subOverdrive={subOverdrive}
                  setSubOverdrive={setSubOverdrive}
                  isDistorted={isDistorted}
                  setIsDistorted={setIsDistorted}
                  isScreaming={isScreaming}
                  setIsScreaming={setIsScreaming}
                  isEchoEnabled={isEchoEnabled}
                  setIsEchoEnabled={setIsEchoEnabled}
                  AudioEngine={AudioEngine}
                  zValue={zValue}
                  handleZValueChange={handleZValueChange}
                  tempo={tempo}
                  handleBpmSlideChange={handleBpmSlideChange}
                  handleTapTempo={handleTapTempo}
                />
              </div>

              <div className="bg-zinc-900/60 border border-zinc-850/80 p-5 rounded-2xl shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-zinc-800/65">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse" />
                  <h3 className="text-[10px] font-black tracking-widest text-amber-500 uppercase font-sans">⚡ LIVE EFFEKTE & TRANSIENTEN</h3>
                </div>
                <PerformanceSection
                  globalRhythm={globalRhythm}
                  setGlobalRhythm={setGlobalRhythm}
                  drumDensity={drumDensity}
                  setDrumDensity={setDrumDensity}
                  drumHat={drumHat}
                  setDrumHat={setDrumHat}
                  liveInstOverride={liveInstOverride}
                  setLiveInstOverride={setLiveInstOverride}
                  adjustOctaveMultiplier={adjustOctaveMultiplier}
                  playManualKick={playManualKick}
                  playManualCowbell={playManualCowbell}
                  playManualSiren={playManualSiren}
                  setTransDisplayMessage={setTransDisplayMessage}
                />
              </div>
            </div>

            {/* Right Column: Playlist Sequencer timeline & library presets */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              <div className="bg-zinc-900/60 border border-zinc-850/80 p-5 rounded-2xl shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-zinc-800/65">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
                  <h3 className="text-[10px] font-black tracking-widest text-emerald-400 uppercase font-sans">🎹 COMPOSITION PLAYLIST TIMELINE</h3>
                </div>
                <SequencerSection
                  composition={composition}
                  setComposition={setComposition}
                  compPlaybackActive={compPlaybackActive}
                  setCompPlaybackActive={handleToggleCompPlayback}
                  loopCompActive={loopCompActive}
                  setLoopCompActive={setLoopCompActive}
                  activeSongKey={activeSongKey}
                  removeTimelineBlock={removeTimelineBlock}
                  updateTimelineBlock={updateTimelineBlock}
                  addToTimeline={addToTimeline}
                  setTransDisplayMessage={setTransDisplayMessage}
                  compActiveBlockId={compActiveBlockId}
                />

                {/* WhatsApp shared camping control */}
                <div id="campfire-collab-sharing-panel-desk" className="bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/80 shadow-md mt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-900 pb-2.5 mb-2.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <h4 className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase font-mono">
                          |⛺ CAMPFIRE-SCHRAMMELN & WHATSAPP-TEILEREI|
                        </h4>
                      </div>
                      <p className="text-[9.5px] text-zinc-400 font-sans leading-relaxed mt-0.5">
                        Schick deinen Jam-Kollegn de Rhythmus- und Begleitungs-Konfiguration direkt via WhatsApp rüber!
                      </p>
                      <span className="text-[8px] bg-emerald-950/80 text-emerald-400 border border-emerald-900 px-1 rounded inline-block font-mono mt-1">
                        ⚡ Ur-komprimierter Datenstrizzi
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        id="whatsapp-share-timeline-btn-desk"
                        onClick={() => {
                          const payload: SharedRigData = {
                            mixQueue,
                            composition,
                            tempo,
                            activeSongKey,
                            globalRhythm,
                            drumDensity,
                            drumHat
                          };
                          const code = encodeSession(payload);
                          const finalUrl = `${window.location.origin}${window.location.pathname}?rig=${code}`;
                          const songName = songsData[activeSongKey]?.label || activeSongKey;
                          
                          const shareText = `🎸 *Hütten-Schrammel Rig Share fia di!* 🏕️\n\nServas! Ich hab grad a richtig gmiatliche live Drum & Bass Backing-Reihung zusammengebastelt fia unsern Bluetooth-Jam!\n\n🔑 *IMPORT-CODE (Kopieren ➔ In App auf IMPORTIEREN klicken):*\n${code}\n\n🔗 *Oder direkt über Link:* ${finalUrl}\n\n*Specs:* ${tempo} BPM | Hadern: ${songName} | Taktung: ${globalRhythm} (${mixQueue.length} Hadern gspeichert)`;
                          
                          window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
                          setTransDisplayMessage("📤 WhatsApp Link & Import-Code gschriem! Schicks dei Hawara.");
                        }}
                        className="flex items-center gap-1 bg-emerald-950 hover:bg-emerald-500 hover:text-zinc-950 text-emerald-300 border border-emerald-800/80 hover:border-emerald-500 text-[9.5px] p-1.5 px-3 rounded-md font-bold transition-all cursor-pointer active:scale-95 shadow-md shadow-emerald-950/10"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        VIA WHATSAPP TEILN
                      </button>
                      
                      <button
                        id="manual-import-toggle-btn-desk"
                        onClick={() => {
                          setShowManualImport(!showManualImport);
                          setShareInputText('');
                        }}
                        className={`flex items-center gap-1 text-[9.5px] p-1.5 px-3 rounded-md font-bold transition-all cursor-pointer border
                          ${showManualImport 
                            ? 'bg-zinc-800 text-white border-zinc-700' 
                            : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'}`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        CODE IMPORTIERN
                      </button>
                    </div>
                  </div>

                  {showManualImport && (
                    <div className="space-y-2 bg-zinc-900/60 p-2.5 rounded border border-zinc-850">
                      <label className="text-[8px] font-mono uppercase tracking-widest text-zinc-400 block mb-1">
                        HAU DEN LINK ODER CODE REIN:
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="Link mit ?rig=... oda Code do reinkleschn"
                          value={shareInputText}
                          onChange={(e) => setShareInputText(e.target.value)}
                          className="flex-grow bg-zinc-950 text-zinc-100 text-[10px] p-1.5 px-2 rounded border border-zinc-800 focus:outline-none focus:border-cyan-500 font-sans font-mono"
                        />
                        <button
                          id="run-code-import-btn-desk"
                          onClick={() => {
                            try {
                              const decoded = decodeSession(shareInputText);
                              if (decoded && decoded.mixQueue && typeof decoded.tempo === 'number') {
                                handleImportSharedRig(decoded);
                                setShowManualImport(false);
                                setShareInputText('');
                              } else {
                                setTransDisplayMessage("⚠️ Ungültiger Code/Format. Bitte check den Link oder de WhatsApp-Meldung nochamol.");
                              }
                            } catch (e) {
                              setTransDisplayMessage("⚠️ Fehler beim Ladn: Format hinich oder zerstückelt.");
                            }
                          }}
                          className="bg-cyan-950 hover:bg-cyan-500 hover:text-black hover:border-cyan-500 text-cyan-300 border border-cyan-800 text-[9.5px] p-1.5 px-3 rounded-md font-bold transition-all shrink-0 cursor-pointer active:scale-95"
                        >
                          RIG LADEN
                        </button>
                      </div>
                    </div>
                  )}

                  {/* LOCAL SAVES PANEL */}
                  <div className="mt-4 pt-3 border-t border-zinc-900 text-left">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Save className="w-3.5 h-3.5 text-cyan-400" />
                      <h4 className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase font-mono">
                        |💾 EIGENE JAMS LOKAL SPEICHERN & LADEN|
                      </h4>
                    </div>
                    
                    {/* Save New Form */}
                    <div className="flex gap-1.5 mb-3 bg-zinc-900/40 p-1.5 rounded border border-zinc-855">
                      <input
                        type="text"
                        placeholder="Nama fia dei Reihung (z.B. Berg-Mix #1)"
                        value={localSaveName}
                        onChange={(e) => setLocalSaveName(e.target.value)}
                        className="flex-grow bg-zinc-950 text-zinc-100 text-[9.5px] p-1.5 px-2 rounded border border-zinc-850 focus:outline-none focus:border-cyan-500 font-sans"
                      />
                      <button
                        onClick={() => {
                          handleSaveRigLocally(localSaveName);
                          setLocalSaveName('');
                        }}
                        className="bg-cyan-950 hover:bg-cyan-500 hover:text-black hover:border-cyan-500 text-cyan-300 border border-cyan-800 text-[9px] p-1.5 px-3 rounded font-bold transition-all shrink-0 cursor-pointer active:scale-95 flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" />
                        SPEICHERN
                      </button>
                    </div>

                    {/* List of Saves */}
                    {savedRigs.length === 0 ? (
                      <div className="text-[8.5px] text-zinc-550 text-center font-mono py-2 rounded bg-zinc-900/10 border border-dashed border-zinc-900">
                        KEINE LOKALEN SPEICHERUNGEN VORHANDEN. TRAG INHALT EIN & SPEICHERE DEINEN JAM LOKAL!
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                        {savedRigs.map((rig) => (
                          <div key={rig.id} className="flex items-center justify-between bg-zinc-900/50 p-1.5 px-2 rounded border border-zinc-850/60 hover:border-cyan-500/40 transition-all text-left group">
                            <button
                              onClick={() => handleImportSharedRig(rig.payload)}
                              className="flex-grow flex flex-col min-w-0 pr-2 transition hover:text-cyan-300 cursor-pointer text-left focus:outline-none"
                              title="Diesen Jam jetzt laden"
                            >
                              <span className="text-[9.5px] font-bold text-zinc-300 group-hover:text-cyan-300 truncate font-sans tracking-wide leading-tight">
                                {rig.name}
                              </span>
                              <span className="text-[7.5px] text-zinc-500 font-mono mt-0.5 leading-none block">
                                ⏱️ {rig.timestamp} • {rig.payload.composition?.length || 0} Slots
                              </span>
                            </button>
                            <button
                              onClick={() => handleDeleteRigLocally(rig.id)}
                              className="w-4 h-4 rounded bg-red-950/45 hover:bg-red-500 hover:text-black text-red-400 border border-red-900/30 flex items-center justify-center text-[9px] font-mono leading-none transition-all active:scale-90 shrink-0 cursor-pointer"
                              title="Aus local Speicher löschen"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-850/80 p-5 rounded-2xl shadow-xl backdrop-blur-md flex flex-col gap-4">
                <div className="flex items-center gap-2 mb-1 pb-2 border-b border-zinc-800/65">
                  <span className="w-2.5 h-2.5 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.6)] animate-pulse" />
                  <h3 className="text-[10px] font-black tracking-widest text-pink-500 uppercase font-sans">🎵 HADERN-BIBLIOTHEK (LIBRARY & PRESETS)</h3>
                </div>
                
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-lg bg-zinc-950/90 bg-opacity-90">
                  <div className="flex flex-col gap-2 mb-3">
                    <h2 className="text-[9px] font-black tracking-wider text-zinc-400 uppercase font-sans">🎵 STILRICHTUNG AUSSUCHN (PRESETS)</h2>
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                      {categories.map((catSpec) => (
                        <button
                          id={`cat-filter-desk-${catSpec.id}`}
                          key={catSpec.id}
                          onClick={() => setSelectedCategory(catSpec.id)}
                          className={`text-[9px] font-bold px-2.5 py-1 rounded-full transition-all shrink-0 cursor-pointer
                            ${selectedCategory === catSpec.id 
                              ? 'bg-cyan-400 text-zinc-900 font-black' 
                              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                            }`}
                        >
                          {catSpec.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto pr-1">
                    {filteredSongs.map((key) => {
                      const s = songsData[key];
                      const isActive = activeSongKey === key;
                      const isPending = pendingSongKey === key;
                      const isFav = favorites.includes(key);

                      return (
                        <div
                          key={key}
                          style={{ borderColor: s.color }}
                          className={`relative flex flex-col justify-between p-2.5 rounded-lg border-l-[3.5px] transition-all hover:bg-zinc-855 bg-zinc-950 text-zinc-200
                            ${isActive 
                              ? 'bg-zinc-850/60 shadow-md scale-98 border border-zinc-705/50' 
                              : isPending 
                                ? 'bg-zinc-90 w-full bg-zinc-900 border-dashed animate-pulse text-cyan-400' 
                                : 'border-zinc-900'
                            }`}
                        >
                          <button
                            id={`fav-toggle-desk-${key}`}
                            onClick={() => toggleFavoritePin(key)}
                            className="absolute top-1 right-1 p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-amber-405 transition-all cursor-pointer"
                          >
                            <Star className={`w-3 h-3 ${isFav ? 'text-amber-400 fill-current' : ''}`} />
                          </button>
                          <div id={`song-select-slot-desk-${key}`} className="cursor-pointer" onClick={() => handleSongPreloadSelect(key)}>
                            <span className="text-sm block leading-none mb-1">{s.emoji}</span>
                            <span className="font-extrabold text-[10.5px] block text-white truncate pr-4 leading-tight">{s.label}</span>
                            <div className="flex justify-between items-center text-[7.5px] text-zinc-500 font-mono mt-1">
                              <span>{s.bpm} BPM</span>
                            </div>
                          </div>
                          <button
                            id={`quick-queue-push-desk-${key}`}
                            onClick={() => handleAddSongToMixQueue(key)}
                            className="mt-2 text-[8px] font-mono font-bold py-0.5 rounded text-center block w-full bg-zinc-900 hover:bg-cyan-950 hover:text-cyan-400 border border-zinc-850/50 transition-all uppercase cursor-pointer"
                          >
                            + ANREIHEN
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <FavoriteDeck
                  favorites={favorites}
                  setFavorites={setFavorites}
                  activeSongKey={activeSongKey}
                  onSelectSong={(key) => handleSongPreloadSelect(key)}
                  onAddToQueue={(key) => handleAddSongToMixQueue(key)}
                />

                <MixQueuePlanner
                  queue={mixQueue}
                  setQueue={setMixQueue}
                  activeSongKey={activeSongKey}
                  globalRhythm={globalRhythm}
                  tempo={tempo}
                  onExecuteNextTransition={handleExecuteAutomatedTransit}
                  transitionActive={transitionActive}
                />
              </div>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="flex flex-col gap-4"
            >
              {activeTab === 'mixer' && (
                <MixerSection
                  kickVol={kickVol}
                  snareVol={snareVol}
                  subVol={subVol}
                  leadVol={leadVol}
                  masterVol={masterVol}
                  kickMute={kickMute}
                  snareMute={snareMute}
                  subMute={subMute}
                  leadMute={leadMute}
                  masterMute={masterMute}
                  updateStemVolume={updateStemVolume}
                  toggleMuteStemState={toggleMuteStemState}
                  xyPos={xyPos}
                  padRef={padRef}
                  handleXyPadGesture={handleXyPadGesture}
                  handleXyTouchStart={handleXyTouchStart}
                  subOverdrive={subOverdrive}
                  setSubOverdrive={setSubOverdrive}
                  isDistorted={isDistorted}
                  setIsDistorted={setIsDistorted}
                  isScreaming={isScreaming}
                  setIsScreaming={setIsScreaming}
                  isEchoEnabled={isEchoEnabled}
                  setIsEchoEnabled={setIsEchoEnabled}
                  AudioEngine={AudioEngine}
                  zValue={zValue}
                  handleZValueChange={handleZValueChange}
                  tempo={tempo}
                  handleBpmSlideChange={handleBpmSlideChange}
                  handleTapTempo={handleTapTempo}
                />
              )}

              {activeTab === 'library' && (
                <div className="flex flex-col gap-4">
                  {/* PRESETS SECTOR */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-lg bg-zinc-950/90 bg-opacity-90">
                    <div className="flex flex-col gap-2 mb-3">
                      <h2 className="text-sm font-black tracking-wider text-zinc-200 uppercase font-sans">
                        🎵 STILRICHTUNG AUSSUCHN (PRESSETS)
                      </h2>
                      
                      {/* Category tabs filters */}
                      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                        {categories.map((catSpec) => (
                          <button
                            id={`cat-filter-${catSpec.id}`}
                            key={catSpec.id}
                            onClick={() => setSelectedCategory(catSpec.id)}
                            className={`text-[9px] font-bold px-2.5 py-1 rounded-full transition-all shrink-0 cursor-pointer
                              ${selectedCategory === catSpec.id 
                                ? 'bg-cyan-400 text-zinc-950 font-black' 
                                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                              }`}
                          >
                            {catSpec.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Songs list */}
                    <div className="grid grid-cols-2 gap-2 max-h-[195px] overflow-y-auto pr-1">
                      {filteredSongs.map((key) => {
                        const s = songsData[key];
                        const isActive = activeSongKey === key;
                        const isPending = pendingSongKey === key;
                        const isFav = favorites.includes(key);

                        return (
                          <div
                            key={key}
                            style={{ borderColor: s.color }}
                            className={`relative flex flex-col justify-between p-2.5 rounded-lg border-l-[3.5px] transition-all hover:bg-zinc-855 bg-zinc-950 text-zinc-200
                              ${isActive 
                                ? 'bg-zinc-850/60 shadow-md scale-98 border border-zinc-705/50' 
                                : isPending 
                                  ? 'bg-zinc-90 w-full bg-zinc-900 border-dashed animate-pulse text-cyan-400' 
                                  : 'border-zinc-900'
                              }`}
                          >
                            <button
                              id={`fav-toggle-${key}`}
                              onClick={() => toggleFavoritePin(key)}
                              className="absolute top-1 right-1 p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-amber-405 transition-all cursor-pointer"
                            >
                              <Star className={`w-3 h-3 ${isFav ? 'text-amber-400 fill-current' : ''}`} />
                            </button>

                            <div id={`song-select-slot-${key}`} className="cursor-pointer" onClick={() => handleSongPreloadSelect(key)}>
                              <span className="text-sm block leading-none mb-1">{s.emoji}</span>
                              <span className="font-extrabold text-[10.5px] block text-white truncate pr-4 leading-tight">
                                {s.label}
                              </span>
                              <div className="flex justify-between items-center text-[7.5px] text-zinc-500 font-mono mt-1">
                                <span>{s.bpm} BPM</span>
                              </div>
                            </div>

                            <button
                              id={`quick-queue-push-${key}`}
                              onClick={() => handleAddSongToMixQueue(key)}
                              className="mt-2 text-[8px] font-mono font-bold py-0.5 rounded text-center block w-full bg-zinc-900 hover:bg-cyan-950 hover:text-cyan-400 border border-zinc-850/50 transition-all uppercase cursor-pointer"
                            >
                              + ANREIHEN
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <FavoriteDeck
                    favorites={favorites}
                    setFavorites={setFavorites}
                    activeSongKey={activeSongKey}
                    onSelectSong={(key) => handleSongPreloadSelect(key)}
                    onAddToQueue={(key) => handleAddSongToMixQueue(key)}
                  />

                  <MixQueuePlanner
                    queue={mixQueue}
                    setQueue={setMixQueue}
                    activeSongKey={activeSongKey}
                    globalRhythm={globalRhythm}
                    tempo={tempo}
                    onExecuteNextTransition={handleExecuteAutomatedTransit}
                    transitionActive={transitionActive}
                  />
                </div>
              )}

              {activeTab === 'performance' && (
                <PerformanceSection
                  globalRhythm={globalRhythm}
                  setGlobalRhythm={setGlobalRhythm}
                  drumDensity={drumDensity}
                  setDrumDensity={setDrumDensity}
                  drumHat={drumHat}
                  setDrumHat={setDrumHat}
                  liveInstOverride={liveInstOverride}
                  setLiveInstOverride={setLiveInstOverride}
                  adjustOctaveMultiplier={adjustOctaveMultiplier}
                  playManualKick={playManualKick}
                  playManualCowbell={playManualCowbell}
                  playManualSiren={playManualSiren}
                  setTransDisplayMessage={setTransDisplayMessage}
                />
              )}

              {activeTab === 'sequencer' && (
                <div className="flex flex-col gap-4">
                  <SequencerSection
                    composition={composition}
                    setComposition={setComposition}
                    compPlaybackActive={compPlaybackActive}
                    setCompPlaybackActive={handleToggleCompPlayback}
                    loopCompActive={loopCompActive}
                    setLoopCompActive={setLoopCompActive}
                    activeSongKey={activeSongKey}
                    removeTimelineBlock={removeTimelineBlock}
                    updateTimelineBlock={updateTimelineBlock}
                    addToTimeline={addToTimeline}
                    setTransDisplayMessage={setTransDisplayMessage}
                    compActiveBlockId={compActiveBlockId}
                  />

                  {/* WhatsApp Camping Share Control Center */}
                  <div id="campfire-collab-sharing-panel" className="bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/80 shadow-md">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-900 pb-2.5 mb-2.5">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <h4 className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase font-mono">
                            |⛺ CAMPFIRE-SCHRAMMELN & WHATSAPP-TEILEREI|
                          </h4>
                        </div>
                        <p className="text-[9.5px] text-zinc-400 font-sans leading-relaxed mt-0.5">
                          Schick deinen Jam-Kollegn de Rhythmus- und Begleitungs-Konfiguration direkt via WhatsApp rüber, damit alle synchron vibrieren und mid-schrammeln kenna!
                        </p>
                        <span className="text-[8px] bg-emerald-950/80 text-emerald-400 border border-emerald-900 px-1 rounded inline-block font-mono mt-1">
                          ⚡ Ur-komprimierter Datenstrizzi (Sicher für WhatsApp & Bluetooth-Boxn)
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <button
                          id="whatsapp-share-timeline-btn"
                          onClick={() => {
                            const payload: SharedRigData = {
                              mixQueue,
                              composition,
                              tempo,
                              activeSongKey,
                              globalRhythm,
                              drumDensity,
                              drumHat
                            };
                            const code = encodeSession(payload);
                            const finalUrl = `${window.location.origin}${window.location.pathname}?rig=${code}`;
                            const songName = songsData[activeSongKey]?.label || activeSongKey;
                            
                            const shareText = `🎸 *Hütten-Schrammel Rig Share fia di!* 🏕️\n\nServas! Ich hab grad a richtig gmiatliche live Drum & Bass Backing-Reihung zusammengebastelt fia unsern Bluetooth-Jam!\n\n🔑 *IMPORT-CODE (Kopieren ➔ In App auf IMPORTIEREN klicken):*\n${code}\n\n🔗 *Oder direkt über Link:* ${finalUrl}\n\n*Specs:* ${tempo} BPM | Hadern: ${songName} | Taktung: ${globalRhythm} (${mixQueue.length} Hadern gspeichert)`;
                            
                            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
                            setTransDisplayMessage("📤 WhatsApp Link & Import-Code gschriem! Schicks dei Hawara.");
                          }}
                          className="flex items-center gap-1 bg-emerald-950 hover:bg-emerald-500 hover:text-zinc-950 text-emerald-300 border border-emerald-800/80 hover:border-emerald-500 text-[9.5px] p-1.5 px-3 rounded-md font-bold transition-all cursor-pointer active:scale-95 shadow-md shadow-emerald-950/10"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          VIA WHATSAPP TEILN
                        </button>
                        
                        <button
                          id="manual-import-toggle-btn"
                          onClick={() => {
                            setShowManualImport(!showManualImport);
                            setShareInputText('');
                          }}
                          className={`flex items-center gap-1 text-[9.5px] p-1.5 px-3 rounded-md font-bold transition-all cursor-pointer border
                            ${showManualImport 
                              ? 'bg-zinc-800 text-white border-zinc-700' 
                              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                          CODE IMPORTIERN
                        </button>
                      </div>
                    </div>

                    {showManualImport && (
                      <div className="space-y-2 bg-zinc-900/60 p-2.5 rounded border border-zinc-850">
                        <label className="text-[8px] font-mono uppercase tracking-widest text-zinc-400 block mb-1">
                          HAU DEN LINK ODER CODE REIN:
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            placeholder="Link mit ?rig=... oda Code do reinkleschn"
                            value={shareInputText}
                            onChange={(e) => setShareInputText(e.target.value)}
                            className="flex-grow bg-zinc-950 text-zinc-100 text-[10px] p-1.5 px-2 rounded border border-zinc-800 focus:outline-none focus:border-cyan-500 font-sans font-mono"
                          />
                          <button
                            id="run-code-import-btn"
                            onClick={() => {
                              try {
                                const decoded = decodeSession(shareInputText);
                                if (decoded && decoded.mixQueue && typeof decoded.tempo === 'number') {
                                  handleImportSharedRig(decoded);
                                  setShowManualImport(false);
                                  setShareInputText('');
                                } else {
                                  setTransDisplayMessage("⚠️ Ungültiger Code/Format. Bitte check den Link oder de WhatsApp-Meldung nochamol.");
                                }
                              } catch (e) {
                                setTransDisplayMessage("⚠️ Fehler beim Ladn: Format hinich oder zerstückelt.");
                              }
                            }}
                            className="bg-cyan-950 hover:bg-cyan-500 hover:text-black hover:border-cyan-500 text-cyan-300 border border-cyan-800 text-[9.5px] p-1.5 px-3 rounded-md font-bold transition-all shrink-0 cursor-pointer active:scale-95"
                          >
                            RIG LADEN
                          </button>
                        </div>
                        <span className="text-[8px] text-zinc-500 font-mono block">
                          Hau den Link von deim Freind do reinkopiern, und scho rennt de Maschin blitzschnell!
                        </span>
                      </div>
                    )}

                    {/* LOCAL SAVES PANEL */}
                    <div className="mt-4 pt-3 border-t border-zinc-900 text-left">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Save className="w-3.5 h-3.5 text-cyan-400" />
                        <h4 className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase font-mono">
                          |💾 EIGENE JAMS LOKAL SPEICHERN & LADEN|
                        </h4>
                      </div>
                      
                      {/* Save New Form */}
                      <div className="flex gap-1.5 mb-3 bg-zinc-900/40 p-1.5 rounded border border-zinc-855">
                        <input
                          type="text"
                          placeholder="Nama fia dei Reihung (z.B. Berg-Mix #1)"
                          value={localSaveName}
                          onChange={(e) => setLocalSaveName(e.target.value)}
                          className="flex-grow bg-zinc-950 text-zinc-100 text-[9.5px] p-1.5 px-2 rounded border border-zinc-850 focus:outline-none focus:border-cyan-500 font-sans"
                        />
                        <button
                          onClick={() => {
                            handleSaveRigLocally(localSaveName);
                            setLocalSaveName('');
                          }}
                          className="bg-cyan-950 hover:bg-cyan-500 hover:text-black hover:border-cyan-500 text-cyan-300 border border-cyan-800 text-[9px] p-1.5 px-3 rounded font-bold transition-all shrink-0 cursor-pointer active:scale-95 flex items-center gap-1"
                        >
                          <Save className="w-3 h-3" />
                          SPEICHERN
                        </button>
                      </div>

                      {/* List of Saves */}
                      {savedRigs.length === 0 ? (
                        <div className="text-[8.5px] text-zinc-550 text-center font-mono py-2 rounded bg-zinc-900/10 border border-dashed border-zinc-900">
                          KEINE LOKALEN SPEICHERUNGEN VORHANDEN. TRAG INHALT EIN & SPEICHERE DEINEN JAM LOKAL!
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                          {savedRigs.map((rig) => (
                            <div key={rig.id} className="flex items-center justify-between bg-zinc-900/50 p-1.5 px-2 rounded border border-zinc-850/60 hover:border-cyan-500/40 transition-all text-left group">
                              <button
                                onClick={() => handleImportSharedRig(rig.payload)}
                                className="flex-grow flex flex-col min-w-0 pr-2 transition hover:text-cyan-300 cursor-pointer text-left focus:outline-none"
                                title="Diesen Jam jetzt laden"
                              >
                                <span className="text-[9.5px] font-bold text-zinc-300 group-hover:text-cyan-300 truncate font-sans tracking-wide leading-tight">
                                  {rig.name}
                                </span>
                                <span className="text-[7.5px] text-zinc-500 font-mono mt-0.5 leading-none block">
                                  ⏱️ {rig.timestamp} • {rig.payload.composition?.length || 0} Slots
                                </span>
                              </button>
                              <button
                                onClick={() => handleDeleteRigLocally(rig.id)}
                                className="w-4 h-4 rounded bg-red-950/45 hover:bg-red-500 hover:text-black text-red-400 border border-red-900/30 flex items-center justify-center text-[9px] font-mono leading-none transition-all active:scale-90 shrink-0 cursor-pointer"
                                title="Aus local Speicher löschen"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* iOS GLASSMORPHIC TAB BAR COMPONENT */}
      <nav 
        id="ios-bottom-bar" 
        className={`${isDesktop ? 'hidden' : 'fixed bottom-0 left-0 right-0 z-50 md:max-w-md md:mx-auto bg-zinc-900/95 backdrop-blur-lg border-t border-zinc-800/80 px-4 pt-2.5 pb-6 flex items-center justify-around text-zinc-450 select-none shadow-[0_-8px_24px_rgba(0,0,0,0.6)]'}`}
      >
        {/* Tab 1: Sequencer Timeline */}
        <button
          id="tab-btn-sequencer"
          onClick={() => setActiveTab('sequencer')}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-all duration-100 py-1 flex-1
            ${activeTab === 'sequencer' 
              ? 'text-emerald-450 text-emerald-400 scale-[1.02]' 
              : 'text-zinc-500 hover:text-zinc-300'
            }`}
        >
          <Layers className={`w-4.5 h-4.5 ${activeTab === 'sequencer' ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
          <span className="text-[9.5px] font-sans font-bold tracking-tight">Hadern-Reihung</span>
        </button>

        {/* Tab 2: Mixer */}
        <button
          id="tab-btn-mixer"
          onClick={() => setActiveTab('mixer')}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-all duration-100 py-1 flex-1
            ${activeTab === 'mixer' 
              ? 'text-cyan-400 scale-[1.02]' 
              : 'text-zinc-500 hover:text-zinc-300'
            }`}
        >
          <Sliders className={`w-4.5 h-4.5 ${activeTab === 'mixer' ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
          <span className="text-[9.5px] font-sans font-bold tracking-tight">Mischpult</span>
        </button>

        {/* Tab 3: Drums and Rhythm */}
        <button
          id="tab-btn-performance"
          onClick={() => setActiveTab('performance')}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-all duration-100 py-1 flex-1
            ${activeTab === 'performance' 
              ? 'text-amber-500 scale-[1.02]' 
              : 'text-zinc-500 hover:text-zinc-300'
            }`}
        >
          <Zap className={`w-4.5 h-4.5 ${activeTab === 'performance' ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
          <span className="text-[9.5px] font-sans font-bold tracking-tight">Takte & Krach</span>
        </button>

        {/* Tab 4: Library */}
        <button
          id="tab-btn-library"
          onClick={() => setActiveTab('library')}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-all duration-100 py-1 flex-1
            ${activeTab === 'library' 
              ? 'text-pink-500 scale-[1.02]' 
              : 'text-zinc-500 hover:text-zinc-300'
            }`}
        >
          <Music className={`w-4.5 h-4.5 ${activeTab === 'library' ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
          <span className="text-[9.5px] font-sans font-bold tracking-tight">Hadern-Sammlung</span>
        </button>
      </nav>

    </div>
  );
}
