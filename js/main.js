// Point d'entrée de l'application. Ce fichier ne contient aucune logique
// métier : il se contente de récupérer les éléments du DOM et de les
// distribuer aux modules qui en ont besoin, puis de lancer le premier rendu.
import { state } from './state.js';
import { initRender, render } from './render.js';
import {
  initInteractions, startConnectionDrag, startNodeDrag, startElbowDrag, startEndpointDrag
} from './interactions.js';
import { setSaveIndicator, restoreAutosave, undo, saveHistory } from './persistence.js';
import { downloadSVG, downloadPNG, downloadProjectJSON, importProjectJSON } from './exporter.js';

const canvas = document.getElementById('canvas');
const connectionsSvg = document.getElementById('connectionsSvg');
const properties = document.getElementById('properties');
const undoBtn = document.getElementById('undoBtn');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');
const exportPngBtn = document.getElementById('exportPngBtn');
const saveJsonBtn = document.getElementById('saveJsonBtn');
const importBtn = document.getElementById('importBtn');
const importInput = document.getElementById('importInput');
const duplicateBtn = document.getElementById('duplicateBtn');
const snapBtn = document.getElementById('snapBtn');
const saveIndicator = document.getElementById('saveIndicator');
const shapeItems = document.querySelectorAll('.shape-item');

setSaveIndicator(saveIndicator);

initRender({
  canvas,
  connectionsSvg,
  properties,
  onPortMouseDown: startConnectionDrag,
  onNodeMouseDown: startNodeDrag,
  onElbowHandleMouseDown: startElbowDrag,
  onEndpointMouseDown: startEndpointDrag
});

initInteractions({
  canvas,
  connectionsSvg,
  shapeItems,
  snapBtn,
  duplicateBtn,
  undoBtn
});

undoBtn.addEventListener('click', () => undo(render));

clearBtn.addEventListener('click', () => {
  if (confirm('Voulez-vous vraiment vider le logigramme ?')) {
    saveHistory();
    state.nodes = [];
    state.connections = [];
    state.selectedNode = null;
    state.selectedConnection = null;
    render();
  }
});

exportBtn.addEventListener('click', downloadSVG);
exportPngBtn.addEventListener('click', downloadPNG);
saveJsonBtn.addEventListener('click', downloadProjectJSON);

importBtn.addEventListener('click', () => importInput.click());
importInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  importProjectJSON(file, render);
  importInput.value = '';
});

// Initialisation
restoreAutosave();
render();
