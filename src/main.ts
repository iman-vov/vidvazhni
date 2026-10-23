/// <reference types="vite-plugin-pwa/client" />
// Entry point. Phase 1: the debug overlay plays a scenario by hand over the three.js board.
import { registerSW } from 'virtual:pwa-register';
import { mountDebug } from './ui/debug/app';

const board = document.getElementById('board');
const overlay = document.getElementById('overlay');
if (board && overlay) mountDebug(board, overlay);
if (import.meta.env.DEV) void import('./ui/debug/devtools').then((m) => m.installDevtools());

registerSW({ immediate: true });
