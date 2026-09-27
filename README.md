# BOA - Application bancaire (démo sécurité)

Démo React/Vite d'une page bancaire (virement + code de validation local sécurisé), conçue pendant le stage de Johanne à BOA Mali pour répondre à un problème réel : en cas de panne réseau, les codes SMS de validation des transferts n'arrivaient pas. Cette démo montre une génération de code en local, protégée par une authentification supplémentaire (PIN), pour éviter qu'un téléphone volé ou emprunté suffise à valider un virement.

## Démo en ligne

Publiée via GitHub Pages sur ce dépôt.

## Installation locale

```bash
npm install
npm run dev
```

## PIN de démonstration

Le code local (simulant une biométrie/PIN d'appareil) est **1234**, défini dans `src/App.jsx` (`PIN_DEMO`).

## Sécurité — ce qui est réellement démontré

- Le code de validation n'est généré qu'après confirmation d'un PIN local (authentification à deux facteurs avant génération).
- Trois échecs de PIN verrouillent la génération pendant 2 minutes et journalisent l'événement.
- Le code affiché est lié au bénéficiaire, au montant et au motif (empreinte affichée), pour empêcher sa réutilisation sur une autre transaction.

Cette démo reste un prototype pédagogique côté client : dans une vraie implémentation, le secret cryptographique vivrait dans le Secure Enclave / Android Keystore du téléphone, et la vérification finale du code se ferait côté serveur bancaire.

## Structure

```
src/
  App.jsx        Composant unique de la page bancaire
  main.jsx        Point d'entrée React
  assets/
    logo-boa.png  Logo Bank of Africa
```
