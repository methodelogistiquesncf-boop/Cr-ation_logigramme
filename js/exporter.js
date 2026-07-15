// Construction du SVG exportable (réutilisé pour l'export SVG et PNG),
// export du projet en JSON, et import d'un projet JSON existant.
import { state } from './state.js';
import { generateShapeSVG, hexToRgb, escapeXml } from './shapes.js';
import { resolveEndpoints, resolvedSide, generateElbowPath } from './geometry.js';
import { saveHistory } from './persistence.js';

export function buildExportSVG() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  state.nodes.forEach(node => {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  });

  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = 400; maxY = 300;
  }

  const padding = 40;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const offsetX = -minX + padding;
  const offsetY = -minY + padding;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="white"/>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
      <polygon points="0 0, 10 3, 0 6" fill="#586069"/>
    </marker>
    <marker id="arrowThickExport" markerWidth="12" markerHeight="12" refX="10" refY="4" orient="auto">
      <polygon points="0 0, 12 4, 0 8" fill="#586069"/>
    </marker>
  </defs>\n`;

  state.connections.forEach(conn => {
    const fromNode = state.nodes.find(n => n.id === conn.from);
    const toNode = state.nodes.find(n => n.id === conn.to);
    if (!fromNode || !toNode) return;

    const { from, to } = resolveEndpoints(conn, fromNode, toNode);
    const fromSide = resolvedSide(conn, fromNode, from, 'from');
    const toSide = resolvedSide(conn, toNode, to, 'to');

    let attrs = `stroke="#586069" fill="none"`;
    let element = 'line';
    let coords = `x1="${from.x + offsetX}" y1="${from.y + offsetY}" x2="${to.x + offsetX}" y2="${to.y + offsetY}"`;

    if (conn.arrowType === 'elbow' || conn.arrowType === 'elbow-dashed') {
      element = 'path';
      const path = generateElbowPath(
        { x: from.x + offsetX, y: from.y + offsetY },
        { x: to.x + offsetX, y: to.y + offsetY },
        conn.elbowBend,
        fromSide,
        toSide,
        conn.elbowMidRatio
      );
      coords = `d="${path}"`;
    }

    switch (conn.arrowType) {
      case 'simple': attrs += ` stroke-width="2" marker-end="url(#arrow)"`; break;
      case 'line': attrs += ` stroke-width="2"`; break;
      case 'elbow': attrs += ` stroke-width="2" marker-end="url(#arrow)"`; break;
      case 'elbow-dashed': attrs += ` stroke-width="2" stroke-dasharray="5,4" marker-end="url(#arrow)"`; break;
      case 'double': attrs += ` stroke-width="2" marker-end="url(#arrow)" marker-start="url(#arrow)"`; break;
      case 'dashed': attrs += ` stroke-width="2" stroke-dasharray="5,4" marker-end="url(#arrow)"`; break;
      case 'thick': attrs += ` stroke-width="4" marker-end="url(#arrowThickExport)"`; break;
    }

    svg += `  <${element} ${coords} ${attrs}/>\n`;

    if (conn.label) {
      const midX = (from.x + to.x) / 2 + offsetX;
      const midY = (from.y + to.y) / 2 + offsetY;
      const tw = conn.label.length * 7 + 10;
      svg += `  <rect x="${midX - tw / 2}" y="${midY - 16}" width="${tw}" height="20" rx="4" fill="white" stroke="#e1e4e8"/>\n`;
      svg += `  <text x="${midX}" y="${midY}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="600" fill="#586069">${escapeXml(conn.label)}</text>\n`;
    }
  });

  state.nodes.forEach(node => {
    const x = node.x + offsetX;
    const y = node.y + offsetY;

    svg += `  <g transform="translate(${x}, ${y})">\n`;
    svg += `    ${generateShapeSVG(node.type, node.width, node.height, node.borderColor, node.fillColor)}\n`;

    const textColor = node.fillColor !== 'transparent' ?
      ((hexToRgb(node.fillColor).r * 299 + hexToRgb(node.fillColor).g * 587 + hexToRgb(node.fillColor).b * 114) / 1000 > 128 ? '#24292e' : 'white') :
      node.borderColor;

    const lines = String(node.text).split('\n');
    const lineHeight = 16;
    const startY = node.height / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
      svg += `    <text x="${node.width / 2}" y="${startY + i * lineHeight}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="500" fill="${textColor}">${escapeXml(line)}</text>\n`;
    });
    svg += `  </g>\n`;
  });

  svg += `</svg>`;
  return { svg, width, height };
}

export function downloadSVG() {
  const { svg } = buildExportSVG();
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'logigramme.svg';
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPNG() {
  if (state.nodes.length === 0) {
    alert("Ajoutez au moins un bloc avant d'exporter.");
    return;
  }
  const { svg, width, height } = buildExportSVG();
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = width * scale;
    c.height = height * scale;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);
    c.toBlob((blob2) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob2);
      link.download = 'logigramme.png';
      link.click();
    });
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('Erreur lors de la génération du PNG.');
  };
  img.src = url;
}

export function downloadProjectJSON() {
  const data = {
    nodes: state.nodes,
    connections: state.connections,
    nodeCounter: state.nodeCounter,
    connectionCounter: state.connectionCounter
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'logigramme-projet.json';
  a.click();
  URL.revokeObjectURL(url);
}

// onDone est appelé après un import réussi pour rafraîchir l'affichage
// (découplage volontaire de render.js pour éviter une dépendance inutile).
export function importProjectJSON(file, onDone) {
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (!Array.isArray(data.nodes) || !Array.isArray(data.connections)) {
        throw new Error('Format invalide');
      }
      saveHistory();
      state.nodes = data.nodes;
      state.connections = data.connections;
      state.nodeCounter = data.nodeCounter || state.nodes.reduce((m, n) => Math.max(m, n.id), 0);
      state.connectionCounter = data.connectionCounter || state.connections.reduce((m, c) => Math.max(m, c.id), 0);
      state.selectedNode = null;
      state.selectedConnection = null;
      onDone();
    } catch (err) {
      alert('Fichier JSON invalide : ' + err.message);
    }
  };
  reader.readAsText(file);
}
