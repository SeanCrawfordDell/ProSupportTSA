"use strict";
// Live note quality score panel for Case Notes.
window.CaseRubric = (() => {
  const $ = id => document.getElementById(id);
  let api = null, pending = false;
  function render() {
    pending = false;
    const note = api?.current();
    if (!note || !$("noteRubric")) return;
    const result = CaseRubricCore.score(note);
    $("rubricTotal").textContent = String(result.total);
    $("rubricRating").textContent = result.rating;
    $("noteRubric").dataset.rating = result.rating === "Strong" ? "strong" : result.rating === "Needs detail" ? "medium" : "low";
    $("rubricCategories").replaceChildren(...Object.keys(result.maxima).map(key => {
      const row = document.createElement("div"), name = document.createElement("span"), meter = document.createElement("meter"), value = document.createElement("strong");
      row.className = "rubric-row";
      name.textContent = result.labels[key];
      meter.min = 0; meter.max = result.maxima[key]; meter.value = result.categories[key];
      meter.low = result.maxima[key] * 0.5; meter.high = result.maxima[key] * 0.8; meter.optimum = result.maxima[key];
      meter.setAttribute("aria-label", `${result.labels[key]} ${result.categories[key]} of ${result.maxima[key]}`);
      value.textContent = `${result.categories[key]} / ${result.maxima[key]}`;
      row.append(name, meter, value);
      return row;
    }));
    const gaps = result.gaps.slice(0, 5);
    $("rubricGaps").replaceChildren(...(gaps.length ? gaps.map(item => {
      const li = document.createElement("li"), points = document.createElement("b");
      points.textContent = `+${item.points}`;
      li.append(points, document.createTextNode(" " + item.text));
      return li;
    }) : [Object.assign(document.createElement("li"), { textContent: "Nothing missing. This note covers every rubric item." })]));
  }
  function refresh() {
    if (pending) return;
    pending = true;
    setTimeout(render, 0);
  }
  function init(options) {
    api = options;
    // Case Notes updates the note on input; score afterwards so the panel reflects the latest edit.
    document.addEventListener("input", refresh);
    document.addEventListener("change", refresh);
    document.addEventListener("click", event => { if (event.target.closest?.("button")) refresh(); });
    refresh();
  }
  return { init, refresh };
})();
