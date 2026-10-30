// Graphique : choix de la période et points cliquables.
// Remplace renderChart() de index.html (s'appuie sur ses variables globales).
(function () {
  const PERIODS = [["7j", "7 j", 7], ["1m", "1 mois", 30], ["3m", "3 mois", 91], ["1a", "1 an", 365], ["tout", "Tout", 0]];
  let period = "3m";
  try { const s = localStorage.getItem("bc-periode"); if (PERIODS.some((p) => p[0] === s)) period = s; } catch {}
  let selected = null; // date (AAAA-MM-JJ) de la pesée affichée dans la bulle
  let shown = [];      // index des pesées dessinées

  const css = document.createElement("style");
  css.textContent = `
.chart-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
.periods { display: inline-flex; flex-wrap: wrap; gap: 4px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 3px; }
.periods button { background: transparent; border: none; color: var(--muted); padding: 5px 11px; border-radius: 7px; font-size: 0.85rem; }
.periods button[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 18%, transparent); }
.period-sum { font-size: 0.85rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.period-sum b { color: var(--ink); font-family: var(--f-data); font-weight: 600; }
.chart-wrap { position: relative; min-width: 0; }
svg.chart .pt { cursor: pointer; outline: none; }
svg.chart .pt:focus-visible .vis { stroke-width: 4; }
.pt-tip { position: absolute; z-index: 5; min-width: 190px; max-width: 240px; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; box-shadow: 0 6px 20px color-mix(in srgb, var(--ink) 20%, transparent); font-size: 0.85rem; display: grid; gap: 3px; }
.pt-tip .d { color: var(--muted); font-size: 0.78rem; }
.pt-tip .d::first-letter { text-transform: uppercase; }
.pt-tip .w { font-family: var(--f-data); font-size: 1.35rem; font-weight: 600; }
.pt-tip .r { display: flex; justify-content: space-between; gap: 12px; }
.pt-tip .r span:last-child { font-family: var(--f-data); font-variant-numeric: tabular-nums; white-space: nowrap; }
.pt-tip .x { position: absolute; top: 4px; right: 6px; background: none; border: none; color: var(--muted); padding: 2px 6px; font-weight: 400; }
.pt-tip .up { color: var(--bad); } .pt-tip .down { color: var(--good); }
`;
  document.head.appendChild(css);

  /* ---------- Barre des périodes et résumé ---------- */
  const svg = $("chart");
  const box = svg.closest(".chart-box");
  const tools = document.createElement("div");
  tools.className = "chart-tools";
  tools.innerHTML = `<div class="periods" role="group" aria-label="Période affichée">${PERIODS.map(([k, label]) => `<button type="button" data-p="${k}">${label}</button>`).join("")}</div><span class="period-sum" id="periodSum"></span>`;
  box.before(tools);
  tools.querySelector(".periods").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-p]");
    if (!b) return;
    period = b.dataset.p;
    try { localStorage.setItem("bc-periode", period); } catch {}
    scrollToEnd = true;
    renderChart(calc());
  });

  // La bulle vit hors de la zone qui défile, pour ne pas être coupée.
  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  box.before(wrap);
  wrap.appendChild(box);
  const tip = document.createElement("div");
  tip.className = "pt-tip";
  tip.hidden = true;
  tip.setAttribute("role", "dialog");
  tip.setAttribute("aria-label", "Détail de la pesée");
  wrap.appendChild(tip);
  let scrollToEnd = true, tipIndex = -1;
  box.addEventListener("scroll", () => { if (!tip.hidden) showTip(tipIndex); });

  const signed = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), d);

  /* ---------- Dessin ---------- */
  window.renderChart = function (c) {
    const p = state.profile, all = c.entries;
    const W = 680, H = 280, L = 46, R = 16, T = 16, B = 34;
    tools.querySelectorAll("[data-p]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.p === period)));
    const sum = $("periodSum");
    if (!all.length) {
      svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Ajoutez une pesée pour voir la courbe</text>`;
      sum.textContent = "";
      hideTip();
      return;
    }

    // Moyenne mobile calculée sur toutes les pesées, puis découpée à la période.
    const ma = all.map((e, i) => { const s = all.slice(Math.max(0, i - 6), i + 1); return s.reduce((a, b) => a + b.w, 0) / s.length; });
    const days = PERIODS.find((x) => x[0] === period)[2];
    const today = toTime(todayISO());
    let t0, t1, endProj = null, goalT = p.date ? toTime(p.date) : null;
    if (days) {
      t1 = Math.max(today, toTime(all.at(-1).d));
      t0 = t1 - days * DAY;
      shown = all.map((e, i) => i).filter((i) => toTime(all[i].d) >= t0);
      if (!(goalT && goalT >= t0 && goalT <= t1)) goalT = null;
    } else {
      t0 = toTime(all[0].d);
      t1 = toTime(all.at(-1).d);
      endProj = c.eta && c.eta - t1 < 365 * DAY ? c.eta : null;
      t1 = Math.max(t1, endProj || 0, goalT && goalT - t1 < 365 * DAY ? goalT : 0, t0 + 7 * DAY);
      if (goalT && goalT > t1) goalT = null;
      shown = all.map((e, i) => i);
    }

    if (!shown.length) {
      svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Aucune pesée sur cette période</text>`;
      sum.textContent = `Dernière pesée : ${fmt(all.at(-1).w)} kg le ${fmtDate(all.at(-1).d)}`;
      hideTip();
      return;
    }

    const ws = shown.map((i) => all[i].w);
    let lo = Math.min(...ws), hi = Math.max(...ws);
    // L'objectif n'écrase pas l'échelle d'une courte période quand il est loin.
    const showGoal = !days || (p.goal >= lo - 3 && p.goal <= hi + 3);
    if (showGoal) { lo = Math.min(lo, p.goal); hi = Math.max(hi, p.goal); }
    const y0 = Math.floor(lo - 1), y1 = Math.ceil(hi + 1);
    const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
    const y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);

    let out = "";
    const step = Math.max(1, Math.ceil((y1 - y0) / 6));
    for (let v = y0; v <= y1; v += step) {
      out += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>`;
      out += `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    const span = (t1 - t0) / DAY;
    const ticks = span <= 8 ? Math.round(span) : span <= 120 ? 5 : 6;
    const opts = span <= 8 ? { weekday: "short", day: "numeric" } : span <= 120 ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" };
    for (let i = 0; i <= ticks; i++) {
      const t = t0 + ((t1 - t0) * i) / ticks;
      out += `<text x="${x(t)}" y="${H - 10}" text-anchor="${i === 0 ? "start" : i === ticks ? "end" : "middle"}">${new Date(t).toLocaleDateString("fr-FR", opts)}</text>`;
    }
    if (showGoal) {
      out += `<line x1="${L}" x2="${W - R}" y1="${y(p.goal)}" y2="${y(p.goal)}" stroke="var(--good)" stroke-width="1.5" stroke-dasharray="6 5"/>`;
      out += `<text x="${W - R}" y="${y(p.goal) - 6}" text-anchor="end" style="fill:var(--good)">objectif ${fmt(p.goal)} kg</text>`;
      if (goalT) out += `<circle cx="${x(goalT)}" cy="${y(p.goal)}" r="4" fill="var(--good)"/>`;
    }

    const pts = shown.map((i) => [x(toTime(all[i].d)), y(all[i].w)]);
    const path = (arr) => arr.map((pt, k) => (k ? "L" : "M") + pt[0].toFixed(1) + " " + pt[1].toFixed(1)).join(" ");
    const line = path(pts);
    out += `<path d="${line} L${pts.at(-1)[0]} ${H - B} L${pts[0][0]} ${H - B} Z" fill="var(--accent)" fill-opacity="0.1" stroke="none"/>`;
    if (shown.length >= 3) out += `<path d="${path(shown.map((i) => [x(toTime(all[i].d)), y(ma[i])]))}" fill="none" stroke="var(--muted)" stroke-width="1.5"/>`;
    if (endProj) out += `<line x1="${pts.at(-1)[0]}" y1="${pts.at(-1)[1]}" x2="${x(endProj)}" y2="${y(p.goal)}" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="3 4"/>`;
    out += `<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;

    const sel = selected ? all.findIndex((e) => e.d === selected) : -1;
    if (shown.includes(sel)) {
      const sx = x(toTime(all[sel].d));
      out += `<line x1="${sx}" x2="${sx}" y1="${T}" y2="${H - B}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="2 3"/>`;
    }
    shown.forEach((i, k) => {
      const [px, py] = pts[k];
      const isSel = i === sel, last = k === pts.length - 1;
      out += `<g class="pt" data-i="${i}" tabindex="0" role="button" aria-label="${fmtDate(all[i].d)} : ${fmt(all[i].w)} kg">`
        + `<circle cx="${px}" cy="${py}" r="14" fill="transparent"/>`
        + `<circle class="vis" cx="${px}" cy="${py}" r="${isSel ? 7 : last ? 5 : 4}" fill="${isSel || last ? "var(--accent)" : "var(--surface)"}" stroke="${isSel ? "var(--surface)" : "var(--accent)"}" stroke-width="${isSel ? 3 : 2}"/>`
        + `</g>`;
    });
    if (sel === -1 || !shown.includes(sel)) {
      const lp = pts.at(-1);
      out += `<text x="${Math.min(lp[0], W - R - 4)}" y="${lp[1] - 12}" text-anchor="end" style="fill:var(--ink);font-weight:600">${fmt(all[shown.at(-1)].w)} kg</text>`;
    }
    svg.innerHTML = out;

    const first = all[shown[0]].w, lastW = all[shown.at(-1)].w;
    sum.innerHTML = shown.length > 1
      ? `Sur la période : <b>${signed(lastW - first)} kg</b> · ${shown.length} pesées · min ${fmt(Math.min(...ws))} / max ${fmt(Math.max(...ws))} kg`
      : `1 pesée sur la période`;

    // Sur petit écran, on montre d'abord les pesées les plus récentes.
    if (scrollToEnd) { box.scrollLeft = box.scrollWidth; scrollToEnd = false; }
    if (shown.includes(sel)) requestAnimationFrame(() => showTip(sel)); else hideTip();
  };

  /* ---------- Bulle de détail ---------- */
  function showTip(i) {
    const all = calc().entries, e = all[i], p = state.profile;
    if (!e) return hideTip();
    const hm = p.height / 100, prev = all[i - 1];
    const diff = prev ? e.w - prev.w : null;
    const toGoal = e.w - p.goal;
    tip.innerHTML = `
      <button type="button" class="x" aria-label="Fermer">✕</button>
      <span class="d">${new Date(e.d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
      <span class="w">${fmt(e.w)} kg</span>
      <span class="r"><span>${prev ? "Depuis le " + new Date(prev.d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "Première pesée"}</span><span class="${diff > 0 ? "up" : diff < 0 ? "down" : ""}">${diff == null ? "—" : signed(diff) + " kg"}</span></span>
      <span class="r"><span>IMC</span><span>${fmt(e.w / (hm * hm))}</span></span>
      <span class="r"><span>Depuis le début</span><span>${signed(e.w - all[0].w)} kg</span></span>
      <span class="r"><span>${Math.abs(toGoal) < 0.05 ? "Objectif" : toGoal > 0 ? "Reste à perdre" : "Reste à prendre"}</span><span>${Math.abs(toGoal) < 0.05 ? "atteint" : fmt(Math.abs(toGoal)) + " kg"}</span></span>`;
    tip.hidden = false;
    tipIndex = i;
    const dot = svg.querySelector(`.pt[data-i="${i}"] .vis`);
    if (!dot) return hideTip();
    const b = wrap.getBoundingClientRect(), d = dot.getBoundingClientRect();
    const cx = d.left + d.width / 2 - b.left, cy = d.top - b.top;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const left = Math.max(4, Math.min(cx - tw / 2, wrap.clientWidth - tw - 4));
    const top = cy - th - 12 >= -40 ? cy - th - 12 : cy + d.height + 12;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() { tip.hidden = true; }

  function pick(g) {
    const i = Number(g.dataset.i);
    const d = calc().entries[i].d;
    selected = selected === d ? null : d;
    renderChart(calc());
  }
  svg.addEventListener("click", (ev) => {
    ev.stopPropagation(); // le redessin détache la cible : ne pas laisser le clic « extérieur » fermer la bulle
    const g = ev.target.closest(".pt");
    if (g) { pick(g); return; }
    if (selected) { selected = null; renderChart(calc()); }
  });
  svg.addEventListener("keydown", (ev) => {
    const g = ev.target.closest(".pt");
    if (g && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); pick(g); }
  });
  tip.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (ev.target.closest(".x")) { selected = null; renderChart(calc()); }
  });
  document.addEventListener("click", (ev) => {
    if (selected && !wrap.contains(ev.target)) { selected = null; renderChart(calc()); }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && selected) { selected = null; renderChart(calc()); }
  });

  renderChart(calc());
})();
