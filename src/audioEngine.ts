/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Song } from './types';
import { songsData, fillK, fillS, fillH, rhythmSteps } from './songsData';

class AudioEngineClass {
  public ctx: AudioContext | null = null;
  public analyser: AnalyserNode | null = null;
  
  // Master Chain
  public absoluteMasterGain: GainNode | null = null;
  public masterCompressor: DynamicsCompressorNode | null = null;
  public masterFilter: BiquadFilterNode | null = null;
  public masterDistortion: WaveShaperNode | null = null;
  public masterDistWet: GainNode | null = null;
  
  // FX Delay
  public delayNode: DelayNode | null = null;
  public feedbackGain: GainNode | null = null;
  public delayGain: GainNode | null = null;
  
  // Stems Gain & Nodes
  public stems: Record<string, {
    gainNode: GainNode | null;
    distortionNode?: WaveShaperNode | null;
    volume: number;
    mute: boolean;
  }> = {
    kick: { gainNode: null, volume: 1.0, mute: true },
    snare: { gainNode: null, volume: 0.8, mute: true },
    sub: { gainNode: null, distortionNode: null, volume: 0.7, mute: true },
    lead: { gainNode: null, volume: 0.8, mute: false },
  };

  // Live Mixer State (cloned to sync with React)
  public isGoing: boolean = false;
  public tempo: number = 120;
  public globalRhythm: string = '4/4';
  public drumDensity: 'sparse' | 'normal' | 'full' = 'normal';
  public drumHat: 'off' | 'mixed' | 'open' = 'mixed';
  public liveInstOverride: string | null = null;
  public octaveMultiplier: number = 1.0;
  
  // Fill State
  public fillActive: boolean = false;
  public fillStep: number = 0;
  public fillType: 'snare_build' | 'double_time' | 'syncopated_funk' = 'snare_build';
  
  // Scheduling parameters
  public nextNoteTime: number = 0;
  public currentStep: number = 0;
  public activeSongKey: string = 'house';
  public pendingSongKey: string | null = null;
  
  // FX parameters
  public isDistorted: boolean = false;
  public isScreaming: boolean = false;
  public isEchoEnabled: boolean = false;
  
  // Active state notifications to React
  private onStepCallback: ((step: number, currentBlockKey: string) => void) | null = null;
  private onBpmCallback: ((newBpm: number) => void) | null = null;
  private onTransCompleteCallback: (() => void) | null = null;

  // Transition parameters
  public transActive: boolean = false;
  public transBars: number = 4;
  private transTimer: any = null;
  private savedMasterVol: number = 0.5;
  private savedSnareVol: number = 0.8;
  private savedLeadVol: number = 0.8;

  constructor() {}

  public init() {
    if (this.ctx) return;
    
    // Create modern standard context
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    this.ctx = new AudioContextClass();

    // Create Analyser for real-time visual visual feedback
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64;
    
    // Chain structure
    this.absoluteMasterGain = this.ctx.createGain();
    this.absoluteMasterGain.gain.value = 0.5;
    
    this.masterCompressor = this.ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -6;
    this.masterCompressor.ratio.value = 4;
    
    this.masterFilter = this.ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.value = 20000;
    this.masterFilter.Q.value = 1;
    
    this.masterDistortion = this.ctx.createWaveShaper();
    this.masterDistortion.curve = this.makeDistCurve(220);
    this.masterDistortion.oversample = '4x';
    
    this.masterDistWet = this.ctx.createGain();
    this.masterDistWet.gain.value = 0;
    
    this.delayNode = this.ctx.createDelay(1.5);
    this.delayNode.delayTime.value = (60 / this.tempo) / 4;
    
    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.4;
    
    this.delayGain = this.ctx.createGain();
    this.delayGain.gain.value = 0;
    
    // Stems setup
    this.stems.kick.gainNode = this.ctx.createGain();
    this.stems.snare.gainNode = this.ctx.createGain();
    this.stems.sub.gainNode = this.ctx.createGain();
    this.stems.sub.distortionNode = this.ctx.createWaveShaper();
    this.stems.sub.distortionNode.curve = this.makeDistCurve(8);
    this.stems.sub.distortionNode.oversample = '4x';
    this.stems.lead.gainNode = this.ctx.createGain();
    
    // Defaults matching the mixer buttons
    this.stems.kick.gainNode.gain.value = 0; // Off/muted initially
    this.stems.snare.gainNode.gain.value = 0; // Off/muted initially
    this.stems.sub.gainNode.gain.value = 0; // Sub starts OFF/muted
    this.stems.lead.gainNode.gain.value = 0.8; // Lead starts ON
    
    // Wiring the matrix
    const targets = [
      this.stems.kick.gainNode,
      this.stems.snare.gainNode,
      this.stems.sub.distortionNode,
      this.stems.lead.gainNode
    ];
    
    targets.forEach((node) => {
      if (node && this.masterFilter && this.delayNode) {
        node.connect(this.masterFilter);
        node.connect(this.delayNode);
      }
    });
    
    this.stems.sub.gainNode.connect(this.stems.sub.distortionNode);
    
    this.masterFilter.connect(this.masterDistortion);
    this.masterFilter.connect(this.masterDistWet);
    this.masterDistortion.connect(this.masterCompressor);
    this.masterDistWet.connect(this.masterCompressor);
    
    this.masterCompressor.connect(this.absoluteMasterGain);
    if (this.analyser) {
      this.absoluteMasterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    } else {
      this.absoluteMasterGain.connect(this.ctx.destination);
    }
    
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);
    this.delayNode.connect(this.delayGain);
    
    if (this.delayGain && this.masterCompressor) {
      this.delayGain.connect(this.masterCompressor);
    }
    
    this.updateVolumes();
  }
  
  private makeDistCurve(amt: number) {
    const k = Math.max(0, amt);
    const n = 44100;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }
  
  public setCallbacks(
    onStep: (step: number, blockKey: string) => void,
    onBpm: (bpm: number) => void,
    onTransComplete: () => void
  ) {
    this.onStepCallback = onStep;
    this.onBpmCallback = onBpm;
    this.onTransCompleteCallback = onTransComplete;
  }

  public getAverageAmplitude(): number {
    if (!this.analyser || !this.ctx) return 0;
    const array = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(array);
    let sum = 0;
    for (let i = 0; i < array.length; i++) {
      sum += array[i];
    }
    const val = sum / array.length / 255;
    // Boost low levels for better visual scaling and sensitivity
    return Math.min(1.0, val * 1.5);
  }
  
  public playKick(t: number) {
    if (!this.ctx || !this.stems.kick.gainNode) return;
    const o = this.ctx.createOscillator();
    const e = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.18);
    
    e.gain.setValueAtTime(1.1, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    
    o.connect(e);
    e.connect(this.stems.kick.gainNode);
    o.start(t);
    o.stop(t + 0.4);
    
    o.onended = () => {
      try { e.disconnect(); } catch {}
    };
  }
  
  public playSnare(t: number, velocity: number = 0.85) {
    if (!this.ctx || !this.stems.snare.gainNode) return;
    const sampleRate = this.ctx.sampleRate;
    const bSize = sampleRate * 0.12;
    const bf = this.ctx.createBuffer(1, bSize, sampleRate);
    const d = bf.getChannelData(0);
    for (let i = 0; i < bSize; i++) {
      d[i] = Math.random() * 2 - 1;
    }
    
    const n = this.ctx.createBufferSource();
    n.buffer = bf;
    
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(velocity, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 950;
    
    n.connect(f);
    f.connect(e);
    e.connect(this.stems.snare.gainNode);
    
    n.start(t);
    n.stop(t + 0.15);
    
    n.onended = () => {
      try { e.disconnect(); f.disconnect(); } catch {}
    };
  }
  
  public playHiHat(t: number, isOpen: boolean) {
    if (!this.ctx || !this.stems.snare.gainNode) return;
    const sampleRate = this.ctx.sampleRate;
    const dur = isOpen ? 0.14 : 0.052;
    const bSize = sampleRate * dur;
    const bf = this.ctx.createBuffer(1, bSize, sampleRate);
    const d = bf.getChannelData(0);
    for (let i = 0; i < bSize; i++) {
      d[i] = Math.random() * 2 - 1;
    }
    
    const n = this.ctx.createBufferSource();
    n.buffer = bf;
    
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(isOpen ? 0.38 : 0.28, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + dur);
    
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    
    n.connect(f);
    f.connect(e);
    e.connect(this.stems.snare.gainNode);
    
    n.start(t);
    n.stop(t + dur + 0.02);
    
    n.onended = () => {
      try { e.disconnect(); f.disconnect(); } catch {}
    };
  }
  
  public playClave(t: number) {
    if (!this.ctx || !this.stems.snare.gainNode) return;
    const o = this.ctx.createOscillator();
    const e = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1180, t);
    o.frequency.exponentialRampToValueAtTime(850, t + 0.012);
    
    e.gain.setValueAtTime(0.45, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.042);
    
    o.connect(e);
    e.connect(this.stems.snare.gainNode);
    o.start(t);
    o.stop(t + 0.05);
    o.onended = () => {
      try { e.disconnect(); } catch {}
    };
  }
  
  public playCowbell(t: number) {
    if (!this.ctx || !this.stems.snare.gainNode) return;
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const e = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    
    o1.type = 'square';
    o1.frequency.value = 562;
    o2.type = 'square';
    o2.frequency.value = 848;
    
    f.type = 'bandpass';
    f.frequency.value = 750;
    f.Q.value = 3.2;
    
    e.gain.setValueAtTime(0.35, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    
    o1.connect(f);
    o2.connect(f);
    f.connect(e);
    e.connect(this.stems.snare.gainNode);
    
    o1.start(t);
    o2.start(t);
    o1.stop(t + 0.2);
    o2.stop(t + 0.2);
    
    o1.onended = () => {
      try { e.disconnect(); f.disconnect(); } catch {}
    };
  }
  
  public playClap(t: number) {
    if (!this.ctx || !this.stems.snare.gainNode) return;
    const sampleRate = this.ctx.sampleRate;
    const bSize = sampleRate * 0.055;
    const bf = this.ctx.createBuffer(1, bSize, sampleRate);
    const d = bf.getChannelData(0);
    for (let i = 0; i < bSize; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.009));
    }
    
    const n = this.ctx.createBufferSource();
    n.buffer = bf;
    
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.55, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.092);
    
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2300;
    f.Q.value = 1.1;
    
    n.connect(f);
    f.connect(e);
    e.connect(this.stems.snare.gainNode);
    
    n.start(t);
    n.stop(t + 0.12);
    
    n.onended = () => {
      try { e.disconnect(); f.disconnect(); } catch {}
    };
  }
  
  public playSubBass(t: number, fr: number) {
    if (!this.ctx || !this.stems.sub.gainNode) return;
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const e = this.ctx.createGain();
    
    o1.type = 'sine';
    o1.frequency.value = fr / 2.0; 
    o2.type = 'triangle';
    o2.frequency.value = fr;
    
    e.gain.setValueAtTime(0.68, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    
    o1.connect(e);
    o2.connect(e);
    e.connect(this.stems.sub.gainNode);
    
    o1.start(t);
    o2.start(t);
    o1.stop(t + 1.0);
    o2.stop(t + 1.0);
    
    let endCount = 0;
    const checkEnd = () => {
      endCount++;
      if (endCount >= 2) {
        try { e.disconnect(); } catch {}
      }
    };
    
    o1.onended = checkEnd;
    o2.onended = checkEnd;
  }
  
  public playInstrumentPattern(t: number, inst: string, fr: number) {
    if (!this.ctx || !this.stems.lead.gainNode || !fr) return;
    const finalFreq = fr * this.octaveMultiplier;
    
    if (inst === 'sax') {
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      const e = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      
      o1.type = 'sawtooth';
      o1.frequency.value = finalFreq;
      o2.type = 'sawtooth';
      o2.frequency.value = finalFreq * 1.006;
      
      f.type = 'lowpass';
      f.frequency.value = 2800;
      
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(0.55, t + 0.04);
      e.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      
      o1.connect(f);
      o2.connect(f);
      f.connect(e);
      e.connect(this.stems.lead.gainNode);
      
      o1.start(t);
      o2.start(t);
      o1.stop(t + 0.5);
      o2.stop(t + 0.5);
      o1.onended = () => { try { e.disconnect(); f.disconnect(); } catch {} };
    } 
    else if (inst === 'synth') {
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      const o3 = this.ctx.createOscillator();
      const e = this.ctx.createGain();
      
      o1.type = 'sawtooth'; o1.frequency.value = finalFreq;
      o2.type = 'sawtooth'; o2.frequency.value = finalFreq * 1.012;
      o3.type = 'square';   o3.frequency.value = finalFreq * 0.988;
      
      e.gain.setValueAtTime(0.28, t);
      e.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      
      o1.connect(e);
      o2.connect(e);
      o3.connect(e);
      e.connect(this.stems.lead.gainNode);
      
      o1.start(t); o2.start(t); o3.start(t);
      o1.stop(t + 0.4); o2.stop(t + 0.4); o3.stop(t + 0.4);
      o1.onended = () => { try { e.disconnect(); } catch {} };
    } 
    else if (inst === 'acid') {
      const o = this.ctx.createOscillator();
      const e = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      
      o.type = 'sawtooth';
      o.frequency.value = finalFreq;
      
      f.type = 'lowpass';
      f.Q.value = 16;
      f.frequency.setValueAtTime(3800, t);
      f.frequency.exponentialRampToValueAtTime(180, t + 0.22);
      
      e.gain.setValueAtTime(0.68, t);
      e.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      
      o.connect(f);
      f.connect(e);
      e.connect(this.stems.lead.gainNode);
      
      o.start(t);
      o.stop(t + 0.35);
      o.onended = () => { try { e.disconnect(); f.disconnect(); } catch {} };
    }
    else if (inst === 'chip') {
      const o = this.ctx.createOscillator();
      const e = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = finalFreq;
      
      e.gain.setValueAtTime(0.32, t);
      e.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      
      o.connect(e);
      e.connect(this.stems.lead.gainNode);
      
      o.start(t);
      o.stop(t + 0.16);
      o.onended = () => { try { e.disconnect(); } catch {} };
    }
    else if (inst === 'flute') {
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      const e = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      
      o1.type = 'sine'; o1.frequency.value = finalFreq;
      o2.type = 'sine'; o2.frequency.value = finalFreq * 1.004;
      
      f.type = 'lowpass'; f.frequency.value = 3500;
      
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(0.48, t + 0.035);
      e.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      
      o1.connect(f);
      o2.connect(f);
      f.connect(e);
      e.connect(this.stems.lead.gainNode);
      
      o1.start(t); o2.start(t);
      o1.stop(t + 0.52); o2.stop(t + 0.52);
      o1.onended = () => { try { e.disconnect(); f.disconnect(); } catch {} };
    }
    else if (inst === 'surf') {
      const o = this.ctx.createOscillator();
      const e = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = finalFreq;
      
      e.gain.setValueAtTime(0.75, t);
      e.gain.exponentialRampToValueAtTime(0.001, t + 0.095);
      
      o.connect(e);
      e.connect(this.stems.lead.gainNode);
      
      o.start(t);
      o.stop(t + 0.22);
      o.onended = () => { try { e.disconnect(); } catch {} };
    }
    else if (inst === 'strings') {
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      const e = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      
      o1.type = 'sawtooth'; o1.frequency.value = finalFreq;
      o2.type = 'sawtooth'; o2.frequency.value = finalFreq * 1.003;
      
      f.type = 'lowpass'; f.frequency.value = 1800; f.Q.value = 0.5;
      
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(0.25, t + 0.09);
      e.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      
      o1.connect(f);
      o2.connect(f);
      f.connect(e);
      e.connect(this.stems.lead.gainNode);
      
      o1.start(t); o2.start(t);
      o1.stop(t + 0.65); o2.stop(t + 0.65);
      o1.onended = () => { try { e.disconnect(); f.disconnect(); } catch {} };
    }
    else {
      // Default brass/sawtooth
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      const o3 = this.ctx.createOscillator();
      const e = this.ctx.createGain();
      
      o1.type = 'sawtooth'; o1.frequency.value = finalFreq;
      o2.type = 'sawtooth'; o2.frequency.value = finalFreq * 1.004;
      o3.type = 'square';   o3.frequency.value = finalFreq * 0.996;
      
      e.gain.setValueAtTime(0.38, t);
      e.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      
      o1.connect(e);
      o2.connect(e);
      o3.connect(e);
      e.connect(this.stems.lead.gainNode);
      
      o1.start(t); o2.start(t); o3.start(t);
      o1.stop(t + 0.42); o2.stop(t + 0.42); o3.stop(t + 0.42);
      o1.onended = () => { try { e.disconnect(); } catch {} };
    }
  }
  
  public loop() {
    if (!this.isGoing || !this.ctx || this.ctx.state === 'suspended') return;
    
    const ct = this.ctx.currentTime;
    if (this.nextNoteTime < ct - 0.5) {
      this.nextNoteTime = ct;
    }
    
    const secondsPerStep = (60.0 / this.tempo) / 4;
    
    while (this.nextNoteTime < ct + 0.1) {
      const activeRhythm = this.globalRhythm;
      const stepCount = rhythmSteps[activeRhythm] || 16;
      const step = this.currentStep % stepCount;
      
      // Auto-load pending track at step boundaries
      if (this.pendingSongKey && step === 0) {
        this.activeSongKey = this.pendingSongKey;
        this.pendingSongKey = null;
        this.tempo = songsData[this.activeSongKey].bpm;
        if (this.onBpmCallback) this.onBpmCallback(this.tempo);
      }
      
      const songData = songsData[this.activeSongKey] || songsData.house;
      const activeInst = this.liveInstOverride || songData.inst;
      const drumType = songData.drumType;
      
      // Trigger callback
      if (this.onStepCallback) {
        this.onStepCallback(step, this.activeSongKey);
      }
      
      // Drum trigger flags
      let dK = false, dS = false, dHC = false, dHO = false, dCL = false, dCB = false, dCP = false;
      
      if (this.fillActive) {
        const fs = this.fillStep % 16;
        
        let customK = 0;
        let customS = 0;
        let customH = 0;
        
        if (this.fillType === 'double_time') {
          // Energetic 32nd style doubles
          customK = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1][fs];
          customS = [0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1][fs];
          customH = [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1][fs];
        } else if (this.fillType === 'syncopated_funk') {
          // Playful campfire/groove park fill - great for acoustic jams!
          customK = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0][fs];
          customS = [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1][fs];
          customH = [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1][fs];
        } else {
          // 'snare_build' - Legendary rising snare roll drop
          customK = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0][fs];
          customS = [0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1][fs];
          customH = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0][fs];
        }
        
        dK = customK === 1;
        dS = customS === 1;
        dHC = customH === 1;
        
        // Crescendo curve volume on snare roll
        const snareVelocity = 0.35 + (this.fillStep / 15) * 0.55; 
        
        this.fillStep++;
        if (this.fillStep >= 16) {
          this.fillActive = false;
        }
        
        if (dK) this.playKick(this.nextNoteTime);
        if (dS) this.playSnare(this.nextNoteTime, snareVelocity);
        if (dHC) this.playHiHat(this.nextNoteTime, false);
        
        // Block other drum hits so the fill stays perfectly clean & defined
        dK = false;
        dS = false;
        dCP = false;
        dHC = false;
        dHO = false;
        dCL = false;
        dCB = false;
      } else {
        // Evaluate custom rhythms
        if (activeRhythm === '7/8') {
          if (step === 0 || step === 8) dK = true;
          if (step === 4 || step === 12) dS = true;
          if (step % 2 === 0) dHC = true;
        } else if (activeRhythm === '3/4') {
          if (step === 0) dK = true;
          if (step === 4 || step === 8) dS = true;
          if (step % 2 === 0) dHC = true;
        } else if (activeRhythm === '5/4') {
          if (step === 0 || step === 12) dK = true;
          if (step === 8) dS = true;
          if (step % 2 === 0) dHC = true;
        } else if (activeRhythm === '6/8') {
          if (step === 0) dK = true;
          if (step === 6) dS = true;
          if (step % 2 === 0) dHC = true;
        } else if (activeRhythm === '9/8') {
          if (step === 0 || step === 12) dK = true;
          if (step === 4 || step === 10) dS = true;
          if (step % 2 === 0) dHC = true;
        } else if (activeRhythm === '12/8') {
          if (step === 0 || step === 12) dK = true;
          if (step === 6 || step === 18) dS = true;
          if (step % 2 === 0) dHC = true;
        } else if (activeRhythm === '2/4') {
          if (step === 0) dK = true;
          if (step === 4) dS = true;
          if (step % 2 === 0) dHC = true;
        } else if (activeRhythm === 'rumba') {
          if (step === 0 || step === 6 || step === 11) dK = true;
          if (step === 4 || step === 12) dS = true;
          if (step % 2 === 0) dHC = true;
          if (step === 3 || step === 9) dCL = true;
        } else if (activeRhythm === 'dembow') {
          if (step === 0 || step === 4 || step === 8 || step === 12) dK = true;
          if (step === 3 || step === 7 || step === 11 || step === 15) dS = true;
          if (step % 2 === 0) dHC = true;
        } else if (activeRhythm === 'clave') {
          if (step === 0 || step === 8) dK = true;
          if (step === 4 || step === 12) dS = true;
          if (step === 0 || step === 3 || step === 6 || step === 10 || step === 12) dCL = true;
          if (step % 2 === 0) dHC = true;
        } else {
          // Default fallbacks with specific styles
          if (drumType === 'fourfloor') {
            if (step === 0 || step === 4 || step === 8 || step === 12) dK = true;
            if (step === 4 || step === 12) dS = true;
            if (step % 2 === 0) dHC = true;
          } else if (drumType === 'trap') {
            if (step === 0 || step === 6 || step === 11) dK = true;
            if (step === 4 || step === 12) dCP = true;
            if (step % 2 === 0 || step === 3 || step === 7 || step === 11 || step === 15) dHC = true;
          } else if (drumType === 'swing' || drumType === 'blues') {
            if (step === 0 || step === 6 || step === 11) dK = true;
            if (step === 4 || step === 12) dS = true;
            if (step === 0 || step === 3 || step === 4 || step === 7 || step === 8 || step === 11 || step === 12 || step === 15) dHC = true;
            if (drumType === 'blues' && (step === 2 || step === 10)) dCL = true;
          } else if (drumType === 'house') {
            if (step === 0 || step === 4 || step === 8 || step === 12) dK = true;
            if (step === 4 || step === 12) dS = true;
            if (step % 2 === 0) dHC = true;
            if (step === 2 || step === 6 || step === 10 || step === 14) dHO = true;
          } else if (drumType === 'reggae') {
            if (step === 8) { dK = true; dS = true; }
            if (step === 2 || step === 6 || step === 10 || step === 14) dHC = true;
            if (step === 0) dCL = true;
          } else if (drumType === 'roots') {
            if (step === 0) dK = true;
            if (step === 8) dS = true;
            if (step === 2 || step === 6 || step === 10 || step === 14) dHC = true;
            if (step === 0 || step === 10) dCL = true;
          } else if (drumType === 'dub') {
            if (step === 8) { dK = true; dS = true; }
            if (step === 2 || step === 6 || step === 10 || step === 14) dHC = true;
            if (step === 4) dCB = true;
          } else if (drumType === 'deepdub') {
            if (step === 0) dK = true;
            if (step === 8) dS = true;
            if (step === 6) dCB = true;
            if (step === 14) dHC = true;
          } else if (drumType === 'steppers') {
            if (step === 0 || step === 4 || step === 8 || step === 12) dK = true;
            if (step === 4 || step === 12) dS = true;
            if (step === 2 || step === 6 || step === 10 || step === 14) dHC = true;
            if (step === 0) dCB = true;
          } else if (drumType === 'dancehall') {
            if (step === 0 || step === 6 || step === 11) dK = true;
            if (step === 4 || step === 12) dCP = true;
            if (step % 2 === 0) dHC = true;
          } else if (drumType === 'arabian') {
            if (step === 0 || step === 8) dK = true;
            if (step === 4 || step === 12) dS = true;
            if (step % 2 === 0) dHC = true;
            if (step === 0 || step === 3 || step === 6 || step === 8 || step === 11) dCL = true;
          } else if (drumType === 'bollywood') {
            if (step === 0 || step === 8) dK = true;
            if (step === 4 || step === 12) dS = true;
            if (step % 2 === 0) dHC = true;
            if (step === 0 || step === 2 || step === 8 || step === 10) dCL = true;
          } else if (drumType === 'reggaeton') {
            if (step === 0 || step === 4 || step === 8 || step === 12) dK = true;
            if (step === 3 || step === 7 || step === 11 || step === 15) dS = true;
            if (step % 2 === 0) dHC = true;
          } else if (drumType === 'cumbia') {
            if (step === 0 || step === 8) dK = true;
            if (step === 4 || step === 12) dS = true;
            if (step % 2 === 0) dHC = true;
            if (step === 2 || step === 6 || step === 10 || step === 14) dCL = true;
          } else if (drumType === 'tango') {
            if (step === 0 || step === 3 || step === 8 || step === 11) dK = true;
            if (step === 4 || step === 12) dS = true;
            if (step < 4 || (step >= 8 && step < 12)) dHC = true;
          } else if (drumType === 'dnb') {
            if (step === 0 || step === 10) dK = true;
            if (step === 4 || step === 12) dS = true;
            if (step % 2 === 0) dHC = true;
          } else if (drumType === 'salsa') {
            if (step === 0 || step === 8) dK = true;
            if (step === 0 || step === 2 || step === 4 || step === 8 || step === 10) dCL = true;
            if (step % 2 === 0) dHC = true;
            if (step === 4 || step === 12) dCB = true;
          } else if (drumType === 'afrobeat') {
            if (step === 0 || step === 8) dK = true;
            if (step === 4 || step === 12) dS = true;
            if (step % 2 === 0) dHC = true;
            if (step % 2 === 0) dCB = true;
          } else {
            // General standard fallback
            if (step === 0 || step === 8) dK = true;
            if (step === 4 || step === 12) dS = true;
            if (step % 2 === 0) dHC = true;
          }
        }
      }
      
      // Drum density & hat controls
      if (this.drumDensity === 'sparse') {
        if (dHC && step % 4 !== 0) dHC = false;
        dHO = false;
      } else if (this.drumDensity === 'full') {
        if (!dK && (step === 2 || step === 6 || step === 10 || step === 14)) dK = true;
        if (dHC && (step === 6 || step === 14)) {
          dHO = true;
          dHC = false;
        }
        if (!dCL && !dCB && (step === 3 || step === 11)) dCL = true;
      }
      
      if (this.drumHat === 'off') {
        dHC = false;
        dHO = false;
      } else if (this.drumHat === 'open') {
        if (dHC) {
          dHO = true;
          dHC = false;
        }
      }
      
      // Fire Drums!
      if (dK) this.playKick(this.nextNoteTime);
      if (dS) this.playSnare(this.nextNoteTime);
      if (dCP) this.playClap(this.nextNoteTime);
      if (dHC) this.playHiHat(this.nextNoteTime, false);
      if (dHO) this.playHiHat(this.nextNoteTime, true);
      if (dCL) this.playClave(this.nextNoteTime);
      if (dCB) this.playCowbell(this.nextNoteTime);
      
      // Synths triggers
      const bassNote = songData.bass[step % songData.bass.length];
      const melodyNote = songData.melody[step % songData.melody.length];
      
      if (bassNote !== 0 && songData.scale[bassNote - 1]) {
        this.playSubBass(this.nextNoteTime, songData.scale[bassNote - 1]);
        if (activeInst === 'acid') {
          this.playInstrumentPattern(this.nextNoteTime, 'acid', songData.scale[bassNote - 1]);
        }
      }
      
      if (melodyNote !== 0 && songData.scale[melodyNote - 1]) {
        this.playInstrumentPattern(this.nextNoteTime, activeInst, songData.scale[melodyNote - 1]);
      }
      
      this.nextNoteTime += secondsPerStep;
      this.currentStep++;
    }
    
    // Smooth recursive scheduling loop
    requestAnimationFrame(() => this.loop());
  }
  
  public start() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.isGoing) {
      this.isGoing = true;
      this.currentStep = 0;
      if (this.ctx) {
        this.nextNoteTime = this.ctx.currentTime;
      }
      this.loop();
    }
  }
  
  public stop() {
    this.isGoing = false;
  }
  
  public panicStop() {
    this.isGoing = false;
    this.transActive = false;
    if (this.transTimer) {
      clearTimeout(this.transTimer);
      this.transTimer = null;
    }
    this.fillActive = false;
    this.pendingSongKey = null;
    this.liveInstOverride = null;
    this.octaveMultiplier = 1.0;
    
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch (e) {}
      this.ctx = null;
    }
  }
  
  public toggleStem(key: string) {
    if (this.stems[key]) {
      this.stems[key].mute = !this.stems[key].mute;
      this.updateVolumes();
    }
    return this.stems[key]?.mute;
  }
  
  public updateStemVolume(key: string, vol: number) {
    if (this.stems[key]) {
      this.stems[key].volume = vol;
      this.updateVolumes();
    }
  }
  
  public updateVolumes() {
    for (const key in this.stems) {
      const s = this.stems[key];
      if (s.gainNode) {
        s.gainNode.gain.value = s.mute ? 0 : s.volume;
      }
    }
  }
  
  public updateMasterVolume(v: number) {
    if (this.absoluteMasterGain) {
      this.absoluteMasterGain.gain.value = v;
    }
  }
  
  public updateSubDrive(v: number) {
    if (this.stems.sub.distortionNode) {
      this.stems.sub.distortionNode.curve = this.makeDistCurve(v * 4.5);
    }
  }
  
  public setBpm(b: number) {
    this.tempo = b;
    if (this.delayNode) {
      this.delayNode.delayTime.value = (60 / this.tempo) / 4;
    }
  }
  
  public triggerFill() {
    if (!this.isGoing) return;
    this.fillActive = true;
    this.fillStep = 0;
  }
  
  // Transition Implementations
  public doCrescendoPlan(barsSetting: number) {
    if (!this.ctx || !this.absoluteMasterGain || !this.masterFilter) return;
    this.transBars = barsSetting;
    
    const duration = this.transBars * 4 * (60 / this.tempo);
    const now = this.ctx.currentTime;
    
    this.absoluteMasterGain.gain.cancelScheduledValues(now);
    this.absoluteMasterGain.gain.setValueAtTime(0.01, now);
    this.absoluteMasterGain.gain.linearRampToValueAtTime(0.5, now + duration);
    
    this.masterFilter.frequency.cancelScheduledValues(now);
    this.masterFilter.frequency.setValueAtTime(220, now);
    this.masterFilter.frequency.exponentialRampToValueAtTime(20000, now + duration);
    
    this.transActive = true;
    if (this.transTimer) clearTimeout(this.transTimer);
    this.transTimer = setTimeout(() => {
      this.transActive = false;
      if (this.onTransCompleteCallback) this.onTransCompleteCallback();
    }, duration * 1000);
  }
  
  public doDecrescendoPlan(barsSetting: number) {
    if (!this.ctx || !this.absoluteMasterGain || !this.masterFilter) return;
    this.transBars = barsSetting;
    
    const duration = this.transBars * 4 * (60 / this.tempo);
    const now = this.ctx.currentTime;
    
    this.savedMasterVol = this.absoluteMasterGain.gain.value;
    
    this.absoluteMasterGain.gain.cancelScheduledValues(now);
    this.absoluteMasterGain.gain.setValueAtTime(this.savedMasterVol, now);
    this.absoluteMasterGain.gain.linearRampToValueAtTime(0.01, now + duration);
    
    this.masterFilter.frequency.cancelScheduledValues(now);
    this.masterFilter.frequency.setValueAtTime(this.masterFilter.frequency.value, now);
    this.masterFilter.frequency.exponentialRampToValueAtTime(200, now + duration);
    
    this.transActive = true;
    if (this.transTimer) clearTimeout(this.transTimer);
    this.transTimer = setTimeout(() => {
      this.transActive = false;
      if (this.onTransCompleteCallback) this.onTransCompleteCallback();
    }, duration * 1000);
  }
  
  public doBreakPlan(barsSetting: number) {
    if (!this.ctx || !this.stems.snare.gainNode || !this.stems.lead.gainNode) return;
    this.transBars = barsSetting;
    
    const now = this.ctx.currentTime;
    this.savedSnareVol = this.stems.snare.volume;
    this.savedLeadVol = this.stems.lead.volume;
    
    // Instantly mute Snare and Lead stems
    this.stems.snare.gainNode.gain.cancelScheduledValues(now);
    this.stems.lead.gainNode.gain.cancelScheduledValues(now);
    this.stems.snare.gainNode.gain.setValueAtTime(0, now);
    this.stems.lead.gainNode.gain.setValueAtTime(0, now);
    
    const duration = this.transBars * 4 * (60 / this.tempo);
    
    this.transActive = true;
    if (this.transTimer) clearTimeout(this.transTimer);
    
    this.transTimer = setTimeout(() => {
      if (!this.isGoing || !this.ctx || !this.stems.snare.gainNode || !this.stems.lead.gainNode || !this.masterFilter) return;
      const now2 = this.ctx.currentTime;
      const rampUp = 2 * (60 / this.tempo);
      
      this.stems.snare.gainNode.gain.setValueAtTime(0.01, now2);
      this.stems.snare.gainNode.gain.linearRampToValueAtTime(this.savedSnareVol, now2 + rampUp);
      
      this.stems.lead.gainNode.gain.setValueAtTime(0.01, now2);
      this.stems.lead.gainNode.gain.linearRampToValueAtTime(this.savedLeadVol, now2 + rampUp);
      
      this.masterFilter.frequency.cancelScheduledValues(now2);
      this.masterFilter.frequency.setValueAtTime(400, now2);
      this.masterFilter.frequency.exponentialRampToValueAtTime(20000, now2 + rampUp);
      
      setTimeout(() => {
        this.transActive = false;
        if (this.onTransCompleteCallback) this.onTransCompleteCallback();
      }, rampUp * 1000);
    }, duration * 1000);
  }
  
  public doSmoothMixPlan(barsSetting: number, nextSongKey: string, nextRhythm?: string) {
    if (!this.ctx || !this.absoluteMasterGain || !this.masterFilter) return;
    this.transBars = barsSetting;
    
    const duration = this.transBars * 4 * (60 / this.tempo);
    const now = this.ctx.currentTime;
    
    this.savedMasterVol = this.absoluteMasterGain.gain.value;
    
    this.absoluteMasterGain.gain.cancelScheduledValues(now);
    this.absoluteMasterGain.gain.setValueAtTime(this.savedMasterVol, now);
    this.absoluteMasterGain.gain.linearRampToValueAtTime(0.01, now + duration);
    
    this.masterFilter.frequency.cancelScheduledValues(now);
    this.masterFilter.frequency.setValueAtTime(this.masterFilter.frequency.value, now);
    this.masterFilter.frequency.exponentialRampToValueAtTime(200, now + duration);
    
    this.transActive = true;
    if (this.transTimer) clearTimeout(this.transTimer);
    
    this.transTimer = setTimeout(() => {
      // Transit mid-blend!
      this.activeSongKey = nextSongKey;
      this.tempo = songsData[nextSongKey].bpm;
      if (nextRhythm) {
        this.globalRhythm = nextRhythm;
      }
      if (this.onBpmCallback) this.onBpmCallback(this.tempo);
      
      const now2 = this.ctx!.currentTime;
      const rampUp = duration; // Equal crossfade ramp up time
      
      this.absoluteMasterGain!.gain.cancelScheduledValues(now2);
      this.absoluteMasterGain!.gain.setValueAtTime(0.01, now2);
      this.absoluteMasterGain!.gain.linearRampToValueAtTime(this.savedMasterVol || 0.5, now2 + rampUp);
      
      this.masterFilter!.frequency.cancelScheduledValues(now2);
      this.masterFilter!.frequency.setValueAtTime(220, now2);
      this.masterFilter!.frequency.exponentialRampToValueAtTime(20000, now2 + rampUp);
      
      setTimeout(() => {
        this.transActive = false;
        if (this.onTransCompleteCallback) this.onTransCompleteCallback();
      }, rampUp * 1000);
    }, duration * 1000);
  }
  
  public updateXyFx(xOffset: number, yOffset: number) {
    if (!this.masterFilter) return;
    // Map X (0 to 1) to Cutoff Frequency (80Hz to 18kHz)
    const cutoff = 80 + xOffset * 17920;
    // Map Y (0 to 1) to resonance Q factor (1 to 24)
    const resonance = 1 + (1 - yOffset) * 23;
    
    this.masterFilter.frequency.setValueAtTime(cutoff, this.ctx?.currentTime || 0);
    this.masterFilter.Q.setValueAtTime(resonance, this.ctx?.currentTime || 0);
  }
}

export const AudioEngine = new AudioEngineClass();
export default AudioEngine;
