const state = {
  baseSchools: [],
  schools: [],
  dataPayload: null,
  markers: new Map(),
  selected: null,
  filter: "main",
  query: "",
  abcFilter: { a: "", b: "", c: "" },
  pointFilter: { min: "", max: "" },
  editorUnlocked: false,
  saveMode: "server",
};

const STORAGE_KEY = "dahua-admission-map-edits-v1";
const PAYLOAD_STORAGE_KEY = "dahua-admission-map-payload-v1";
const EDIT_PASSWORD = "22068816";
const GRADE_POINTS = {
  "A++": 21,
  "A+": 18,
  A: 15,
  "B++": 12,
  "B+": 9,
  B: 6,
  C: 3,
};
const TAICHUNG_CENTER = [24.205, 120.72];
const TAICHUNG_BOUNDS = L.latLngBounds([24.02, 120.46], [24.38, 120.90]);
const CLASSROOM = {
  name: "盛田教研",
  address: "臺中市北區英才路112號",
  lat: 24.155834002493,
  lng: 120.677512027639,
};

const map = L.map("map", {
  zoomControl: true,
  preferCanvas: true,
  maxBounds: TAICHUNG_BOUNDS,
  maxBoundsViscosity: 0.75,
  minZoom: 10,
}).setView(TAICHUNG_CENTER, 11);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
}).addTo(map);

map.createPane("taichungMask");
map.getPane("taichungMask").style.zIndex = 350;
map.getPane("taichungMask").style.pointerEvents = "none";
map.createPane("taichungBoundary");
map.getPane("taichungBoundary").style.zIndex = 360;
map.getPane("taichungBoundary").style.pointerEvents = "none";

const markerLayer = L.layerGroup().addTo(map);
const classroomLayer = L.layerGroup().addTo(map);
const boundaryMaskLayer = L.layerGroup().addTo(map);
const boundaryLineLayer = L.layerGroup().addTo(map);

map.on("click", () => {
  if (!state.selected) return;
  state.selected = null;
  renderDetail(null);
  renderList(filteredSchools());
});

const els = {
  summary: document.querySelector("#summaryText"),
  updated: document.querySelector("#updatedText"),
  search: document.querySelector("#searchInput"),
  filterA: document.querySelector("#filterA"),
  filterB: document.querySelector("#filterB"),
  filterC: document.querySelector("#filterC"),
  filterError: document.querySelector("#filterError"),
  filterPointMin: document.querySelector("#filterPointMin"),
  filterPointMax: document.querySelector("#filterPointMax"),
  subjectScores: [...document.querySelectorAll(".subject-score")],
  writingScore: document.querySelector("#writingScore"),
  myAbcText: document.querySelector("#myAbcText"),
  myTotalPoints: document.querySelector("#myTotalPoints"),
  applyMyScore: document.querySelector("#applyMyScore"),
  list: document.querySelector("#schoolList"),
  mappedCount: document.querySelector("#mappedCount"),
  recordCount: document.querySelector("#recordCount"),
  avgPoint: document.querySelector("#avgPoint"),
  visibleCount: document.querySelector("#visibleCount"),
  detail: document.querySelector("#detailPanel"),
  editDialog: document.querySelector("#editDialog"),
  editForm: document.querySelector("#editForm"),
  editSchool: document.querySelector("#editSchool"),
  editAddress: document.querySelector("#editAddress"),
  editLat: document.querySelector("#editLat"),
  editLng: document.querySelector("#editLng"),
  editAccuracy: document.querySelector("#editAccuracy"),
  editDepartments: document.querySelector("#editDepartments"),
  editError: document.querySelector("#editError"),
  closeEditor: document.querySelector("#closeEditor"),
  resetEdit: document.querySelector("#resetEdit"),
  openTableEditor: document.querySelector("#openTableEditor"),
  tableEditor: document.querySelector("#tableEditor"),
  tableEditorForm: document.querySelector("#tableEditorForm"),
  closeTableEditor: document.querySelector("#closeTableEditor"),
  editableSheet: document.querySelector("#editableSheet"),
  tableEditError: document.querySelector("#tableEditError"),
  tableEditStatus: document.querySelector("#tableEditStatus"),
  addTableRow: document.querySelector("#addTableRow"),
  deleteSelectedRows: document.querySelector("#deleteSelectedRows"),
  reloadTableData: document.querySelector("#reloadTableData"),
  passwordDialog: document.querySelector("#passwordDialog"),
  passwordForm: document.querySelector("#passwordForm"),
  editPassword: document.querySelector("#editPassword"),
  passwordError: document.querySelector("#passwordError"),
  closePassword: document.querySelector("#closePassword"),
  cancelPassword: document.querySelector("#cancelPassword"),
  segments: [...document.querySelectorAll(".segment")],
};

const SHEET_COLUMNS = [
  { key: "selected", label: "" },
  { key: "school", label: "學校" },
  { key: "address", label: "地址" },
  { key: "lat", label: "緯度" },
  { key: "lng", label: "經度" },
  { key: "locationAccuracy", label: "定位" },
  { key: "department", label: "科系" },
  { key: "year", label: "年度" },
  { key: "totalPoints", label: "總積點" },
  { key: "score", label: "積分" },
  { key: "aCount", label: "A數" },
  { key: "bCount", label: "B數" },
  { key: "cCount", label: "C數" },
  { key: "chinese", label: "國文" },
  { key: "english", label: "英語" },
  { key: "math", label: "數學" },
  { key: "social", label: "社會" },
  { key: "science", label: "自然" },
  { key: "writing", label: "寫作" },
  { key: "notes", label: "備註" },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadEdits() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveEdits(edits) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
}

function loadStoredPayload() {
  try {
    const payload = JSON.parse(localStorage.getItem(PAYLOAD_STORAGE_KEY) || "null");
    return payload && Array.isArray(payload.schools) ? payload : null;
  } catch {
    return null;
  }
}

function payloadTime(payload) {
  const time = payload?.updatedAt ? Date.parse(payload.updatedAt) : 0;
  return Number.isFinite(time) ? time : 0;
}

function choosePayload(fileData, storedData) {
  if (!storedData) return fileData;
  if (payloadTime(fileData) > payloadTime(storedData)) return fileData;
  return { ...storedData, updatedAt: storedData.updatedAt || fileData.updatedAt };
}

function recalcSchool(school) {
  const records = school.departments.flatMap((dept) => dept.records || []);
  const points = records.map((record) => record.totalPoints).filter((value) => typeof value === "number");
  school.recordCount = records.length;
  school.avgTotalPoints = points.length ? Number((points.reduce((sum, value) => sum + value, 0) / points.length).toFixed(1)) : null;
  school.minTotalPoints = points.length ? Math.min(...points) : null;
  school.maxTotalPoints = points.length ? Math.max(...points) : null;
  school.departments.forEach((dept) => {
    const deptPoints = (dept.records || []).map((record) => record.totalPoints).filter((value) => typeof value === "number");
    dept.avgTotalPoints = deptPoints.length ? Number((deptPoints.reduce((sum, value) => sum + value, 0) / deptPoints.length).toFixed(1)) : null;
    dept.minTotalPoints = deptPoints.length ? Math.min(...deptPoints) : null;
    dept.maxTotalPoints = deptPoints.length ? Math.max(...deptPoints) : null;
  });
}

function applyStoredEdits() {
  const edits = loadEdits();
  state.schools = clone(state.baseSchools).map((school) => {
    const edited = edits[school.school];
    if (!edited) return school;
    const next = { ...school, ...edited };
    recalcSchool(next);
    return next;
  });
}

function scoreClass(value) {
  if (value >= 85) return "high";
  if (value >= 60) return "mid";
  return "low";
}

function fmt(value) {
  return value === null || value === undefined ? "-" : value;
}

function formatUpdatedAt(value) {
  if (!value) return "未記錄";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function renderDataMeta() {
  if (!state.dataPayload?.summary) return;
  els.summary.textContent = `${state.dataPayload.summary.schools} 所學校，${state.dataPayload.summary.mapped} 所可上地圖`;
  els.updated.textContent = `上次更新：${formatUpdatedAt(state.dataPayload.updatedAt)}`;
}

function calculateMyScore() {
  const grades = els.subjectScores.map((select) => select.value);
  const writing = els.writingScore.value;
  if (grades.some((grade) => !grade) || writing === "") return null;

  const counts = grades.reduce((acc, grade) => {
    if (grade.startsWith("A")) acc.a += 1;
    else if (grade.startsWith("B")) acc.b += 1;
    else acc.c += 1;
    return acc;
  }, { a: 0, b: 0, c: 0 });
  const totalPoints = grades.reduce((sum, grade) => sum + GRADE_POINTS[grade], 0) + Number(writing);
  return { ...counts, totalPoints };
}

function renderMyScore() {
  const score = calculateMyScore();
  if (!score) {
    els.myAbcText.textContent = "-";
    els.myTotalPoints.textContent = "-";
    els.applyMyScore.disabled = true;
    return;
  }
  els.myAbcText.textContent = `${score.a}/${score.b}/${score.c}`;
  els.myTotalPoints.textContent = score.totalPoints;
  els.applyMyScore.disabled = false;
}

function applyMyScoreToFilters() {
  const score = calculateMyScore();
  if (!score) return;
  els.filterA.value = String(score.a);
  els.filterB.value = String(score.b);
  els.filterC.value = String(score.c);
  els.filterPointMin.value = "";
  els.filterPointMax.value = String(score.totalPoints);
  state.abcFilter = { a: String(score.a), b: String(score.b), c: String(score.c) };
  state.pointFilter = { min: "", max: String(score.totalPoints) };
  updateFilterError();
  state.selected = null;
  renderDetail(null);
  render();
}

function normalizeSearch(value) {
  return value
    .toLowerCase()
    .replaceAll("台", "臺")
    .replace(/\s+/g, "");
}

function schoolAliases(schoolName) {
  const aliases = [];
  if (schoolName.includes("臺中第一")) aliases.push("一中", "臺中一中", "中一中");
  if (schoolName.includes("臺中女子")) aliases.push("女中", "臺中女中", "中女中");
  if (schoolName.includes("臺中第二")) aliases.push("二中", "臺中二中", "中二中");
  if (schoolName.includes("臺中工業")) aliases.push("臺中高工", "中工");
  if (schoolName.includes("臺中家事商業")) aliases.push("家商", "臺中家商");
  if (schoolName.includes("豐原商業")) aliases.push("豐商");
  if (schoolName.includes("大甲工業")) aliases.push("大甲高工");
  if (schoolName.includes("沙鹿工業")) aliases.push("沙工");
  return aliases;
}

function schoolMatches(school) {
  const query = normalizeSearch(state.query.trim());
  const filterOk = state.filter === "all" || school.sourceGroup === state.filter;
  const scoreOk = schoolMatchesScoreFilters(school);
  if (!filterOk || !scoreOk) return false;
  if (!query) return true;
  const haystack = [
    school.school,
    ...schoolAliases(school.school),
    school.address,
    ...school.departments.map((dept) => dept.name),
  ].join(" ");
  const normalizedHaystack = normalizeSearch(haystack);
  const compactSchoolName = normalizeSearch(school.school.replace(/國立|私立|市立|臺中市立|高級中等學校|高級中學|職業學校/g, ""));
  return normalizedHaystack.includes(query) || compactSchoolName.includes(query);
}

function abcFilterIsComplete() {
  const { a, b, c } = state.abcFilter;
  return a !== "" && b !== "" && c !== "";
}

function abcFilterIsValid() {
  const { a, b, c } = state.abcFilter;
  if (!abcFilterIsComplete()) return true;
  return Number(a) + Number(b) + Number(c) === 5;
}

function recordMatchesScoreFilters(record) {
  const { a, b, c } = state.abcFilter;
  const { min, max } = state.pointFilter;
  if (a !== "" && Number(record.aCount) !== Number(a)) return false;
  if (b !== "" && Number(record.bCount) !== Number(b)) return false;
  if (c !== "" && Number(record.cCount) !== Number(c)) return false;
  if (min !== "" && Number(record.totalPoints) < Number(min)) return false;
  if (max !== "" && Number(record.totalPoints) > Number(max)) return false;
  return true;
}

function schoolMatchesScoreFilters(school) {
  const { a, b, c } = state.abcFilter;
  const { min, max } = state.pointFilter;
  if (a === "" && b === "" && c === "" && min === "" && max === "") return true;
  if (!abcFilterIsValid()) return false;
  if (!pointFilterIsValid()) return false;
  return school.departments.some((dept) =>
    (dept.records || []).some((record) => recordMatchesScoreFilters(record))
  );
}

function markerHtml(school) {
  const value = Math.round(school.avgTotalPoints || 0);
  const accuracy = school.locationAccuracy === "approximate" ? " approximate" : "";
  return `<div class="marker ${scoreClass(value)}${accuracy}">${value}</div>`;
}

function createMarker(school) {
  const icon = L.divIcon({
    html: markerHtml(school),
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  const marker = L.marker([school.lat, school.lng], { icon });
  marker.on("click", (event) => {
    if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
    selectSchool(school.school);
  });
  marker.bindTooltip(school.school, { direction: "top", offset: [0, -12] });
  return marker;
}

function renderClassroomMarker() {
  classroomLayer.clearLayers();
  const icon = L.divIcon({
    html: `<div class="classroom-marker">盛</div>`,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
  L.marker([CLASSROOM.lat, CLASSROOM.lng], { icon })
    .addTo(classroomLayer)
    .bindTooltip(`<strong>${CLASSROOM.name}</strong><br>${CLASSROOM.address}`, {
      direction: "top",
      offset: [0, -14],
    });
}

function geometryPolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function ringToLatLngs(ring) {
  return ring.map(([lng, lat]) => [lat, lng]);
}

function renderTaichungBoundary(feature) {
  boundaryMaskLayer.clearLayers();
  boundaryLineLayer.clearLayers();

  const world = [
    [-90, -360],
    [-90, 360],
    [90, 360],
    [90, -360],
  ];
  const holes = geometryPolygons(feature.geometry)
    .map((polygon) => polygon[0])
    .filter(Boolean)
    .map(ringToLatLngs);

  if (holes.length) {
    L.polygon([world, ...holes], {
      pane: "taichungMask",
      stroke: false,
      fillColor: "#8b9188",
      fillOpacity: 0.78,
      fillRule: "evenodd",
      interactive: false,
    }).addTo(boundaryMaskLayer);
  }

  L.geoJSON(feature, {
    pane: "taichungBoundary",
    interactive: false,
    style: {
      color: "#dda129",
      weight: 2.4,
      opacity: 0.95,
      fillOpacity: 0,
    },
  }).addTo(boundaryLineLayer);
}

function renderMarkers(schools, shouldFit = false) {
  markerLayer.clearLayers();
  state.markers.clear();
  const bounds = [];
  schools.forEach((school) => {
    if (school.lat === null || school.lng === null) return;
    const marker = createMarker(school);
    marker.addTo(markerLayer);
    state.markers.set(school.school, marker);
    bounds.push([school.lat, school.lng]);
  });
  if (shouldFit && bounds.length) {
    map.fitBounds(TAICHUNG_BOUNDS, { padding: [18, 18], maxZoom: 11 });
  }
}

function renderList(schools) {
  els.list.innerHTML = "";
  const fragment = document.createDocumentFragment();
  schools.forEach((school) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `school-row${state.selected === school.school ? " active" : ""}`;
    button.innerHTML = `
      <strong>${school.school}</strong>
      <div class="row-meta">
        <span class="badge">${school.departments.length} 科系</span>
        <span class="badge">平均 ${fmt(school.avgTotalPoints)}</span>
        <span class="badge ${school.locationAccuracy}">${school.locationAccuracy === "exact" ? "精確" : school.locationAccuracy === "approximate" ? "近似" : "未定位"}</span>
      </div>
    `;
    button.addEventListener("click", () => selectSchool(school.school));
    fragment.appendChild(button);
  });
  els.list.appendChild(fragment);
}

function renderMetrics(schools) {
  const mapped = schools.filter((school) => school.lat !== null && school.lng !== null).length;
  const records = schools.reduce((sum, school) => sum + school.recordCount, 0);
  const points = schools.map((school) => school.avgTotalPoints).filter((value) => typeof value === "number");
  const avg = points.length ? (points.reduce((sum, value) => sum + value, 0) / points.length).toFixed(1) : "-";
  els.mappedCount.textContent = mapped;
  els.recordCount.textContent = records;
  els.avgPoint.textContent = avg;
  els.visibleCount.textContent = `${schools.length} 所`;
}

function recordRows(records) {
  const points = records.map((record) => record.totalPoints).filter((value) => typeof value === "number");
  const maxPoint = points.length ? Math.max(...points) : null;
  const minPoint = points.length ? Math.min(...points) : null;
  const hasLargeGap = maxPoint !== null && minPoint !== null && maxPoint - minPoint >= 15;
  return records
    .map((record) => {
      const subjects = Object.values(record.subjects).join(" / ");
      const noteText = [record.notes, record.special, record.reason].filter(Boolean).join(" ");
      const isSpecial = /原住民|低收|低收入|中低|弱勢|技藝|身障|身心障礙|特殊/.test(noteText);
      const isLargeGap = hasLargeGap && typeof record.totalPoints === "number" && maxPoint - record.totalPoints >= 15;
      const marks = `${isSpecial ? "★ " : ""}${isLargeGap ? "△ " : ""}`;
      const title = [
        isSpecial ? noteText : "",
        isLargeGap ? `同科系積點落差較大：最高 ${maxPoint}，此筆 ${record.totalPoints}` : "",
      ].filter(Boolean).join("；");
      const year = `${marks}${record.year}`;
      return `
        <tr class="${[isSpecial ? "special-record" : "", isLargeGap ? "gap-record" : ""].filter(Boolean).join(" ")}" title="${title}">
          <td>${year}</td>
          <td>${fmt(record.totalPoints)}</td>
          <td>${record.aCount}/${record.bCount}/${record.cCount}</td>
          <td>${subjects}</td>
          <td>${record.writing}</td>
        </tr>
      `;
    })
    .join("");
}

function renderDetail(school) {
  if (!school) {
    els.detail.className = "detail-panel empty";
    els.detail.innerHTML = `
      <div class="detail-placeholder">
        <strong>點選地圖上的學校</strong>
        <span>查看科系、平均積點、最低錄取與歷年成績。</span>
      </div>
    `;
    return;
  }

  els.detail.className = "detail-panel";
  const accuracyLabel = school.locationAccuracy === "exact" ? "精確定位" : school.locationAccuracy === "approximate" ? "行政區近似定位" : "未定位";
  els.detail.innerHTML = `
    <div class="detail-head">
      <div class="detail-title-row">
        <h2>${school.school}</h2>
        <button class="detail-close" type="button" aria-label="關閉學校資訊">×</button>
      </div>
      <div class="address">${school.address || "未提供地址"}</div>
      <div class="score-line">
        <span class="badge">平均 ${fmt(school.avgTotalPoints)}</span>
        <span class="badge">最低 ${fmt(school.minTotalPoints)}</span>
        <span class="badge">最高 ${fmt(school.maxTotalPoints)}</span>
        <span class="badge ${school.locationAccuracy}">${accuracyLabel}</span>
      </div>
    </div>
    ${school.departments
      .map(
        (dept) => `
          <section class="dept">
            <div class="dept-title">
              <strong>${dept.name}</strong>
              <span>平均 ${fmt(dept.avgTotalPoints)} / 最低 ${fmt(dept.minTotalPoints)}</span>
            </div>
            <table class="record-table">
              <thead>
                <tr><th>年</th><th>積點</th><th>A/B/C</th><th>五科</th><th>寫作</th></tr>
              </thead>
              <tbody>${recordRows(dept.records)}</tbody>
            </table>
          </section>
        `,
      )
      .join("")}
  `;
  els.detail.querySelector(".detail-close")?.addEventListener("click", () => {
    state.selected = null;
    renderDetail(null);
    renderList(filteredSchools());
  });
}

function selectSchool(name) {
  const school = state.schools.find((item) => item.school === name);
  if (!school) return;
  state.selected = name;
  const marker = state.markers.get(name);
  if (marker) marker.openTooltip();
  renderDetail(school);
  renderList(filteredSchools());
}

function filteredSchools() {
  return state.schools.filter(schoolMatches);
}

function render(options = {}) {
  const schools = filteredSchools();
  renderMarkers(schools, options.fitMap === true);
  renderList(schools);
  renderMetrics(schools);
}

function flattenSchools(schools) {
  return schools.flatMap((school) =>
    school.departments.flatMap((dept) =>
      dept.records.map((record) => ({
        school: school.school,
        address: school.address || "",
        lat: school.lat ?? "",
        lng: school.lng ?? "",
        locationAccuracy: school.locationAccuracy || "missing",
        department: dept.name,
        year: record.year,
        totalPoints: record.totalPoints ?? "",
        score: record.score ?? "",
        aCount: record.aCount ?? "",
        bCount: record.bCount ?? "",
        cCount: record.cCount ?? "",
        chinese: record.subjects?.國文 || "",
        english: record.subjects?.英語 || "",
        math: record.subjects?.數學 || "",
        social: record.subjects?.社會 || "",
        science: record.subjects?.自然 || "",
        writing: record.writing || "",
        notes: record.notes || "",
      })),
    ),
  );
}

function buildEditableSheet() {
  const rows = flattenSchools(state.schools);
  const thead = els.editableSheet.querySelector("thead");
  const tbody = els.editableSheet.querySelector("tbody");
  thead.innerHTML = `<tr>${SHEET_COLUMNS.map((col) => `<th>${col.label}</th>`).join("")}</tr>`;
  tbody.innerHTML = "";
  const fragment = document.createDocumentFragment();
  rows.forEach((row) => fragment.appendChild(createSheetRow(row)));
  tbody.appendChild(fragment);
  els.tableEditStatus.textContent = `${rows.length} 列，可直接編輯儲存格`;
}

function createSheetRow(row = {}) {
  const tr = document.createElement("tr");
  SHEET_COLUMNS.forEach((col) => {
    const td = document.createElement("td");
    td.dataset.key = col.key;
    if (col.key === "selected") {
      td.innerHTML = `<input type="checkbox" aria-label="選取列" />`;
    } else {
      td.contentEditable = "true";
      td.textContent = row[col.key] ?? "";
    }
    tr.appendChild(td);
  });
  return tr;
}

function cellValue(row, key) {
  return row.querySelector(`[data-key="${key}"]`)?.textContent.trim() || "";
}

function toNumberOrNull(value) {
  if (value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function schoolsFromSheet() {
  const rows = [...els.editableSheet.querySelectorAll("tbody tr")].map((tr) => ({
    school: cellValue(tr, "school"),
    address: cellValue(tr, "address"),
    lat: toNumberOrNull(cellValue(tr, "lat")),
    lng: toNumberOrNull(cellValue(tr, "lng")),
    locationAccuracy: cellValue(tr, "locationAccuracy") || "missing",
    department: cellValue(tr, "department"),
    year: cellValue(tr, "year"),
    totalPoints: toNumberOrNull(cellValue(tr, "totalPoints")),
    score: toNumberOrNull(cellValue(tr, "score")),
    aCount: Number(cellValue(tr, "aCount") || 0),
    bCount: Number(cellValue(tr, "bCount") || 0),
    cCount: Number(cellValue(tr, "cCount") || 0),
    chinese: cellValue(tr, "chinese"),
    english: cellValue(tr, "english"),
    math: cellValue(tr, "math"),
    social: cellValue(tr, "social"),
    science: cellValue(tr, "science"),
    writing: cellValue(tr, "writing"),
    notes: cellValue(tr, "notes"),
  })).filter((row) => row.school && row.department);

  const schoolMap = new Map();
  rows.forEach((row) => {
    const schoolKey = row.school;
    if (!schoolMap.has(schoolKey)) {
      schoolMap.set(schoolKey, {
        school: row.school,
        address: row.address,
        sourceGroup: "main",
        lat: row.lat,
        lng: row.lng,
        locationAccuracy: row.locationAccuracy,
        departments: [],
      });
    }
    const school = schoolMap.get(schoolKey);
    school.address = row.address || school.address;
    school.lat = row.lat;
    school.lng = row.lng;
    school.locationAccuracy = row.locationAccuracy;
    let dept = school.departments.find((item) => item.name === row.department);
    if (!dept) {
      dept = { name: row.department, records: [] };
      school.departments.push(dept);
    }
    dept.records.push({
      year: row.year,
      category: "高中職",
      school: row.school,
      address: row.address,
      department: row.department,
      subjects: {
        國文: row.chinese,
        英語: row.english,
        數學: row.math,
        社會: row.social,
        自然: row.science,
      },
      aCount: row.aCount,
      bCount: row.bCount,
      cCount: row.cCount,
      writing: row.writing,
      score: row.score,
      totalPoints: row.totalPoints,
      notes: row.notes,
      sourceGroup: "main",
    });
  });

  return [...schoolMap.values()].map((school) => {
    recalcSchool(school);
    school.departments.sort((a, b) => (b.avgTotalPoints || -1) - (a.avgTotalPoints || -1));
    return school;
  }).sort((a, b) => (b.avgTotalPoints || -1) - (a.avgTotalPoints || -1));
}

async function persistPayload(schools) {
  const mapped = schools.filter((school) => school.lat !== null && school.lng !== null).length;
  const records = schools.reduce((sum, school) => sum + school.recordCount, 0);
  const payload = {
    generatedFrom: state.dataPayload?.generatedFrom || "browser editor",
    updatedAt: new Date().toISOString(),
    summary: { schools: schools.length, mapped, unmapped: schools.length - mapped, records },
    schools,
  };
  let savedToServer = false;
  try {
    const response = await fetch("/api/schools", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edit-password": EDIT_PASSWORD,
      },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      savedToServer = true;
    } else if (response.status !== 404 && response.status !== 405) {
      const text = await response.text();
      throw new Error(text || "儲存失敗");
    }
  } catch (error) {
    if (!location.hostname.endsWith("github.io") && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      throw error;
    }
  }
  state.dataPayload = payload;
  state.baseSchools = schools;
  state.schools = clone(schools);
  localStorage.removeItem(STORAGE_KEY);
  if (savedToServer) {
    localStorage.removeItem(PAYLOAD_STORAGE_KEY);
    state.saveMode = "server";
  } else {
    localStorage.setItem(PAYLOAD_STORAGE_KEY, JSON.stringify(payload));
    state.saveMode = "browser";
  }
}

function showTableEditor() {
  els.tableEditError.textContent = "";
  buildEditableSheet();
  els.tableEditor.showModal();
}

function requestTableEditorUnlock() {
  if (state.editorUnlocked) {
    showTableEditor();
    return;
  }
  els.passwordError.textContent = "";
  els.editPassword.value = "";
  els.passwordDialog.showModal();
  requestAnimationFrame(() => els.editPassword.focus());
}

function unlockTableEditor(event) {
  event.preventDefault();
  if (els.editPassword.value !== EDIT_PASSWORD) {
    els.passwordError.textContent = "密碼錯誤";
    els.editPassword.select();
    return;
  }
  state.editorUnlocked = true;
  els.passwordDialog.close();
  showTableEditor();
}

async function saveTableEditor() {
  try {
    const schools = schoolsFromSheet();
    await persistPayload(schools);
    renderDataMeta();
    els.tableEditStatus.textContent = state.saveMode === "server" ? "已儲存到網站資料" : "已儲存在此瀏覽器";
    els.tableEditor.close();
    state.selected = null;
    renderDetail(null);
    render();
  } catch (error) {
    els.tableEditError.textContent = error.message;
  }
}

function openEditor(name) {
  const school = state.schools.find((item) => item.school === name);
  if (!school) return;
  els.editError.textContent = "";
  els.editSchool.value = school.school;
  els.editAddress.value = school.address || "";
  els.editLat.value = school.lat ?? "";
  els.editLng.value = school.lng ?? "";
  els.editAccuracy.value = school.locationAccuracy || "missing";
  els.editDepartments.value = JSON.stringify(school.departments, null, 2);
  els.editDialog.showModal();
}

function saveCurrentEdit() {
  const originalName = state.selected;
  const current = state.schools.find((item) => item.school === originalName);
  if (!current) return;

  let departments;
  try {
    departments = JSON.parse(els.editDepartments.value);
    if (!Array.isArray(departments)) throw new Error("科系資料必須是陣列");
  } catch (error) {
    els.editError.textContent = `科系與成績資料格式錯誤：${error.message}`;
    return;
  }

  const lat = els.editLat.value.trim() === "" ? null : Number(els.editLat.value);
  const lng = els.editLng.value.trim() === "" ? null : Number(els.editLng.value);
  if ((lat !== null && Number.isNaN(lat)) || (lng !== null && Number.isNaN(lng))) {
    els.editError.textContent = "緯度與經度必須是數字，或留空。";
    return;
  }

  const edits = loadEdits();
  const updated = {
    school: els.editSchool.value.trim() || current.school,
    address: els.editAddress.value.trim(),
    lat,
    lng,
    locationAccuracy: els.editAccuracy.value,
    departments,
  };

  delete edits[originalName];
  edits[updated.school] = updated;
  saveEdits(edits);
  applyStoredEdits();
  state.selected = updated.school;
  els.editDialog.close();
  renderDetail(state.schools.find((item) => item.school === updated.school));
  render({ fitMap: true });
}

function resetCurrentEdit() {
  const name = state.selected;
  if (!name) return;
  const edits = loadEdits();
  delete edits[name];
  saveEdits(edits);
  applyStoredEdits();
  els.editDialog.close();
  state.selected = name;
  const restored = state.schools.find((item) => item.school === name) || state.schools.find((item) => item.school === els.editSchool.value);
  if (restored) {
    state.selected = restored.school;
    renderDetail(restored);
  }
  render();
}

async function init() {
  const [response, boundaryResponse] = await Promise.all([
    fetch("./data/schools.json"),
    fetch("./data/taichung-boundary.json"),
  ]);
  const fileData = await response.json();
  const storedData = loadStoredPayload();
  const data = choosePayload(fileData, storedData);
  const boundary = await boundaryResponse.json();
  state.dataPayload = data;
  state.baseSchools = data.schools;
  applyStoredEdits();
  renderDataMeta();
  renderTaichungBoundary(boundary);
  renderClassroomMarker();
  render();
}

function handleSearchChange(event) {
  state.query = event.target.value;
  render();
}

els.search.addEventListener("input", handleSearchChange);
els.search.addEventListener("search", handleSearchChange);

els.subjectScores.forEach((select) => {
  select.addEventListener("change", renderMyScore);
});
els.writingScore.addEventListener("change", renderMyScore);
els.applyMyScore.addEventListener("click", applyMyScoreToFilters);

function handleAbcFilterChange() {
  state.abcFilter = {
    a: els.filterA.value,
    b: els.filterB.value,
    c: els.filterC.value,
  };
  updateFilterError();
  state.selected = null;
  renderDetail(null);
  render();
}

function handlePointFilterChange() {
  state.pointFilter = {
    min: els.filterPointMin.value.trim(),
    max: els.filterPointMax.value.trim(),
  };
  updateFilterError();
  state.selected = null;
  renderDetail(null);
  render();
}

function pointFilterIsValid() {
  const { min, max } = state.pointFilter;
  return min === "" || max === "" || Number(min) <= Number(max);
}

function updateFilterError() {
  if (!abcFilterIsValid()) {
    els.filterError.textContent = "A/B/C 三項都選擇時，加總必須等於 5。";
    return;
  }
  if (!pointFilterIsValid()) {
    els.filterError.textContent = "最低積點不可大於最高積點。";
    return;
  }
  els.filterError.textContent = "";
}

els.filterA.addEventListener("change", handleAbcFilterChange);
els.filterB.addEventListener("change", handleAbcFilterChange);
els.filterC.addEventListener("change", handleAbcFilterChange);
els.filterPointMin.addEventListener("input", handlePointFilterChange);
els.filterPointMax.addEventListener("input", handlePointFilterChange);

els.segments.forEach((button) => {
  button.addEventListener("click", () => {
    if (!button.dataset.filter) return;
    els.segments.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    render();
  });
});

els.openTableEditor.addEventListener("click", requestTableEditorUnlock);

els.passwordForm.addEventListener("submit", unlockTableEditor);

els.closePassword.addEventListener("click", () => {
  els.passwordDialog.close();
});

els.cancelPassword.addEventListener("click", () => {
  els.passwordDialog.close();
});

els.closeTableEditor.addEventListener("click", () => {
  els.tableEditor.close();
});

els.addTableRow.addEventListener("click", () => {
  els.editableSheet.querySelector("tbody").appendChild(createSheetRow({ locationAccuracy: "approximate" }));
});

els.deleteSelectedRows.addEventListener("click", () => {
  els.editableSheet.querySelectorAll('tbody input[type="checkbox"]:checked').forEach((input) => input.closest("tr")?.remove());
});

els.reloadTableData.addEventListener("click", buildEditableSheet);

els.tableEditorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveTableEditor();
});

els.editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveCurrentEdit();
});

els.closeEditor.addEventListener("click", () => {
  els.editDialog.close();
});

els.resetEdit.addEventListener("click", resetCurrentEdit);

init().catch((error) => {
  els.summary.textContent = "資料讀取失敗";
  els.detail.innerHTML = `<div class="detail-placeholder"><strong>無法載入資料</strong><span>${error.message}</span></div>`;
});
