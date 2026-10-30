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
  const css = document.createElement("style");
  css.textContent = `
.account { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.account p { margin: 0; font-size: 0.9rem; flex: 1 1 220px; min-width: 0; overflow-wrap: anywhere; }
.account form { display: flex; flex-wrap: wrap; gap: 8px; flex: 999 1 420px; align-items: center; }
.account input { flex: 1 1 160px; width: auto; }
.account .links { display: flex; flex-wrap: wrap; gap: 4px 12px; width: 100%; }
.account .link { background: none; border: none; padding: 0; color: var(--accent); font-weight: 400; font-size: 0.85rem; text-decoration: underline; }
.account .msg { width: 100%; font-size: 0.85rem; color: var(--muted); min-height: 1em; }
.account .msg.bad { color: var(--bad); }
.account .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--good); margin-right: 6px; vertical-align: middle; }
`;
  document.head.appendChild(css);

  const box = document.createElement("section");
  box.className = "account";
  box.setAttribute("aria-label", "Synchronisation");
  document.querySelector("header").after(box);

  const msg = (text, bad) => {
    const el = box.querySelector(".msg");
    if (el) { el.textContent = text || ""; el.classList.toggle("bad", !!bad); }
  };

  function showSignedOut() {
    box.innerHTML = `
      <p><strong>Synchroniser mes appareils</strong><br>Connectez-vous pour retrouver vos données sur iPhone, ordinateur et tablette.</p>
      <form id="authForm" novalidate>
        <input id="authEmail" type="email" autocomplete="email" placeholder="Adresse e-mail" required>
        <input id="authPass" type="password" autocomplete="current-password" placeholder="Mot de passe (6 caractères min.)" required>
        <button type="submit" id="authLogin">Se connecter</button>
        <button type="button" class="ghost" id="authSignup">Créer un compte</button>
        <div class="links"><button type="button" class="link" id="authReset">Mot de passe oublié ?</button></div>
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
    box.innerHTML = `
      <p><span class="dot" aria-hidden="true"></span>Synchronisé avec <strong></strong></p>
      <button type="button" class="ghost" id="authLogout">Se déconnecter</button>
      <div class="msg" role="status"></div>`;
    box.querySelector("strong").textContent = user.email;
    box.querySelector("#authLogout").addEventListener("click", () => auth.signOut());
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

  if (typeof firebase === "undefined") {
    box.innerHTML = `<p>Synchronisation indisponible hors connexion. Vos données restent enregistrées sur cet appareil.</p>`;
    return;
  }

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
    book = { example: false, current: data.current, people: data.people.map((p) => ({ id: p.id, profile: p.profile, entries: Array.isArray(p.entries) ? p.entries.slice() : [] })) };
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
