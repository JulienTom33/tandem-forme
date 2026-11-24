# Tandem Forme

L'appli de remise en forme pour les couples : séances de sport à deux, menus équilibrés et recettes françaises, journal, suivi du poids, du sommeil et des données de la montre.

- PWA statique (HTML, CSS, JavaScript, sans étape de build), hébergée sur Vercel.
- Données et connexion par code e-mail : Supabase (région UE).
- La clé Supabase présente dans `app.js` est la clé publique prévue pour le navigateur ; l'accès aux données est protégé par les règles RLS de la base.

## Fichiers

- `index.html`, `style.css` : coquille de l'appli
- `app.js` : écrans (connexion, inscription, profil, aujourd'hui, repas, journal, suivi, réglages, compte)
- `program.js` : génération du programme et choix des repas (règles simples)
- `sw.js`, `manifest.webmanifest`, `icons/` : installation sur l'écran d'accueil
