// Synchronisation entre appareils : compte e-mail + base Firestore.
// S'appuie sur les variables globales de index.html (book, state, store, render…).
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyAg6t00bXXsV8tajmD9Rni2ah5GaXtl5_4",
    authDomain: "balance-cap.firebaseapp.com",
    projectId: "balance-cap",
    storageBucket: "balance-cap.firebasestorage.app",
    messagingSenderId: "588556362642",
    appId: "1:588556362642:web:7e8790306b51702345174b",
  };

  /* ---------- Interface ---------- */
  // Tout tient dans l'en-tête : un bouton « Se connecter », ou une pastille « Synchronisé » une fois connecté.
  // Le formulaire et le compte s'ouvrent dans une fenêtre (styles .sheet-bg / .sheet de details.js).
  const css = document.createElement("style");
  css.textContent = `
.top-actions { display: flex; align-items: center; gap: 8px; }
.acct-btn { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 999px; font-size: 0.85rem; }
.acct-btn.synced { background: color-mix(in srgb, var(--good) 14%, transparent); border-color: transparent; color: var(--good); }
.acct-btn.synced.warn { background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn); }
.acct-btn.synced:hover { filter: brightness(1.1); }
body.signed-in #saveState { display: none; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: none; }
.account { width: min(460px, 100%); }
.account .sheet-head { align-items: center; }
.account p { margin: 0; font-size: 0.92rem; overflow-wrap: anywhere; }
.account form { display: grid; gap: 10px; }
.account .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.account .link { background: none; border: none; padding: 0; color: var(--accent); font-weight: 400; font-size: 0.85rem; text-decoration: underline; justify-self: start; }
.account .msg { font-size: 0.85rem; color: var(--muted); min-height: 1em; }
.account .msg.bad { color: var(--bad); }
`;
  document.head.appendChild(css);

  const saveState = $("saveState");
  const actions = document.createElement("div");
  actions.className = "top-actions";
  saveState.replaceWith(actions);
  const acctBtn = document.createElement("button");
  acctBtn.type = "button";
  acctBtn.className = "ghost acct-btn";
  acctBtn.hidden = true;
  actions.append(saveState, acctBtn);

  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.hidden = true;
  bg.innerHTML = `<section class="sheet panel account" role="dialog" aria-modal="true" aria-labelledby="acctTitle"></section>`;
  document.body.appendChild(bg);
  const box = bg.querySelector(".account");
  let signedIn = false;

  const openAcct = () => { bg.hidden = false; document.documentElement.style.overflow = "hidden"; (box.querySelector("input") || box.querySelector(".close")).focus(); };
  const closeAcct = () => { if (bg.hidden) return; bg.hidden = true; document.documentElement.style.overflow = ""; acctBtn.focus(); };
  acctBtn.addEventListener("click", openAcct);
  bg.addEventListener("click", (ev) => { if (ev.target === bg || ev.target.closest(".close")) closeAcct(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeAcct(); });

  // Une fois connecté, la pastille reprend l'état d'enregistrement (Synchronisé, Enregistrement…, Synchro en attente).
  const baseSetSaveState = setSaveState;
  window.setSaveState = function (text, warn) {
    baseSetSaveState(text, warn);
    if (signedIn) showStatus(text, warn);
  };
  function showStatus(text, warn) {
    acctBtn.className = "acct-btn synced" + (warn ? " warn" : "");
    acctBtn.innerHTML = `<span class="dot" aria-hidden="true"></span>`;
    acctBtn.append(text);
  }

  const head = (title) => `<div class="sheet-head"><h2 id="acctTitle">${title}</h2><button type="button" class="close" aria-label="Fermer">✕</button></div>`;

  const msg = (text, bad) => {
    const el = box.querySelector(".msg");
    if (el) { el.textContent = text || ""; el.classList.toggle("bad", !!bad); }
  };

  function showSignedOut() {
    signedIn = false;
    document.body.classList.remove("signed-in");
    acctBtn.hidden = false;
    acctBtn.className = "ghost acct-btn";
    acctBtn.textContent = "Se connecter";
    box.innerHTML = `${head("Synchroniser mes appareils")}
      <p>Connectez-vous pour retrouver vos données sur iPhone, ordinateur et tablette.</p>
      <form id="authForm" novalidate>
        <input id="authEmail" type="email" autocomplete="email" placeholder="Adresse e-mail" required>
        <input id="authPass" type="password" autocomplete="current-password" placeholder="Mot de passe (6 caractères min.)" required>
        <div class="row">
          <button type="submit" id="authLogin">Se connecter</button>
          <button type="button" class="ghost" id="authSignup">Créer un compte</button>
        </div>
        <button type="button" class="link" id="authReset">Mot de passe oublié ?</button>
        <div class="msg" role="status"></div>
      </form>`;
    const email = () => box.querySelector("#authEmail").value.trim();
    const pass = () => box.querySelector("#authPass").value;
    box.querySelector("#authForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (!email() || !pass()) return msg("Indiquez votre e-mail et votre mot de passe.", true);
      msg("Connexion…");
      auth.signInWithEmailAndPassword(email(), pass()).catch((e) => msg(explain(e), true));
    });
    box.querySelector("#authSignup").addEventListener("click", () => {
      if (!email() || !pass()) return msg("Indiquez un e-mail et choisissez un mot de passe.", true);
      msg("Création du compte…");
      auth.createUserWithEmailAndPassword(email(), pass()).catch((e) => msg(explain(e), true));
    });
    box.querySelector("#authReset").addEventListener("click", () => {
      if (!email()) return msg("Indiquez d'abord votre e-mail.", true);
      auth.sendPasswordResetEmail(email())
        .then(() => msg("E-mail envoyé : suivez le lien pour choisir un nouveau mot de passe."))
        .catch((e) => msg(explain(e), true));
    });
  }

  function showSignedIn(user) {
    signedIn = true;
    document.body.classList.add("signed-in");
    acctBtn.hidden = false;
    acctBtn.title = `Compte : ${user.email}`;
    showStatus("Synchronisé");
    box.innerHTML = `${head("Mon compte")}
      <p>Synchronisé avec <strong></strong></p>
      <button type="button" class="ghost" id="authLogout">Se déconnecter</button>
      <div class="msg" role="status"></div>`;
    box.querySelector("strong").textContent = user.email;
    box.querySelector("#authLogout").addEventListener("click", () => { auth.signOut(); closeAcct(); });
    closeAcct();
  }

  function explain(e) {
    const c = (e && e.code) || "";
    if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "E-mail ou mot de passe incorrect.";
    if (c.includes("email-already-in-use")) return "Un compte existe déjà avec cet e-mail : utilisez « Se connecter ».";
    if (c.includes("weak-password")) return "Mot de passe trop court : 6 caractères minimum.";
    if (c.includes("invalid-email")) return "Cette adresse e-mail n'est pas valide.";
    if (c.includes("network-request-failed")) return "Pas de connexion internet. Réessayez une fois en ligne.";
    if (c.includes("too-many-requests")) return "Trop d'essais. Patientez quelques minutes.";
    return "Erreur : " + (e && e.message ? e.message : "inconnue");
  }

  // Hors connexion, pas de bouton : la pastille d'enregistrement suffit.
  if (typeof firebase === "undefined") return;

  /* ---------- Firebase ---------- */
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  let ref = null, unsub = null, lastJson = "";
  const snapshotOf = () => JSON.parse(JSON.stringify({ current: book.current, people: book.people }));
  // Firestore renvoie les clés triées : on compare avec un JSON aux clés triées.
  const stable = (v) => Array.isArray(v) ? "[" + v.map(stable).join(",") + "]"
    : v && typeof v === "object" ? "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}"
    : JSON.stringify(v);

  function push() {
    if (!ref || book.example) return;
    const data = snapshotOf();
    lastJson = stable(data);
    ref.set({ ...data, updatedAt: Date.now() })
      .then(() => { setSaveState("Synchronisé"); msg(""); })
      .catch(() => { setSaveState("Synchro en attente", true); });
  }

  // Chaque enregistrement local part aussi vers le compte.
  const localPersist = persist;
  window.persist = function () { localPersist(); push(); };

  function apply(data) {
    book = { example: false, current: data.current, people: data.people.map((p) => ({ id: p.id, profile: p.profile, entries: Array.isArray(p.entries) ? p.entries.slice() : [], water: Array.isArray(p.water) ? p.water.slice() : [] })) };
    selectPerson(data.current);
    creating = false;
    fillForm();
    render();
    if (store) store.save(snapshotOf()).catch(() => {});
    lastJson = stable(snapshotOf());
    setSaveState("Synchronisé");
  }

  auth.onAuthStateChanged(async (user) => {
    if (unsub) { unsub(); unsub = null; }
    ref = null;
    if (!user) {
      showSignedOut();
      if (store && !book.example) setSaveState(store.label);
      return;
    }
    showSignedIn(user);
    ref = db.collection("users").doc(user.uid);
    try {
      // Première connexion sur cet appareil : on fusionne les personnes locales avec celles du compte.
      const snap = await ref.get();
      const cloud = snap.exists && Array.isArray(snap.data().people) ? snap.data() : null;
      if (!book.example) {
        const people = cloud ? cloud.people.slice() : [];
        for (const p of book.people) if (!people.some((q) => q.id === p.id)) people.push(p);
        if (!cloud || people.length !== cloud.people.length) {
          apply({ current: book.current, people });
          push();
        } else {
          apply(cloud);
        }
      } else if (cloud && cloud.people.length) {
        apply(cloud);
      }
    } catch {
      msg("Synchronisation impossible pour l'instant, réessai automatique.", true);
    }
    // Ensuite on suit les changements faits sur les autres appareils.
    unsub = ref.onSnapshot({ includeMetadataChanges: true }, (s) => {
      if (!s.exists || s.metadata.hasPendingWrites) return;
      const d = s.data();
      if (!Array.isArray(d.people) || !d.people.length) return;
      const j = stable({ current: d.current, people: d.people });
      if (j === lastJson) return;
      lastJson = j;
      apply(d);
    }, () => msg("Synchronisation interrompue. Rechargez l'application.", true));
  });
})();
