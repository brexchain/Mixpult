/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Star, ShieldAlert, ChevronLeft, ChevronRight, Play, Plus, X, ListCollapse } from 'lucide-react';
import { songsData } from '../songsData';

interface FavoriteDeckProps {
  favorites: string[];
  setFavorites: React.Dispatch<React.SetStateAction<string[]>>;
  activeSongKey: string;
  onSelectSong: (key: string) => void;
  onAddToQueue: (key: string) => void;
}

export default function FavoriteDeck({
  favorites,
  setFavorites,
  activeSongKey,
  onSelectSong,
  onAddToQueue,
}: FavoriteDeckProps) {
  
  // Rearrange order handlers
  const moveLeft = (index: number) => {
    if (index === 0) return;
    const newFavs = [...favorites];
    const temp = newFavs[index - 1];
    newFavs[index - 1] = newFavs[index];
    newFavs[index] = temp;
    setFavorites(newFavs);
  };

  const moveRight = (index: number) => {
    if (index === favorites.length - 1) return;
    const newFavs = [...favorites];
    const temp = newFavs[index + 1];
    newFavs[index + 1] = newFavs[index];
    newFavs[index] = temp;
    setFavorites(newFavs);
  };

  const removeFavorite = (keyToRemove: string) => {
    setFavorites(prev => prev.filter(key => key !== keyToRemove));
  };

  return (
    <div id="favorite-deck" className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1 px-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Star className="w-4 h-4 fill-current" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-wider text-zinc-100 uppercase font-sans">
              ★ MEINE LEIWANDEN LIEBLINGS-HADERN ★
            </h3>
            <p className="text-[10px] text-zinc-500 leading-tight">
              Schieb deine Schmankerl hin und her, damitst beim Jammen am Bluetooth-Kastl die Reihung im Gspür hast!
            </p>
          </div>
        </div>
        <span className="text-[9px] bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-400 font-mono self-start sm:self-center">
          {favorites.length} Gepickt
        </span>
      </div>

      {favorites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 px-4 bg-zinc-950/40 border border-zinc-805 border-dashed rounded-lg text-center">
          <p className="text-zinc-500 text-[11px] mb-1 font-sans">Geh oida, noch ka anziger Hadern do!</p>
          <p className="text-[9px] text-zinc-600 max-w-[280px]">
            Klick auf den <Star className="inline w-3 h-3 text-zinc-600" /> Stern bei de Musik-Auswohln unten, damit des Scheibling do oben landet!
          </p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-zinc-700">
          {favorites.map((songKey, index) => {
            const song = songsData[songKey];
            if (!song) return null;
            const isActive = activeSongKey === songKey;

            return (
              <motion.div
                key={`${songKey}-${index}`}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className={`relative flex-shrink-0 flex flex-col justify-between w-[152px] bg-zinc-950 border rounded-lg p-2.5 transition-all
                  ${isActive 
                    ? 'border-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.15)] bg-pink-950/5' 
                    : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60'
                  }`}
              >
                {/* Header item */}
                <div className="flex items-start justify-between gap-1 mb-2">
                  <div className="truncate pr-1">
                    <span className="text-zinc-500 text-[8px] font-mono block">PLATZ {String(index + 1).padStart(2, '0')}</span>
                    <span className="font-sans font-bold text-xs text-white tracking-wide block truncate">
                      {song.emoji} {song.label}
                    </span>
                  </div>
                  <button
                    id={`remove-fav-${songKey}`}
                    onClick={() => removeFavorite(songKey)}
                    className="p-1 rounded-full text-zinc-500 hover:text-red-400 hover:bg-zinc-900 transition-colors"
                    title="Hadern raushauen"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                {/* Badges / tag info */}
                <div className="flex items-center gap-1.5 mb-3">
                  <span className="text-[9px] font-bold text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                    {song.bpm} BPM
                  </span>
                  <span className="text-[8px] text-zinc-500 font-medium truncate uppercase tracking-widest bg-zinc-900 px-1 py-0.5 rounded">
                    {song.tags[0]}
                  </span>
                </div>

                {/* Arrangement and mix triggers */}
                <div className="space-y-2 mt-auto">
                  {/* Left Right shift arrows */}
                  <div className="flex items-center justify-between gap-1 bg-zinc-900/90 rounded p-1">
                    <button
                      id={`move-left-${songKey}`}
                      onClick={() => moveLeft(index)}
                      disabled={index === 0}
                      className={`p-1 rounded transition-colors ${index === 0 ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                      title="Links rücken"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    
                    <span className="text-[8px] text-zinc-500 font-mono tracking-tighter">REIHUNG</span>
                    
                    <button
                      id={`move-right-${songKey}`}
                      onClick={() => moveRight(index)}
                      disabled={index === favorites.length - 1}
                      className={`p-1 rounded transition-colors ${index === favorites.length - 1 ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                      title="Rechts rücken"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Immediate Mixer & Queue Add Actions */}
                  <div className="grid grid-cols-2 gap-1 pt-0.5">
                    <button
                      id={`play-fav-${songKey}`}
                      onClick={() => onSelectSong(songKey)}
                      className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded transition-all text-[9.5px] font-bold tracking-tight
                        ${isActive 
                          ? 'bg-pink-500 text-white' 
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white'
                        }`}
                      title="Direkt am Mischpult laden"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      WERFN
                    </button>

                    <button
                      id={`queue-fav-${songKey}`}
                      onClick={() => onAddToQueue(songKey)}
                      className="bg-cyan-950/40 border border-cyan-800/50 hover:bg-cyan-500/10 hover:border-cyan-500 text-cyan-400 hover:text-white flex items-center justify-center gap-1 py-1 px-1.5 rounded transition-all text-[9.5px] font-bold tracking-tight"
                      title="Liedl an die Warteschlange anhängen"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      REIHEN
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
