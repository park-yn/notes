// PHYSICS WEB
// Documents and their \uses lines come from graph.json (written by build.py).
// Positions and roads come from map.json (written by the Save button in edit mode).
// Nothing in here needs editing to add a document.
//
// Keys:  E = enter/leave edit mode.  In road mode: click to add points,
//        double-click or Enter to finish, Backspace = undo point, Esc = cancel.
//        In label mode: click empty space to write a label, click a label to
//        change its text (empty text deletes it), drag a label to move it.

const FONT = "18px arial";
const MAP_KEY = "physicsweb-map";      // unsaved/just-saved map kept in this browser
const TOKEN_KEY = "physicsweb-token";  // GitHub token for the Save button

// ---------------------------------------------------------------- sizes
// Box sizes are estimated from the label so spacing can be checked before drawing.
const measure = document.createElement("canvas").getContext("2d");
measure.font = FONT;
function boxSize(label) {
  const lines = String(label).split("\n");
  const w = Math.max(...lines.map(l => measure.measureText(l).width)) + 2 * 10 + 2;
  const h = lines.length * 22 + 2 * 10;
  return { w, h };
}
const GAP = boxSize("X").h;   // minimum space between any two boxes = one node height

// ---------------------------------------------------------------- loading
function loadJSON(url) {
  return fetch(url, { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).catch(() => null);
}

Promise.all([loadJSON("graph.json"), loadJSON("map.json")]).then(([graph, published]) => {
  const empty = { savedAt: "", nodes: {}, roads: [] };
  let local = null;
  try { local = JSON.parse(localStorage.getItem(MAP_KEY)); } catch (e) {}
  published = published || empty;
  // use whichever map is newer: the published one, or one saved from this browser
  let map = local && local.savedAt > (published.savedAt || "") ? local : published;
  map = { savedAt: map.savedAt || "", nodes: { ...map.nodes }, roads: [...(map.roads || [])],
          labels: (map.labels || []).map(l => ({ ...l })) };
  start(graph, map);
});

function start(graph, map) {
  const size = {};
  graph.nodes.forEach(n => (size[n.id] = boxSize(n.label)));

  // ---------------------------------------------------------------- spacing
  const pos = {};   // current positions of placed nodes
  graph.nodes.forEach(n => { if (map.nodes[n.id]) pos[n.id] = { x: map.nodes[n.id][0], y: map.nodes[n.id][1] }; });

  function clearOf(id, p) {
    return Object.keys(pos).every(other => {
      if (other === id) return true;
      const q = pos[other], a = size[id], b = size[other];
      const gx = Math.abs(p.x - q.x) - (a.w + b.w) / 2;
      const gy = Math.abs(p.y - q.y) - (a.h + b.h) / 2;
      return gx >= GAP || gy >= GAP;
    });
  }
  // nearest spot to p where node id doesn't crowd any other node
  function nearestFree(id, p) {
    if (clearOf(id, p)) return { x: p.x, y: p.y };
    for (let r = 20; r < 5000; r += 20) {
      const steps = Math.max(8, Math.round(r / 10));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * 2 * Math.PI;
        const q = { x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) };
        if (clearOf(id, q)) return q;
      }
    }
    return { x: p.x, y: p.y };
  }

  // ---------------------------------------------------------------- placing new nodes
  // next to its \near node, else next to something it's linked to,
  // else in a column to the right of everything ("inbox") until you place it
  const linked = {};
  graph.edges.forEach(e => {
    (linked[e.to] = linked[e.to] || []).push(e.from);
    (linked[e.from] = linked[e.from] || []).push(e.to);
  });
  const unplaced = new Set(graph.nodes.filter(n => !pos[n.id]).map(n => n.id));
  let waiting = graph.nodes.filter(n => !pos[n.id]);
  while (waiting.length) {
    let progress = false;
    waiting = waiting.filter(n => {
      const anchor = [n.near, ...(linked[n.id] || [])].find(a => a && pos[a]);
      if (!anchor) return true;
      pos[n.id] = nearestFree(n.id, pos[anchor]);
      progress = true;
      return false;
    });
    if (!progress && waiting.length) {
      const n = waiting.shift();
      const ids = Object.keys(pos);
      const start = ids.length
        ? { x: Math.max(...ids.map(i => pos[i].x + size[i].w / 2)) + 3 * GAP + size[n.id].w / 2,
            y: Math.min(...ids.map(i => pos[i].y)) }
        : { x: 0, y: 0 };
      pos[n.id] = nearestFree(n.id, start);
    }
  }

  // ---------------------------------------------------------------- network
  const nodes = new vis.DataSet(graph.nodes.map(n => ({
    id: n.id,
    label: n.label,
    url: n.url,
    x: pos[n.id].x,
    y: pos[n.id].y,
    color: n.ghost ? { background: "#f0f0f0", highlight: { background: "#ffff99", border: "#2e81ff" } }
         : n.failed ? { border: "#dd3333" } : undefined,
    font: { color: n.ghost ? "#777777" : "#000000" }
  })));
  const edges = new vis.DataSet(graph.edges.map(e => ({ from: e.from, to: e.to })));

  const container = document.getElementById("network");
  const network = new vis.Network(container, { nodes, edges }, {
    interaction: { hover: true, dragNodes: false },
    nodes: {
      shape: "box",
      color: {
        background: "#cccccc",
        border: "#2e81ff",
        highlight: { background: "#ffff99", border: "#2e81ff" },
        hover: { background: "#cccccc", border: "#2e81ff" }
      },
      font: { color: "#000000", size: 18, face: "arial", vadjust: 0 },
      margin: 10
    },
    edges: {
      arrows: { to: false, middle: false, from: false },
      color: { color: "#2e81ff", highlight: "#2e81ff", hover: "#2e81ff" },
      width: 1,
      hoverWidth: 0,
      selectionWidth: 0,
      smooth: { enabled: true, type: "curvedCW", roundness: 0.2 }
    },
    physics: false
  });

  // ---------------------------------------------------------------- roads
  const ROAD_COLOR = "#b4b4b4", ROAD_WIDTH = 3;
  // region labels: small grey text, same colour as the roads
  const LABEL_COLOR = "#a0a0a0", LABEL_SIZE = 16, LABEL_FONT = `${LABEL_SIZE}px arial`;
  let editing = null;      // label whose text is being typed
  let draft = null;        // road being drawn: list of [x, y]
  let cursor = null;       // mouse position while drawing

  function trace(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
                        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
  }
  network.on("beforeDrawing", ctx => {
    ctx.save();
    ctx.strokeStyle = ROAD_COLOR;
    ctx.lineWidth = ROAD_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const road of map.roads) {
      if (road.length < 2) continue;
      ctx.beginPath(); trace(ctx, road); ctx.stroke();
    }
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = LABEL_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const l of map.labels) {
      if (l === editing) continue;
      ctx.fillText(l.text, l.x, l.y);
    }
    if (draft && draft.length) {
      const pts = cursor ? [...draft, cursor] : draft;
      if (pts.length >= 2) {
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); trace(ctx, pts); ctx.stroke();
      }
    }
    ctx.restore();
  });

  // distance from a point to a road (for the eraser)
  function distanceToRoad(p, road) {
    let best = Infinity;
    for (let i = 0; i < road.length - 1; i++) {
      const p0 = road[i - 1] || road[i], p1 = road[i], p2 = road[i + 1], p3 = road[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      for (let t = 0; t <= 1; t += 0.05) {
        const u = 1 - t;
        const x = u*u*u*p1[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*p2[0];
        const y = u*u*u*p1[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*p2[1];
        best = Math.min(best, Math.hypot(p.x - x, p.y - y));
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- edit mode
  const toolbar = document.getElementById("toolbar");
  const notice = document.getElementById("notice");
  let mode = "view";       // view | move | road | erase
  let dirty = false;

  function say(text, ms = 2500) {
    notice.textContent = text;
    notice.style.opacity = 1;
    clearTimeout(say.timer);
    if (ms) say.timer = setTimeout(() => (notice.style.opacity = 0), ms);
  }
  function setMode(m) {
    if (draft) finishRoad();
    if (editing) labelInput.blur();
    mode = m;
    toolbar.style.display = mode === "view" ? "none" : "flex";
    toolbar.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
    network.setOptions({ interaction: { dragNodes: mode === "move" } });
    container.style.cursor = mode === "road" ? "crosshair" : mode === "erase" ? "pointer"
                           : mode === "label" ? "text" : "";
    if (mode === "road") say("Click to add points · double-click or Enter to finish · Backspace undoes a point", 5000);
    if (mode === "erase") say("Click a road or a label to delete it", 3000);
    if (mode === "label") say("Click empty space to write a label · click a label to change it · drag to move", 5000);
  }
  function changed() {
    dirty = true;
    say("Unsaved changes", 0);
  }
  function finishRoad() {
    if (draft && draft.length >= 2) { map.roads.push(draft); changed(); }
    draft = null; cursor = null;
    network.redraw();
  }

  toolbar.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.mode) setMode(b.dataset.mode);
    if (b.dataset.action === "save") save();
    if (b.dataset.action === "done") setMode("view");
  });

  document.addEventListener("keydown", e => {
    if (e.target === search || e.target === labelInput) return;
    if (e.key === "e" || e.key === "E") { setMode(mode === "view" ? "move" : "view"); return; }
    if (mode !== "road" || !draft) return;
    if (e.key === "Enter") finishRoad();
    if (e.key === "Escape") { draft = null; cursor = null; network.redraw(); }
    if (e.key === "Backspace") { e.preventDefault(); draft.pop(); if (!draft.length) draft = null; network.redraw(); }
  });

  // clicks: open PDF (view), add road point (road), delete road (erase)
  network.on("click", params => {
    const p = params.pointer.canvas;
    if (mode === "view" || mode === "move") {
      if (mode === "view" && params.nodes.length) {
        const node = nodes.get(params.nodes[0]);
        if (node.url) window.open(node.url, "_blank");
      }
      return;
    }
    if (mode === "road") {
      draft = draft || [];
      const last = draft[draft.length - 1];
      if (!last || Math.hypot(last[0] - p.x, last[1] - p.y) > 4 / network.getScale()) {
        draft.push([Math.round(p.x), Math.round(p.y)]);
      }
      network.redraw();
    }
    if (mode === "erase") {
      const hit = labelAt(p);
      if (hit) { map.labels.splice(map.labels.indexOf(hit), 1); changed(); network.redraw(); return; }
      const reach = 12 / network.getScale();
      let best = -1, bestD = reach;
      map.roads.forEach((road, i) => {
        const d = distanceToRoad(p, road);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0) { map.roads.splice(best, 1); changed(); network.redraw(); }
    }
  });
  network.on("doubleClick", () => { if (mode === "road") finishRoad(); });

  container.addEventListener("mousemove", e => {
    if (mode !== "road" || !draft) return;
    const r = container.getBoundingClientRect();
    const c = network.DOMtoCanvas({ x: e.clientX - r.left, y: e.clientY - r.top });
    cursor = [c.x, c.y];
    network.redraw();
  });

  // ---------------------------------------------------------------- labels
  measure.font = LABEL_FONT;
  function labelAt(p) {
    measure.font = LABEL_FONT;
    const pad = 6 / network.getScale();
    for (let i = map.labels.length - 1; i >= 0; i--) {
      const l = map.labels[i];
      const w = measure.measureText(l.text).width;
      if (Math.abs(p.x - l.x) <= w / 2 + pad && Math.abs(p.y - l.y) <= LABEL_SIZE / 2 + pad) return l;
    }
    return null;
  }
  function canvasAt(e) {
    const r = container.getBoundingClientRect();
    return network.DOMtoCanvas({ x: e.clientX - r.left, y: e.clientY - r.top });
  }

  // typing box, placed over the label being written
  const labelInput = document.createElement("input");
  labelInput.id = "labelinput";
  labelInput.autocomplete = "off";
  labelInput.spellcheck = false;
  document.body.appendChild(labelInput);

  function startEditing(label) {
    editing = label;
    const scale = network.getScale();
    const d = network.canvasToDOM({ x: label.x, y: label.y });
    const r = container.getBoundingClientRect();
    labelInput.style.fontSize = `${LABEL_SIZE * scale}px`;
    labelInput.style.left = `${r.left + d.x}px`;
    labelInput.style.top = `${r.top + d.y}px`;
    labelInput.value = label.text;
    labelInput.style.display = "block";
    network.redraw();
    setTimeout(() => { labelInput.focus(); labelInput.select(); }, 0);
  }
  function stopEditing(keep) {
    if (!editing) return;
    const label = editing, text = labelInput.value.trim();
    editing = null;
    labelInput.style.display = "none";
    const isNew = !map.labels.includes(label);
    if (keep && text) {
      if (text !== label.text || isNew) { label.text = text; if (isNew) map.labels.push(label); changed(); }
    } else if (keep && !text && !isNew) {
      map.labels.splice(map.labels.indexOf(label), 1);
      changed();
    }
    network.redraw();
  }
  labelInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); labelInput.blur(); }
    if (e.key === "Escape") { e.preventDefault(); stopEditing(false); }
    e.stopPropagation();
  });
  labelInput.addEventListener("blur", () => stopEditing(true));

  // drag a label (move and label modes); click to write or change one (label mode)
  let press = null;
  container.addEventListener("pointerdown", e => {
    if ((mode !== "label" && mode !== "move") || editing) return;
    const p = canvasAt(e);
    const label = labelAt(p);
    if (label) network.setOptions({ interaction: { dragView: false } });
    press = { label, start: p, last: p, sx: e.clientX, sy: e.clientY, moved: false };
  }, true);
  window.addEventListener("pointermove", e => {
    if (!press) return;
    if (Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > 4) press.moved = true;
    if (!press.label || !press.moved) return;
    const p = canvasAt(e);
    press.label.x += p.x - press.last.x;
    press.label.y += p.y - press.last.y;
    press.last = p;
    network.redraw();
  });
  window.addEventListener("pointerup", () => {
    if (!press) return;
    const { label, start, moved } = press;
    press = null;
    network.setOptions({ interaction: { dragView: true } });
    if (label && moved) {
      label.x = Math.round(label.x); label.y = Math.round(label.y);
      changed();
      return;
    }
    if (mode !== "label" || moved) return;
    if (label) startEditing(label);
    else startEditing({ text: "", x: Math.round(start.x), y: Math.round(start.y) });
  });

  // dropped node: keep it at least one node-height away from every other node
  network.on("dragEnd", params => {
    if (mode !== "move" || !params.nodes.length) return;
    const now = network.getPositions(params.nodes);
    for (const id of params.nodes) {
      const p = nearestFree(id, now[id]);
      pos[id] = p;
      network.moveNode(id, p.x, p.y);
      unplaced.delete(id);
    }
    changed();
  });

  window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  // ---------------------------------------------------------------- saving
  function mapText() {
    const p = network.getPositions();
    const ids = Object.keys(p).sort();
    const lines = ids.map(id => `    ${JSON.stringify(id)}: [${Math.round(p[id].x)}, ${Math.round(p[id].y)}]`);
    const roads = map.roads.map(r => "    " + JSON.stringify(r));
    const labels = map.labels.map(l =>
      `    {"text": ${JSON.stringify(l.text)}, "x": ${Math.round(l.x)}, "y": ${Math.round(l.y)}}`);
    return "{\n" +
      `  "savedAt": ${JSON.stringify(map.savedAt)},\n` +
      `  "nodes": {\n${lines.join(",\n")}\n  },\n` +
      `  "roads": [\n${roads.join(",\n")}\n  ],\n` +
      `  "labels": [\n${labels.join(",\n")}\n  ]\n}\n`;
  }

  async function save() {
    if (draft) finishRoad();
    if (editing) labelInput.blur();
    map.savedAt = new Date().toISOString();
    const p = network.getPositions();
    map.nodes = {};
    Object.keys(p).forEach(id => (map.nodes[id] = [Math.round(p[id].x), Math.round(p[id].y)]));
    const text = mapText();
    try { localStorage.setItem(MAP_KEY, JSON.stringify(map)); } catch (e) {}

    // repo from the address: <owner>.github.io/<repo>/
    const owner = location.hostname.endsWith(".github.io") ? location.hostname.split(".")[0] : null;
    const repo = location.pathname.split("/").filter(Boolean)[0];
    let token = localStorage.getItem(TOKEN_KEY);
    if (owner && repo && !token) {
      token = prompt("To save straight to GitHub, paste your GitHub token (one time only).\n" +
                     "Cancel to copy the map instead.");
      if (token) localStorage.setItem(TOKEN_KEY, token.trim());
    }
    if (!owner || !repo || !token) {
      await navigator.clipboard.writeText(text);
      dirty = false;
      say("Map copied: paste it over everything in web/map.json", 5000);
      return;
    }

    say("Saving…", 0);
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/web/map.json`;
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
    try {
      const current = await fetch(api, { headers, cache: "no-store" });
      const sha = current.ok ? (await current.json()).sha : undefined;
      const res = await fetch(api, {
        method: "PUT", headers,
        body: JSON.stringify({
          message: "Update map",
          content: btoa(unescape(encodeURIComponent(text))),
          sha
        })
      });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(TOKEN_KEY);
        say("GitHub refused the token. Press Save again to enter a new one.", 6000);
        return;
      }
      if (!res.ok) throw new Error(res.status);
      dirty = false;
      say("Saved", 2500);
    } catch (err) {
      await navigator.clipboard.writeText(text).catch(() => {});
      say("Couldn't reach GitHub. Map copied: paste it into web/map.json", 6000);
    }
  }

  // ---------------------------------------------------------------- search
  const search = document.getElementById("search");
  const results = document.getElementById("results");
  const sorted = [...graph.nodes].sort((a, b) => a.label.localeCompare(b.label));
  let shown = [], active = 0;

  function goTo(n) {
    search.value = n.label;
    results.style.display = "none";
    network.selectNodes([n.id]);
    network.focus(n.id, { scale: 1.2, animation: { duration: 500 } });
    search.blur();
  }
  function render() {
    const q = search.value.trim().toLowerCase();
    shown = sorted.filter(n => n.label.toLowerCase().includes(q));
    active = 0;
    results.innerHTML = "";
    shown.forEach((n, i) => {
      const row = document.createElement("div");
      row.textContent = n.label;
      if (n.ghost) row.className = "unwritten";
      if (i === active) row.classList.add("active");
      row.addEventListener("mousedown", e => { e.preventDefault(); goTo(n); });
      results.appendChild(row);
    });
    results.style.display = shown.length ? "block" : "none";
  }
  search.addEventListener("focus", render);
  search.addEventListener("input", render);
  search.addEventListener("blur", () => { results.style.display = "none"; });
  search.addEventListener("keydown", e => {
    const rows = results.children;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!shown.length) return;
      rows[active].classList.remove("active");
      active = (active + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length;
      rows[active].classList.add("active");
      rows[active].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && shown.length) {
      goTo(shown[active]);
    } else if (e.key === "Escape") {
      search.blur();
    }
  });
}
