// dashboard.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { sankey, sankeyLinkHorizontal } from "https://cdn.jsdelivr.net/npm/d3-sankey@0.12/+esm";


const TRAITS = ["body_mass_g", "flipper_length_mm", "bill_length_mm", "bill_depth_mm"];
const AVAILABLE_FIELDS = ["island", "species", "diet", "sex", "life_stage", "year"];

const dataUrl = "data/palmerpenguins_extended.csv";
const penguins = await d3.csv(dataUrl, d3.autoType);

function renderCheckboxes(containerId, values, unchecked = []) {
  const container = d3.select(`#${containerId}`);
  container.html("");
  values.forEach(val => {
    const label = container.append("label");
    label.append("input")
      .attr("type", "checkbox")
      .attr("value", val)
      .property("checked", !unchecked.includes(val));
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

function drawScatter() {
  const traits = TRAITS;
  const size = 150;
  const padding = 20;

  const width = size * traits.length + padding * 2;
  const height = size * traits.length + padding * 2;

  const svg = d3.select("#scatter")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Scales for each trait
  const scales = {};
  traits.forEach(trait => {
    const values = penguins.map(d => d[trait]).filter(v => v != null);
    scales[trait] = d3.scaleLinear().domain(d3.extent(values)).nice().range([padding, size - padding]);
  });

  // Nest penguin data by species for color
  const speciesList = Array.from(new Set(penguins.map(d => d.species)));
  const color = d3.scaleOrdinal(d3.schemeCategory10).domain(speciesList);

  // Draw each cell
  traits.forEach((yTrait, row) => {
    traits.forEach((xTrait, col) => {
      const cell = svg.append("g")
        .attr("transform", `translate(${col * size + padding},${row * size + padding})`);

      if (xTrait === yTrait) {
        // Diagonal cell label
        cell.append("text")
          .attr("x", size / 2 - padding)
          .attr("y", size / 2 - padding)
          .attr("text-anchor", "right")
          .attr("alignment-baseline", "middle")
          .text(xTrait)
          .style("font-weight", "bold")
          .attr("font-size", "10px");;
      } else {
        // Scatterplot
        cell.selectAll("circle")
          .data(penguins.filter(d => d[xTrait] != null && d[yTrait] != null))
          .join("circle")
          .attr("cx", d => scales[xTrait](d[xTrait]))
          .attr("cy", d => size - scales[yTrait](d[yTrait])) // Invert y for SVG
          .attr("r", 3)
          .attr("fill", d => color(d.species))
          .attr("opacity", 0.7);
      }

      // Axes (for outer edges only)
      if (row === traits.length - 1) {
        const xAxis = d3.axisBottom(scales[xTrait]).ticks(4).tickSize(2);
        cell.append("g")
          .attr("transform", `translate(0,${size - padding})`)
          .call(xAxis)
          .attr("font-size", "8px");
      }

      if (col === 0) {
        const yAxis = d3.axisLeft(scales[yTrait]).ticks(4).tickSize(2);
        cell.append("g")
          .attr("transform", `translate(${padding},0)`)
          .call(yAxis)
          .attr("font-size", "8px");
      }
    });
  });

  // Optional legend
  const legend = svg.append("g")
    .attr("transform", `translate(${width - 550}, 20)`);
  speciesList.forEach((species, i) => {
    legend.append("circle")
      .attr("cx", 0)
      .attr("cy", i * 15)
      .attr("r", 5)
      .attr("fill", color(species));
    legend.append("text")
      .attr("x", 10)
      .attr("y", i * 15 + 3)
      .attr("font-size", "10px")
      .text(species);
  });
}

/*
  When I made the bar chart I processed the data differently from how Bowei did it
  So I'm just going to hard code the numbers here because that's easier.
  All we need is the graph so I figure how we program the data processing stuff doesn't matter too much
  
  If you're wondering where the numbers came from, I just counted how many penguins there were of each
  species and diet, then normalized it by dividing the total number of penguins in that species (because 
  the dataset didn't collect equal numbers of each of the 3 species).
  For example Adelie-Fish has a value of about 0.246, which means 24.6% of Adelie penguins eat fish.

  -Reilly
*/
function getDietData() {
  return [
    {label: "Adelie-Fish", value: 0.24615384615384617},
    {label: "Adelie-Krill", value: 0.43141025641025643},
    {label: "Adelie-Parental", value: 0.26794871794871794},
    {label: "Adelie-Squid", value: 0.05448717948717949},

    {label: "Gentoo-Fish", value: 0.3825180433039294},
    {label: "Gentoo-Krill", value: 0.32558139534883723},
    {label: "Gentoo-Parental", value: 0.23416198877305533},
    {label: "Gentoo-Squid", value: 0.057738572574178026},

    {label: "Chinstrap-Fish", value: 0.15569823434991975},
    {label: "Chinstrap-Krill", value: 0.5457463884430177},
    {label: "Chinstrap-Parental", value: 0.24077046548956663},
    {label: "Chinstrap-Squid", value: 0.05778491171749599},
  ]
}

function drawBars() {
  const width = 640;
  const height = 400;
  const marginTop = 20;
  const marginRight = 0;
  const marginBottom = 60;
  const marginLeft = 40;

  const species = ["Adelie", "Gentoo", "Chinstrap"];
  const diets = ["Fish", "Krill", "Parental", "Squid"];

  // Form and container setup
  const form = document.createElement("select");
  form.innerHTML = `
    <option value="species">Group by Species</option>
    <option value="diet">Group by Diet</option>
  `;

  const container = document.createElement("div");
  const root = document.getElementById("bar-chart");
  root.innerHTML = "";
  root.appendChild(form);
  root.appendChild(container);

  const svg = d3.create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("style", `max-width: ${width}px; height: auto; font: 10px sans-serif;`);

  container.appendChild(svg.node());

  // Pattern defs
  const defs = svg.append("defs");
  const patternData = [
    { id: "pattern-adelie", angle: 45 },
    { id: "pattern-gentoo", angle: -45 },
    { id: "pattern-chinstrap", angle: 0 }
  ];

  patternData.forEach(({ id, angle }) => {
    const p = defs.append("pattern")
      .attr("id", id)
      .attr("width", 6)
      .attr("height", 6)
      .attr("patternUnits", "userSpaceOnUse")
      .attr("patternTransform", `rotate(${angle})`);

    p.append("rect")
      .attr("width", 3)
      .attr("height", 6)
      .attr("fill", "black")
      .attr("opacity", 0.5);
  });

  const gX = svg.append("g")
    .attr("transform", `translate(0,${height - marginBottom})`);
  const gY = svg.append("g")
    .attr("transform", `translate(${marginLeft},0)`);

  const barLayer = svg.append("g");
  const legendGroup = svg.append("g")
    .attr("transform", `translate(${width / 2 - 100},${height - marginBottom + 40})`);

  const color = d3.scaleOrdinal()
    .domain(diets)
    .range(d3.schemeCategory10);

  const x0 = d3.scaleBand().range([marginLeft, width - marginRight]).paddingInner(0.1);
  const x1 = d3.scaleBand().padding(0.05);
  const y = d3.scaleLinear().range([height - marginBottom, marginTop]);

  const dietData = getDietData(); // Ensure `data` is global or passed in
  const flatData = dietData.map(d => {
    const [sp, di] = d.label.split("-");
    return {
      label: d.label,
      species: sp,
      diet: di,
      value: d.value
    };
  });

  const bars = barLayer.selectAll("g.bar")
    .data(flatData)
    .join("g")
    .attr("class", "bar");

  bars.append("rect")
    .attr("class", "colorBar")
    .attr("width", 0)
    .attr("y", y(0))
    .attr("height", 0)
    .attr("fill", d => color(d.diet));

  bars.append("rect")
    .attr("class", "patternOverlay")
    .attr("width", 0)
    .attr("y", y(0))
    .attr("height", 0)
    .attr("fill", d => `url(#pattern-${d.species.toLowerCase()})`)
    .attr("pointer-events", "none");

  function updateChart(groupBy) {
    const groups = groupBy === "species" ? species : diets;
    const subGroups = groupBy === "species" ? diets : species;

    x0.domain(groups);
    x1.domain(subGroups).range([0, x0.bandwidth()]);
    y.domain([0, d3.max(flatData, d => d.value)]).nice();

    gX.transition().duration(750).call(d3.axisBottom(x0));
    gY.transition().duration(750).call(d3.axisLeft(y));

    bars.transition().duration(750)
      .attr("transform", d => {
        const groupKey = groupBy === "species" ? d.species : d.diet;
        const subGroupKey = groupBy === "species" ? d.diet : d.species;
        return `translate(${x0(groupKey) + x1(subGroupKey)},0)`;
      });

    bars.select(".colorBar").transition().duration(750)
      .attr("y", d => y(d.value))
      .attr("height", d => y(0) - y(d.value))
      .attr("width", x1.bandwidth());

    bars.select(".patternOverlay").transition().duration(750)
      .attr("y", d => y(d.value))
      .attr("height", d => y(0) - y(d.value))
      .attr("width", x1.bandwidth());

    // Legend
    legendGroup.selectAll("*").remove();
    diets.forEach((label, i) => {
      const lg = legendGroup.append("g")
        .attr("transform", `translate(${i * 100}, 0)`);
      lg.append("rect")
        .attr("width", 15)
        .attr("height", 15)
        .attr("fill", color(label));
      lg.append("text")
        .attr("x", 20)
        .attr("y", 12)
        .text(label)
        .style("font-size", "10px");
    });
  }

  svg.append("text")
    .attr("x", 40)
    .attr("y", height - 25)
    .style("font-size", "11px")
    .text("Patterns indicate species: Adelie (↗), Gentoo (↘), Chinstrap (║)");

  updateChart("species");

  form.addEventListener("change", () => updateChart(form.value));
}


renderCheckboxes("traitSelector", TRAITS);
renderCheckboxes("sankeyDims", AVAILABLE_FIELDS, ["sex", "life_stage", "year"]);
renderCheckboxes("speciesFilter", Array.from(new Set(penguins.map(d => d.species))));
renderCheckboxes("sexFilter", Array.from(new Set(penguins.map(d => d.sex))));
renderCheckboxes("yearFilter", Array.from(new Set(penguins.map(d => d.year))));

addCheckboxListeners();
drawScatter();
drawHeatmap();
drawBars();
drawSankey();
