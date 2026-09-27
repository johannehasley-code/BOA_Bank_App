import { useState, useEffect, useRef } from "react";
import { ShieldCheck, Lock, AlertTriangle, CheckCircle2, Clock, ShieldAlert, Eye, EyeOff, Wallet } from "lucide-react";
import logoBOA from "./assets/logo-boa.png";

// ---------------------------------------------------------------------------
// Données de démonstration
// ---------------------------------------------------------------------------
const COMPTE_DEMO = { titulaire: "Johanne H.", numero: "ML0123456789", solde: 245780 };
const PIN_DEMO = "1234"; // Simule le code local (biométrie/PIN) déjà enregistré sur l'appareil
const MAX_TENTATIVES = 3;
const DUREE_BLOCAGE_S = 120;
const DUREE_CODE_S = 45;

const TRANSACTIONS_INIT = [
  { id: 1, titre: "Virement reçu - Ahmed M.", date: "12/10/2023", montant: 1500, sens: "positif" },
  { id: 2, titre: "Paiement facture ELECTRIQUE", date: "11/10/2023", montant: -450.75, sens: "negatif" },
  { id: 3, titre: "Retrait DAB", date: "10/10/2023", montant: -1000, sens: "negatif" },
  { id: 4, titre: "Virement - Loyer", date: "09/10/2023", montant: -3000, sens: "negatif" },
  { id: 5, titre: "Virement reçu - Salaire", date: "08/10/2023", montant: 8500, sens: "positif" },
];

function formatXOF(n) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " XOF";
}

function genererCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Simule une empreinte cryptographique liée à la transaction (bénéficiaire + montant + horodatage)
// En production : HMAC-SHA256(secret_device, beneficiaire|montant|nonce_serveur), le secret vivant
// dans le Secure Enclave / Android Keystore, jamais lisible par l'application elle-même.
function empreinteTransaction(beneficiaire, montant, motif) {
  const base = `${beneficiaire}|${montant}|${motif}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = (h * 31 + base.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).slice(0, 8).toUpperCase();
}

export default function App() {
  const [beneficiaire, setBeneficiaire] = useState("");
  const [compteBenef, setCompteBenef] = useState("");
  const [montant, setMontant] = useState("");
  const [motif, setMotif] = useState("");

  const [transactions, setTransactions] = useState(TRANSACTIONS_INIT);
  const [notification, setNotification] = useState(null);

  const [etapeAuth, setEtapeAuth] = useState(false);
  const [pinSaisi, setPinSaisi] = useState("");
  const [afficherPin, setAfficherPin] = useState(false);
  const [tentatives, setTentatives] = useState(0);
  const [bloqueJusqua, setBloqueJusqua] = useState(null);
  const [secondesBlocage, setSecondesBlocage] = useState(0);

  const [codeAuthentifie, setCodeAuthentifie] = useState(false);
  const [code, setCode] = useState(null);
  const [empreinte, setEmpreinte] = useState(null);
  const [tempsRestant, setTempsRestant] = useState(0);
  const [codeValidation, setCodeValidation] = useState("");

  const [journal, setJournal] = useState([]);

  const minuteurCode = useRef(null);
  const minuteurBlocage = useRef(null);

  const ajouterJournal = (message, type = "info") => {
    setJournal((j) => [{ id: Date.now(), message, type, heure: new Date().toLocaleTimeString("fr-FR") }, ...j].slice(0, 6));
  };

  useEffect(() => {
    if (code && tempsRestant > 0) {
      minuteurCode.current = setTimeout(() => setTempsRestant((t) => t - 1), 1000);
    } else if (code && tempsRestant === 0) {
      setCode(null);
      setEmpreinte(null);
      ajouterJournal("Code de validation expiré automatiquement", "info");
    }
    return () => clearTimeout(minuteurCode.current);
  }, [code, tempsRestant]);

  useEffect(() => {
    if (bloqueJusqua && secondesBlocage > 0) {
      minuteurBlocage.current = setTimeout(() => setSecondesBlocage((s) => s - 1), 1000);
    } else if (bloqueJusqua && secondesBlocage === 0) {
      setBloqueJusqua(null);
      setTentatives(0);
    }
    return () => clearTimeout(minuteurBlocage.current);
  }, [bloqueJusqua, secondesBlocage]);

  const champsTransfertValides = beneficiaire.trim() && montant && Number(montant) > 0;

  function demarrerGenerationCode() {
    if (!champsTransfertValides) {
      setNotification({ texte: "Veuillez remplir le bénéficiaire et le montant avant de générer un code.", type: "erreur" });
      return;
    }
    if (bloqueJusqua) return;
    setEtapeAuth(true);
    setPinSaisi("");
  }

  function verifierPin() {
    if (bloqueJusqua) return;

    if (pinSaisi === PIN_DEMO) {
      setEtapeAuth(false);
      setCodeAuthentifie(true);
      setTentatives(0);
      const nouveauCode = genererCode();
      const emp = empreinteTransaction(beneficiaire, montant, motif);
      setCode(nouveauCode);
      setEmpreinte(emp);
      setTempsRestant(DUREE_CODE_S);
      ajouterJournal(`Code généré après authentification locale réussie — lié à ${formatXOF(Number(montant))} vers ${beneficiaire}`, "succes");
    } else {
      const nb = tentatives + 1;
      setTentatives(nb);
      setPinSaisi("");
      if (nb >= MAX_TENTATIVES) {
        setBloqueJusqua(Date.now() + DUREE_BLOCAGE_S * 1000);
        setSecondesBlocage(DUREE_BLOCAGE_S);
        setEtapeAuth(false);
        ajouterJournal("3 échecs de code local — génération bloquée et alerte envoyée au canal secondaire (email/SMS)", "alerte");
      } else {
        ajouterJournal(`Code local incorrect (tentative ${nb}/${MAX_TENTATIVES})`, "avertissement");
      }
    }
  }

  function annulerAuth() {
    setEtapeAuth(false);
    setPinSaisi("");
  }

  function validerTransfert() {
    if (!champsTransfertValides) {
      setNotification({ texte: "Veuillez remplir tous les champs obligatoires.", type: "erreur" });
      return;
    }
    if (!code || !codeAuthentifie) {
      setNotification({ texte: "Générez d'abord un code de validation authentifié.", type: "erreur" });
      return;
    }
    if (codeValidation !== code) {
      setNotification({ texte: "Le code de validation saisi ne correspond pas.", type: "erreur" });
      return;
    }

    const nouvelleTx = {
      id: Date.now(),
      titre: `Virement - ${beneficiaire}`,
      date: new Date().toLocaleDateString("fr-FR"),
      montant: -Number(montant),
      sens: "negatif",
    };
    setTransactions((t) => [nouvelleTx, ...t]);
    ajouterJournal(`Transfert de ${formatXOF(Number(montant))} vers ${beneficiaire} confirmé`, "succes");
    setNotification({ texte: "Votre opération a été effectuée avec succès.", type: "succes" });

    reinitialiserFormulaire();
    setTimeout(() => setNotification(null), 3500);
  }

  function reinitialiserFormulaire() {
    setBeneficiaire("");
    setCompteBenef("");
    setMontant("");
    setMotif("");
    setCode(null);
    setEmpreinte(null);
    setCodeAuthentifie(false);
    setCodeValidation("");
    setTempsRestant(0);
  }

  const boaVert = "#006747";
  const boaVertClair = "#4caf50";

  return (
    <div style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", background: "#f5f5f5", minHeight: "100vh", color: "#333" }}>
      <header style={{ background: "#fff", position: "sticky", top: 0, zIndex: 10, borderBottom: `3px solid ${boaVert}`, boxShadow: "0 2px 14px rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <img src={logoBOA} alt="Bank of Africa - BMCE Group" style={{ height: 34 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: boaVertClair, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>
              {COMPTE_DEMO.titulaire.split(" ").map((m) => m[0]).join("")}
            </div>
            <span style={{ fontSize: 14, color: "#444" }}>{COMPTE_DEMO.titulaire}</span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 60px" }}>
        <div style={{ position: "relative", overflow: "hidden", background: `linear-gradient(135deg, ${boaVert} 0%, #004d34 100%)`, borderRadius: 12, boxShadow: "0 6px 16px rgba(0,103,71,0.18)", padding: 22, marginBottom: 24, color: "#fff" }}>
          <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.85, fontSize: 13 }}>
            <Wallet size={15} /> Compte {COMPTE_DEMO.numero}
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, margin: "12px 0 4px" }}>{formatXOF(COMPTE_DEMO.solde)}</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Solde disponible</div>
        </div>

        <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.05)", padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, color: boaVert, marginBottom: 18, paddingBottom: 8, borderBottom: `2px solid ${boaVertClair}` }}>
            Nouveau virement
          </h2>

          <Champ label="Nom du bénéficiaire">
            <input className="fc" value={beneficiaire} onChange={(e) => setBeneficiaire(e.target.value)} placeholder="Ex : Ahmed M." />
          </Champ>
          <Champ label="Numéro de compte">
            <input className="fc" value={compteBenef} onChange={(e) => setCompteBenef(e.target.value)} placeholder="Numéro de compte du bénéficiaire" />
          </Champ>
          <Champ label="Montant (XOF)">
            <input className="fc" type="number" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="0,00" />
          </Champ>
          <Champ label="Motif">
            <input className="fc" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif du transfert" />
          </Champ>

          <div style={{ background: "rgba(0,103,71,0.05)", borderRadius: 8, padding: 18, margin: "18px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <ShieldCheck size={18} color={boaVert} />
              <h3 style={{ fontSize: 16, color: boaVert }}>Code de validation local</h3>
            </div>
            <p style={{ fontSize: 13.5, color: "#555", marginBottom: 14 }}>
              En cas de non-réception du SMS, générez un code local. Une authentification supplémentaire
              (code PIN de l'application) est requise avant toute génération, afin que la possession seule
              du téléphone ne suffise pas à valider un virement.
            </p>

            {bloqueJusqua && (
              <Alerte type="alerte" texte={`Génération bloquée après ${MAX_TENTATIVES} échecs. Réessayez dans ${secondesBlocage}s. Une alerte a été envoyée à votre canal secondaire.`} />
            )}

            {!code && !bloqueJusqua && (
              <button className="btn btn-generer" onClick={demarrerGenerationCode} disabled={!champsTransfertValides}>
                <Lock size={15} style={{ marginRight: 6 }} /> Générer un code
              </button>
            )}

            {code && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, color: boaVert, background: "#f5f5f5", padding: "10px 15px", borderRadius: 6, flexGrow: 1, textAlign: "center" }}>
                    {code}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#777", display: "flex", alignItems: "center", gap: 6 }}>
                  <Clock size={14} /> Expire dans {tempsRestant}s
                </div>
                <div style={{ fontSize: 12.5, color: boaVert, marginTop: 8, background: "#eef6f0", padding: "8px 10px", borderRadius: 6 }}>
                  Ce code n'est valable que pour ce virement précis : <strong>{formatXOF(Number(montant))}</strong> vers <strong>{beneficiaire}</strong>
                  {" "}(référence {empreinte}). Il devient invalide si l'un de ces éléments change.
                </div>

                <div style={{ marginTop: 16 }}>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 14, color: boaVert }}>Entrez le code de validation</label>
                  <input className="fc" value={codeValidation} onChange={(e) => setCodeValidation(e.target.value)} placeholder="XXXXXX" />
                </div>
              </>
            )}

            {etapeAuth && (
              <div style={{ marginTop: 16, padding: 16, background: "#fff", border: `1px solid ${boaVertClair}`, borderRadius: 8 }}>
                <div style={{ fontSize: 14, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <Lock size={15} color={boaVert} /> Confirmez votre code PIN local pour continuer
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="fc"
                    type={afficherPin ? "text" : "password"}
                    maxLength={4}
                    value={pinSaisi}
                    onChange={(e) => setPinSaisi(e.target.value.replace(/\D/g, ""))}
                    placeholder="PIN à 4 chiffres"
                    style={{ flex: 1 }}
                  />
                  <button type="button" onClick={() => setAfficherPin((v) => !v)} className="btn-icone" aria-label="Afficher le PIN">
                    {afficherPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {tentatives > 0 && (
                  <div style={{ fontSize: 12.5, color: "#b45309", marginTop: 8 }}>
                    Code incorrect ({tentatives}/{MAX_TENTATIVES} tentatives)
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button className="btn btn-secondaire" onClick={annulerAuth}>Annuler</button>
                  <button className="btn btn-primaire" onClick={verifierPin} disabled={pinSaisi.length !== 4}>Confirmer</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <button className="btn btn-secondaire" onClick={reinitialiserFormulaire}>Annuler</button>
            <button className="btn btn-primaire" onClick={validerTransfert}>Valider le transfert</button>
          </div>

          {notification && <Alerte type={notification.type === "succes" ? "succes" : "alerte"} texte={notification.texte} />}
        </div>

        <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.05)", padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 17, color: boaVert, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldAlert size={18} /> Journal de sécurité
          </h2>
          {journal.length === 0 ? (
            <div style={{ fontSize: 13.5, color: "#888" }}>Aucun événement pour l'instant.</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {journal.map((j) => (
                <li key={j.id} style={{ fontSize: 13, padding: "8px 0", borderBottom: "1px solid #eee", color: j.type === "alerte" ? "#b91c1c" : j.type === "succes" ? boaVert : "#555" }}>
                  <span style={{ color: "#999", marginRight: 8 }}>{j.heure}</span>{j.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.05)", padding: 20 }}>
          <h2 style={{ fontSize: 17, color: boaVert, marginBottom: 12 }}>Dernières opérations</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {transactions.map((t) => (
              <li key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #eee" }}>
                <div>
                  <div style={{ fontSize: 14 }}>{t.titre}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{t.date}</div>
                </div>
                <div style={{ fontWeight: 600, color: t.sens === "positif" ? "#2e7d32" : "#c62828" }}>
                  {t.sens === "positif" ? "+" : ""}{formatXOF(t.montant)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <style>{`
        .fc { width: 100%; padding: 10px 12px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 15px; }
        .fc:focus { outline: none; border-color: ${boaVertClair}; }
        .btn { padding: 10px 18px; border: none; border-radius: 6px; font-size: 14.5px; font-weight: 600; cursor: pointer; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-primaire { background: ${boaVert}; color: #fff; }
        .btn-secondaire { background: #eee; color: #444; }
        .btn-generer { background: ${boaVertClair}; color: #fff; display: flex; align-items: center; }
        .btn-icone { border: 1px solid #ddd; background: #fff; border-radius: 6px; padding: 8px; cursor: pointer; }
      `}</style>
    </div>
  );
}

function Champ({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500, color: "#006747" }}>{label}</label>
      {children}
    </div>
  );
}

function Alerte({ type, texte }) {
  const couleurs = {
    alerte: { bg: "#fef2f2", border: "#fecaca", texte: "#b91c1c" },
    succes: { bg: "#f0fdf4", border: "#bbf7d0", texte: "#166534" },
  };
  const c = couleurs[type] || couleurs.alerte;
  const Icone = type === "succes" ? CheckCircle2 : AlertTriangle;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: c.bg, border: `1px solid ${c.border}`, color: c.texte, padding: "10px 14px", borderRadius: 6, fontSize: 13.5, marginTop: 14 }}>
      <Icone size={16} /> {texte}
    </div>
  );
}
