// Mesure d'un verre en photo : on repère les bords du verre et le niveau de l'eau, puis on calcule le volume.
// Le verre est vu comme un tronc de cône (haut et fond de largeurs différentes).
// S'appuie sur les variables globales de index.html (addWater, fmt…) et sur les styles .sheet de details.js.
(function () {
  const css = document.createElement("style");
  css.textContent = `
.glass-open { display: flex; align-items: center; justify-content: center; gap: 8px; }
.glass-stage { position: relative; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; touch-action: none; }
.glass-stage svg { display: block; width: 100%; height: auto; max-height: 55vh; }
.glass-stage .h { cursor: grab; }
.glass-pick { display: grid; place-items: center; gap: 10px; text-align: center; padding: 28px 16px; border: 2px dashed var(--line); border-radius: 12px; color: var(--muted); }
.glass-ref { display: grid; gap: 8px; }
.glass-ref .opt { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 0.92rem; color: var(--ink); }
.glass-ref .opt input[type="radio"] { width: auto; }
.glass-ref .opt select, .glass-ref .opt input[type="number"] { width: 110px; }
.glass-result { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 16px; }
.glass-result .v { font-family: var(--f-data); font-size: 2rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.glass-result .v small { font-size: 0.9rem; color: var(--muted); font-weight: 400; margin-left: 4px; }
.glass-actions { display: flex; flex-wrap: wrap; gap: 8px; }
`;
  document.head.appendChild(css);

  // Bouton dans le bloc « Eau bue aujourd'hui »
  const open = document.createElement("button");
  open.type = "button";
  open.className = "ghost glass-open";
  open.textContent = "📷 Mesurer un verre en photo";
  $("waterBtns").after(open);

  const MAX_SIDE = 1200; // la photo est réduite : plus rapide et suffisant pour la mesure
  let bg = null, img = null, pts = null, drag = null;

  /* ---------- Fenêtre ---------- */
  function close() {
    if (!bg) return;
    bg.remove(); bg = null; img = null; pts = null;
    document.removeEventListener("keydown", onKey);
    open.focus();
  }
  const onKey = (ev) => { if (ev.key === "Escape") close(); };

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
          <label class="glass-pick">
            <span>Photographiez le verre <b>de profil</b>, l'appareil à la hauteur de l'eau, devant un fond uni.</span>
            <span class="pill">Prendre ou choisir une photo</span>
            <input type="file" accept="image/*" capture="environment" id="glassFile" hidden>
          </label>
        </div>
        <p class="err" id="glassErr"></p>
      </div>`;
    document.body.appendChild(bg);
    bg.addEventListener("click", (ev) => { if (ev.target === bg) close(); });
    bg.querySelector(".close").addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    bg.querySelector("#glassFile").addEventListener("change", (ev) => { if (ev.target.files[0]) loadPhoto(ev.target.files[0]); });
    bg.querySelector(".close").focus();
  });

  function loadPhoto(file) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
      const cv = document.createElement("canvas");
      cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
      cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      img = { w: cv.width, h: cv.height, src: cv.toDataURL("image/jpeg", 0.85) };
      pts = detect(cv);
      showEditor();
    };
    im.onerror = () => { URL.revokeObjectURL(url); $("glassErr").textContent = "Impossible de lire cette image. Essayez une photo JPEG ou PNG."; };
    im.src = url;
  }

  /* ---------- Détection automatique (point de départ, à ajuster) ---------- */
  function detect(src) {
    const w = 200, h = Math.max(20, Math.round((src.height / src.width) * w));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const at = (x, y) => g[y * w + x];
    const dx = (x, y) => Math.abs(at(x + 1, y) - at(x - 1, y));
    const dy = (x, y) => Math.abs(at(x, y + 1) - at(x, y - 1));
    const smooth = (a) => a.map((_, i) => ((a[i - 1] ?? a[i]) + a[i] + (a[i + 1] ?? a[i])) / 3);
    const argmax = (a, from, to) => { let best = from; for (let i = from; i < to; i++) if (a[i] > a[best]) best = i; return best; };

    // Bords du verre : les colonnes aux contrastes verticaux les plus forts, une de chaque côté du centre.
    const col = new Array(w).fill(0);
    for (let x = 1; x < w - 1; x++) for (let y = Math.round(h * 0.1); y < h * 0.9; y++) col[x] += dx(x, y);
    const cs = smooth(col);
    const xl = argmax(cs, Math.round(w * 0.04), Math.round(w * 0.48));
    const xr = argmax(cs, Math.round(w * 0.52), Math.round(w * 0.96));

    // Hauteur du verre : les lignes où ces bords sont bien visibles. On cherche le bord autour de chaque
    // colonne, assez large pour suivre un verre qui s'évase vers le haut.
    const reach = Math.round(w * 0.06);
    const edgeNear = (x0, y) => {
      let best = x0, v = -1;
      for (let x = Math.max(1, x0 - reach); x <= Math.min(w - 2, x0 + reach); x++) if (dx(x, y) > v) { v = dx(x, y); best = x; }
      return [best, v];
    };
    const side = new Array(h).fill(0);
    for (let y = 1; y < h - 1; y++) side[y] = Math.min(edgeNear(xl, y)[1], edgeNear(xr, y)[1]);
    const ss = smooth(side), thr = Math.max(...ss) * 0.35;
    let yt = ss.findIndex((v) => v > thr), yb = h - 1 - [...ss].reverse().findIndex((v) => v > thr);
    if (yt < 0 || yb - yt < h * 0.15) { yt = Math.round(h * 0.25); yb = Math.round(h * 0.8); }
    // Position des bords en haut et au fond (moyenne sur quelques lignes)
    const edgeAt = (x0, y0, dir) => {
      const xs = [];
      for (let i = 0; i < 4; i++) { const y = Math.min(h - 2, Math.max(1, y0 + dir * i)); xs.push(edgeNear(x0, y)[0]); }
      return xs.reduce((a, b) => a + b) / xs.length;
    };
    const xtl = edgeAt(xl, yt, 1), xtr = edgeAt(xr, yt, 1), xbl = edgeAt(xl, yb, -1), xbr = edgeAt(xr, yb, -1);

    // Niveau de l'eau : la ligne horizontale la plus marquée à l'intérieur du verre.
    const row = new Array(h).fill(0);
    const a = Math.min(xl, xr) + 3, b = Math.max(xl, xr) - 3;
    for (let y = yt + 1; y < yb - 1; y++) {
      for (let x = a; x < b; x++) row[y] += dy(x, y);
      row[y] /= Math.max(1, b - a);
    }
    const span = yb - yt;
    const yw = argmax(smooth(row), Math.round(yt + span * 0.08), Math.max(Math.round(yt + span * 0.08) + 1, Math.round(yb - span * 0.06)));

    const s = src.width / w;
    return {
      tl: { x: xtl * s, y: yt * s }, tr: { x: xtr * s, y: yt * s },
      bl: { x: xbl * s, y: yb * s }, br: { x: xbr * s, y: yb * s },
      water: yw * s,
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
    const mode = bg.querySelector("[name=glassRef]:checked").value;
    let ml, fullMl;
    if (mode === "cap") {
      fullMl = parseFloat(bg.querySelector("#glassCap").value) * 10;
      if (!isFinite(fullMl) || fullMl <= 0) return null;
      ml = fullMl * (water / full);
    } else {
      const dCm = parseFloat(bg.querySelector("#glassDiam").value);
      if (!isFinite(dCm) || dCm <= 0) return null;
      const cmPerPx = dCm / Math.abs(pts.tr.x - pts.tl.x);
      ml = water * cmPerPx ** 3; // 1 cm³ = 1 ml
      fullMl = full * cmPerPx ** 3;
    }
    return { ml, fullMl, pct: (water / full) * 100 };
  }

  /* ---------- Éditeur : poignées à glisser sur la photo ---------- */
  function showEditor() {
    const r = Math.max(img.w, img.h) * 0.018;
    $("glassErr").textContent = "";
    $("glassBody").innerHTML = `
      <div style="display:grid;gap:14px">
        <p class="note" style="margin:0">Positions proposées automatiquement. Faites glisser les points <b>sur les bords intérieurs</b> du verre (haut et fond), puis la ligne bleue <b>sur la surface de l'eau</b>.</p>
        <div class="glass-stage">
          <svg id="glassSvg" viewBox="0 0 ${img.w} ${img.h}" role="img" aria-label="Photo du verre avec les repères de mesure">
            <image href="${img.src}" width="${img.w}" height="${img.h}"/>
            <path id="gWaterFill" fill="#3b82f6" fill-opacity="0.28"/>
            <path id="gOutline" fill="none" stroke="#ffffff" stroke-width="${r * 0.35}" stroke-opacity="0.9"/>
            <path id="gOutline2" fill="none" stroke="#0d6b62" stroke-width="${r * 0.18}"/>
            <line id="gWater" stroke="#3b82f6" stroke-width="${r * 0.3}"/>
            ${["tl", "tr", "bl", "br", "water"].map((k) => `<g class="h" data-h="${k}"><circle r="${r * 2.4}" fill="transparent"/><circle r="${r}" fill="${k === "water" ? "#3b82f6" : "#0d6b62"}" stroke="#ffffff" stroke-width="${r * 0.3}"/></g>`).join("")}
          </svg>
        </div>
        <div class="glass-ref">
          <label class="opt"><input type="radio" name="glassRef" value="cap" checked> Contenance du verre plein :
            <select id="glassCapSel"><option value="15">15 cl</option><option value="20">20 cl</option><option value="25" selected>25 cl</option><option value="33">33 cl</option><option value="40">40 cl</option><option value="50">50 cl</option><option value="">Autre…</option></select>
            <input id="glassCap" type="number" min="1" max="200" step="1" value="25" aria-label="Contenance en cl" hidden>
          </label>
          <label class="opt"><input type="radio" name="glassRef" value="diam"> Je connais le diamètre intérieur du haut :
            <input id="glassDiam" type="number" min="2" max="30" step="0.1" value="7" aria-label="Diamètre en cm"> cm
          </label>
        </div>
        <div class="glass-result">
          <div><span class="k" style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);font-weight:700">Eau dans le verre</span>
            <div class="v" id="glassVol">—</div>
            <span class="note" id="glassFill"></span></div>
          <div class="glass-actions">
            <label class="pill" style="cursor:pointer;align-self:center">Autre photo<input type="file" accept="image/*" capture="environment" id="glassFile2" hidden></label>
            <button type="button" id="glassAdd">Ajouter à l'eau bue</button>
          </div>
        </div>
        <p class="note" style="margin:0">Estimation à ±15 % environ : la perspective, l'épaisseur du verre et un fond bombé faussent un peu la mesure.</p>
      </div>`;

    const svg = $("glassSvg");
    const toSvg = (ev) => {
      const p = svg.createSVGPoint();
      p.x = ev.clientX; p.y = ev.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    };
    svg.addEventListener("pointerdown", (ev) => {
      const h = ev.target.closest("[data-h]");
      if (!h) return;
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

    const capSel = bg.querySelector("#glassCapSel"), cap = bg.querySelector("#glassCap");
    capSel.addEventListener("change", () => {
      cap.hidden = capSel.value !== "";
      if (capSel.value) cap.value = capSel.value; else cap.focus();
      bg.querySelector("[value=cap]").checked = true;
      draw();
    });
    bg.querySelector("#glassDiam").addEventListener("focus", () => { bg.querySelector("[value=diam]").checked = true; draw(); });
    bg.querySelector(".glass-ref").addEventListener("input", draw);
    bg.querySelector("#glassFile2").addEventListener("change", (ev) => { if (ev.target.files[0]) loadPhoto(ev.target.files[0]); });
    bg.querySelector("#glassAdd").addEventListener("click", () => {
      const m = measure();
      if (!m) { $("glassErr").textContent = "Indiquez la contenance du verre ou son diamètre."; return; }
      const ml = Math.round(m.ml / 10) * 10;
      if (ml <= 0) { $("glassErr").textContent = "Le verre semble vide : placez la ligne bleue sur la surface de l'eau."; return; }
      if (creating || book.example) { $("glassErr").textContent = "Enregistrez d'abord votre profil pour compter l'eau bue."; return; }
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
    $("glassFill").textContent = m ? `Rempli à ${fmt(m.pct, 0)} %, verre plein : ${fmt(m.fullMl / 10, 0)} cl` : "";
  }
})();
