// Actions qui mutent l'état suite à une décision de l'utilisateur
// (sélection, suppression, duplication), puis redemandent un rendu.
// Voir la note dans render.js au sujet de l'import circulaire avec ce module :
// c'est volontaire et sans danger car aucun appel n'a lieu au chargement.
import { state, GRID_SIZE } from './state.js';
import { saveHistory, autosave } from './persistence.js';
import { render, renderProperties } from './render.js';

export function selectNode(node) {
  state.selectedNode = node;
  state.selectedConnection = null;
  renderProperties();
  render();
}

export function selectConnection(conn) {
  state.selectedConnection = conn;
  state.selectedNode = null;
  renderProperties();
  render();
}

export function deleteSelectedNode() {
  if (!state.selectedNode) return;
  saveHistory();
  const id = state.selectedNode.id;
  state.nodes = state.nodes.filter(n => n.id !== id);
  state.connections = state.connections.filter(c => c.from !== id && c.to !== id);
  state.selectedNode = null;
  render();
  autosave();
}

export function deleteSelectedConnection() {
  if (!state.selectedConnection) return;
  saveHistory();
  state.connections = state.connections.filter(c => c.id !== state.selectedConnection.id);
  state.selectedConnection = null;
  render();
  autosave();
}

export function duplicateNode(node) {
  saveHistory();
  const newNode = Object.assign({}, node, {
    id: ++state.nodeCounter,
    x: node.x + GRID_SIZE * 2,
    y: node.y + GRID_SIZE * 2
  });
  state.nodes.push(newNode);
  selectNode(newNode);
  autosave();
}
