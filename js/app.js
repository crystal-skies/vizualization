// --- INICIALIZACIÓN ---
Promise.all([
  d3.json("org_chart.json"),
  d3.json("propagation_events.json")
]).then(([org, propRaw]) => {
  state.orgData = org;
  state.propEvents = propRaw.map(d => ({ ...d, ts: +d.when })).sort((a, b) => a.ts - b.ts);
  state.minT = state.propEvents[0].ts;
  state.maxT = state.propEvents[state.propEvents.length - 1].ts;
  state.currentTs = state.minT;

  buildDepthMap();
  
  // 1. PRIMERO DIBUJAMOS LOS GRÁFICOS (Para que existan las variables)
  initMainChart(); 
  initSideChart(); 
  initTimeline();  // ¡Aquí nace tlHandle!
  
  // 2. DESPUÉS ACTIVAMOS LA INTERFAZ (Botones y clics automáticos)
  setupUI();       
  
  // 3. ACTUALIZACIÓN FINAL
  updateAll();     
});


// --- CONTROLADOR PRINCIPAL DE ACTUALIZACIÓN ---
function updateAll() {
  // Actualizar UI del reloj
  if (state.currentTs) {
    const d = new Date(state.currentTs * 1000);
    document.getElementById("clock-date").innerText = d.toLocaleDateString("es-ES", {month:"short", day:"numeric", year:"numeric"});
    document.getElementById("clock-time").innerText = d.toLocaleTimeString("es-ES") + " UTC";
  }
  
  // Posición del Slider
  tlHandle.attr("cx", tlScale(state.currentTs));

  // Filtrar eventos por tiempo y campaña
  const visibleEvents = state.propEvents.filter(e => 
    e.ts <= state.currentTs && 
    (state.campaign === "Todas" || e.campaign === state.campaign)
  );

  document.getElementById("stats-label").innerText = `${visibleEvents.length} transmisiones detectadas`;

  // Actualizar Gráficos sincronizados
  updateMainChart(visibleEvents);
  
  if (document.getElementById("side-panel").classList.contains("open")) {
    document.getElementById("side-title").innerText = state.selectedNode ? `Topología: ${state.selectedNode}` : `Detalle de Campaña`;
    updateSideChart(visibleEvents);
  }
  // Consola inferior de filtraciones (Sincronización en tiempo real)
  const consoleDiv = document.getElementById("bottom-console");
  if (consoleDiv && !consoleDiv.classList.contains("collapsed")) {
    openSaiditLedger(); // Refresca la tabla automáticamente con los nuevos datos
  }
}
