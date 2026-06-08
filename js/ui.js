/* Este archivo contiene toda la lógica relacionada con la interfaz de usuario, incluyendo:
- Configuración de los filtros de campaña
- Inicialización y manejo de la línea de tiempo
- Lógica para abrir y cerrar el panel lateral con los detalles de Saidit
- Funcionalidad de arrastre y anclaje para el panel lateral (inspirada en Windows)
*/

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

  // ---> PEGA LA LÓGICA DE LA CONSOLA AQUÍ ADENTRO <---
  const consoleHeader = document.getElementById("console-header");
  if (consoleHeader) {
    consoleHeader.addEventListener("click", () => {
      const consoleDiv = document.getElementById("bottom-console");
      const btn = document.getElementById("toggle-console-btn");
      if (!consoleDiv || !btn) return;
      if (consoleDiv.classList.contains("collapsed")) {
        openSaiditConsole();
      } else {
        consoleDiv.classList.add("collapsed");
        btn.innerText = "Expandir ▲";
      }
    });
  }
}

// --- LÍNEA DE TIEMPO ---
let tlScale, tlHandle;
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


// --- LÓGICA DE LA CONSOLA INFERIOR (Q2) ---
function openSaiditConsole() {
  const consoleDiv = document.getElementById("bottom-console");
  const btn = document.getElementById("toggle-console-btn");
  if (!consoleDiv || !btn) return;
  if (consoleDiv.classList.contains("collapsed")) {
    consoleDiv.classList.remove("collapsed");
    btn.innerText = "Minimizar ▼";
  }
  requestAnimationFrame(() => {
    openSaiditLedger();
    if (typeof updateAll === "function") {
      updateAll();
    }
  });
}

function openSaiditLedger() {
  const saiditEvents = state.propEvents.filter(e => 
    e.ts <= state.currentTs && 
    (e.target === "system:saidit" || e.target?.includes("saidit"))
  );

  const container = d3.select("#saidit-table-container");
  container.html(""); 

  if (saiditEvents.length === 0) {
    container.html("<div class='empty-msg'>Monitoreando tráfico hacia system:saidit... No hay exfiltraciones detectadas.</div>");
  } else {
    // La tabla ahora ocupa todo el ancho, es mucho más legible
    let html = `<table class="ledger-table">
                  <tr>
                    <th style="width:15%">Fecha</th>
                    <th style="width:10%">Campaña</th>
                    <th style="width:15%">Origen (Infectado)</th>
                    <th style="width:15%">Acción</th>
                    <th style="width:45%">Contenido Interceptado</th>
                  </tr>`;
    
    saiditEvents.reverse().forEach(e => {
      const dateStr = new Date(e.ts * 1000).toLocaleString("es-ES", {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit"});
      const color = COLORS[e.campaign]?.base || "#444";
      const action = e.details?.task || e.short_name || "Post";
      const content = e.details?.content || e["details.content"] || e.details?.args?.path || "Vacío/Cifrado";
      
      html += `<tr>
                <td style="color:#888; white-space:nowrap;">${dateStr}</td>
                <td><span class="camp-tag" style="background:${color}">${e.campaign}</span></td>
                <td style="font-weight:600;">${e.source}</td>
                <td><span style="font-family:monospace;">${action}</span></td>
                <td><div class="content-box">${content}</div></td>
              </tr>`;
    });
    html += `</table>`;
    container.html(html);
  }
}

