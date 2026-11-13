// Nodes and links come from graph.json, which build.py writes from your
// documents. Nothing in here needs editing to add a document.

fetch("graph.json").then(r => r.json()).then(graph => {

  const nodes = new vis.DataSet(graph.nodes.map(n => ({
    id: n.id,
    label: n.label,
    url: n.url,
    // unwritten documents: same box, page-coloured fill, grey text
    color: n.ghost ? { background: '#f0f0f0', highlight: { background: '#ffff99', border: '#2e81ff' } }
         : n.failed ? { border: '#dd3333' } : undefined,
    font: { color: n.ghost ? '#777777' : '#000000' }
  })));

  const edges = new vis.DataSet(graph.edges.map(e => ({ from: e.from, to: e.to })));

  const container = document.getElementById("network");

  const options = {
    interaction: { hover: true },
    layout: { randomSeed: 2 },    // same layout every time the page loads
    nodes: {
      shape: 'box',
      color: {
        background: '#cccccc',
        border: '#2e81ff',
        highlight: { background: '#ffff99', border: '#2e81ff' },
        hover: { background: '#cccccc', border: '#2e81ff' }
      },
      font: { color: '#000000', size: 18, face: 'arial', vadjust: 0 },
      margin: 10
    },
    edges: {
      arrows: { to: false, middle: false, from: false },
      color: { color: '#2e81ff', highlight: '#2e81ff', hover: '#2e81ff' },
      width: 1,
      hoverWidth: 0,
      selectionWidth: 0,
      smooth: { enabled: true, type: 'curvedCW', roundness: 0.2 }
    },
    physics: {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: { gravitationalConstant: -80, springLength: 140 },
      stabilization: { iterations: 300 }
    }
  };

  const network = new vis.Network(container, { nodes, edges }, options);

  // lay out once, then freeze: nodes stay wherever you drag them
  network.once("stabilizationIterationsDone", () => network.setOptions({ physics: false }));

  // click a node to open its PDF
  network.on("click", params => {
    if (params.nodes.length) {
      const node = nodes.get(params.nodes[0]);
      if (node.url) window.open(node.url, "_blank");
    }
  });

  // SEARCH: an alphabetical index of every document; picking one flies to it
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
});
