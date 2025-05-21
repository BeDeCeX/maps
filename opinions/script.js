// URLs de Google Sheets CSV
const GOOGLE_SHEETS_THEATERS_CSV =
  "https://docs.google.com/spreadsheets/d/1aVnaXk6l7hE_qRXLFOumtm-G4kCXUtBR407EtTd_cbo/export?format=csv&gid=0";
const GOOGLE_SHEETS_TRAVELS_CSV =
  "https://docs.google.com/spreadsheets/d/1aVnaXk6l7hE_qRXLFOumtm-G4kCXUtBR407EtTd_cbo/export?format=csv&gid=74665963";
const GOOGLE_SHEETS_OPINIONS =
  "https://docs.google.com/spreadsheets/d/1aVnaXk6l7hE_qRXLFOumtm-G4kCXUtBR407EtTd_cbo/export?format=csv&gid=1611834000";

// Entry IDs para enviar formulario
const ENTRY_IDS = {
  nombre: "entry.323503685",
  pais: "entry.1274955336",
  concierto: "entry.1787269451",
  mensaje: "entry.1944083368",
  redes: "entry.2094972450",
};

let todasLasOpiniones = [];
let mapa;
let geojsonLayer;

// Carga CSV con fetch y PapaParse
async function cargarCSV(url) {
  const res = await fetch(url);
  const text = await res.text();
  return Papa.parse(text, { header: true }).data;
}

// Inicializa Leaflet y carga mapa y opiniones
async function init() {
  // Crear mapa Leaflet
  mapa = L.map("map").setView([20, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 6,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapa);

  // Cargar opiniones
  todasLasOpiniones = await cargarCSV(GOOGLE_SHEETS_OPINIONS);

  // Filtrar opiniones válidas (no vacías)
  todasLasOpiniones = todasLasOpiniones.filter(
    (op) => op.mensaje && op.mensaje.trim() !== ""
  );

  mostrarOpiniones(todasLasOpiniones);

  // Cargar teatros para el formulario
  const teatros = await cargarCSV(GOOGLE_SHEETS_THEATERS_CSV);
  llenarConciertos(teatros);

  // Llenar países de origen únicos en el select
  llenarPaises(todasLasOpiniones);

  // Eventos UI
  document
    .getElementById("open-form-btn")
    .addEventListener("click", abrirFormulario);
  document
    .getElementById("close-form")
    .addEventListener("click", cerrarFormulario);
  document
    .getElementById("fan-form")
    .addEventListener("submit", enviarFormulario);
  document
    .getElementById("pais-origen")
    .addEventListener("change", filtrarPorPais);

  // Cerrar formulario con ESC
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cerrarFormulario();
    }
  });
}

// Muestra opiniones en el contenedor
function mostrarOpiniones(opiniones) {
  const contenedor = document.getElementById("comments-container");
  contenedor.innerHTML = "";

  if (opiniones.length === 0) {
    contenedor.innerHTML = "<p>No hay opiniones para mostrar.</p>";
    return;
  }

  opiniones.forEach((opinion, i) => {
    const postIt = document.createElement("div");
    postIt.className = "post-it";
    postIt.tabIndex = 0;
    postIt.setAttribute("role", "button");
    postIt.setAttribute("aria-pressed", "false");
    postIt.title = `Mensaje de ${opinion.nombre || "Anónimo"} desde ${opinion.pais || "desconocido"}`;

    // Mostrar resumen del mensaje (max 60 chars)
    const resumen = opinion.mensaje.length > 60 ? opinion.mensaje.slice(0, 60) + "…" : opinion.mensaje;

    postIt.textContent = resumen;

    // Al hacer click o enter mostrar detalle modal
    postIt.addEventListener("click", () => mostrarDetalle(opinion));
    postIt.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        mostrarDetalle(opinion);
      }
    });

    contenedor.appendChild(postIt);
  });
}

// Mostrar detalle completo de la opinión
function mostrarDetalle(opinion) {
  // Crear modal si no existe
  let modal = document.getElementById("postit-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "postit-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Detalle de opinión");

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.innerHTML = "×";
    closeBtn.addEventListener("click", () => modal.classList.remove("show"));
    modal.appendChild(closeBtn);

    const content = document.createElement("div");
    content.id = "modal-content";
    modal.appendChild(content);

    document.body.appendChild(modal);
  }

  const content = modal.querySelector("#modal-content");
  content.innerHTML = `
    <h3>Mensaje de ${opinion.nombre || "Anónimo"}</h3>
    <p><strong>País:</strong> ${opinion.pais || "Desconocido"}</p>
    <p><strong>Concierto:</strong> ${opinion.concierto || "No indicado"}</p>
    <p><strong>Mensaje:</strong></p>
    <p>${sanitizeHTML(opinion.mensaje)}</p>
    <p><strong>Redes sociales:</strong> ${opinion.redes || "No proporcionadas"}</p>
  `;

  modal.classList.add("show");
}

// Sanitiza texto para evitar XSS básico
function sanitizeHTML(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, "<br>");
}

// Llena select con países únicos extraídos de opiniones
function llenarPaises(opiniones) {
  const paisSelect = document.getElementById("pais-origen");
  const paisesUnicos = new Set();

  opiniones.forEach((op) => {
    if (op.pais && op.pais.trim() !== "") {
      paisesUnicos.add(op.pais.trim());
    }
  });

  // Ordenar países alfabeticamente
  Array.from(paisesUnicos)
    .sort()
    .forEach((pais) => {
      const option = document.createElement("option");
      option.value = pais;
      option.textContent = pais;
      paisSelect.appendChild(option);
    });
}

// Llena checkboxes con los conciertos (teatros)
function llenarConciertos(teatros) {
  const contenedor = document.getElementById("conciertos-checkboxes");
  contenedor.innerHTML = "";

  teatros.forEach((teatro) => {
    const id = teatro.nombre || teatro.Ciudad || teatro.nombreTeatro || teatro.Concierto || teatro.name || teatro.city || "";
    if (!id) return;

    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "concierto";
    checkbox.value = id;
    label.appendChild(checkbox);
    label.append(` ${id}`);
    contenedor.appendChild(label);
  });
}

// Abre el formulario
function abrirFormulario() {
  document.getElementById("form-overlay").classList.remove("hidden");
  document.getElementById("nombre").focus();
}

// Cierra el formulario
function cerrarFormulario() {
  document.getElementById("form-overlay").classList.add("hidden");
  document.getElementById("form-message").textContent = "";
  document.getElementById("fan-form").reset();
}

// Filtra opiniones por país y actualiza la vista
function filtrarPorPais(e) {
  const pais = e.target.value;
  if (!pais) {
    mostrarOpiniones(todasLasOpiniones);
  } else {
    const filtradas = todasLasOpiniones.filter(
      (op) => op.pais && op.pais.trim().toLowerCase() === pais.toLowerCase()
    );
    mostrarOpiniones(filtradas);
  }
}

// Envía formulario a Google Sheets via form submit (form submit)
async function enviarFormulario(e) {
  e.preventDefault();

  const form = e.target;
  const nombre = form.nombre.value.trim() || "Anónimo";
  const pais = form.pais.value.trim();
  const conciertoCheckboxes = form.querySelectorAll('input[name="concierto"]:checked');
  const mensaje = form.mensaje.value.trim();
  const redes = form.redes.value.trim();

  if (!pais) {
    mostrarMensaje("Por favor, selecciona un país de origen.");
    return;
  }
  if (conciertoCheckboxes.length === 0) {
    mostrarMensaje("Por favor, selecciona al menos un concierto.");
    return;
  }
  if (!mensaje) {
    mostrarMensaje("Por favor, escribe un mensaje.");
    return;
  }

  // Concatenar conciertos seleccionados en cadena separada por comas
  const conciertosSeleccionados = Array.from(conciertoCheckboxes)
    .map((c) => c.value)
    .join(", ");

  // Construir URL para enviar
  const url = new URL("https://docs.google.com/forms/d/e/1FAIpQLSfD_your_form_id_here/formResponse"); 
  // => Necesitas poner aquí el URL real de tu formulario de Google Forms, no la hoja de cálculo
  // Lo que tenemos es un spreadsheet export CSV, no el form submit URL.
  // Por tanto, o bien lo configuras tú y me pasas, o tendríamos que enviar con fetch a un endpoint intermedio.
  // Aquí dejaré el código listo para enviar a Google Forms, por ahora sólo la simulación.

  // Alternativa: enviar con fetch a Google Sheets vía API (requiere servidor)
  // O con fetch a un servicio backend tuyo.

  // Por ahora haré envío via POST a Google Forms (con la URL que tú tendrás que completar)
  // IMPORTANTE: Cambia el 'formURL' a la URL de envío de tu Google Form (no la de Google Sheets)

  const formURL = "https://docs.google.com/forms/d/e/YOUR_GOOGLE_FORM_ID/formResponse";

  // Crear formData para enviar
  const formData = new FormData();
  formData.append(ENTRY_IDS.nombre, nombre);
  formData.append(ENTRY_IDS.pais, pais);
  formData.append(ENTRY_IDS.concierto, conciertosSeleccionados);
  formData.append(ENTRY_IDS.mensaje, mensaje);
  formData.append(ENTRY_IDS.redes, redes);

  try {
    const response = await fetch(formURL, {
      method: "POST",
      mode: "no-cors",
      body: formData,
    });
    mostrarMensaje("Gracias por enviar tu mensaje. ¡Nos encanta leerte!");
    form.reset();
    cerrarFormulario();
    // Recargar opiniones (idealmente se actualizaría con la nueva entrada tras refrescar)
  } catch (error) {
    mostrarMensaje("Error al enviar. Inténtalo de nuevo más tarde.");
    console.error(error);
  }
}

// Mostrar mensaje de feedback en el formulario
function mostrarMensaje(msg) {
  const cont = document.getElementById("form-message");
  cont.textContent = msg;
}

document.addEventListener("DOMContentLoaded", init);
