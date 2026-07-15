// Tout ce qui construit le DOM/SVG visible à l'écran : blocs, connexions,
// panneau de propriétés. Ce module est appelé chaque fois que l'état change.
//
// Import circulaire assumé avec actions.js : render.js a besoin des actions
// (sélectionner/supprimer/dupliquer) pour câbler les boutons du panneau de
// propriétés, et actions.js a besoin de render() pour rafraîchir l'affichage
// après une mutation. C'est sans danger ici car aucun des deux modules
// n'appelle l'autre au moment du chargement : les appels ont lieu plus tard,
// depuis des gestionnaires d'événements, quand les deux modules sont déjà
// entièrement chargés.
import { state, colorPresets, nodeTypes } from './state.js';
import { generateShapeSVG, hexToRgb } from './shapes.js';
import {
  FIXED_PORTS, resolveEndpoints, resolvedSide, getElbowBend, generateElbowPath
} from './geometry.js';
import { autosave, saveHistory } from './persistence.js';
import {
  selectNode, selectConnection, deleteSelectedNode,
  deleteSelectedConnection, duplicateNode
} from './actions.js';

let canvas, connectionsSvg, properties;
// Callbacks fournis par interactions.js : démarrer un drag depuis un port,
// déplacer un bloc, glisser le coude d'une connexion en angle droit, ou
// glisser une extrémité de connexion pour la rebrancher ailleurs (évite un
// import circulaire supplémentaire vers interactions.js).
let onPortMouseDown = () => {};
let onNodeMouseDown = () => {};
let onElbowHandleMouseDown = () => {};
let onEndpointMouseDown = () => {};

export function initRender(refs) {
  canvas = refs.canvas;
  connectionsSvg = refs.connectionsSvg;
  properties = refs.properties;
  onPortMouseDown = refs.onPortMouseDown || onPortMouseDown;
  onNodeMouseDown = refs.onNodeMouseDown || onNodeMouseDown;
  onElbowHandleMouseDown = refs.onElbowHandleMouseDown || onElbowHandleMouseDown;
  onEndpointMouseDown = refs.onEndpointMouseDown || onEndpointMouseDown;
}

function startInlineEdit(node, div, textSpan) {
  const textarea = document.createElement('textarea');
  textarea.className = 'node-text-edit';
  textarea.value = node.text;
  textSpan.style.display = 'none';
  div.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const finish = () => {
    node.text = textarea.value;
    textarea.remove();
    render();
  };

  textarea.addEventListener('blur', finish);
  textarea.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finish();
    } else if (e.key === 'Escape') {
      textarea.value = node.text;
      finish();
    }
  });
}

function createNodeElement(node) {
  const div = document.createElement('div');
  div.className = 'node';
  div.style.left = node.x + 'px';
  div.style.top = node.y + 'px';
  div.style.width = node.width + 'px';
  div.style.height = node.height + 'px';
  div.dataset.id = node.id;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', node.width);
  svg.setAttribute('height', node.height);
  svg.innerHTML = generateShapeSVG(node.type, node.width, node.height, node.borderColor, node.fillColor);
  div.appendChild(svg);

  const textSpan = document.createElement('div');
  textSpan.className = 'node-text';
  textSpan.textContent = node.text;

  if (node.fillColor && node.fillColor !== 'transparent') {
    const rgb = hexToRgb(node.fillColor);
    const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
    textSpan.style.color = brightness > 128 ? '#24292e' : 'white';
  } else {
    textSpan.style.color = node.borderColor;
  }

  div.appendChild(textSpan);

  const anchorPoints = document.createElement('div');
  anchorPoints.className = 'anchor-points';

  FIXED_PORTS.forEach(portId => {
    const point = document.createElement('div');
    point.className = `anchor-point ${portId}`;
    point.dataset.anchor = portId;

    // Un port se glisse à tout moment : pas besoin d'activer un "mode
    // connexion" au préalable, comme dans draw.io.
    point.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onPortMouseDown(node, portId);
    });

    anchorPoints.appendChild(point);
  });

  div.appendChild(anchorPoints);

  textSpan.addEventListener('click', (e) => {
    e.stopPropagation();
    selectNode(node);
  });

  div.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    saveHistory();
    startInlineEdit(node, div, textSpan);
  });

  div.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('anchor-point')) return;
    onNodeMouseDown(node, div, e);
  });

  if (state.selectedNode && state.selectedNode.id === node.id) {
    div.classList.add('selected');
  }

  return div;
}

export function renderConnections() {
  connectionsSvg.querySelectorAll('.connection-line, .connection-label, .connection-label-bg, .elbow-handle, .elbow-handle-icon, .endpoint-handle').forEach(el => el.remove());

  state.connections.forEach(conn => {
    const fromNode = state.nodes.find(n => n.id === conn.from);
    const toNode = state.nodes.find(n => n.id === conn.to);
    if (!fromNode || !toNode) return;

    const { from, to } = resolveEndpoints(conn, fromNode, toNode);
    const fromSide = resolvedSide(conn, fromNode, from, 'from');
    const toSide = resolvedSide(conn, toNode, to, 'to');

    const isSelected = state.selectedConnection && state.selectedConnection.id === conn.id;

    let pathElement;

    if (conn.arrowType === 'elbow' || conn.arrowType === 'elbow-dashed') {
      pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathElement.setAttribute('d', generateElbowPath(from, to, conn.elbowBend, fromSide, toSide, conn.elbowMidRatio));
    } else {
      pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      pathElement.setAttribute('x1', from.x);
      pathElement.setAttribute('y1', from.y);
      pathElement.setAttribute('x2', to.x);
      pathElement.setAttribute('y2', to.y);
    }

    pathElement.classList.add('connection-line');

    if (isSelected) {
      pathElement.classList.add('selected');
    }

    switch (conn.arrowType) {
      case 'simple':
        pathElement.setAttribute('stroke-width', '2');
        pathElement.setAttribute('marker-end', isSelected ? 'url(#arrowSimple-selected)' : 'url(#arrowSimple)');
        break;
      case 'line':
        pathElement.setAttribute('stroke-width', '2');
        break;
      case 'elbow':
        pathElement.setAttribute('stroke-width', '2');
        pathElement.setAttribute('marker-end', isSelected ? 'url(#arrowSimple-selected)' : 'url(#arrowSimple)');
        break;
      case 'elbow-dashed':
        pathElement.setAttribute('stroke-width', '2');
        pathElement.setAttribute('stroke-dasharray', '5,4');
        pathElement.setAttribute('marker-end', isSelected ? 'url(#arrowSimple-selected)' : 'url(#arrowSimple)');
        break;
      case 'double':
        pathElement.setAttribute('stroke-width', '2');
        pathElement.setAttribute('marker-end', isSelected ? 'url(#arrowSimple-selected)' : 'url(#arrowSimple)');
        pathElement.setAttribute('marker-start', isSelected ? 'url(#arrowSimple-selected)' : 'url(#arrowSimple)');
        break;
      case 'dashed':
        pathElement.setAttribute('stroke-width', '2');
        pathElement.setAttribute('stroke-dasharray', '5,4');
        pathElement.setAttribute('marker-end', isSelected ? 'url(#arrowSimple-selected)' : 'url(#arrowSimple)');
        break;
      case 'thick':
        pathElement.setAttribute('stroke-width', '4');
        pathElement.setAttribute('marker-end', isSelected ? 'url(#arrowThick-selected)' : 'url(#arrowThick)');
        break;
    }

    pathElement.style.pointerEvents = 'stroke';
    pathElement.addEventListener('click', (e) => {
      e.stopPropagation();
      selectConnection(conn);
    });

    connectionsSvg.appendChild(pathElement);

    if ((conn.arrowType === 'elbow' || conn.arrowType === 'elbow-dashed') && isSelected) {
      const useH = getElbowBend(from, to, conn.elbowBend, fromSide, toSide) === 'h';
      const ratio = (typeof conn.elbowMidRatio === 'number' && !isNaN(conn.elbowMidRatio)) ? conn.elbowMidRatio : 0.5;
      const cornerX = useH ? from.x + (to.x - from.x) * ratio : from.x;
      const cornerY = useH ? from.y : from.y + (to.y - from.y) * ratio;

      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      handle.setAttribute('cx', cornerX);
      handle.setAttribute('cy', cornerY);
      handle.setAttribute('r', 8);
      handle.setAttribute('fill', '#0366d6');
      handle.setAttribute('stroke', 'white');
      handle.setAttribute('stroke-width', '2');
      handle.classList.add('elbow-handle');
      handle.style.cursor = useH ? 'ew-resize' : 'ns-resize';
      handle.style.pointerEvents = 'all';

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = "Glisser pour déplacer l'angle, cliquer pour inverser son sens";
      handle.appendChild(title);

      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      icon.setAttribute('x', cornerX);
      icon.setAttribute('y', cornerY);
      icon.setAttribute('text-anchor', 'middle');
      icon.setAttribute('dominant-baseline', 'central');
      icon.setAttribute('font-size', '10');
      icon.setAttribute('fill', 'white');
      icon.style.pointerEvents = 'none';
      icon.classList.add('elbow-handle-icon');
      icon.textContent = useH ? '↔' : '↕';

      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onElbowHandleMouseDown(conn, useH, from, to);
      });

      connectionsSvg.appendChild(handle);
      connectionsSvg.appendChild(icon);
    }

    // Poignées de rebranchement : une connexion sélectionnée peut être
    // re-glissée par l'une ou l'autre de ses extrémités vers un autre bloc,
    // sans avoir à la supprimer et en recréer une nouvelle.
    if (isSelected) {
      [{ end: 'from', point: from }, { end: 'to', point: to }].forEach(({ end, point }) => {
        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        handle.setAttribute('cx', point.x);
        handle.setAttribute('cy', point.y);
        handle.setAttribute('r', 6);
        handle.setAttribute('fill', 'white');
        handle.setAttribute('stroke', '#0366d6');
        handle.setAttribute('stroke-width', '2');
        handle.classList.add('endpoint-handle');
        handle.style.cursor = 'grab';
        handle.style.pointerEvents = 'all';

        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = 'Glisser pour rebrancher cette extrémité';
        handle.appendChild(title);

        handle.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          onEndpointMouseDown(conn, end, from, to);
        });

        connectionsSvg.appendChild(handle);
      });
    }

    if (conn.label) {
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;

      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const textWidth = conn.label.length * 7 + 10;
      bg.setAttribute('x', midX - textWidth / 2);
      bg.setAttribute('y', midY - 16);
      bg.setAttribute('width', textWidth);
      bg.setAttribute('height', 20);
      bg.setAttribute('rx', '4');
      bg.classList.add('connection-label-bg');
      connectionsSvg.appendChild(bg);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', midX);
      text.setAttribute('y', midY);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.classList.add('connection-label');
      text.textContent = conn.label;
      connectionsSvg.appendChild(text);
    }
  });
}

export function renderProperties() {
  if (state.selectedNode) {
    const node = state.selectedNode;
    properties.innerHTML = `
      <h3>✏️ Propriétés du bloc</h3>

      <div class="prop-group">
        <label>Type</label>
        <input type="text" value="${nodeTypes[node.type].label}" disabled style="background: #f6f8fa;">
      </div>

      <div class="prop-group">
        <label>Texte</label>
        <textarea id="nodeText">${node.text}</textarea>
      </div>

      <div class="prop-group">
        <label>Couleurs</label>
        <div class="color-row">
          <div>
            <label style="font-size: 11px; margin-bottom: 4px;">Bordure</label>
            <input type="color" id="nodeBorderColor" value="${node.borderColor}">
          </div>
          <div>
            <label style="font-size: 11px; margin-bottom: 4px;">Remplissage</label>
            <input type="color" id="nodeFillColor" value="${node.fillColor === 'transparent' ? '#ffffff' : node.fillColor}">
          </div>
        </div>
        <div style="margin-top: 8px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="nodeTransparent" ${node.fillColor === 'transparent' ? 'checked' : ''}>
            <span style="font-size: 12px;">Fond transparent</span>
          </label>
        </div>
      </div>

      <div class="prop-group">
        <label>Couleurs rapides</label>
        <div class="color-presets">
          ${colorPresets.map(c => `<div class="color-preset" style="background:${c}" data-color="${c}"></div>`).join('')}
        </div>
      </div>

      <div class="prop-group">
        <button class="btn" style="width:100%; margin-bottom: 8px;" id="duplicateNodeBtn">📋 Dupliquer (Ctrl+D)</button>
        <button class="btn btn-clear" style="width:100%" id="deleteNode">🗑 Supprimer le bloc (Suppr)</button>
      </div>
    `;

    document.getElementById('nodeText').addEventListener('input', (e) => {
      node.text = e.target.value;
      render();
      autosave();
    });

    document.getElementById('nodeBorderColor').addEventListener('input', (e) => {
      node.borderColor = e.target.value;
      render();
      autosave();
    });

    document.getElementById('nodeFillColor').addEventListener('input', (e) => {
      if (!document.getElementById('nodeTransparent').checked) {
        node.fillColor = e.target.value;
        render();
        autosave();
      }
    });

    document.getElementById('nodeTransparent').addEventListener('change', (e) => {
      if (e.target.checked) {
        node.fillColor = 'transparent';
      } else {
        node.fillColor = document.getElementById('nodeFillColor').value;
      }
      render();
      autosave();
    });

    document.querySelectorAll('.color-preset').forEach(preset => {
      preset.addEventListener('click', () => {
        node.borderColor = preset.dataset.color;
        if (!document.getElementById('nodeTransparent').checked) {
          node.fillColor = preset.dataset.color;
          document.getElementById('nodeFillColor').value = preset.dataset.color;
        }
        document.getElementById('nodeBorderColor').value = preset.dataset.color;
        render();
        autosave();
      });
    });

    document.getElementById('duplicateNodeBtn').addEventListener('click', () => duplicateNode(node));
    document.getElementById('deleteNode').addEventListener('click', deleteSelectedNode);

  } else if (state.selectedConnection) {
    const conn = state.selectedConnection;
    properties.innerHTML = `
      <h3>➜ Propriétés de la connexion</h3>

      <div class="prop-group">
        <label>Libellé</label>
        <input type="text" id="connLabel" value="${conn.label}" placeholder="Oui, Non...">
      </div>

      <div class="prop-group">
        <label>Type</label>
        <select id="connArrowType">
          <option value="simple" ${conn.arrowType === 'simple' ? 'selected' : ''}>Flèche simple</option>
          <option value="line" ${conn.arrowType === 'line' ? 'selected' : ''}>Trait simple</option>
          <option value="elbow" ${conn.arrowType === 'elbow' ? 'selected' : ''}>Angle droit</option>
          <option value="elbow-dashed" ${conn.arrowType === 'elbow-dashed' ? 'selected' : ''}>Angle droit pointillé</option>
          <option value="double" ${conn.arrowType === 'double' ? 'selected' : ''}>Double flèche</option>
          <option value="dashed" ${conn.arrowType === 'dashed' ? 'selected' : ''}>Pointillé</option>
          <option value="thick" ${conn.arrowType === 'thick' ? 'selected' : ''}>Épaisse</option>
        </select>
      </div>

      ${(conn.arrowType === 'elbow' || conn.arrowType === 'elbow-dashed') ? `
      <div class="prop-group">
        <label>Sens du coude</label>
        <button class="btn" style="width:100%" id="toggleBendBtn">⟲ Inverser le sens de l'angle</button>
      </div>
      ` : ''}

      <div class="prop-group">
        <button class="btn btn-clear" style="width:100%" id="deleteConn">🗑 Supprimer (Suppr)</button>
      </div>
    `;

    document.getElementById('connLabel').addEventListener('input', (e) => {
      conn.label = e.target.value;
      renderConnections();
      autosave();
    });

    document.getElementById('connArrowType').addEventListener('change', (e) => {
      conn.arrowType = e.target.value;
      renderConnections();
      autosave();
    });

    const toggleBendBtn = document.getElementById('toggleBendBtn');
    if (toggleBendBtn) {
      toggleBendBtn.addEventListener('click', () => {
        const fromNode = state.nodes.find(n => n.id === conn.from);
        const toNode = state.nodes.find(n => n.id === conn.to);
        if (!fromNode || !toNode) return;
        const { from, to } = resolveEndpoints(conn, fromNode, toNode);
        const fromSide = resolvedSide(conn, fromNode, from, 'from');
        const toSide = resolvedSide(conn, toNode, to, 'to');
        const current = getElbowBend(from, to, conn.elbowBend, fromSide, toSide);
        saveHistory();
        conn.elbowBend = current === 'h' ? 'v' : 'h';
        conn.elbowMidRatio = 0.5;
        renderConnections();
        autosave();
      });
    }

    document.getElementById('deleteConn').addEventListener('click', deleteSelectedConnection);

  } else {
    properties.innerHTML = `
      <div class="empty-state">
        👈 Sélectionnez un élément<br>pour modifier ses propriétés
      </div>
    `;
  }
}

export function render() {
  canvas.querySelectorAll('.node').forEach(el => el.remove());
  state.nodes.forEach(node => {
    canvas.appendChild(createNodeElement(node));
  });
  renderConnections();
  if (state.selectedNode || state.selectedConnection) {
    renderProperties();
  }
  autosave();
}
