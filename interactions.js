// Toutes les interactions utilisateur qui ne sont pas de simples clics sur
// un bouton : glisser une forme depuis la barre d'outils, tracer une
// connexion d'un port à un autre (avec accrochage magnétique et connexions
// flottantes façon draw.io), déplacer un bloc, rebrancher l'extrémité d'une
// connexion existante, déplacer le coude d'une connexion "angle droit", et
// les raccourcis clavier.
import { state, GRID_SIZE, nodeTypes } from './state.js';
import { generateShapeSVG } from './shapes.js';
import { getPorts, getFloatingPoint, getElbowBend } from './geometry.js';
import { saveHistory, autosave } from './persistence.js';
import { render, renderConnections } from './render.js';
import { selectNode, duplicateNode, deleteSelectedNode, deleteSelectedConnection } from './actions.js';

const SNAP_RADIUS = 18; // rayon d'accrochage magnétique, en pixels canvas

let canvas;

export function snap(value) {
  return state.snapToGrid ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;
}

function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left + canvas.scrollLeft,
    y: e.clientY - rect.top + canvas.scrollTop
  };
}

// --- Glisser-déposer d'une forme depuis la barre d'outils vers le canvas ---
function setupShapeDragAndDrop(shapeItems) {
  shapeItems.forEach(item => {
    // Le navigateur peut initier son propre glisser-déposer natif sur les
    // <svg> (surtout Firefox/Safari), ce qui coupe court à notre système
    // souris maison. On le désactive explicitement sur l'item et tous ses
    // enfants.
    item.setAttribute('draggable', 'false');
    item.querySelectorAll('*').forEach(el => el.setAttribute('draggable', 'false'));
    item.addEventListener('dragstart', (e) => e.preventDefault());

    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const nodeType = item.dataset.type;
      const nodeConfig = nodeTypes[nodeType];
      if (!nodeConfig) return;

      const ghost = document.createElement('div');
      ghost.style.position = 'fixed';
      ghost.style.width = nodeConfig.width + 'px';
      ghost.style.height = nodeConfig.height + 'px';
      ghost.style.pointerEvents = 'none';
      ghost.style.zIndex = '9999';
      ghost.style.opacity = '0.55';
      ghost.style.left = (e.clientX - nodeConfig.width / 2) + 'px';
      ghost.style.top = (e.clientY - nodeConfig.height / 2) + 'px';

      const ghostSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      ghostSvg.setAttribute('width', nodeConfig.width);
      ghostSvg.setAttribute('height', nodeConfig.height);
      ghostSvg.innerHTML = generateShapeSVG(nodeType, nodeConfig.width, nodeConfig.height, nodeConfig.color, nodeConfig.fill);
      ghost.appendChild(ghostSvg);
      document.body.appendChild(ghost);

      function isOverCanvas(ev) {
        const rect = canvas.getBoundingClientRect();
        return ev.clientX >= rect.left && ev.clientX <= rect.right &&
               ev.clientY >= rect.top && ev.clientY <= rect.bottom;
      }

      function onMove(ev) {
        ghost.style.left = (ev.clientX - nodeConfig.width / 2) + 'px';
        ghost.style.top = (ev.clientY - nodeConfig.height / 2) + 'px';
        ghost.style.opacity = isOverCanvas(ev) ? '0.9' : '0.4';
      }

      function onUp(ev) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        ghost.remove();

        if (!isOverCanvas(ev)) return;

        saveHistory();
        const rect = canvas.getBoundingClientRect();
        const node = {
          id: ++state.nodeCounter,
          type: nodeType,
          x: snap(ev.clientX - rect.left + canvas.scrollLeft - nodeConfig.width / 2),
          y: snap(ev.clientY - rect.top + canvas.scrollTop - nodeConfig.height / 2),
          text: nodeConfig.label,
          borderColor: nodeConfig.color,
          fillColor: nodeConfig.fill,
          width: nodeConfig.width,
          height: nodeConfig.height
        };
        state.nodes.push(node);
        selectNode(node);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// Style par défaut appliqué aux nouvelles connexions (choisi dans la barre
// latérale). Il reste modifiable après coup depuis le panneau de propriétés.
function setupArrowTypeSelector() {
  document.querySelectorAll('.arrow-preview-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.arrow-preview-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      state.currentArrowType = item.dataset.arrow;
    });
  });
}

function setupSnapToggle(snapBtn) {
  snapBtn.classList.add('active');
  snapBtn.addEventListener('click', () => {
    state.snapToGrid = !state.snapToGrid;
    snapBtn.classList.toggle('active', state.snapToGrid);
  });
}

// Cherche, sous le curseur, un bloc cible et éventuellement le port le plus
// proche (dans un rayon d'accrochage). Renvoie null si aucun bloc valide
// n'est survolé. Partagé entre la création de connexion et le rebranchement.
function findSnapTarget(e, canvasX, canvasY, excludeNodeId) {
  const hoveredEl = document.elementFromPoint(e.clientX, e.clientY);
  const hoveredNodeDiv = hoveredEl ? hoveredEl.closest('.node') : null;
  if (!hoveredNodeDiv) return null;

  const targetId = parseInt(hoveredNodeDiv.dataset.id);
  if (targetId === excludeNodeId) return null;

  const targetNode = state.nodes.find(n => n.id === targetId);
  if (!targetNode) return null;

  let bestPort = null;
  let bestDist = SNAP_RADIUS;
  getPorts(targetNode).forEach(p => {
    const d = Math.hypot(p.x - canvasX, p.y - canvasY);
    if (d < bestDist) {
      bestDist = d;
      bestPort = p;
    }
  });

  return { node: targetNode, div: hoveredNodeDiv, port: bestPort };
}

function clearSnapHighlights() {
  document.querySelectorAll('.node').forEach(n => n.classList.remove('drop-target'));
  document.querySelectorAll('.anchor-point').forEach(p => p.classList.remove('snap-active'));
}

function applySnapHighlight(snapTarget) {
  if (!snapTarget) return;
  snapTarget.div.classList.add('drop-target');
  if (snapTarget.port) {
    const portEl = snapTarget.div.querySelector(`.anchor-point.${snapTarget.port.id}`);
    if (portEl) portEl.classList.add('snap-active');
  }
}

// --- Création de connexion : glisser depuis un port vers un autre bloc ---
// Plus de "mode connexion" à activer au préalable : un port se glisse à
// tout moment. Lâcher précisément sur un port crée une connexion fixe ;
// lâcher n'importe où ailleurs sur le bloc crée une connexion "flottante"
// qui se recalculera automatiquement si les blocs bougent.
let connectingFrom = null;
let connectingSnap = null;
let tempConnectionLine = null;
let connectionsSvgRef = null;

function cancelArrowDrawing() {
  connectingFrom = null;
  connectingSnap = null;
  if (tempConnectionLine) {
    tempConnectionLine.remove();
    tempConnectionLine = null;
  }
  document.querySelectorAll('.node').forEach(n => n.classList.remove('connecting'));
  clearSnapHighlights();
}

function createTempLine(color, start) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-dasharray', '6,4');
  line.style.pointerEvents = 'none';
  line.setAttribute('x1', start.x);
  line.setAttribute('y1', start.y);
  line.setAttribute('x2', start.x);
  line.setAttribute('y2', start.y);
  connectionsSvgRef.appendChild(line);
  return line;
}

export function startConnectionDrag(node, portId) {
  cancelArrowDrawing();
  connectingFrom = { node, anchor: portId };
  const div = canvas.querySelector(`.node[data-id="${node.id}"]`);
  if (div) div.classList.add('connecting');

  const ports = getPorts(node);
  const start = ports.find(p => p.id === portId) || { x: node.x, y: node.y };
  tempConnectionLine = createTempLine('#28a745', start);
}

function setupConnectionDragTracking() {
  document.addEventListener('mousemove', (e) => {
    if (!connectingFrom) return;
    const { x, y } = toCanvasCoords(e);

    clearSnapHighlights();
    const snapTarget = findSnapTarget(e, x, y, connectingFrom.node.id);
    connectingSnap = snapTarget;

    let previewEnd = { x, y };
    if (snapTarget) {
      applySnapHighlight(snapTarget);
      previewEnd = snapTarget.port || getFloatingPoint(snapTarget.node, connectingFrom.node);
    }

    if (tempConnectionLine) {
      tempConnectionLine.setAttribute('x2', previewEnd.x);
      tempConnectionLine.setAttribute('y2', previewEnd.y);
    }
  });

  document.addEventListener('mouseup', () => {
    if (!connectingFrom) return;

    if (connectingSnap) {
      saveHistory();
      state.connections.push({
        id: ++state.connectionCounter,
        from: connectingFrom.node.id,
        fromAnchor: connectingFrom.anchor,
        to: connectingSnap.node.id,
        toAnchor: connectingSnap.port ? connectingSnap.port.id : 'auto',
        label: '',
        arrowType: state.currentArrowType
      });
      autosave();
    }

    cancelArrowDrawing();
    render();
  });
}

// --- Rebranchement : glisser l'extrémité d'une connexion sélectionnée ---
let reconnecting = null; // { conn, end, fixedNode }
let reconnectSnap = null;
let reconnectSnapshot = null;

export function startEndpointDrag(conn, end, from, to) {
  const fromNode = state.nodes.find(n => n.id === conn.from);
  const toNode = state.nodes.find(n => n.id === conn.to);
  const movingEndNode = end === 'from' ? fromNode : toNode;
  const fixedNode = end === 'from' ? toNode : fromNode;
  if (!movingEndNode || !fixedNode) return;

  reconnecting = { conn, end, fixedNode };
  reconnectSnapshot = JSON.stringify({ nodes: state.nodes, connections: state.connections });
  tempConnectionLine = createTempLine('#f59e0b', end === 'from' ? from : to);
}

function setupReconnectTracking() {
  document.addEventListener('mousemove', (e) => {
    if (!reconnecting) return;
    const { x, y } = toCanvasCoords(e);

    clearSnapHighlights();
    const snapTarget = findSnapTarget(e, x, y, reconnecting.fixedNode.id);
    reconnectSnap = snapTarget;

    let previewEnd = { x, y };
    if (snapTarget) {
      applySnapHighlight(snapTarget);
      previewEnd = snapTarget.port || getFloatingPoint(snapTarget.node, reconnecting.fixedNode);
    }

    if (tempConnectionLine) {
      tempConnectionLine.setAttribute('x2', previewEnd.x);
      tempConnectionLine.setAttribute('y2', previewEnd.y);
    }
  });

  document.addEventListener('mouseup', () => {
    if (!reconnecting) return;
    const { conn, end } = reconnecting;

    if (reconnectSnap) {
      state.history.push(reconnectSnapshot);
      if (state.history.length > 50) state.history.shift();
      const anchor = reconnectSnap.port ? reconnectSnap.port.id : 'auto';
      if (end === 'from') {
        conn.from = reconnectSnap.node.id;
        conn.fromAnchor = anchor;
      } else {
        conn.to = reconnectSnap.node.id;
        conn.toAnchor = anchor;
      }
      autosave();
    }
    // Sinon (lâché dans le vide) : la connexion reste inchangée.

    reconnecting = null;
    reconnectSnap = null;
    reconnectSnapshot = null;
    if (tempConnectionLine) {
      tempConnectionLine.remove();
      tempConnectionLine = null;
    }
    clearSnapHighlights();
    render();
  });
}

// --- Déplacement à la souris de l'angle d'une connexion "Angle droit" ---
let draggingElbow = null;
let elbowDragMoved = false;
let elbowDragSnapshot = null;

export function startElbowDrag(conn, useH, from, to) {
  elbowDragSnapshot = JSON.stringify({ nodes: state.nodes, connections: state.connections });
  elbowDragMoved = false;
  draggingElbow = { conn, useH, from, to };
}

function setupElbowDragTracking() {
  document.addEventListener('mousemove', (e) => {
    if (!draggingElbow) return;
    elbowDragMoved = true;
    const { x, y } = toCanvasCoords(e);
    const { conn, useH, from, to } = draggingElbow;

    let ratio;
    if (useH) {
      const span = to.x - from.x;
      ratio = span !== 0 ? (x - from.x) / span : 0.5;
    } else {
      const span = to.y - from.y;
      ratio = span !== 0 ? (y - from.y) / span : 0.5;
    }
    ratio = Math.max(0.02, Math.min(0.98, ratio));
    conn.elbowMidRatio = ratio;
    renderConnections();
  });

  document.addEventListener('mouseup', () => {
    if (!draggingElbow) return;
    const { conn, from, to } = draggingElbow;

    if (!elbowDragMoved) {
      // Pas de déplacement : un simple clic inverse le sens de l'angle.
      saveHistory();
      const current = getElbowBend(from, to, conn.elbowBend, null, null);
      conn.elbowBend = current === 'h' ? 'v' : 'h';
      conn.elbowMidRatio = 0.5;
      renderConnections();
      autosave();
    } else if (elbowDragSnapshot) {
      state.history.push(elbowDragSnapshot);
      if (state.history.length > 50) state.history.shift();
      autosave();
    }

    draggingElbow = null;
    elbowDragSnapshot = null;
  });
}

// --- Déplacement des blocs à la souris ---
let draggingNode = null;
let dragOffsetX = 0, dragOffsetY = 0;
let dragMoved = false;
let dragSnapshot = null;

export function startNodeDrag(node, div, e) {
  dragSnapshot = JSON.stringify({ nodes: state.nodes, connections: state.connections });
  draggingNode = node;
  dragMoved = false;
  dragOffsetX = e.clientX - node.x;
  dragOffsetY = e.clientY - node.y;
  div.style.cursor = 'grabbing';
  e.preventDefault();
  selectNode(node);
}

function setupNodeDragTracking() {
  document.addEventListener('mousemove', (e) => {
    if (!draggingNode) return;
    dragMoved = true;
    draggingNode.x = snap(e.clientX - dragOffsetX);
    draggingNode.y = snap(e.clientY - dragOffsetY);
    const el = canvas.querySelector(`.node[data-id="${draggingNode.id}"]`);
    if (el) {
      el.style.left = draggingNode.x + 'px';
      el.style.top = draggingNode.y + 'px';
    }
    renderConnections();
  });

  document.addEventListener('mouseup', () => {
    if (draggingNode) {
      if (dragMoved && dragSnapshot) {
        state.history.push(dragSnapshot);
        if (state.history.length > 50) state.history.shift();
        autosave();
      }
      const el = canvas.querySelector(`.node[data-id="${draggingNode.id}"]`);
      if (el) el.style.cursor = 'move';
      draggingNode = null;
      dragSnapshot = null;
    }
  });
}

// --- Raccourcis clavier ---
function setupKeyboardShortcuts(undoBtn) {
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (isTyping) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (state.selectedNode) deleteSelectedNode();
      else if (state.selectedConnection) deleteSelectedConnection();
    } else if (e.key === 'Escape') {
      if (connectingFrom) cancelArrowDrawing();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoBtn.click();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (state.selectedNode) duplicateNode(state.selectedNode);
    }
  });
}

// Point d'entrée : câble toutes les interactions avec les éléments du DOM.
export function initInteractions(refs) {
  canvas = refs.canvas;
  connectionsSvgRef = refs.connectionsSvg;

  setupShapeDragAndDrop(refs.shapeItems);
  setupArrowTypeSelector();
  setupSnapToggle(refs.snapBtn);
  setupConnectionDragTracking();
  setupReconnectTracking();
  setupElbowDragTracking();
  setupNodeDragTracking();
  setupKeyboardShortcuts(refs.undoBtn);

  refs.duplicateBtn.addEventListener('click', () => {
    if (state.selectedNode) duplicateNode(state.selectedNode);
  });

  canvas.addEventListener('click', (e) => {
    if (e.target === canvas) {
      state.selectedNode = null;
      state.selectedConnection = null;
      render();
    }
  });
}
