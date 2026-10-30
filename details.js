// Fiches détaillées : chaque case de statistique s'ouvre sur le calcul, son sens et des conseils.
// S'appuie sur les variables globales de index.html (state, calc, render, fmt…).
(function () {
  const css = document.createElement("style");
  css.textContent = `
.stats .stat { cursor: pointer; transition: border-color .15s, transform .15s; position: relative; }
.stats .stat:hover { border-color: var(--accent); }
.stats .stat:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.stats .stat .more { font-size: 0.75rem; color: var(--accent); font-weight: 700; margin-top: 6px; }
.sheet-bg { position: fixed; inset: 0; z-index: 50; background: color-mix(in srgb, var(--ink) 45%, transparent); display: flex; align-items: center; justify-content: center;
  padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)); }
.sheet { background: var(--surface); color: var(--ink); border-radius: 16px; width: min(640px, 100%); max-height: 100%; overflow: auto; padding: 20px; display: grid; gap: 16px; box-shadow: 0 20px 50px color-mix(in srgb, var(--ink) 30%, transparent); overscroll-behavior: contain; }
@media (max-width: 600px) { .sheet-bg { align-items: flex-end; padding-bottom: 0; } .sheet { border-radius: 16px 16px 0 0; max-height: 90%; padding-bottom: max(20px, env(safe-area-inset-bottom, 0px)); } }
.sheet-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.sheet-head .k { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); font-weight: 700; }
.sheet-head .v { font-family: var(--f-data); font-size: 2rem; font-weight: 600; line-height: 1.1; }
.sheet-head .v small { font-size: 0.9rem; color: var(--muted); font-weight: 400; margin-left: 4px; }
.sheet h3 { font-family: var(--f-display); font-size: 1rem; margin: 0 0 6px; }
.sheet p, .sheet li { margin: 0; font-size: 0.92rem; line-height: 1.55; }
.sheet ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
.sheet section { display: grid; gap: 6px; }
.formula { background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; font-family: var(--f-data); font-size: 0.85rem; line-height: 1.7; overflow-x: auto; }
.formula b { color: var(--accent); }
.tbl { overflow-x: auto; }
.tbl table { min-width: 100%; }
.tbl th, .tbl td { padding: 6px 8px; font-size: 0.85rem; white-space: nowrap; }
.tbl th { white-space: normal; letter-spacing: 0.03em; vertical-align: bottom; }
.tbl td { white-space: normal; }
.tbl td.n { white-space: nowrap; }
.tbl td small { display: block; color: var(--muted); font-size: 0.75rem; }
.tbl tr.me td { background: var(--accent-soft); font-weight: 700; }
.tbl td.n { font-family: var(--f-data); text-align: right; }
.tbl th.n { text-align: right; }
.note { font-size: 0.8rem !important; color: var(--muted); }
.sheet .close { background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 999px; width: 36px; height: 36px; padding: 0; font-weight: 400; flex: none; }
`;
  document.head.appendChild(css);

  const r1 = (n) => fmt(n, 1), r0 = (n) => fmt(n, 0);
  const table = (head, rows, meIndex, numCols) => `<div class="tbl"><table><thead><tr>${head.map((h, i) => `<th class="${numCols.includes(i) ? "n" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r, ri) => `<tr class="${ri === meIndex ? "me" : ""}">${r.map((c, i) => `<td class="${numCols.includes(i) ? "n" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

  // Activités : dépense = MET × poids (kg) × durée (h).
  const ACTIVITIES = [
    ["Marche tranquille (4 km/h)", 3], ["Marche rapide (6 km/h)", 4.3], ["Vélo loisir (16 km/h)", 6], ["Natation modérée", 6],
    ["Musculation", 5], ["Danse, zumba", 5.5], ["Football, basket", 7.5], ["Course à pied (8 km/h)", 8.3],
    ["Course à pied (10 km/h)", 9.8], ["Corde à sauter", 11], ["Ménage, jardinage", 3.5], ["Monter des escaliers", 8],
  ];
  // Protéines : g pour 100 g, portion type (g), protéines et kcal de la portion (valeurs moyennes indicatives).
  const FOODS = [
    ["Blanc de poulet cuit", 31, "120 g", 37, 200], ["Thon au naturel", 26, "1 boîte, 100 g", 26, 115], ["Steak haché 5 % cuit", 26, "100 g", 26, 170],
    ["Saumon cuit", 25, "120 g", 30, 250], ["Œufs", 13, "2 œufs", 13, 145], ["Skyr nature", 10, "150 g", 15, 90],
    ["Fromage blanc 0 %", 8, "200 g", 16, 100], ["Tofu ferme", 15, "125 g", 19, 180], ["Lentilles cuites", 9, "200 g", 18, 230],
    ["Pois chiches cuits", 9, "150 g", 13, 245], ["Emmental", 28, "30 g", 8, 115], ["Amandes", 21, "30 g", 6, 175],
    ["Lait demi-écrémé", 3.3, "1 verre, 250 ml", 8, 115], ["Pain complet", 9, "2 tranches, 50 g", 5, 125],
  ];

  function lastWeights(c, n) { return c.entries.slice(-n).reverse(); }

  /* ---------- Contenu de chaque fiche ---------- */
  const SHEETS = [
    // 0. Poids actuel
    (c, p) => {
      const es = c.entries, ws = es.map((e) => e.w);
      const last7 = es.slice(-7), avg = last7.length ? last7.reduce((a, e) => a + e.w, 0) / last7.length : c.w;
      return {
        k: "Poids actuel", v: r1(c.w), u: "kg",
        body: `
        <section><h3>Votre évolution</h3>
          ${es.length > 1 ? `<p>Depuis votre première pesée (${fmtDate(es[0].d)}) : <b>${c.w - c.start > 0 ? "+" : ""}${r1(c.w - c.start)} kg</b>. Plus bas : ${r1(Math.min(...ws))} kg, plus haut : ${r1(Math.max(...ws))} kg. Moyenne des ${last7.length} dernières pesées : ${r1(avg)} kg.</p>` : `<p>C'est votre première mesure. Ajoutez des pesées pour suivre votre évolution.</p>`}
          ${es.length ? table(["Date", "Poids", "Écart"], lastWeights(c, 5).map((e) => { const i = es.indexOf(e); const d = i ? e.w - es[i - 1].w : null; return [fmtDate(e.d), r1(e.w) + " kg", d == null ? "—" : (d > 0 ? "+" : "") + r1(d)]; }), -1, [1, 2]) : ""}
        </section>
        <section><h3>Bien se peser</h3><ul>
          <li>Toujours la même balance, posée sur un sol dur.</li>
          <li>Le matin, à jeun, après être passé aux toilettes, en sous-vêtements.</li>
          <li>2 à 3 fois par semaine suffit : regardez la tendance, pas une seule pesée.</li>
          <li>Des écarts de 0,5 à 1 kg d'un jour à l'autre sont normaux (eau, sel, repas de la veille).</li>
        </ul></section>`,
      };
    },
    // 1. IMC
    (c, p) => {
      const hm = p.height / 100;
      const cats = [["Moins de 18,5", "Insuffisance pondérale"], ["18,5 à 24,9", "Corpulence normale"], ["25 à 29,9", "Surpoids"], ["30 à 34,9", "Obésité modérée"], ["35 à 39,9", "Obésité sévère"], ["40 et plus", "Obésité morbide"]];
      const me = c.bmi < 18.5 ? 0 : c.bmi < 25 ? 1 : c.bmi < 30 ? 2 : c.bmi < 35 ? 3 : c.bmi < 40 ? 4 : 5;
      const goalBmi = p.goal / (hm * hm);
      return {
        k: "Indice de masse corporelle", v: r1(c.bmi), u: "",
        body: `
        <section><h3>Le calcul</h3>
          <div class="formula">IMC = poids ÷ (taille × taille)<br>= ${r1(c.w)} ÷ (${fmt(hm, 2)} × ${fmt(hm, 2)})<br>= ${r1(c.w)} ÷ ${fmt(hm * hm, 2)} = <b>${r1(c.bmi)}</b></div>
        </section>
        <section><h3>Les catégories de l'OMS</h3>${table(["IMC", "Catégorie"], cats, me, [])}</section>
        <section><h3>Votre objectif</h3><p>À ${r1(p.goal)} kg, votre IMC serait de <b>${r1(goalBmi)}</b> (${cats[goalBmi < 18.5 ? 0 : goalBmi < 25 ? 1 : goalBmi < 30 ? 2 : goalBmi < 35 ? 3 : goalBmi < 40 ? 4 : 5][1].toLowerCase()}).</p></section>
        <section><h3>Ses limites</h3><ul>
          <li>L'IMC ne distingue pas le muscle de la graisse : une personne très musclée peut être « en surpoids » sans excès de graisse.</li>
          <li>Il ne dit pas où se trouve la graisse. Le tour de taille complète bien : au-delà de 94 cm (homme) ou 80 cm (femme), le risque augmente.</li>
          <li>Il ne s'applique pas tel quel aux moins de 18 ans ni aux femmes enceintes.</li>
        </ul></section>`,
      };
    },
    // 2. Poids santé
    (c, p) => {
      const hm = p.height / 100, h2 = hm * hm;
      const gap = c.w > c.idealMax ? `Vous êtes <b>${r1(c.w - c.idealMax)} kg</b> au-dessus de la limite haute.` : c.w < c.idealMin ? `Vous êtes <b>${r1(c.idealMin - c.w)} kg</b> en dessous de la limite basse.` : `Votre poids est <b>dans la zone</b>.`;
      return {
        k: "Poids santé", v: `${r0(c.idealMin)}–${r0(c.idealMax)}`, u: "kg",
        body: `
        <section><h3>Le calcul</h3>
          <div class="formula">Bas  = 18,5 × ${fmt(hm, 2)}² = 18,5 × ${fmt(h2, 2)} = <b>${r1(c.idealMin)} kg</b><br>Haut = 24,9 × ${fmt(hm, 2)}² = 24,9 × ${fmt(h2, 2)} = <b>${r1(c.idealMax)} kg</b></div>
          <p>C'est la plage de poids qui correspond à un IMC « normal » pour votre taille (${p.height} cm).</p>
        </section>
        <section><h3>Où vous en êtes</h3><p>${gap} Votre objectif de ${r1(p.goal)} kg est ${p.goal > c.idealMax ? "au-dessus de la zone : c'est une bonne étape intermédiaire." : p.goal < c.idealMin ? "<b>sous la zone santé</b> : parlez-en à un médecin avant de viser si bas." : "dans la zone santé."}</p></section>
        <section><h3>Conseils</h3><ul>
          <li>Pas besoin de viser le bas de la plage : se stabiliser n'importe où dedans est bénéfique.</li>
          <li>Perdre 5 à 10 % de son poids améliore déjà la tension, la glycémie et le cholestérol.</li>
        </ul></section>`,
      };
    },
    // 3. Masse grasse
    (c, p) => {
      const male = p.sex === "h", fat = Math.max(3, c.fat);
      const rows = male ? [["Essentielle", "2 à 5 %"], ["Athlète", "6 à 13 %"], ["Bonne forme", "14 à 17 %"], ["Moyenne", "18 à 24 %"], ["Élevée", "25 % et plus"]]
        : [["Essentielle", "10 à 13 %"], ["Athlète", "14 à 20 %"], ["Bonne forme", "21 à 24 %"], ["Moyenne", "25 à 31 %"], ["Élevée", "32 % et plus"]];
      const lims = male ? [6, 14, 18, 25] : [14, 21, 25, 32];
      const me = fat < lims[0] ? 0 : fat < lims[1] ? 1 : fat < lims[2] ? 2 : fat < lims[3] ? 3 : 4;
      return {
        k: "Masse grasse estimée", v: r1(fat), u: "%",
        body: `
        <section><h3>Le calcul (formule de Deurenberg)</h3>
          <div class="formula">% = 1,2 × IMC + 0,23 × âge − 10,8 × sexe − 5,4<br>(sexe = 1 pour un homme, 0 pour une femme)<br>= 1,2 × ${r1(c.bmi)} + 0,23 × ${p.age} − 10,8 × ${male ? 1 : 0} − 5,4<br>= <b>${r1(fat)} %</b></div>
          <p>Environ <b>${r1(c.w * fat / 100)} kg</b> de graisse et ${r1(c.w * (1 - fat / 100))} kg de masse maigre (muscles, os, eau, organes).</p>
        </section>
        <section><h3>Repères (${male ? "hommes" : "femmes"})</h3>${table(["Niveau", "Masse grasse"], rows, me, [])}</section>
        <section><h3>À savoir</h3><ul>
          <li>C'est une estimation à partir de l'IMC : l'erreur peut atteindre ± 4 points. Une balance à impédance ou un mètre ruban donnent un suivi complémentaire.</li>
          <li>Pour perdre de la graisse sans perdre de muscle : assez de protéines et 2 séances de renforcement par semaine.</li>
        </ul></section>`,
      };
    },
    // 4. Métabolisme de base
    (c, p) => {
      const male = p.sex === "h";
      return {
        k: "Métabolisme de base", v: r0(c.bmr), u: "kcal / jour",
        body: `
        <section><h3>Le calcul (formule de Mifflin-St Jeor)</h3>
          <div class="formula">${male ? "Homme" : "Femme"} = 10 × poids + 6,25 × taille − 5 × âge ${male ? "+ 5" : "− 161"}<br>= 10 × ${r1(c.w)} + 6,25 × ${p.height} − 5 × ${p.age} ${male ? "+ 5" : "− 161"}<br>= ${r0(10 * c.w)} + ${r0(6.25 * p.height)} − ${5 * p.age} ${male ? "+ 5" : "− 161"} = <b>${r0(c.bmr)} kcal</b></div>
        </section>
        <section><h3>Ce que ça veut dire</h3><p>C'est l'énergie que votre corps brûle au repos complet en 24 h : respirer, faire battre le cœur, garder sa température, faire fonctionner le cerveau. Elle représente 60 à 70 % de ce que vous dépensez chaque jour.</p></section>
        <section><h3>Conseils</h3><ul>
          <li>Ne descendez pas durablement sous ce nombre de calories : le corps se met en économie et la fatigue augmente.</li>
          <li>Le muscle consomme plus d'énergie que la graisse : le renforcement musculaire aide à garder un métabolisme élevé.</li>
          <li>Il baisse quand on perd du poids : les calculs se mettent à jour à chaque pesée.</li>
        </ul></section>`,
      };
    },
    // 5. Dépense journalière
    (c, p) => {
      const levels = [["Sédentaire", "1,2"], ["Légère (1 à 3 séances/sem.)", "1,375"], ["Modérée (3 à 5)", "1,55"], ["Élevée (6 à 7)", "1,725"], ["Très élevée", "1,9"]];
      const me = [1.2, 1.375, 1.55, 1.725, 1.9].indexOf(Number(p.activity));
      const acts = ACTIVITIES.map(([n, met]) => [n, r0(met * c.w * 0.5) + " kcal", r0(300 / (met * c.w) * 60) + " min"]);
      return {
        k: "Dépense journalière", v: r0(c.tdee), u: "kcal / jour",
        body: `
        <section><h3>Le calcul</h3>
          <div class="formula">Dépense = métabolisme de base × niveau d'activité<br>= ${r0(c.bmr)} × ${fmt(p.activity, 3).replace(/0+$/, "")} = <b>${r0(c.tdee)} kcal</b></div>
          ${table(["Niveau d'activité", "Coefficient"], levels, me, [1])}
        </section>
        <section><h3>Ce que ça veut dire</h3><p>${c.losing ? `Manger environ <b>${r0(c.tdee - 500)} kcal</b> par jour (500 de moins) fait perdre environ 0,5 kg par semaine.` : p.goal > c.w ? `Manger environ <b>${r0(c.tdee + 300)} kcal</b> par jour (300 de plus) fait prendre environ 0,25 kg par semaine.` : `Manger environ ${r0(c.tdee)} kcal par jour vous maintient à votre poids.`}</p></section>
        <section><h3>Activités conseillées (calculées pour ${r1(c.w)} kg)</h3>
          ${table(["Activité", "En 30 min", "Pour 300 kcal"], acts, -1, [1, 2])}
          <p class="note">Calcul : MET de l'activité × poids × durée. Valeurs moyennes, elles varient selon l'intensité.</p>
        </section>
        <section><h3>Repères de l'OMS</h3><ul>
          <li>150 à 300 min par semaine d'activité modérée (marche rapide, vélo…), soit 30 min 5 jours sur 7.</li>
          <li>2 séances de renforcement musculaire par semaine.</li>
          <li>Bouger dans la journée compte aussi : escaliers, trajets à pied, 7 000 à 10 000 pas.</li>
        </ul></section>`,
      };
    },
    // 6. Eau
    (c, p) => {
      const glasses = Math.round(c.water / 0.25);
      return {
        k: "Eau conseillée", v: r1(c.water), u: "L / jour",
        body: `
        <section><h3>Le calcul</h3>
          <div class="formula">Eau = poids × 35 ml<br>= ${r1(c.w)} × 35 = ${r0(c.w * 35)} ml = <b>${r1(c.water)} L</b>, soit environ <b>${glasses} verres</b> de 25 cl</div>
        </section>
        <section><h3>À ajouter</h3><ul>
          <li>+ 0,5 à 1 L par heure de sport.</li>
          <li>Davantage quand il fait chaud ou en cas de fièvre.</li>
        </ul></section>
        <section><h3>Conseils</h3><ul>
          <li>Un grand verre d'eau avant chaque repas aide à se sentir rassasié plus vite.</li>
          <li>Gardez une bouteille à portée de main : on boit plus quand l'eau est visible.</li>
          <li>Thé, café et tisanes sans sucre comptent. Les sodas et jus, eux, apportent beaucoup de sucre.</li>
          <li>Fruits et légumes (concombre, pastèque, tomate…) apportent aussi de l'eau.</li>
          <li>Une urine claire est un bon signe d'hydratation.</li>
        </ul></section>`,
      };
    },
    // 7. Protéines
    (c, p) => {
      const perKg = c.losing ? 1.6 : 1.2, target = c.protein;
      // Exemple de journée : on additionne des portions jusqu'à atteindre l'objectif.
      const plan = [], picks = [[5, "Petit-déjeuner"], [4, "Petit-déjeuner"], [0, "Déjeuner"], [8, "Déjeuner"], [6, "Collation"], [3, "Dîner"], [7, "Dîner"], [11, "Collation"], [12, "Collation"]];
      let tot = 0, kcal = 0;
      for (const [i, meal] of picks) { if (tot >= target) break; const f = FOODS[i]; plan.push([meal, `${f[0]} (${f[2]})`, f[3] + " g"]); tot += f[3]; kcal += f[4]; }
      return {
        k: "Protéines", v: r0(target), u: "g / jour",
        body: `
        <section><h3>Le calcul</h3>
          <div class="formula">Protéines = poids × ${fmt(perKg, 1)} g<br>= ${r1(c.w)} × ${fmt(perKg, 1)} = <b>${r0(target)} g par jour</b>, soit environ ${r0(target / 3)} g par repas</div>
          <p>${c.losing ? "Pendant une perte de poids, 1,6 g par kg aide à garder vos muscles et à avoir moins faim." : "1,2 g par kg suffit pour entretenir vos muscles, surtout avec du renforcement musculaire."}</p>
        </section>
        <section><h3>Aliments riches en protéines</h3>
          ${table(["Aliment et portion", "/100 g", "Portion", "kcal"], FOODS.map((f) => [`${f[0]}<small>${f[2]}</small>`, fmt(f[1], f[1] % 1 ? 1 : 0) + " g", f[3] + " g", f[4]]), -1, [1, 2, 3])}
          <p class="note">Valeurs moyennes indicatives, elles varient selon les marques et la cuisson.</p>
        </section>
        <section><h3>Exemple de journée (${tot} g, environ ${kcal} kcal)</h3>
          ${table(["Moment", "Aliment", "Protéines"], plan, -1, [2])}
          <p class="note">À compléter avec des légumes, des féculents et des fruits selon votre apport calorique.</p>
        </section>
        <section><h3>Conseils</h3><ul>
          <li>Répartissez les protéines sur les 3 repas plutôt que tout le soir.</li>
          <li>Mélangez sources animales et végétales (légumineuses + céréales, par exemple lentilles et riz).</li>
          <li>Si vous avez un problème rénal, demandez l'avis de votre médecin avant d'augmenter les protéines.</li>
        </ul></section>`,
      };
    },
  ];

  /* ---------- Fenêtre ---------- */
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.hidden = true;
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle"></div>`;
  document.body.appendChild(bg);
  const sheet = bg.querySelector(".sheet");
  let opener = null;

  function open(i, from) {
    const c = calc(), p = state.profile, s = SHEETS[i](c, p);
    sheet.innerHTML = `
      <div class="sheet-head"><div><div class="k" id="sheetTitle">${s.k}${book.example ? " · exemple" : ""}</div><div class="v">${s.v}<small>${s.u}</small></div></div>
      <button type="button" class="close" aria-label="Fermer">✕</button></div>
      ${s.body}
      <p class="note">Estimations générales, pas un avis médical.</p>`;
    opener = from || null;
    bg.hidden = false;
    sheet.scrollTop = 0;
    document.documentElement.style.overflow = "hidden";
    sheet.querySelector(".close").focus();
  }
  function close() {
    if (bg.hidden) return;
    bg.hidden = true;
    document.documentElement.style.overflow = "";
    if (opener && document.contains(opener)) opener.focus();
  }
  bg.addEventListener("click", (ev) => { if (ev.target === bg || ev.target.closest(".close")) close(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") close(); });

  /* ---------- Cases cliquables ---------- */
  function decorate() {
    $("stats").querySelectorAll(".stat").forEach((el, i) => {
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-haspopup", "dialog");
      el.dataset.sheet = i;
      if (!el.querySelector(".more")) el.insertAdjacentHTML("beforeend", `<span class="more" aria-hidden="true">Détails ›</span>`);
    });
  }
  $("stats").addEventListener("click", (ev) => {
    const el = ev.target.closest(".stat");
    if (el) open(Number(el.dataset.sheet), el);
  });
  $("stats").addEventListener("keydown", (ev) => {
    const el = ev.target.closest(".stat");
    if (el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); open(Number(el.dataset.sheet), el); }
  });

  const baseRender = render;
  window.render = function () { baseRender(); decorate(); };
  decorate();
})();
