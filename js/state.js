/* Este archivo define el estado global de la aplicación y contiene funciones para procesar los datos
y construir estructuras auxiliares como el mapa de profundidad. Es el núcleo lógico que conecta la carga
de datos con la visualización y la interfaz de usuario.
*/

// --- CONSTANTES Y ESTADO GLOBAL ---
const COLORS = {
  HiddenOrca: { base: "#e63946", dim: "#f7a3a8" },
  MellowOtter: { base: "#f4a261", dim: "#fad4b0" },
  SwiftWren: { base: "#2a9d8f", dim: "#96d4cd" },
  Todas: { base: "#2176ae", dim: "#a8d4ea" }
};

const state = {
  orgData: null,
  propEvents: null,
  minT: 0, maxT: 0, currentTs: 0,
  campaign: "Todas",
  selectedNode: null,
  playing: false, timer: null,
  
  // Datos calculados para los gráficos
  depthMap: new Map(),
  sideNodes: {} 
};

// --- FUNCIONES DE PROCESAMIENTO DE DATOS ---
function buildDepthMap() {
  const childMap = new Map();
  state.orgData.edges.forEach(({ source, target }) => {
    if (!childMap.has(source)) childMap.set(source, []);
    childMap.get(source).push(target);
  });
  
  const allTargets = new Set(state.orgData.edges.map(e => e.target));
  const isRoot = [...new Set(state.orgData.edges.map(e => e.source))].find(s => !allTargets.has(s));
  
  const bfsQ = [[isRoot, 0]];
  while (bfsQ.length) {
    const [id, d] = bfsQ.shift();
    const key = id.replace("person:", "");
    if (!state.depthMap.has(key)) {
      state.depthMap.set(key, d);
      (childMap.get(id) || []).forEach(c => bfsQ.push([c, d + 1]));
    }
  }
}
