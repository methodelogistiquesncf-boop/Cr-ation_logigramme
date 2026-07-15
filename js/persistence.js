// Tout ce qui touche à la persistance : pile d'annulation (undo) et
// sauvegarde automatique dans localStorage. Ne touche jamais au DOM.
import { state, STORAGE_KEY } from './state.js';

let autosaveTimeout = null;
let saveIndicatorEl = null;

// Le bandeau "Sauvegardé à ..." est optionnel ; on l'enregistre une fois
// au démarrage pour ne pas faire de document.getElementById partout.
export function setSaveIndicator(el) {
  saveIndicatorEl = el;
}

export function saveHistory() {
  state.history.push(JSON.stringify({
    nodes: state.nodes,
    connections: state.connections
  }));
  if (state.history.length > 50) state.history.shift();
}

export function undo(onDone) {
  if (state.history.length === 0) return;
  const prev = JSON.parse(state.history.pop());
  state.nodes = prev.nodes;
  state.connections = prev.connections;
  state.selectedNode = null;
  state.selectedConnection = null;
  if (onDone) onDone();
}

export function autosave() {
  clearTimeout(autosaveTimeout);
  autosaveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        nodes: state.nodes,
        connections: state.connections,
        nodeCounter: state.nodeCounter,
        connectionCounter: state.connectionCounter
      }));
      if (saveIndicatorEl) {
        saveIndicatorEl.textContent = '💾 Sauvegardé localement ' + new Date().toLocaleTimeString('fr-FR');
      }
    } catch (err) {
      console.warn('Autosave impossible :', err);
    }
  }, 400);
}

export function restoreAutosave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.nodes && data.nodes.length > 0) {
      state.nodes = data.nodes;
      state.connections = data.connections || [];
      state.nodeCounter = data.nodeCounter || state.nodes.reduce((m, n) => Math.max(m, n.id), 0);
      state.connectionCounter = data.connectionCounter || state.connections.reduce((m, c) => Math.max(m, c.id), 0);
    }
  } catch (err) {
    console.warn('Impossible de restaurer la sauvegarde locale :', err);
  }
}
