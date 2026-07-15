// Dessin des formes (SVG interne à un bloc) et petit utilitaire couleur.
// Ce module ne connaît rien de l'état global : il prend des paramètres et
// renvoie une chaîne SVG ou un objet RGB, ce qui le rend facile à tester.

export function generateShapeSVG(type, width, height, borderColor, fillColor) {
  const fill = fillColor === 'transparent' ? 'white' : fillColor;
  const fillOpacity = '1';

  switch (type) {
    case 'terminal':
      return `<rect width="${width}" height="${height}" rx="${height / 2}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>`;

    case 'process':
      return `<rect width="${width}" height="${height}" rx="4" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>`;

    case 'decision':
      return `<path d="M${width / 2} 0 L${width} ${height / 2} L${width / 2} ${height} L0 ${height / 2} Z" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>`;

    case 'io':
      return `<path d="M${width * 0.1} 0 L${width} 0 L${width * 0.9} ${height} L0 ${height} Z" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>`;

    case 'document':
      return `<path d="M0 0 L${width} 0 L${width} ${height * 0.75} Q${width * 0.75} ${height * 0.95} ${width / 2} ${height * 0.75} T0 ${height * 0.75} Z" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>`;

    case 'subprocess':
      return `<rect width="${width}" height="${height}" rx="4" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>
              <line x1="15" y1="0" x2="15" y2="${height}" stroke="${borderColor}" stroke-width="2"/>
              <line x1="${width - 15}" y1="0" x2="${width - 15}" y2="${height}" stroke="${borderColor}" stroke-width="2"/>`;

    case 'database':
      return `<ellipse cx="${width / 2}" cy="10" rx="${width / 2 - 2}" ry="9" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>
              <path d="M2 10 L2 ${height - 10} Q2 ${height} ${width / 2} ${height} Q${width - 2} ${height} ${width - 2} ${height - 10} L${width - 2} 10" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>
              <ellipse cx="${width / 2}" cy="${height - 10}" rx="${width / 2 - 2}" ry="9" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>`;

    case 'connector':
      return `<circle cx="${width / 2}" cy="${height / 2}" r="${width / 2 - 2}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>`;

    case 'delay':
      return `<rect width="${width}" height="${height}" rx="30" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>`;

    case 'preparation':
      return `<path d="M${width * 0.15} 0 L${width * 0.85} 0 L${width} ${height / 2} L${width * 0.85} ${height} L${width * 0.15} ${height} L0 ${height / 2} Z" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>`;

    case 'manual':
      return `<path d="M0 ${height * 0.25} L${width} 0 L${width} ${height} L0 ${height} Z" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>`;

    case 'multidoc':
      return `<rect x="8" y="0" width="${width - 8}" height="${height * 0.85}" rx="6" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>
              <rect x="0" y="8" width="${width - 8}" height="${height * 0.85}" rx="6" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>`;

    default:
      return `<rect width="${width}" height="${height}" rx="4" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-width="2"/>`;
  }
}

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
}

export function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  })[c]);
}
