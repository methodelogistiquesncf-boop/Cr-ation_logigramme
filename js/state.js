// État partagé de l'application. Un seul objet mutable importé par tous les
// autres modules : c'est la source de vérité unique (nodes, connections,
// sélection, mode courant...).
export const state = {
  nodes: [],
  connections: [],
  selectedNode: null,
  selectedConnection: null,
  currentArrowType: 'simple',
  history: [],
  nodeCounter: 0,
  connectionCounter: 0,
  snapToGrid: true
};

export const GRID_SIZE = 20;
export const STORAGE_KEY = 'logigramme_autosave_v1';

export const colorPresets = [
  '#0366d6', '#28a745', '#d73a49', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#ec4899', '#6366f1', '#10b981', '#f97316'
];

// Catalogue des formes disponibles dans la barre d'outils : couleur par
// défaut, taille par défaut et libellé initial posé sur le canvas.
export const nodeTypes = {
  terminal: { label: 'Début', color: '#667eea', fill: 'transparent', width: 140, height: 60 },
  process: { label: 'Processus', color: '#0366d6', fill: 'transparent', width: 140, height: 60 },
  decision: { label: 'Décision ?', color: '#f59e0b', fill: 'transparent', width: 120, height: 120 },
  io: { label: 'Entrée/Sortie', color: '#10b981', fill: 'transparent', width: 140, height: 60 },
  document: { label: 'Document', color: '#8b5cf6', fill: 'transparent', width: 140, height: 80 },
  subprocess: { label: 'Sous-processus', color: '#0366d6', fill: 'transparent', width: 140, height: 60 },
  database: { label: 'Base de données', color: '#06b6d4', fill: 'transparent', width: 100, height: 120 },
  connector: { label: '1', color: '#6366f1', fill: 'transparent', width: 60, height: 60 },
  delay: { label: 'Attente', color: '#f59e0b', fill: 'transparent', width: 140, height: 60 },
  preparation: { label: 'Préparation', color: '#ec4899', fill: 'transparent', width: 140, height: 60 },
  manual: { label: 'Manuel', color: '#10b981', fill: 'transparent', width: 140, height: 60 },
  multidoc: { label: 'Documents', color: '#8b5cf6', fill: 'transparent', width: 140, height: 80 }
};
