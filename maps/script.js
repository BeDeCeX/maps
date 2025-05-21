// URLs de las hojas públicas Google Sheets CSV export
const GOOGLE_SHEETS_THEATERS_CSV = "https://docs.google.com/spreadsheets/d/1aVnaXk6l7hE_qRXLFOumtm-G4kCXUtBR407EtTd_cbo/export?format=csv&gid=0";
const GOOGLE_SHEETS_TRAVELS_CSV = "https://docs.google.com/spreadsheets/d/1aVnaXk6l7hE_qRXLFOumtm-G4kCXUtBR407EtTd_cbo/export?format=csv&gid=74665963";

// URLs GeoJSON
const GEOJSON_COUNTRIES = "geojson/countries.geojson";  // Mapa mundial simplificado
const GEOJSON_SPAIN_PROVINCES = "geojson/spain_provinces.geojson"; // Provincias España

const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
  shadowSize: [41, 41],
});

const selectedIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
  iconSize: [30, 45],
  iconAnchor: [15, 45],
  popupAnchor: [1, -34],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
  shadowSize: [41, 41],
});

const simpleDotIcon = L.divIcon({
  html: '<div style="width:10px; height:10px; background:#888; border-radius:50%;"></div>',
  className: '',
  iconSize: [10, 10],
});

// Variables globales
let map;
let theaters = [];
let travels = [];
let theaterMarkers = [];
let markersGroup;
let polygonsGroup;
let travelLinesGroup;
let highlightedLayer = null;
let currentSelectedTheater = null;
let openPopup = null;

// Inicializar mapa Leaflet
function initMap() {
  map = L.map("map", {
  center: [40, -4],
  zoom: 6,
  minZoom: 3,
});


  L.tileLayer(
    "https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=1CrOh4g7qCYmpQId0YmL",
    {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }
  ).addTo(map);

  markersGroup = L.layerGroup().addTo(map);
  polygonsGroup = L.layerGroup().addTo(map);
  travelLinesGroup = L.layerGroup().addTo(map); 
}

// Cargar CSV de Google Sheets usando PapaParse
function loadCSV(url, callback) {
  Papa.parse(url, {
    download: true,
    header: true,
    complete: function (results) {
      callback(results.data);
    },
    error: function (err) {
      console.error("Error loading CSV:", err);
      alert("Error al cargar datos. Revisa la consola.");
    },
  });
}

// Cargar GeoJSON
async function loadGeoJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Error cargando GeoJSON: " + url);
  return await resp.json();
}

// Crear marcadores para los teatros
function createTheaterMarkers() {
  markersGroup.clearLayers();
  theaterMarkers = [];

  const grouped = {};
  theaters.forEach((theater) => {
    const key = theater.ciudad.trim().toLowerCase();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(theater);
  });

  Object.values(grouped).forEach((concerts) => {
    const first = concerts[0];
    const lat = parseFloat(first.latitud);
    const lng = parseFloat(first.longitud);

    if (isNaN(lat) || isNaN(lng)) return;

    const marker = L.marker([lat, lng], { icon: defaultIcon }).addTo(markersGroup);

    // Construir contenido popup con botón
    let popupContent = `<div class="popup-content">
      <strong>${first.lugar}</strong><br/>`;

    concerts.forEach((c) => {
      const agotado = c.agotado.toLowerCase() === "true";
      const porcentaje = c.porcentaje || "N/D";
      const fecha = c.fecha || "";
      const link = c.link || "";

      popupContent += `<div class="popup-concert" style="margin-bottom:8px;">
        <em>${fecha}</em><br/>`;

      if (agotado) {
        popupContent += `<span style="color:#888;">Agotado</span>`;
      } else {
        popupContent += `<button class="btn-popup-ticket" onclick="window.open('${link}', '_blank', 'noopener')">Comprar entradas</button>`;
      }

      popupContent += `<br/><small>Ocupación aprox: ${porcentaje}%</small>
      </div>`;
    });

    popupContent += `</div>`;

    marker.bindPopup(popupContent, { closeButton: false });

    marker.on("click", async () => {
      // Controlar popup abierto (cerrar si otro está abierto)
      if (openPopup) {
        if (openPopup === marker.getPopup()) {
          // Popup del mismo marker, toggle: cerrar
          marker.closePopup();
          openPopup = null;
          clearSelection();
          return;
        } else {
          openPopup.remove();
          openPopup = null;
        }
      }
      marker.openPopup();
      openPopup = marker.getPopup();

      currentSelectedTheater = first.ciudad.trim();
      updateMarkersVisuals(currentSelectedTheater);
      await highlightOriginsAndSetupTooltips(currentSelectedTheater);
    });

    theaterMarkers.push({ city: first.ciudad.trim().toLowerCase(), marker });
  });
}

// Función para cambiar el estilo de los markers según la selección
function updateMarkersVisuals(selectedCity) {
  theaterMarkers.forEach(({ city, marker }) => {
    if (city === selectedCity.toLowerCase()) {
      marker.setIcon(selectedIcon);
      marker.setZIndexOffset(1000);
    } else {
      marker.setIcon(simpleDotIcon);
      marker.setZIndexOffset(0);
    }
  });
}

// Función para borrar selección y volver a estado inicial
function clearSelection() {
  currentSelectedTheater = null;
  polygonsGroup.clearLayers();

  // Restaurar todos los markers al icono por defecto
  theaterMarkers.forEach(({ marker }) => {
    marker.setIcon(defaultIcon);
    marker.setZIndexOffset(0);
  });
}

// Nueva función para sombrear y mostrar tooltips con distancia
async function highlightOriginsAndSetupTooltips(destinationCity) {
  polygonsGroup.clearLayers();

  const filteredTravels = travels.filter(
    (t) => t.destino && t.destino.trim().toLowerCase() === destinationCity.toLowerCase()
  );

  const countriesGeo = await loadGeoJSON(GEOJSON_COUNTRIES);
  const provincesGeo = await loadGeoJSON(GEOJSON_SPAIN_PROVINCES);

  const destTheater = theaters.find(
    (t) => t.ciudad && t.ciudad.trim().toLowerCase() === destinationCity.toLowerCase()
  );
  if (!destTheater) return;
  const destCoords = [parseFloat(destTheater.latitud), parseFloat(destTheater.longitud)];

  filteredTravels.forEach((travel) => {
    const origin = travel.origen.trim().toLowerCase();

    let geoFeature = provincesGeo.features.find(
      (f) => f.properties.name.toLowerCase() === origin
    );

    let originCoords = null;
    let polygonLayer = null;

    if (geoFeature) {
      polygonLayer = L.geoJSON(geoFeature, {
        style: { color: "#d32f2f", weight: 3, fillOpacity: 0.3 },
      }).addTo(polygonsGroup);
      originCoords = getCenterOfFeature(geoFeature);
    } else {
      geoFeature = countriesGeo.features.find(
        (f) =>
          f.properties.ADMIN?.toLowerCase() === origin ||
          f.properties.name?.toLowerCase() === origin
      );
      if (geoFeature) {
        polygonLayer = L.geoJSON(geoFeature, {
          style: { color: "#d32f2f", weight: 3, fillOpacity: 0.3 },
        }).addTo(polygonsGroup);
        originCoords = getCenterOfFeature(geoFeature);
      }
    }

    if (polygonLayer && originCoords && destCoords) {
      polygonLayer.on("mouseover", (e) => {
        polygonLayer.setStyle({ fillOpacity: 0.5 });
        const distKm = (map.distance(originCoords, destCoords) / 1000).toFixed(1);
        polygonLayer.bindTooltip(`Distancia: ${distKm} km`).openTooltip(e.latlng);
      });
      polygonLayer.on("mouseout", () => {
        polygonLayer.setStyle({ fillOpacity: 0.3 });
        polygonLayer.closeTooltip();
      });
    }
  });
}

// Evento click global en mapa para limpiar selección al pinchar fuera de pins
function setupMapClickClear() {
  map.on("click", () => {
    if (openPopup) {
      openPopup.remove();
      openPopup = null;
    }
    clearSelection();
  });
}

// Sombrear polígono país o provincia y mostrar líneas trayectos
async function showTravelLines(destinationCity) {
  polygonsGroup.clearLayers();
  travelLinesGroup.clearLayers();

  const filteredTravels = travels.filter(
    (t) => t.destino && t.destino.trim().toLowerCase() === destinationCity.toLowerCase()
  );

  const countriesGeo = await loadGeoJSON(GEOJSON_COUNTRIES);
  const provincesGeo = await loadGeoJSON(GEOJSON_SPAIN_PROVINCES);

  filteredTravels.forEach((travel) => {
    const origin = travel.origen.trim().toLowerCase();
    const dest = travel.destino.trim();

    let geoFeature = provincesGeo.features.find(
      (f) => f.properties.name.toLowerCase() === origin
    );

    let originCoords = null;

    if (geoFeature) {
      const polygon = L.geoJSON(geoFeature, {
        style: { color: "#d32f2f", weight: 3, fillOpacity: 0.3 },
      }).addTo(polygonsGroup);
      originCoords = getCenterOfFeature(geoFeature);

      polygon.on("mouseover", () => polygon.setStyle({ fillOpacity: 0.5 }));
      polygon.on("mouseout", () => polygon.setStyle({ fillOpacity: 0.3 }));
    } else {
      geoFeature = countriesGeo.features.find(
        (f) =>
          f.properties.ADMIN?.toLowerCase() === origin ||
          f.properties.name?.toLowerCase() === origin
      );

      if (geoFeature) {
        const polygon = L.geoJSON(geoFeature, {
          style: { color: "#d32f2f", weight: 3, fillOpacity: 0.3 },
        }).addTo(polygonsGroup);
        originCoords = getCenterOfFeature(geoFeature);

        polygon.on("mouseover", () => polygon.setStyle({ fillOpacity: 0.5 }));
        polygon.on("mouseout", () => polygon.setStyle({ fillOpacity: 0.3 }));
      }
    }

    const destTheater = theaters.find(
      (t) => t.ciudad && t.ciudad.trim().toLowerCase() === dest.toLowerCase()
    );
    if (!destTheater) return;

    const destCoords = [parseFloat(destTheater.latitud), parseFloat(destTheater.longitud)];

    if (originCoords && destCoords) {
      const polyline = L.polyline([originCoords, destCoords], {
        color: "#d32f2f",
        weight: 2,
        opacity: 0.7,
        dashArray: "5, 10",
      }).addTo(travelLinesGroup);

      polyline.on("mouseover", (e) => {
        polyline.setStyle({ color: "#b71c1c", weight: 4, opacity: 1 });
        const distKm = (map.distance(originCoords, destCoords) / 1000).toFixed(1);
        polyline.bindTooltip(`Distancia: ${distKm} km`).openTooltip(e.latlng);
      });
      polyline.on("mouseout", () => {
        polyline.setStyle({ color: "#d32f2f", weight: 2, opacity: 0.7 });
        polyline.closeTooltip();
      });
    }
  });
}

// Función para calcular centro aproximado de feature GeoJSON
function getCenterOfFeature(feature) {
  if (feature.geometry.type === "Polygon") {
    return getPolygonCenter(feature.geometry.coordinates[0]);
  } else if (feature.geometry.type === "MultiPolygon") {
    return getPolygonCenter(feature.geometry.coordinates[0][0]);
  }
  return null;
}

// Calcular centro aproximado de un polígono (array de coordenadas [lng, lat])
function getPolygonCenter(coords) {
  let latSum = 0;
  let lngSum = 0;
  coords.forEach(([lng, lat]) => {
    latSum += lat;
    lngSum += lng;
  });
  const len = coords.length;
  return [latSum / len, lngSum / len];
}

// Cargar y mostrar teatros
function loadTheaters() {
  loadCSV(GOOGLE_SHEETS_THEATERS_CSV, (data) => {
    theaters = data.filter((d) => d.ciudad && d.latitud && d.longitud);
    createTheaterMarkers();
    fillDestinationSelect();
  });
}

// Cargar y almacenar viajes
function loadTravels() {
  loadCSV(GOOGLE_SHEETS_TRAVELS_CSV, (data) => {
    travels = data.filter((d) =>
      d.origen && d.destino && d.origen.trim() !== '' && d.destino.trim() !== ''
    );
  });
}

// Llenar select destino con ciudades de teatros
function fillDestinationSelect() {
  const selectDest = document.getElementById("select-destination");
  selectDest.innerHTML = "";
  const uniqueCities = [...new Set(theaters.map((t) => t.ciudad))];
  uniqueCities.forEach((city) => {
    const option = document.createElement("option");
    option.value = city;
    option.textContent = city;
    selectDest.appendChild(option);
  });
}

// Llenar select origen según selección país o provincia
async function fillOriginSelect(type) {
  const selectOrigin = document.getElementById("select-location");
  selectOrigin.innerHTML = "";
  const labelLocation = document.getElementById("label-location");

  if (type === "province") {
    labelLocation.style.display = "block";
    // Cargar provincias desde geojson
    const provincesGeo = await loadGeoJSON(GEOJSON_SPAIN_PROVINCES);
    const provinces = provincesGeo.features.map((f) => f.properties.name);
    provinces.sort();
    provinces.forEach((p) => {
      const option = document.createElement("option");
      option.value = p;
      option.textContent = p;
      selectOrigin.appendChild(option);
    });
  } else if (type === "country") {
    labelLocation.style.display = "block";
    // Cargar países desde geojson
    const countriesGeo = await loadGeoJSON(GEOJSON_COUNTRIES);
    // Excluir España para evitar confusión
    const countries = countriesGeo.features
      .map((f) => f.properties.ADMIN)
      .filter((c) => c && c.toLowerCase() !== "spain")
      .sort();
    countries.forEach((c) => {
      const option = document.createElement("option");
      option.value = c;
      option.textContent = c;
      selectOrigin.appendChild(option);
    });
  } else {
    labelLocation.style.display = "none";
  }
}

// Manejo modal añadir viaje
function setupModal() {
  const modal = document.getElementById("modal");
  const btnAddTravel = document.getElementById("btn-add-travel");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const selectType = document.getElementById("select-country-or-province");
  const formAddTravel = document.getElementById("form-add-travel");

  btnAddTravel.addEventListener("click", () => {
    modal.classList.remove("hidden");
  });

  btnCloseModal.addEventListener("click", () => {
    modal.classList.add("hidden");
    formAddTravel.reset();
    document.getElementById("label-location").style.display = "none";
  });

  // Cambiar opciones origen al seleccionar tipo (usando geojson)
  selectType.addEventListener("change", async (e) => {
    const val = e.target.value;
    const labelLocation = document.getElementById("label-location");
    const selectLocation = document.getElementById("select-location");
    selectLocation.innerHTML = ""; // limpiar
    labelLocation.style.display = "block";

    let geojsonPath = "";

    if (val === "province") {
      geojsonPath = "geojson/spain_provinces.geojson";
    } else if (val === "country") {
      geojsonPath = "geojson/countries.geojson";
    }

    if (!geojsonPath) return;

    try {
      const res = await fetch(geojsonPath);
      const geojson = await res.json();

      const names = geojson.features.map(f => {
        if (val === "province") return f.properties.NAME_1 || f.properties.name;
        if (val === "country") return f.properties.ADMIN || f.properties.name;
      }).filter(Boolean);

      names.sort();

      names.forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        selectLocation.appendChild(option);
      });
    } catch (err) {
      console.error("Error cargando GeoJSON", err);
      alert("No se pudo cargar la lista de lugares.");
    }
  });


  formAddTravel.addEventListener("submit", async (e) => {
  e.preventDefault();

  const selectType = document.getElementById("select-country-or-province").value; // "province" o "country"
  const origin = document.getElementById("select-location").value.trim();
  const destination = document.getElementById("select-destination").value.trim();

  if (!origin || !destination) {
    alert("Por favor, selecciona origen y destino.");
    return;
  }

  // Validaciones específicas
  const isOriginSpain = (selectType === "province") || (origin === "Spain" || origin === "España");
  const isDestinationSpain = destination.toLowerCase().includes("madrid") || destination.toLowerCase().includes("españa") || destination.toLowerCase().includes("spain"); // o ajuste según datos

  if (origin === destination && isOriginSpain) {
    alert("El origen y destino no pueden ser iguales si el origen es dentro de España.");
    return;
  }

  if (selectType === "country" && isDestinationSpain) {
    alert("Si el origen es internacional, el destino no puede ser en España.");
    return;
  }

  // Prepara datos para enviar a Google Forms (ajusta entry.xxxxx con IDs de tu form)
  const formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSftZR2YJCcpwEZ4GYHxmXqulkQ5fWW-WjU0m8f8T3u5MKUMCg/formResponse"; // PON aquí tu URL real (action del form)
  const formData = new URLSearchParams();
  
  // Aquí debes cambiar entry.xxxxx por el name exacto que Google Forms usa para cada campo (lo ves inspeccionando el formulario)
  formData.append("entry.1054581315", origin);       // Cambia entry.1234567890 por el ID del campo Origen
  formData.append("entry.467416276", destination);  // Cambia entry.0987654321 por el ID del campo Destino

  try {
    await fetch(formUrl, {
      method: "POST",
      mode: "no-cors",  // Google Forms no permite CORS, pero no importa para enviar datos
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });
    alert("Viaje añadido correctamente.");
  } catch (err) {
    alert("Error al enviar el viaje. Inténtalo de nuevo.");
    console.error(err);
  }

  formAddTravel.reset();
  modal.classList.add("hidden");
});

}

// Inicialización completa
async function init() {
  initMap();
  await loadTravels();
  await loadTheaters(); 
  setupModal();
  setupMapClickClear();
}

init();
