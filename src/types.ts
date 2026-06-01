/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Song {
  key: string;
  bpm: number;
  drumType: string;
  bass: number[];
  melody: number[];
  scale: number[];
  inst: string;
  color: string;
  emoji: string;
  label: string;
  tags: string[];
  cat: 'club' | 'world' | 'vintage' | 'reggae' | 'latin' | 'minimal';
}

export interface CompositionBlock {
  id: number;
  songKey: string;
  bpm: number;
  bars: number;
  instIndex: number; // Index in global instrument order
  rhythmIndex: number; // Index in global rhythm order
  kickMute?: boolean;
  snareMute?: boolean;
}

export interface FavoriteTile {
  songKey: string;
  id: string; // unique slot id so people can pin copies or drag reorder
}

export interface QueuedMix {
  id: string;
  songKey: string;
  transitionType: 'fade' | 'rise' | 'drop' | 'mix';
  bars: number;
  customRhythm: string;
}

export interface MixerStems {
  kick: { volume: number; mute: boolean };
  snare: { volume: number; mute: boolean };
  sub: { volume: number; mute: boolean };
  lead: { volume: number; mute: boolean };
}

export interface Category {
  id: string;
  label: string;
}
