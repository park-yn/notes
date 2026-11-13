// Nodes and links come from graph.json, which build.py writes from your
// documents. Nothing in here needs editing to add a document.

fetch("graph.json").then(r => r.json()).then(graph => {

  const nodes = new vis.DataSet(graph.nodes.map(n => ({
    id: n.id,
    label: n.label,
    url: n.url,
    // unwritten documents (named in \uses but not yet written): dashed, faint
    shapeProperties: { borderDashes: n.ghost ? [5, 5] : false },
    font: { color: n.ghost ? '#999999' : '#000000' },
    color: n.ghost ? { background: '#f0f0f0', border: '#999999',
                       highlight: { background: '#f0f0f0', border: '#999999' } }
         : n.failed ? { border: '#d33' } : undefined,
    opacity: n.status === 'draft' ? 0.6 : 1
  })));

  // arrow points from the prerequisite to the document that uses it
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
        highlight: { background: '#ffff99', border: '#2e81ff' }
      },
      font: { color: '#000000', size: 18, face: 'arial', vadjust: 0 },
      margin: 10
    },
    edges: {
      arrows: { middle: { enabled: true, scaleFactor: 0.9 } },
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

  // search: an index of every document; picking one flies to it
  const index = document.getElementById("index");
  graph.nodes
    .map(n => n.label)
    .sort((a, b) => a.localeCompare(b))
    .forEach(label => {
      const option = document.createElement("option");
      option.value = label;
      index.appendChild(option);
    });

  const search = document.getElementById("search");
  function find() {
    const q = search.value.trim().toLowerCase();
    if (!q) return;
    const n = graph.nodes.find(n => n.label.toLowerCase() === q)
           || graph.nodes.find(n => n.label.toLowerCase().includes(q));
    if (!n) return;
    network.selectNodes([n.id]);
    network.focus(n.id, { scale: 1.2, animation: { duration: 500 } });
  }
  search.addEventListener("change", find);
  search.addEventListener("keydown", e => { if (e.key === "Enter") find(); });
});
