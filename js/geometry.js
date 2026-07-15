// Toute la géométrie pure des connexions : ports fixes, connecteurs
// "flottants" (qui suivent automatiquement le bloc quand il bouge, comme
// dans draw.io), et calcul des tracés en angle droit. Aucune dépendance au
// DOM ni à l'état global : tout est passé en paramètre.

// Les 8 ports fixes disponibles sur le contour d'un bloc.
export const FIXED_PORTS = [
  'top', 'right', 'bottom', 'left',
  'top-left', 'top-right', 'bottom-left', 'bottom-right'
];

export function getAnchorPosition(node, anchor) {
  const positions = {
    center: { x: node.x + node.width / 2, y: node.y + node.height / 2 },
    top: { x: node.x + node.width / 2, y: node.y },
    right: { x: node.x + node.width, y: node.y + node.height / 2 },
    bottom: { x: node.x + node.width / 2, y: node.y + node.height },
    left: { x: node.x, y: node.y + node.height / 2 },
    'top-left': { x: node.x, y: node.y },
    'top-right': { x: node.x + node.width, y: node.y },
    'bottom-left': { x: node.x, y: node.y + node.height },
    'bottom-right': { x: node.x + node.width, y: node.y + node.height }
  };
  return positions[anchor] || positions.center;
}

// Position absolue (canvas) de tous les ports d'un bloc, utilisé pour
// l'accrochage magnétique pendant un glisser de connexion.
export function getPorts(node) {
  return FIXED_PORTS.map(id => ({ id, ...getAnchorPosition(node, id) }));
}

// Connecteur flottant : le point de sortie/entrée n'est pas figé sur un
// port précis, il est recalculé à chaque rendu comme l'intersection entre
// le segment reliant les deux centres et le contour du bloc. La flèche
// suit donc automatiquement le bloc quand on le déplace.
export function getFloatingPoint(node, otherNode) {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const ocx = otherNode.x + otherNode.width / 2;
  const ocy = otherNode.y + otherNode.height / 2;
  const dx = ocx - cx;
  const dy = ocy - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const halfW = node.width / 2;
  const halfH = node.height / 2;
  const candidates = [];
  if (dx !== 0) candidates.push(halfW / Math.abs(dx));
  if (dy !== 0) candidates.push(halfH / Math.abs(dy));

  const t = Math.min(...candidates);
  return { x: cx + dx * t, y: cy + dy * t };
}

// De quel côté du rectangle un point situé sur son contour ressort-il ?
// Sert à router un tracé "angle droit" même avec une extrémité flottante.
function sideOfPoint(node, point) {
  const EPS = 0.5;
  if (Math.abs(point.x - node.x) < EPS) return 'left';
  if (Math.abs(point.x - (node.x + node.width)) < EPS) return 'right';
  if (Math.abs(point.y - node.y) < EPS) return 'top';
  if (Math.abs(point.y - (node.y + node.height)) < EPS) return 'bottom';
  return null;
}

function anchorSide(anchor) {
  if (anchor === 'top' || anchor === 'top-left' || anchor === 'top-right') return 'top';
  if (anchor === 'bottom' || anchor === 'bottom-left' || anchor === 'bottom-right') return 'bottom';
  if (anchor === 'left') return 'left';
  if (anchor === 'right') return 'right';
  return null; // 'center' ou inconnu : laissé à l'auto-détection de getElbowBend
}

// Résout les deux extrémités visuelles d'une connexion (fixe ou flottante).
export function resolveEndpoints(conn, fromNode, toNode) {
  const from = conn.fromAnchor === 'auto'
    ? getFloatingPoint(fromNode, toNode)
    : getAnchorPosition(fromNode, conn.fromAnchor);
  const to = conn.toAnchor === 'auto'
    ? getFloatingPoint(toNode, fromNode)
    : getAnchorPosition(toNode, conn.toAnchor);
  return { from, to };
}

// Le "côté logique" d'une extrémité, qu'elle soit fixe ou flottante —
// nécessaire pour router correctement un tracé en angle droit.
export function resolvedSide(conn, node, point, end) {
  const anchor = end === 'from' ? conn.fromAnchor : conn.toAnchor;
  return anchor === 'auto' ? sideOfPoint(node, point) : anchorSide(anchor);
}

// bend: 'h' = horizontal d'abord, 'v' = vertical d'abord, undefined = automatique.
// fromSide/toSide (top/bottom/left/right/null) permettent de choisir un sens
// cohérent avec le côté de sortie/entrée, pour que la pointe de flèche finale
// soit toujours orientée correctement.
export function getElbowBend(from, to, bend, fromSide, toSide) {
  if (bend === 'h' || bend === 'v') return bend;

  const fromHoriz = fromSide === 'left' || fromSide === 'right';
  const fromVert = fromSide === 'top' || fromSide === 'bottom';
  const toHoriz = toSide === 'left' || toSide === 'right';
  const toVert = toSide === 'top' || toSide === 'bottom';

  if (fromHoriz && toVert) return 'h';
  if (fromVert && toHoriz) return 'v';
  if (fromHoriz && toHoriz) return 'v';
  if (fromVert && toVert) return 'h';

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
}

// Supprime les points quasi-identiques consécutifs : un dernier segment de
// longueur ~0 empêche le navigateur de calculer correctement l'angle de la
// pointe de flèche (marker orient="auto").
export function pointsToPath(points) {
  const EPS = 0.5;
  const cleaned = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const p = points[i];
    if (Math.abs(p.x - prev.x) > EPS || Math.abs(p.y - prev.y) > EPS) {
      cleaned.push(p);
    }
  }
  if (cleaned.length === 1) {
    return `M ${cleaned[0].x} ${cleaned[0].y}`;
  }
  return 'M ' + cleaned.map((p, i) => (i === 0 ? `${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
}

export function generateElbowPath(from, to, bend, fromSide, toSide, midRatio) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ratio = (typeof midRatio === 'number' && !isNaN(midRatio)) ? midRatio : 0.5;
  const midX = from.x + dx * ratio;
  const midY = from.y + dy * ratio;
  const useH = getElbowBend(from, to, bend, fromSide, toSide) === 'h';

  const points = useH
    ? [{ x: from.x, y: from.y }, { x: midX, y: from.y }, { x: midX, y: to.y }, { x: to.x, y: to.y }]
    : [{ x: from.x, y: from.y }, { x: from.x, y: midY }, { x: to.x, y: midY }, { x: to.x, y: to.y }];

  return pointsToPath(points);
}
