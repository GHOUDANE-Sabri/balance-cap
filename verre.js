// Mesure d'un verre en photo : l'appli repère seule les bords du verre et le niveau de l'eau, puis calcule le volume.
// Le verre est vu comme un tronc de cône (haut et fond de largeurs différentes).
// Sans rien saisir, on suppose un verre standard ; un verre de référence choisi (largeur ou contenance) est retenu sur l'appareil.
// S'appuie sur les variables globales de index.html (addWater, fmt…) et sur les styles .sheet de details.js.
(function () {
  const css = document.createElement("style");
  css.textContent = `
.glass-open { display: flex; align-items: center; justify-content: center; gap: 8px; }
.glass-stage { position: relative; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; touch-action: none; }
.glass-stage svg { display: block; width: 100%; height: auto; max-height: 50vh; }
.glass-stage .h { cursor: grab; }
.glass-stage.locked .h { display: none; }
.glass-stage.locked { touch-action: auto; }
.glass-pick { display: grid; place-items: center; gap: 10px; text-align: center; padding: 28px 16px; border: 2px dashed var(--line); border-radius: 12px; color: var(--muted); cursor: pointer; }
.glass-busy { text-align: center; color: var(--muted); padding: 28px 0; }
.glass-ref { display: grid; gap: 8px; }
.glass-ref .opt { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 0.92rem; color: var(--ink); }
.glass-ref .opt input[type="radio"] { width: auto; }
.glass-ref .opt select, .glass-ref .opt input[type="number"] { width: 110px; }
.glass-refline { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 0.9rem; }
.glass-refline button { padding: 3px 10px; font-size: 0.85rem; }
.glass-result { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
.glass-result .v { font-family: var(--f-data); font-size: 2.2rem; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.1; }
.glass-result .v small { font-size: 0.9rem; color: var(--muted); font-weight: 400; margin-left: 4px; }
.glass-result .tag { margin-top: 4px; }
.glass-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.glass-actions button { flex: 1 1 auto; }
`;
  document.head.appendChild(css);

  // Bouton dans le bloc « Eau bue aujourd'hui »
  const open = document.createElement("button");
  open.type = "button";
  open.className = "ghost glass-open";
  open.textContent = "📷 Mesurer un verre en photo";
  $("waterBtns").after(open);

  /* ---------- Verre de référence, retenu sur l'appareil ---------- */
  const REF_KEY = "balance-cap-verre";
  // Sans rien connaître du verre, on prend la largeur d'un verre à eau courant (7 à 8 cm en haut).
  const STD_DIAM = 7.5;
  let ref = { mode: "std", cap: 25, diam: 7 };
  try { Object.assign(ref, JSON.parse(localStorage.getItem(REF_KEY)) || {}); } catch {}
  const saveRef = () => { try { localStorage.setItem(REF_KEY, JSON.stringify(ref)); } catch {} };
  const refText = () => ref.mode === "cap" ? `Verre de ${fmt(ref.cap, 0)} cl plein`
    : ref.mode === "diam" ? `Verre de ${fmt(ref.diam, ref.diam % 1 ? 1 : 0)} cm de large`
    : "Verre standard (environ 7,5 cm de large)";

  const MAX_SIDE = 1200; // la photo est réduite : plus rapide et suffisant pour la mesure
  let bg = null, img = null, pts = null, found = null, drag = null, editing = false;

  /* ---------- Fenêtre ---------- */
  function close() {
    if (!bg) return;
    bg.remove(); bg = null; img = null; pts = null; found = null;
    document.removeEventListener("keydown", onKey);
    open.focus();
  }
  const onKey = (ev) => { if (ev.key === "Escape") close(); };

  // Le sélecteur de photo s'ouvre dans le même geste que l'appui sur le bouton : l'appareil photo arrive tout de suite.
  const fileInput = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("capture", "environment"); inp.hidden = true;
    inp.addEventListener("change", () => { if (inp.files[0]) loadPhoto(inp.files[0]); });
    return inp;
  };
  const askPhoto = () => { const inp = fileInput(); bg.appendChild(inp); inp.click(); };

  open.addEventListener("click", () => {
    bg = document.createElement("div");
    bg.className = "sheet-bg";
    bg.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="glassTitle">
        <div class="sheet-head">
          <div><span class="k">Eau bue</span><div class="v" id="glassTitle" style="font-size:1.4rem">Mesurer un verre</div></div>
          <button type="button" class="close" aria-label="Fermer">✕</button>
        </div>
        <div id="glassBody">
          <button type="button" class="glass-pick ghost" id="glassPick">
            <span>Photographiez le verre <b>de profil</b>, l'appareil à la hauteur de l'eau, devant un fond uni.</span>
            <span class="pill">Prendre ou choisir une photo</span>
          </button>
        </div>
        <p class="err" id="glassErr"></p>
      </div>`;
    document.body.appendChild(bg);
    bg.addEventListener("click", (ev) => { if (ev.target === bg) close(); });
    bg.querySelector(".close").addEventListener("click", close);
    bg.querySelector("#glassPick").addEventListener("click", askPhoto);
    document.addEventListener("keydown", onKey);
    askPhoto();
  });

  function loadPhoto(file) {
    $("glassErr").textContent = "";
    $("glassBody").innerHTML = `<p class="glass-busy">Analyse de la photo…</p>`;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
      const cv = document.createElement("canvas");
      cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
      cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      img = { w: cv.width, h: cv.height, src: cv.toDataURL("image/jpeg", 0.85) };
      found = detect(cv);
      pts = found.pts;
      editing = false;
      showResult();
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      $("glassBody").innerHTML = `<button type="button" class="glass-pick ghost" id="glassPick"><span class="pill">Choisir une autre photo</span></button>`;
      $("glassPick").addEventListener("click", askPhoto);
      $("glassErr").textContent = "Impossible de lire cette image. Essayez une photo JPEG ou PNG.";
    };
    im.src = url;
  }

  /* ---------- Détection automatique ---------- */
  // 1. Les deux bords du verre : les colonnes aux contrastes verticaux les plus forts.
  // 2. Chaque bord est suivi ligne par ligne puis ajusté par une droite (verre évasé ou droit).
  // 3. Le niveau de l'eau : là où la couleur à l'intérieur du verre change le plus nettement,
  //    renforcé par la ligne horizontale de la surface.
  function detect(src) {
    const w = 240, h = Math.max(24, Math.round((src.height / src.width) * w));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const n = w * h, R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0; i < n; i++) { R[i] = d[i * 4]; G[i] = d[i * 4 + 1]; B[i] = d[i * 4 + 2]; }
    // Contraste couleur : le plus fort des trois canaux (une eau teintée se voit mieux ainsi qu'en gris).
    const gx = new Float32Array(n), gy = new Float32Array(n);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] = Math.max(Math.abs(R[i + 1] - R[i - 1]), Math.abs(G[i + 1] - G[i - 1]), Math.abs(B[i + 1] - B[i - 1]));
      gy[i] = Math.max(Math.abs(R[i + w] - R[i - w]), Math.abs(G[i + w] - G[i - w]), Math.abs(B[i + w] - B[i - w]));
    }
    const smooth = (a, r = 1) => a.map((_, i) => { let s = 0, c = 0; for (let k = -r; k <= r; k++) if (a[i + k] != null) { s += a[i + k]; c++; } return s / c; });
    const median = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    // 1. Colonnes des bords
    const col = new Array(w).fill(0);
    for (let x = 1; x < w - 1; x++) for (let y = Math.round(h * 0.08); y < h * 0.92; y++) col[x] += gx[y * w + x];
    const cs = smooth(smooth(col, 2), 2);
    const peaks = [];
    for (let x = 2; x < w - 2; x++) if (cs[x] >= cs[x - 1] && cs[x] >= cs[x + 1]) peaks.push(x);
    peaks.sort((p, q) => cs[q] - cs[p]);
    let xl = Math.round(w * 0.3), xr = Math.round(w * 0.7), bestPair = -1;
    const top = peaks.slice(0, 10);
    for (const p of top) for (const q of top) {
      if (q - p < w * 0.12) continue;
      const s = Math.min(cs[p], cs[q]);
      if (s > bestPair) { bestPair = s; xl = p; xr = q; }
    }

    // 2. Suivi des bords et droites
    const reach = Math.round(w * 0.08);
    const track = (x0) => {
      const ex = new Array(h).fill(x0), es = new Array(h).fill(0);
      for (let y = 1; y < h - 1; y++) {
        for (let x = Math.max(1, x0 - reach); x <= Math.min(w - 2, x0 + reach); x++) {
          if (gx[y * w + x] > es[y]) { es[y] = gx[y * w + x]; ex[y] = x; }
        }
      }
      return { ex, es };
    };
    const TL = track(xl), TR = track(xr);
    const both = smooth(TL.es.map((v, y) => Math.min(v, TR.es[y])), 2);
    const thr = 0.3 * [...both].sort((p, q) => p - q)[Math.floor(h * 0.9)];
    // Plus longue suite de lignes où les deux bords sont visibles (petits trous tolérés)
    let yt = -1, yb = -1, runStart = -1, lastOn = -99;
    const gap = Math.max(2, Math.round(h * 0.03));
    for (let y = 1; y < h - 1; y++) {
      if (both[y] <= thr) continue;
      if (y - lastOn > gap) runStart = y;
      lastOn = y;
      if (yb - yt < y - runStart) { yt = runStart; yb = y; }
    }
    let sidesOk = yt >= 0 && yb - yt >= h * 0.15;
    if (!sidesOk) { yt = Math.round(h * 0.2); yb = Math.round(h * 0.85); }
    const fit = (T) => {
      let use = [];
      for (let y = yt; y <= yb; y++) if (T.es[y] > thr * 0.5) use.push(y);
      let line = { a: median(use.map((y) => T.ex[y])), b: 0 }, spread = 99;
      for (let it = 0; it < 3 && use.length >= 4; it++) {
        const my = use.reduce((s, y) => s + y, 0) / use.length, mx = use.reduce((s, y) => s + T.ex[y], 0) / use.length;
        let num = 0, den = 0;
        use.forEach((y) => { num += (y - my) * (T.ex[y] - mx); den += (y - my) ** 2; });
        const b = den ? num / den : 0;
        line = { a: mx - b * my, b };
        const res = use.map((y) => Math.abs(T.ex[y] - (line.a + line.b * y)));
        spread = median(res);
        const lim = Math.max(1.5, 2.5 * spread);
        use = use.filter((y, i) => res[i] <= lim);
      }
      return { ...line, spread };
    };
    const LL = fit(TL), LR = fit(TR);
    const xAt = (L, y) => L.a + L.b * y;
    if (LL.spread > 3 || LR.spread > 3) sidesOk = false;

    // 3. Niveau de l'eau. On compare l'intérieur du verre au décor juste à côté : un changement visible des deux
    // côtés (bord de table, mur…) vient du fond, pas de l'eau, et s'annule dans la différence.
    const span = yb - yt;
    const avg = (y, a, b) => {
      a = Math.max(1, Math.round(a)); b = Math.min(w - 2, Math.round(b));
      let sr = 0, sg = 0, sb = 0, se = 0, c = 0;
      for (let x = a; x <= b; x++) { const i = y * w + x; sr += R[i]; sg += G[i]; sb += B[i]; se += gy[i]; c++; }
      return c ? [sr / c, sg / c, sb / c, se / c, c] : null;
    };
    const rows = [];
    for (let y = yt; y <= yb; y++) {
      const l = xAt(LL, y), r = xAt(LR, y), wid = r - l;
      const inside = avg(y, l + wid * 0.18, r - wid * 0.18) || [0, 0, 0, 0];
      const left = avg(y, l - wid * 0.3, l - wid * 0.08), right = avg(y, r + wid * 0.08, r + wid * 0.3);
      const outs = [left, right].filter(Boolean);
      const out = outs.length ? [0, 1, 2, 3].map((j) => outs.reduce((s, o) => s + o[j], 0) / outs.length) : [0, 0, 0, 0];
      rows.push([inside[0] - out[0], inside[1] - out[1], inside[2] - out[2], Math.max(0, inside[3] - out[3])]);
    }
    const k = Math.max(3, Math.round(span * 0.06));
    const meanOf = (from, to) => {
      const s = [0, 0, 0]; let c = 0;
      for (let i = Math.max(0, from); i <= Math.min(rows.length - 1, to); i++) { s[0] += rows[i][0]; s[1] += rows[i][1]; s[2] += rows[i][2]; c++; }
      return s.map((v) => v / Math.max(1, c));
    };
    // On ignore le haut du verre : l'ellipse du bord y fait un contraste qui n'est pas de l'eau.
    const lo = Math.max(1, Math.round(span * 0.09)), hi = Math.min(rows.length - 2, Math.round(span * 0.97));
    const steps = [], edges = [];
    for (let i = lo; i <= hi; i++) {
      const u = meanOf(Math.max(lo - 2, i - k), i - 1), v = meanOf(i + 1, i + k);
      steps.push(Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]));
      edges.push((rows[i - 1][3] + rows[i][3] + rows[i + 1][3]) / 3);
    }
    const maxS = Math.max(1, ...steps), maxE = Math.max(1, ...edges);
    const score = steps.map((s, j) => 0.65 * s / maxS + 0.35 * edges[j] / maxE);
    // Changements nets, du plus fort au plus faible, assez éloignés les uns des autres
    const cands = [];
    score.forEach((s, j) => { if (s >= (score[j - 1] ?? 0) && s >= (score[j + 1] ?? 0)) cands.push(j); });
    cands.sort((p, q) => score[q] - score[p]);
    const picks = [];
    for (const j of cands) { if (picks.every((p) => Math.abs(p - j) > k)) picks.push(j); if (picks.length === 3) break; }
    const MIN_STEP = 7; // en dessous, l'intérieur du verre ne change pas vraiment de couleur
    // Le fond épais du verre fait aussi un changement net, tout en bas : c'est le fond intérieur, pas l'eau.
    let ib = yb;
    const low = picks.filter((j) => yt + lo + j > yb - span * 0.13 && steps[j] >= MIN_STEP).sort((p, q) => q - p)[0];
    if (low != null) ib = yt + lo + low;
    const water = picks.filter((j) => yt + lo + j < ib - k && steps[j] >= MIN_STEP).sort((p, q) => score[q] - score[p])[0];
    const empty = water == null;
    let yw = empty ? ib : yt + lo + water;
    // Vue un peu d'en haut, la surface de l'eau est une ellipse : le vrai niveau est au milieu de ses deux bords.
    if (!empty) {
      const j0 = water, reachDown = Math.round(span * 0.08);
      let j1 = -1;
      for (let j = j0 + 2; j <= Math.min(edges.length - 1, j0 + reachDown); j++) if (edges[j] > edges[j0] * 0.5 && (j1 < 0 || edges[j] > edges[j1])) j1 = j;
      if (j1 > 0 && yt + lo + j1 < ib) yw = yt + lo + (j0 + j1) / 2;
    }
    const contrast = empty ? 0 : steps[water], noise = median(steps);

    // Confiance : un changement net au niveau de l'eau et deux bords bien droits.
    let conf = clamp((contrast - 1.5 * noise) / 18, 0, 1) * (sidesOk ? 1 : 0.4);
    if (Math.abs(LL.b) > 0.4 || Math.abs(LR.b) > 0.4) conf *= 0.5; // bords trop penchés : sans doute pas un verre

    const s = src.width / w;
    return {
      pts: {
        tl: { x: xAt(LL, yt) * s, y: yt * s }, tr: { x: xAt(LR, yt) * s, y: yt * s },
        bl: { x: xAt(LL, ib) * s, y: ib * s }, br: { x: xAt(LR, ib) * s, y: ib * s },
        water: yw * s,
      },
      conf, empty,
    };
  }

  /* ---------- Calcul du volume ---------- */
  // Volume (en pixels³) entre le niveau y0 et le fond, pour un tronc de cône défini par les 4 coins.
  function volPx(y0) {
    const yt = pts.tl.y, yb = pts.bl.y;
    const rt = Math.abs(pts.tr.x - pts.tl.x) / 2, rb = Math.abs(pts.br.x - pts.bl.x) / 2;
    const from = Math.max(yt, Math.min(yb, y0));
    const n = 200, step = (yb - from) / n;
    let v = 0;
    for (let i = 0; i < n; i++) {
      const y = from + (i + 0.5) * step;
      const r = rb + (rt - rb) * ((yb - y) / (yb - yt));
      v += Math.PI * r * r * step;
    }
    return v;
  }

  function measure() {
    const water = volPx(pts.water), full = volPx(pts.tl.y);
    if (!(full > 0)) return null;
    let ml, fullMl;
    if (ref.mode === "cap") {
      fullMl = ref.cap * 10;
      if (!isFinite(fullMl) || fullMl <= 0) return null;
      ml = fullMl * (water / full);
    } else {
      const diam = ref.mode === "diam" ? ref.diam : STD_DIAM;
      if (!isFinite(diam) || diam <= 0) return null;
      const cmPerPx = diam / Math.abs(pts.tr.x - pts.tl.x);
      ml = water * cmPerPx ** 3; // 1 cm³ = 1 ml
      fullMl = full * cmPerPx ** 3;
    }
    return { ml, fullMl, pct: (water / full) * 100 };
  }

  /* ---------- Résultat, avec correction possible ---------- */
  const capOptions = [15, 20, 25, 33, 40, 50];
  function showResult() {
    const r = Math.max(img.w, img.h) * 0.018;
    const custom = !capOptions.includes(ref.cap);
    $("glassBody").innerHTML = `
      <div style="display:grid;gap:14px">
        <div class="glass-result">
          <div><div class="v" id="glassVol">—</div><span class="note" id="glassFill"></span></div>
          <span class="tag" id="glassConf"></span>
        </div>
        <div class="glass-stage locked" id="glassStage">
          <svg id="glassSvg" viewBox="0 0 ${img.w} ${img.h}" role="img" aria-label="Photo du verre avec le niveau d'eau détecté">
            <image href="${img.src}" width="${img.w}" height="${img.h}"/>
            <path id="gWaterFill" fill="#3b82f6" fill-opacity="0.28"/>
            <path id="gOutline" fill="none" stroke="#ffffff" stroke-width="${r * 0.35}" stroke-opacity="0.9"/>
            <path id="gOutline2" fill="none" stroke="#0d6b62" stroke-width="${r * 0.18}"/>
            <line id="gWater" stroke="#3b82f6" stroke-width="${r * 0.3}"/>
            ${["tl", "tr", "bl", "br", "water"].map((k) => `<g class="h" data-h="${k}"><circle r="${r * 2.4}" fill="transparent"/><circle r="${r}" fill="${k === "water" ? "#3b82f6" : "#0d6b62"}" stroke="#ffffff" stroke-width="${r * 0.3}"/></g>`).join("")}
          </svg>
        </div>
        <p class="note" id="glassHint" style="margin:0" hidden>Faites glisser les points <b>sur les bords intérieurs</b> du verre (haut et fond), puis la ligne bleue <b>sur la surface de l'eau</b>.</p>
        <div class="glass-refline" id="glassRefLine"><span id="glassRefTxt"></span><button type="button" class="ghost" id="glassRefEdit">Changer de verre</button></div>
        <div class="glass-ref" id="glassRef" hidden>
          <label class="opt"><input type="radio" name="glassRef" value="std"> Je ne sais pas : verre standard (environ 7,5 cm de large)</label>
          <label class="opt"><input type="radio" name="glassRef" value="diam"> Largeur du haut, mesurée à la règle :
            <input id="glassDiam" type="number" min="2" max="30" step="0.1" aria-label="Largeur en cm"> cm
          </label>
          <label class="opt"><input type="radio" name="glassRef" value="cap"> Contenance du verre plein :
            <select id="glassCapSel">${capOptions.map((c) => `<option value="${c}">${c} cl</option>`).join("")}<option value="">Autre…</option></select>
            <input id="glassCap" type="number" min="1" max="200" step="1" aria-label="Contenance en cl" hidden>
          </label>
          <p class="note" style="margin:0">Le verre standard donne une idée du volume. Pour un résultat plus juste, mesurez une fois la largeur du haut de votre verre avec une règle : l'appli s'en souviendra.</p>
        </div>
        <div class="glass-actions">
          <button type="button" id="glassAdd">Ajouter à l'eau bue</button>
          <button type="button" class="ghost" id="glassFix">Corriger les repères</button>
          <button type="button" class="ghost" id="glassAgain">Autre photo</button>
        </div>
        <p class="note" style="margin:0">Estimation à ±15 % environ : la perspective, l'épaisseur du verre et un fond bombé faussent un peu la mesure.</p>
      </div>`;

    // Verre de référence : replié, on le change avec « Changer de verre »
    const capSel = $("glassCapSel"), cap = $("glassCap"), diam = $("glassDiam");
    bg.querySelector(`[name=glassRef][value=${ref.mode}]`).checked = true;
    capSel.value = custom ? "" : String(ref.cap);
    cap.value = ref.cap; cap.hidden = !custom;
    diam.value = ref.diam;
    const showRef = (on) => { $("glassRef").hidden = !on; $("glassRefLine").hidden = on; };
    showRef(false);
    $("glassRefTxt").textContent = refText();
    $("glassRefEdit").addEventListener("click", () => showRef(true));
    const readRef = () => {
      ref.mode = bg.querySelector("[name=glassRef]:checked").value;
      const c = parseFloat(capSel.value || cap.value), dm = parseFloat(diam.value);
      if (isFinite(c) && c > 0) ref.cap = c;
      if (isFinite(dm) && dm > 0) ref.diam = dm;
      $("glassRefTxt").textContent = refText();
      draw();
    };
    capSel.addEventListener("change", () => {
      cap.hidden = capSel.value !== "";
      if (capSel.value) cap.value = capSel.value; else cap.focus();
      bg.querySelector("[value=cap]").checked = true;
      readRef();
    });
    diam.addEventListener("focus", () => { bg.querySelector("[value=diam]").checked = true; readRef(); });
    $("glassRef").addEventListener("input", readRef);

    // Repères : verrouillés, sauf si on choisit de les corriger
    const svg = $("glassSvg");
    const toSvg = (ev) => {
      const p = svg.createSVGPoint();
      p.x = ev.clientX; p.y = ev.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    };
    svg.addEventListener("pointerdown", (ev) => {
      const h = ev.target.closest("[data-h]");
      if (!h || !editing) return;
      drag = h.dataset.h;
      svg.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    svg.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      const p = toSvg(ev);
      const x = Math.max(0, Math.min(img.w, p.x)), y = Math.max(0, Math.min(img.h, p.y));
      if (drag === "water") pts.water = y;
      else {
        pts[drag].x = x;
        // Les deux points du haut restent à la même hauteur, de même pour le fond.
        const pair = drag[0] === "t" ? ["tl", "tr"] : ["bl", "br"];
        const other = drag[0] === "t" ? pts.bl.y : pts.tl.y;
        const yy = drag[0] === "t" ? Math.min(y, other - 10) : Math.max(y, other + 10);
        pair.forEach((k) => { pts[k].y = yy; });
      }
      draw();
    });
    const stop = () => { drag = null; };
    svg.addEventListener("pointerup", stop);
    svg.addEventListener("pointercancel", stop);

    $("glassFix").addEventListener("click", () => {
      editing = !editing;
      $("glassStage").classList.toggle("locked", !editing);
      $("glassHint").hidden = !editing;
      $("glassFix").textContent = editing ? "Terminer la correction" : "Corriger les repères";
      draw();
    });
    $("glassAgain").addEventListener("click", askPhoto);
    $("glassAdd").addEventListener("click", () => {
      const m = measure();
      if (!m) { $("glassErr").textContent = "Indiquez la contenance du verre ou son diamètre."; showRef(true); return; }
      const ml = Math.round(m.ml / 10) * 10;
      if (ml <= 0) { $("glassErr").textContent = "Le verre semble vide : corrigez la ligne bleue sur la surface de l'eau."; return; }
      if (creating || book.example) { $("glassErr").textContent = "Enregistrez d'abord votre profil pour compter l'eau bue."; return; }
      saveRef();
      close();
      addWater(ml);
      $("waterErr").textContent ||= `${fmt(ml / 10, 0)} cl ajoutés d'après la photo.`;
    });
    draw();
  }

  function draw() {
    if (!bg || !pts) return;
    const { tl, tr, bl, br } = pts;
    // Bords du verre interpolés à la hauteur de l'eau
    pts.water = Math.max(tl.y, Math.min(bl.y, pts.water));
    const t = (pts.water - tl.y) / (bl.y - tl.y);
    const wl = tl.x + (bl.x - tl.x) * t, wr = tr.x + (br.x - tr.x) * t;
    const outline = `M${tl.x} ${tl.y} L${bl.x} ${bl.y} L${br.x} ${br.y} L${tr.x} ${tr.y} Z`;
    $("gOutline").setAttribute("d", outline);
    $("gOutline2").setAttribute("d", outline);
    $("gWaterFill").setAttribute("d", `M${wl} ${pts.water} L${bl.x} ${bl.y} L${br.x} ${br.y} L${wr} ${pts.water} Z`);
    const wline = $("gWater");
    wline.setAttribute("x1", wl); wline.setAttribute("x2", wr);
    wline.setAttribute("y1", pts.water); wline.setAttribute("y2", pts.water);
    const pos = { tl, tr, bl, br, water: { x: (wl + wr) / 2, y: pts.water } };
    $("glassSvg").querySelectorAll("[data-h]").forEach((h) => {
      const p = pos[h.dataset.h];
      h.setAttribute("transform", `translate(${p.x} ${p.y})`);
    });

    const m = measure();
    $("glassVol").innerHTML = m ? `${fmt(m.ml / 10, 0)}<small>cl</small>` : "—";
    $("glassFill").textContent = m ? `Rempli à ${fmt(m.pct, 0)} %, verre plein : ${ref.mode === "std" ? "environ " : ""}${fmt(m.fullMl / 10, 0)} cl` : "";
    $("glassAdd").textContent = m ? `Ajouter ${fmt(Math.round(m.ml / 10), 0)} cl à l'eau bue` : "Ajouter à l'eau bue";
    const tag = $("glassConf");
    if (editing) { tag.className = "tag good"; tag.textContent = "Corrigé à la main"; }
    else if (found.empty) { tag.className = "tag warn"; tag.textContent = "Niveau introuvable : vérifiez"; }
    else if (found.conf >= 0.6) { tag.className = "tag good"; tag.textContent = "Mesure fiable"; }
    else { tag.className = "tag warn"; tag.textContent = "À vérifier sur la photo"; }
  }
})();
