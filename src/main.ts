/// <reference types="vite-plugin-pwa/client" />
// Entry point. The game by default; `?debug` opens the phase-1 debug overlay.
import { registerSW } from 'virtual:pwa-register';
import { mountApp } from './app/app';
import { prefetchModels } from './render/models';
import { mountDebug } from './ui/debug/app';
import './ui/game/game.css';
import './ui/game/hud.css';
import './ui/game/hud-overlay.css';

const board = document.getElementById('board');
const overlay = document.getElementById('overlay');
const debug = new URLSearchParams(location.search).has('debug');
// `?icons`: the icon gallery for review (dev server only).
const gallery = import.meta.env.DEV && new URLSearchParams(location.search).has('icons');
if (gallery) void import('./ui/icons/gallery').then((m) => m.mountIconGallery());
else if (board && overlay) {
  if (debug) mountDebug(board, overlay);
  else mountApp(board, overlay);
}
if (import.meta.env.DEV && debug) void import('./ui/debug/devtools').then((m) => m.installDevtools());
if (import.meta.env.DEV && !debug) void import('./app/devtools').then((m) => m.installGameDevtools());
// Models of the chosen quality tier into the cache, so the board works offline.
if (import.meta.env.PROD) void prefetchModels().catch(() => {});

registerSW({ immediate: true });
