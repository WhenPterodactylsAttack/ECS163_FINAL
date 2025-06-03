// dashboard.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { sankey, sankeyLinkHorizontal } from "https://cdn.jsdelivr.net/npm/d3-sankey@0.12/+esm";

const TRAITS = ["body_mass_g", "flipper_length_mm", "bill_length_mm", "bill_depth_mm"];
const AVAILABLE_FIELDS = ["island", "species", "diet", "sex", "life_stage", "year"];

const dataUrl = "data/palmerpenguins_extended.csv";
const penguins = await d3.csv(dataUrl, d3.autoType);

function renderCheckboxes(containerId, values) {
  const container = d3.select(`#${containerId}`);
  container.html("");
  values.forEach(val => {
    const label = container.append("label");
    label.append("input")
      .attr("type", "checkbox")
      .attr("value", val)
      .property("checked", true);
    label.append("span").text(val);
  });
}

function getCheckedValues(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input[type=checkbox]:checked`)).map(d => d.value);
}

function addCheckboxListeners() {
  ["traitSelector", "sankeyDims", "speciesFilter", "sexFilter", "yearFilter"].forEach(id => {
    document.querySelectorAll(`#${id} input[type=checkbox]`).forEach(box => {
      box.addEventListener("change", () => {
        if (id === "traitSelector" || id === "groupingField") drawHeatmap();
        else drawSankey();
      });
    });
  });
  document.querySelector("#groupingField").addEventListener("change", drawHeatmap);
}

function drawHeatmap() {
  const groupBy = document.querySelector("#groupingField").value;
  const traits = getCheckedValues("traitSelector");
  if (traits.length === 0) return;

  const groups = Array.from(new Set(penguins.map(d => d[groupBy])));
  const data = [];
  traits.forEach(trait => {
    groups.forEach(group => {
      const values = penguins.filter(d => d[groupBy] === group && d[trait] != null).map(d => d[trait]);
      data.push({ group, trait, value: d3.mean(values) });
    });
  });

  const colorScales = {};
  traits.forEach(trait => {
    const values = data.filter(d => d.trait === trait).map(d => d.value);
    colorScales[trait] = d3.scaleSequential(d3.interpolateYlGnBu).domain(d3.extent(values));
  });

  const margin = { top: 30, right: 30, bottom: 100, left: 100 };
  const width = traits.length * 100 + margin.left + margin.right;
  const height = groups.length * 50 + margin.top + margin.bottom;

  d3.select("#heatmap").html("");
  const svg = d3.select("#heatmap").append("svg").attr("width", width).attr("height", height);
  const x = d3.scaleBand().domain(traits).range([margin.left, width - margin.right]).padding(0.1);
  const y = d3.scaleBand().domain(groups).range([margin.top, height - margin.bottom]).padding(0.1);

  svg.selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", d => x(d.trait))
    .attr("y", d => y(d.group))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("fill", d => colorScales[d.trait](d.value))
    .append("title")
    .text(d => `${d.group}, ${d.trait}: ${d.value.toFixed(1)}`);

  svg.selectAll("text")
    .data(data)
    .join("text")
    .attr("x", d => x(d.trait) + x.bandwidth() / 2)
    .attr("y", d => y(d.group) + y.bandwidth() / 2)
    .attr("text-anchor", "middle")
    .attr("alignment-baseline", "middle")
    .attr("font-size", "10px")
    .attr("fill", "red")
    .text(d => d.value.toFixed(1));

  svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x));
  svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y));
}

function drawSankey() {
  const dims = getCheckedValues("sankeyDims");
  if (dims.length < 2 || dims.length > 3) {
    d3.select("#sankey").html("<p style='color:red;'>Please select 2 or 3 dimensions for the Sankey diagram.</p>");
    return;
  }

  const filtered = penguins.filter(d =>
    getCheckedValues("speciesFilter").includes(d.species) &&
    getCheckedValues("sexFilter").includes(d.sex) &&
    getCheckedValues("yearFilter").includes(d.year.toString())
  );

  const links = [];
  const grouped = d3.rollup(
    filtered.filter(d => dims.every(k => d[k] != null && d[k] !== "")),
    v => v.length,
    ...dims.map(dim => d => d[dim])
  );

  if (dims.length === 2) {
    for (const [a, submap] of grouped) {
      for (const [b, value] of submap) {
        links.push({ source: a, target: b, value });
      }
    }
  } else if (dims.length === 3) {
    for (const [a, bMap] of grouped) {
      for (const [b, cMap] of bMap) {
        const midTotal = d3.sum(cMap.values());
        links.push({ source: a, target: b, value: midTotal });
        for (const [c, value] of cMap) {
          links.push({ source: b, target: c, value });
        }
      }
    }
  }

  const nodeNames = Array.from(new Set(links.flatMap(d => [d.source, d.target])));
  const nodeMap = new Map(nodeNames.map((name, i) => [name, i]));
  const sankeyData = {
    nodes: nodeNames.map(name => ({ name })),
    links: links.map(d => ({ source: nodeMap.get(d.source), target: nodeMap.get(d.target), value: d.value }))
  };

  const graph = sankey().nodeWidth(20).nodePadding(10).extent([[1, 1], [800 - 1, 500 - 1]])(sankeyData);
  d3.select("#sankey").html("");
  const svg = d3.select("#sankey").append("svg").attr("width", 800).attr("height", 500);

  svg.append("g")
    .selectAll("rect")
    .data(graph.nodes)
    .join("rect")
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("height", d => d.y1 - d.y0)
    .attr("width", d => d.x1 - d.x0)
    .attr("fill", "#69b3a2")
    .append("title")
    .text(d => `${d.name}\n${d.value} penguins`);

  svg.append("g")
    .attr("fill", "none")
    .selectAll("path")
    .data(graph.links)
    .join("path")
    .attr("d", sankeyLinkHorizontal())
    .attr("stroke", "#888")
    .attr("stroke-width", d => Math.max(1, d.width))
    .attr("opacity", 0.5)
    .append("title")
    .text(d => `${d.source.name} → ${d.target.name}\n${d.value} penguins`);

  svg.append("g")
    .selectAll("text")
    .data(graph.nodes)
    .join("text")
    .attr("x", d => d.x0 < 400 ? d.x1 + 6 : d.x0 - 6)
    .attr("y", d => (d.y0 + d.y1) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", d => d.x0 < 400 ? "start" : "end")
    .text(d => d.name);
}

renderCheckboxes("traitSelector", TRAITS);
renderCheckboxes("sankeyDims", AVAILABLE_FIELDS);
renderCheckboxes("speciesFilter", Array.from(new Set(penguins.map(d => d.species))));
renderCheckboxes("sexFilter", Array.from(new Set(penguins.map(d => d.sex))));
renderCheckboxes("yearFilter", Array.from(new Set(penguins.map(d => d.year))));

addCheckboxListeners();
drawHeatmap();
drawSankey();
