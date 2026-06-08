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
  setupUI();
  initMainChart();
  initSideChart();
  initTimeline();
  updateAll();
});

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

// --- INTERFAZ DE USUARIO ---
function setupUI() {
  const filtersDiv = d3.select("#campaign-filters");
  Object.keys(COLORS).forEach(camp => {
    filtersDiv.append("button")
      .attr("class", "camp-btn")
      .text(camp)
      .style("border-color", COLORS[camp].base)
      .on("click", function() {
        state.campaign = camp;
        d3.selectAll(".camp-btn").each(function() {
          const isAct = d3.select(this).text() === state.campaign;
          const c = COLORS[d3.select(this).text()].base;
          d3.select(this).style("background", isAct ? c : "white")
                         .style("color", isAct ? "white" : c);
        });
        state.sideNodes = {}; // Reseteamos posiciones del gráfico lateral
        updateAll();
      });
  });
  // Seleccionar "Todas" por defecto
  filtersDiv.select(".camp-btn").dispatch("click");

  // Panel lateral
  document.getElementById("close-btn").addEventListener("click", () => {
    document.getElementById("side-panel").classList.remove("open");
    state.selectedNode = null;
    updateAll(); // Quitar highlighting
  });
}

// --- GRÁFICO 1: ÁRBOL RADIAL (PRINCIPAL) ---
let mainG, mainLinkSel, mainNodeSel, mainLabelMap = {}, mainRoot;

function initMainChart() {
  const container = document.getElementById("main-chart");
  const width = container.clientWidth, height = container.clientHeight;
  const radius = Math.min(width, height) / 2 - 80;

  const svg = d3.select("#main-chart").append("svg")
    .attr("width", width).attr("height", height)
    .style("cursor", "grab");

  mainG = svg.append("g").attr("transform", `translate(${width/2},${height/2})`);
  
  svg.call(d3.zoom().scaleExtent([0.2, 8]).on("zoom", e => {
    mainG.attr("transform", `translate(${width/2 + e.transform.x},${height/2 + e.transform.y}) scale(${e.transform.k})`);
  }));

  // Construir jerarquía
  const childMap = new Map();
  state.orgData.edges.forEach(({ source, target }) => {
    if (!childMap.has(source)) childMap.set(source, []);
    childMap.get(source).push(target);
  });
  const nodeMap = new Map(state.orgData.nodes.map(n => [n.id, n]));
  const rootId = [...new Set(state.orgData.edges.map(e => e.source))].find(s => !new Set(state.orgData.edges.map(e => e.target)).has(s));
  
  function buildTree(id) {
    const node = nodeMap.get(id) || { id, label: id };
    return { ...node, children: (childMap.get(id) || []).map(buildTree) };
  }

  const treeLayout = d3.tree().size([2 * Math.PI, radius])
    .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth);

  mainRoot = d3.hierarchy(buildTree(rootId));
  treeLayout(mainRoot);

  mainLinkSel = mainG.append("g").selectAll("path").data(mainRoot.links()).join("path")
    .attr("fill", "none").attr("stroke", "#c8dff0").attr("stroke-width", 1)
    .attr("d", d3.linkRadial().angle(d => d.x).radius(d => d.y));

  mainNodeSel = mainG.append("g").selectAll("circle").data(mainRoot.descendants()).join("circle")
    .attr("transform", d => `rotate(${d.x * 180 / Math.PI - 90}) translate(${d.y},0)`)
    .attr("r", d => d.depth === 0 ? 8 : d.depth === 1 ? 5 : 3.5)
    .style("cursor", "pointer")
    .on("click", (e, d) => {
      const pid = (d.data.id || "").replace("person:", "");
      state.selectedNode = pid;
      document.getElementById("side-panel").classList.add("open");
      updateAll();
    });

  // Labels
  const labelGroup = mainG.append("g");
  mainRoot.descendants().forEach(d => {
    const pid = (d.data.id || "").replace("person:", "");
    const angle = d.x * 180 / Math.PI - 90;
    const flip = d.x >= Math.PI;
    const anchor = flip ? "end" : "start";
    const offset = flip ? -8 : 8;
    const label = d.data.label || d.data.id;
    
    const gNode = labelGroup.append("g").attr("transform", `rotate(${angle}) translate(${d.y},0) rotate(${flip ? 180 : 0})`);
    const txt = gNode.append("text").attr("dy", "0.31em").attr("x", offset).attr("text-anchor", anchor)
      .style("font-size", d.depth === 0 ? "13px" : "9px").text(label);
    
    mainLabelMap[pid] = { txt, depth: d.depth };
  });

// --- NODO FLOTANTE SAIDIT (Alineado y del mismo tamaño que Root) ---
  const defs = svg.append("defs");
  
  // Creamos el filtro de degradado para la "luz" (ajustado en tamaño)
  const glowGrad = defs.append("radialGradient").attr("id", "saidit-glow-grad");
  glowGrad.append("stop").attr("offset", "10%").attr("class", "glow-center").attr("stop-color", "#e63946").attr("stop-opacity", 0.9);
  glowGrad.append("stop").attr("offset", "100%").attr("class", "glow-edge").attr("stop-color", "#e63946").attr("stop-opacity", 0);

  // Distancia hacia la izquierda (Radio del árbol + un margen para los nombres)
  const offsetLeft = radius + 150; 

  const saiditHub = mainG.append("g")
    .attr("id", "saidit-hub")
    .attr("transform", `translate(-${offsetLeft}, 0)`) 
    .style("cursor", "pointer")
    .on("click", () => {
      // Magia del interruptor: Si está visible, lo ocultamos. Si está oculto, lo abrimos.
      const modal = document.getElementById("saidit-modal");
      if (!modal.classList.contains("hidden")) {
        modal.classList.add("hidden");
      } else {
        openSaiditLedger(); 
      }
    });

  // El círculo de luz escalado para un nodo más pequeño
  saiditHub.append("circle")
    .attr("class", "saidit-glow")
    .attr("r", 25) // Radio de luz reducido para que coincida
    .attr("fill", "url(#saidit-glow-grad)")
    .style("opacity", 0)
    .style("pointer-events", "none");

  // El Emoji del globo (Escalado para que sea igual al punto azul de Tenant Thread)
  saiditHub.append("text")
    .text("🌐")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("font-size", "18px"); // 18px coincide con el diámetro visual del nodo central

  // Etiqueta sutil abajo (Mismo tamaño de letra que el centro)
  saiditHub.append("text")
    .text("system:saidit")
    .attr("y", 22) // Lo subimos un poco para pegarlo al globo
    .attr("text-anchor", "middle")
    .style("font-size", "13px") // Mismo font-size que Tenant Thread
    .attr("fill", "#222"); // Color un poco más oscuro para empatar con los demás
}

function updateMainChart(visibleEvents) {
  const infectedMap = new Map();
  visibleEvents.forEach((e, i) => {
    [e.source, e.target].filter(Boolean).forEach(pid => {
      if (!infectedMap.has(pid)) infectedMap.set(pid, { campaign: e.campaign, order: i });
    });
  });

  const linkPaintMap = new Map();
  visibleEvents.forEach(e => {
    if (e.source && e.target) {
      const isEscalation = (state.depthMap.get(e.target) ?? 99) < (state.depthMap.get(e.source) ?? 99);
      if (isEscalation) linkPaintMap.set(`${e.source}|${e.target}`, e.campaign);
    }
  });

  mainLinkSel
    .attr("stroke", d => {
      const sid = (d.source.data.id || "").replace("person:", "");
      const tid = (d.target.data.id || "").replace("person:", "");
      const camp = linkPaintMap.get(`${sid}|${tid}`) || linkPaintMap.get(`${tid}|${sid}`);
      return camp ? COLORS[camp].base : "#c8dff0";
    })
    .attr("stroke-width", d => {
      const sid = (d.source.data.id || "").replace("person:", ""), tid = (d.target.data.id || "").replace("person:", "");
      return (linkPaintMap.has(`${sid}|${tid}`) || linkPaintMap.has(`${tid}|${sid}`)) ? 3 : 1;
    });

  mainNodeSel
    .attr("fill", d => {
      const pid = (d.data.id || "").replace("person:", "");
      if (infectedMap.has(pid)) return COLORS[infectedMap.get(pid).campaign].base;
      return d.depth === 0 ? "#2176ae" : d.depth === 1 ? "#5ba4cf" : "#a8d4ea";
    })
    .attr("r", d => {
      const pid = (d.data.id || "").replace("person:", "");
      let r = d.depth === 0 ? 8 : d.depth === 1 ? 5 : 3.5;
      if (infectedMap.has(pid)) r *= 1.8;
      return pid === state.selectedNode ? r * 1.5 : r; // Destacar seleccionado
    })
    .attr("stroke", d => {
      const pid = (d.data.id || "").replace("person:", "");
      return pid === state.selectedNode ? "#222" : "#fff";
    })
    .attr("stroke-width", d => (d.data.id || "").replace("person:", "") === state.selectedNode ? 3 : 1.2);

  // --- ANIMACIÓN LUZ SAIDIT (Glow) ---
  const recentSaidit = visibleEvents.filter(e => e.target === "system:saidit" || e.target?.includes("saidit"));
  
  if (recentSaidit.length > 0) {
    const latest = recentSaidit[recentSaidit.length - 1];

    // Si retrocedemos el tiempo en el slider, reseteamos el detector
    if (state.lastSaiditTs && state.currentTs < state.lastSaiditTs) {
      state.lastSaiditId = 0;
    }

    // CORRECCIÓN: Usamos la cantidad total de eventos para saber si hay uno NUEVO
    if (state.lastSaiditCount !== recentSaidit.length) {
      state.lastSaiditCount = recentSaidit.length;
      state.lastSaiditTs = latest.ts;
      
      const campColor = COLORS[latest.campaign]?.base || "#e63946";
      
      d3.selectAll(".glow-center").attr("stop-color", campColor);
      d3.selectAll(".glow-edge").attr("stop-color", campColor);

      d3.select(".saidit-glow")
        .interrupt()
        .style("opacity", 0)
        .transition().duration(200).style("opacity", 1)   
        .transition().duration(1800).style("opacity", 0); 
    }
  } else {
    state.lastSaiditCount = 0;
    state.lastSaiditTs = 0;
  }

}

// --- GRÁFICO 2: DETALLE LATERAL (DAG LÍNEA DE TIEMPO) ---
let sideGZoom, sideLinkLayer, sideNodeLayer;
const SIDE_NODE_R = 18, LEVEL_H = 120;

let sideZoomTransform = d3.zoomIdentity;

// --- GRÁFICO 2: DIAGRAMA DE SECUENCIA (SWIMLANES) ---
function initSideChart(){}

function updateSideChart(visibleEvents) {
  const container = d3.select("#side-chart");
  
  // Asegurarnos de que existe el estado de bloqueo
  if (typeof state.isLocked === "undefined") state.isLocked = false;

  // 1. AUTO-INICIALIZACIÓN, MÁSCARAS, Y BOTÓN LOCK
  let svg = container.select("svg");
  if (svg.empty()) {
    container.style("overflow-y", "auto").style("overflow-x", "hidden");
    svg = container.append("svg").attr("width", "100%").style("display", "block");

    // Crear el Botón Candado en la cabecera (al lado de Cerrar)
    if (d3.select("#lock-btn").empty()) {
      d3.select("#side-header").insert("button", "#close-btn")
        .attr("id", "lock-btn")
        .style("background", "none").style("border", "none").style("cursor", "pointer")
        .style("font-size", "12px").style("margin-right", "15px").style("color", "#aaa")
        .style("font-weight", "bold").style("transition", "color 0.2s")
        .html("🔓")
        .on("click", function() {
          state.isLocked = !state.isLocked;
          d3.select(this)
            .html(state.isLocked ? "🔒" : "🔓")
            .style("color", state.isLocked ? "#e63946" : "#aaa");
          if (state.isLocked) updateAll(); // Forzar el salto de cámara inmediato
        });
    }

    const defs = svg.append("defs");
    Object.keys(COLORS).forEach(camp => {
      defs.append("marker").attr("id", `arr-seq-${camp}`)
        .attr("viewBox", "0 -5 10 10").attr("refX", 8).attr("refY", 0)
        .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", COLORS[camp].base);
    });

    defs.append("clipPath").attr("id", "timeline-clip")
        .append("rect").attr("class", "clip-rect");

    svg.append("g").attr("class", "lifelines");
    const clippedArea = svg.append("g").attr("clip-path", "url(#timeline-clip)");
    clippedArea.append("g").attr("class", "x-axis");
    clippedArea.append("g").attr("class", "events-layer");
    clippedArea.append("g").attr("class", "time-cursor");
    svg.append("g").attr("class", "y-axis");

    if (d3.select("#seq-tooltip").empty()) {
      d3.select("body").append("div").attr("id", "seq-tooltip")
        .style("position", "absolute").style("background", "rgba(0,0,0,0.85)")
        .style("color", "white").style("padding", "10px").style("border-radius", "6px")
        .style("font-size", "12px").style("pointer-events", "none")
        .style("opacity", 0).style("z-index", 9999)
        .style("box-shadow", "0px 4px 10px rgba(0,0,0,0.3)");
    }

    const zoomBehavior = d3.zoom()
      .scaleExtent([1, 500])
      .on("zoom", (e) => {
        // LÓGICA DE DESBLOQUEO: Si el usuario arrastró con el ratón, quitamos el candado
        if (e.sourceEvent && state.isLocked) {
          state.isLocked = false;
          d3.select("#lock-btn").html("🔓 Seguir Radar").style("color", "#aaa");
        }
        
        sideZoomTransform = e.transform;
        const currentVisible = state.propEvents.filter(ev => 
          ev.ts <= state.currentTs && (state.campaign === "Todas" || ev.campaign === state.campaign)
        );
        updateSideChart(currentVisible);
      });
    
    svg.call(zoomBehavior);
  }

  // 2. Extraer datos
  const allCampEvents = state.propEvents.filter(e => state.campaign === "Todas" || e.campaign === state.campaign);
  if (allCampEvents.length === 0) return;

  const campMinT = allCampEvents[0].ts;
  const campMaxT = allCampEvents[allCampEvents.length - 1].ts;

  const peers = [];
  allCampEvents.forEach(e => {
    if (e.source && !peers.includes(e.source)) peers.push(e.source);
    if (e.target && !peers.includes(e.target)) peers.push(e.target);
  });

  // 3. Dimensiones
  const panelNode = document.getElementById("side-panel");
  const containerWidth = panelNode.clientWidth > 50 ? panelNode.clientWidth : 600; 
  const margin = { top: 40, right: 30, bottom: 30, left: 160 };
  const rowHeight = 35;
  const height = Math.max(panelNode.clientHeight || 500, peers.length * rowHeight + margin.top + margin.bottom);

  svg.attr("height", height);

  svg.select(".clip-rect")
     .attr("x", margin.left - 5) 
     .attr("y", 0)
     .attr("width", containerWidth - margin.left + 5)
     .attr("height", height);

  // 4. ESCALAS Y CÁMARA AUTO-SCROLL
  const xScaleOriginal = d3.scaleTime()
    .domain([new Date(campMinT * 1000), new Date(campMaxT * 1000)])
    .range([margin.left, containerWidth - margin.right]);

  // Si el candado está activado, recalcular el transform del zoom automáticamente
  if (state.isLocked) {
    const cursorOrigX = xScaleOriginal(new Date(state.currentTs * 1000));
    // Queremos que el radar azul se mantenga al 70% del ancho de la pantalla
    const targetScreenX = margin.left + (containerWidth - margin.left - margin.right) * 0.7; 
    const currentK = sideZoomTransform.k;
    
    // Calcular hacia dónde debe deslizarse. (Math.min con 0 evita que el inicio del gráfico se arrastre hacia el centro)
    const newX = Math.min(0, targetScreenX - currentK * cursorOrigX);
    
    sideZoomTransform = d3.zoomIdentity.translate(newX, sideZoomTransform.y).scale(currentK);
    svg.node().__zoom = sideZoomTransform; // Sincroniza silenciosamente el motor interno de D3
  }

  const xScale = sideZoomTransform.rescaleX(xScaleOriginal);
  const yScale = d3.scalePoint().domain(peers).range([margin.top, height - margin.bottom]).padding(0.5);

// 5. Dibujar Eje X (STICKY / FLOTANTE CON FONDO SOFT)
  const xAxisFormat = d3.timeFormat("%d %b, %H:%M:%S");
  const xAxisGroup = svg.select(".x-axis");
  
  // Leer el scroll actual para mantenerlo en posición
  const scrollY = document.getElementById("side-chart").scrollTop || 0;

  xAxisGroup
    .attr("transform", `translate(0, ${margin.top - 10 + scrollY})`)
    .call(d3.axisTop(xScale).ticks(5).tickFormat(xAxisFormat))
    .call(g => g.select(".domain").attr("stroke", "#dde"))
    .call(g => g.selectAll("text").attr("fill", "#666").style("font-size", "10px"));

  // Crear el fondo semitransparente (soft) detrás de las fechas
  xAxisGroup.selectAll("rect.axis-bg").data([null]).join("rect")
    .attr("class", "axis-bg")
    .attr("x", 0)
    .attr("y", -margin.top)
    .attr("width", containerWidth)
    .attr("height", margin.top)
    .attr("fill", "rgba(250, 252, 255, 0.90)") // 90% opaco para efecto soft
    .lower(); // Asegura que el fondo quede detrás de los números

  // Traer todo el eje al frente para que pase por encima de las flechas verdes/rojas
  xAxisGroup.raise(); 

  // Escuchar el evento de scroll nativo para que el eje "baje" contigo en tiempo real
  d3.select("#side-chart").on("scroll.stickyAxis", function() {
    svg.select(".x-axis").attr("transform", `translate(0, ${margin.top - 10 + this.scrollTop})`);
  });

  // 6. Nombres
  svg.select(".y-axis").selectAll("text.peer-label").data(peers, d => d)
    .join("text").attr("class", "peer-label")
    .attr("x", margin.left - 15).attr("y", d => yScale(d))
    .attr("text-anchor", "end").attr("alignment-baseline", "middle")
    .style("font-size", "11px").style("cursor", "pointer")
    .text(d => d)
    .attr("fill", d => d === state.selectedNode ? "#e63946" : "#555")
    .style("font-weight", d => d === state.selectedNode ? "bold" : "normal");

  // 7. Rieles
  svg.select(".lifelines").selectAll("line.lifeline").data(peers, d => d)
    .join("line").attr("class", "lifeline")
    .attr("x1", margin.left).attr("x2", containerWidth - margin.right)
    .attr("y1", d => yScale(d)).attr("y2", d => yScale(d))
    .attr("stroke", "#f0f4f8").attr("stroke-width", 1);

  // 8. Eventos Verticales
  const linksData = visibleEvents.filter(e => e.source && e.target && peers.includes(e.source) && peers.includes(e.target));
  const events = svg.select(".events-layer").selectAll("g.event")
    .data(linksData, d => d.ts + d.source + d.target)
    .join("g").attr("class", "event");

  const maxIdx = Math.max(1, linksData.length - 1);
  events.style("opacity", (d, i) => i === linksData.length - 1 ? 1.0 : 0.2 + 0.6 * (i / maxIdx));

  const showTooltip = (event, d) => {
    const tooltip = d3.select("#seq-tooltip");
    const dateStr = new Date(d.ts * 1000).toLocaleString("es-ES");
    const shortName = d.short_name || 'Evento Desconocido';
    const taskName = d.details?.task || d["details.task"] || "";
    const actionLabel = taskName ? `${shortName} <span style="color:#f4a261;">(${taskName})</span>` : shortName;
    const detailStr = d.details?.args?.path || d["details.args.path"] || d.details?.args?.url || d["details.args.url"] || "Ninguno";
    
    tooltip.html(`
      <strong style="color:${COLORS[d.campaign]?.dim || '#fff'}">▶ ${d.campaign || 'Campaña'}</strong><br>
      <b>De:</b> ${d.source}<br>
      <b>Para:</b> ${d.target}<br>
      <b>Hora:</b> ${dateStr}<br>
      <hr style="border: 0.5px solid #444; margin: 4px 0;">
      <b>Acción:</b> ${actionLabel}<br>
      <i style="font-size:10px; color:#aaa;">Ruta/Archivo: ${detailStr}</i>
    `);
    
    tooltip.style("opacity", 1)
      .style("left", (event.pageX + 15) + "px")
      .style("top", (event.pageY - 15) + "px");
  };

  const hideTooltip = () => d3.select("#seq-tooltip").style("opacity", 0);

  events.selectAll("path.event-link").data(d => [d])
    .join("path").attr("class", "event-link")
    .attr("stroke-width", 2).attr("fill", "none")
    .attr("stroke", d => COLORS[d.campaign]?.base || "#aaa")
    .attr("marker-end", d => `url(#arr-seq-${d.campaign})`)
    .style("cursor", "crosshair")
    .on("mouseover", showTooltip).on("mouseout", hideTooltip)
    .attr("d", d => {
      const x = xScale(new Date(d.ts * 1000));
      const y1 = yScale(d.source);
      const y2 = yScale(d.target);
      if (d.source === d.target) return `M ${x},${y1} C ${x+15},${y1-15} ${x+15},${y1+15} ${x},${y1+5}`;
      return `M ${x},${y1} L ${x},${y2}`;
    });

  events.selectAll("circle.event-source").data(d => [d])
    .join("circle").attr("class", "event-source")
    .attr("cx", d => xScale(new Date(d.ts * 1000)))
    .attr("cy", d => yScale(d.source))
    .attr("r", 4).attr("fill", d => COLORS[d.campaign]?.base || "#aaa")
    .style("cursor", "crosshair")
    .on("mouseover", showTooltip).on("mouseout", hideTooltip);

  // 9. Radar
  svg.select(".time-cursor").selectAll("line").data([state.currentTs])
    .join("line").attr("stroke", "#2176ae").attr("stroke-width", 1.5).attr("stroke-dasharray", "4,4")
    .attr("x1", d => xScale(new Date(d * 1000)))
    .attr("x2", d => xScale(new Date(d * 1000)))
    .attr("y1", margin.top - 15).attr("y2", height - margin.bottom + 10);
}

// --- LÍNEA DE TIEMPO COMPARTIDA ---
let tlHandle, tlScale;

function initTimeline() {
  const svg = d3.select("#timeline-svg");
  const bounds = document.getElementById("slider-wrapper").getBoundingClientRect();
  const width = bounds.width, height = bounds.height;
  
  tlScale = d3.scaleLinear().domain([state.minT, state.maxT]).range([20, width - 20]).clamp(true);

  svg.append("rect").attr("x", 20).attr("y", height/2 - 3).attr("width", width - 40).attr("height", 6)
    .attr("rx", 3).attr("fill", "#e0e8f0");

  tlHandle = svg.append("circle").attr("r", 9).attr("cy", height/2).attr("cx", 20)
    .attr("fill", "#2176ae").attr("stroke", "#fff").attr("stroke-width", 2)
    .style("cursor", "ew-resize")
    .call(d3.drag().on("drag", ev => {
      let x = Math.max(20, Math.min(width - 20, ev.x));
      state.currentTs = tlScale.invert(x);
      updateAll();
    }));

  // Botón Play
  const playBtn = document.getElementById("play-btn");
  playBtn.addEventListener("click", () => {
    if (state.playing) {
      clearInterval(state.timer); state.playing = false; playBtn.innerText = "▶ Play";
    } else {
      if (state.currentTs >= state.maxT) state.currentTs = state.minT;
      state.playing = true; playBtn.innerText = "⏸ Pausa";
      state.timer = setInterval(() => {
        const step = (state.maxT - state.minT) / 200; // Velocidad
        state.currentTs += step;
        if (state.currentTs >= state.maxT) {
          state.currentTs = state.maxT;
          clearInterval(state.timer); state.playing = false; playBtn.innerText = "▶ Play";
        }
        updateAll();
      }, 50);
    }
  });
}

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
  // pop up 
  const modal = document.getElementById("saidit-modal");
  if (modal && !modal.classList.contains("hidden")) {
    openSaiditLedger(); // Refresca la tabla automáticamente con los nuevos datos
  }
}

// --- LÓGICA DE LA VENTANA POP-UP SAIDIT (Q2) ---
function openSaiditLedger() {
  const saiditEvents = state.propEvents.filter(e => 
    e.ts <= state.currentTs && 
    (e.target === "system:saidit" || e.target?.includes("saidit"))
  );

  const container = d3.select("#saidit-table-container");
  container.html(""); 

  if (saiditEvents.length === 0) {
    container.html("<div class='empty-msg'>No se han interceptado datos en este momento de la línea de tiempo.</div>");
  } else {
    let html = `<table class="ledger-table">
                  <tr>
                    <th>Fecha</th>
                    <th>Campaña</th>
                    <th>Origen</th>
                    <th>Acción</th>
                    <th>Contenido</th>
                  </tr>`;
    
    saiditEvents.reverse().forEach(e => {
      const dateStr = new Date(e.ts * 1000).toLocaleString("es-ES", {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit"});
      const color = COLORS[e.campaign]?.base || "#444";
      const action = e.details?.task || e.short_name || "Post";
      const content = e.details?.content || e["details.content"] || e.details?.args?.path || "Vacio/Cifrado";
      
      html += `<tr>
                <td style="color:#888; white-space:nowrap;">${dateStr}</td>
                <td><span class="camp-tag" style="background:${color}">${e.campaign}</span></td>
                <td style="font-weight:600;">${e.source}</td>
                <td>${action}</td>
                <td><div class="content-box">${content}</div></td>
              </tr>`;
    });
    html += `</table>`;
    container.html(html);
  }

  d3.select("#saidit-modal").classed("hidden", false);
}

// Cerrar el Modal
document.getElementById("close-modal-btn").addEventListener("click", () => {
  d3.select("#saidit-modal").classed("hidden", true);
});

// --- LÓGICA DE ARRASTRE Y ANCLAJE (A PRUEBA DE BALAS) ---
const popup = document.getElementById("saidit-modal");
const dragHandle = document.getElementById("modal-drag-handle");

let isDragging = false, startX, startY, startLeft, startTop;
let isSnapped = false;

// 1. ESCUCHAMOS EL CLIC SOLO EN EL TÍTULO
dragHandle.addEventListener("mousedown", (e) => {
  isDragging = true;
  
  if (isSnapped) {
    isSnapped = false;
    popup.style.width = "650px";
    popup.style.height = "auto";
    
    startLeft = e.clientX - 325; 
    startTop = e.clientY - 20;
  } else {
    // Obtenemos la posición en píxeles de la ventana
    startLeft = popup.offsetLeft; 
    startTop = popup.offsetTop;
  }
  
  startX = e.clientX;
  startY = e.clientY;
  
  // Forzamos al navegador a soltar cualquier bloqueo de texto
  e.preventDefault(); 
});

// 2. MOVEMOS LA VENTANA
document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  e.preventDefault();
  
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  
  // Importante: usamos !important desde JS para sobreescribir el CSS
  popup.style.setProperty("left", (startLeft + dx) + "px", "important");
  popup.style.setProperty("top", (startTop + dy) + "px", "important");
});

// 3. SOLTAMOS Y HACEMOS EL EFECTO SNAP (WINDOWS)
document.addEventListener("mouseup", (e) => {
  if (!isDragging) return;
  isDragging = false;
  
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  // Si lo sueltas pegado a la DERECHA
  if (e.clientX > screenW - 50) {
    isSnapped = true;
    popup.style.setProperty("transition", "all 0.2s ease-out"); // Animación suave
    popup.style.setProperty("left", (screenW - 520) + "px", "important");
    popup.style.setProperty("top", "60px", "important");
    popup.style.setProperty("width", "500px", "important");
    popup.style.setProperty("height", (screenH - 150) + "px", "important");
    
    // Quitamos la transición después para que no haya lag al volverlo a arrastrar
    setTimeout(() => popup.style.setProperty("transition", "none"), 200);
  }
  
  // Si lo sueltas pegado a la IZQUIERDA
  else if (e.clientX < 50) {
    isSnapped = true;
    popup.style.setProperty("transition", "all 0.2s ease-out");
    popup.style.setProperty("left", "20px", "important");
    popup.style.setProperty("top", "60px", "important");
    popup.style.setProperty("width", "500px", "important");
    popup.style.setProperty("height", (screenH - 150) + "px", "important");
    
    setTimeout(() => popup.style.setProperty("transition", "none"), 200);
  }
});
