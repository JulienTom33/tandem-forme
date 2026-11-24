// Fiches d'exercices et de séances : comment faire le geste, les points clés, la version plus facile.
// La vidéo ouvre une recherche YouTube en français sur le nom de l'exercice (toujours disponible).

export const EXERCISES = {
  'Squat au poids du corps': {
    how: ['Debout, pieds écartés à la largeur des épaules, pointes légèrement vers l\'extérieur.', 'Pousse les fesses en arrière comme pour t\'asseoir sur une chaise, en pliant les genoux.', 'Descends jusqu\'à ce que les cuisses soient à peu près parallèles au sol, ou moins bas si c\'est difficile.', 'Remonte en poussant dans les talons.'],
    keys: ['Le dos reste droit, la poitrine ouverte.', 'Les genoux suivent la direction des pieds, sans rentrer vers l\'intérieur.', 'Inspire en descendant, souffle en remontant.'],
    easier: 'Assieds-toi vraiment sur une chaise à chaque répétition, puis relève-toi.',
    muscles: 'Cuisses, fessiers', video: 'squat poids du corps débutant',
  },
  'Goblet squat kettlebell': {
    how: ['Tiens la kettlebell contre la poitrine, à deux mains, par les côtés de la poignée.', 'Pieds un peu plus écartés que les épaules.', 'Descends en squat, les coudes passent à l\'intérieur des genoux.', 'Remonte en poussant dans les talons, kettlebell toujours collée au buste.'],
    keys: ['Le poids devant aide à garder le dos droit.', 'Ne laisse pas le dos s\'arrondir en bas du mouvement.'],
    easier: 'Fais-le sans kettlebell, ou descends moins bas.',
    muscles: 'Cuisses, fessiers, gainage', video: 'goblet squat kettlebell technique',
  },
  'Fentes arrière alternées': {
    how: ['Debout, pieds à la largeur du bassin.', 'Fais un grand pas en arrière avec une jambe et descends le genou arrière vers le sol, sans le poser.', 'Le genou avant reste au-dessus de la cheville.', 'Pousse sur le pied avant pour revenir debout, puis change de jambe.'],
    keys: ['Le buste reste droit.', 'Tiens-toi à un mur ou une chaise si l\'équilibre est difficile.'],
    easier: 'Fais des demi-fentes en descendant moins bas.',
    muscles: 'Cuisses, fessiers, équilibre', video: 'fente arrière exercice débutant',
  },
  'Pont fessier': {
    how: ['Allongé sur le dos, genoux pliés, pieds à plat près des fesses, bras le long du corps.', 'Serre les fesses et soulève le bassin jusqu\'à former une ligne droite des genoux aux épaules.', 'Tiens 2 secondes en haut.', 'Redescends doucement sans poser complètement.'],
    keys: ['Pousse dans les talons, pas sur la pointe des pieds.', 'Ne creuse pas le bas du dos en haut : ce sont les fessiers qui travaillent.'],
    easier: 'Fais des montées plus petites.',
    muscles: 'Fessiers, arrière des cuisses, bas du dos', video: 'pont fessier exercice',
  },
  'Pont fessier avec mini-band': {
    how: ['Place la mini-band juste au-dessus des genoux.', 'Allongé sur le dos, genoux pliés, pieds à plat.', 'Écarte légèrement les genoux contre l\'élastique et garde cette tension.', 'Monte le bassin, tiens 2 secondes, redescends.'],
    keys: ['Les genoux ne doivent pas se rapprocher pendant le mouvement.'],
    easier: 'Fais-le sans élastique.',
    muscles: 'Fessiers (surtout les côtés)', video: 'pont fessier mini band',
  },
  'Soulevé de terre jambes tendues haltères': {
    how: ['Debout, un haltère dans chaque main devant les cuisses, genoux légèrement fléchis.', 'Pousse les fesses en arrière en laissant glisser les haltères le long des jambes.', 'Descends jusqu\'à sentir l\'étirement à l\'arrière des cuisses (environ mi-tibia).', 'Remonte en contractant les fessiers.'],
    keys: ['Le dos reste plat du début à la fin : c\'est la hanche qui bouge, pas le dos.', 'Prends des haltères légers pour apprendre le geste.'],
    easier: 'Fais le mouvement avec un bâton ou sans charge.',
    muscles: 'Arrière des cuisses, fessiers', video: 'soulevé de terre jambes tendues haltères technique',
  },
  'Kettlebell swing': {
    how: ['Pieds un peu plus écartés que les épaules, kettlebell au sol devant toi.', 'Attrape-la à deux mains, dos plat, et fais-la passer entre les jambes.', 'Pousse les hanches vers l\'avant d\'un coup sec pour lancer la kettlebell jusqu\'à hauteur de poitrine.', 'Laisse-la redescendre entre les jambes en repoussant les fesses en arrière.'],
    keys: ['Ce sont les hanches qui donnent l\'élan, pas les bras.', 'Le dos reste plat, ne t\'accroupis pas.'],
    easier: 'Monte la kettlebell seulement à hauteur du ventre.',
    muscles: 'Fessiers, arrière des cuisses, cardio', video: 'kettlebell swing technique débutant',
  },
  'Montées sur step': {
    how: ['Face au step, pose un pied entier dessus.', 'Pousse sur ce pied pour monter, puis amène l\'autre pied.', 'Redescends en contrôlant, en commençant par le même pied.', 'Change de jambe d\'attaque à chaque série.'],
    keys: ['Pousse sur la jambe du haut, sans t\'aider avec celle du bas.', 'Garde le buste droit.'],
    easier: 'Utilise une marche d\'escalier basse.',
    muscles: 'Cuisses, fessiers, cardio', video: 'montée sur step exercice',
  },
  'Chaise contre le mur': {
    how: ['Dos collé au mur, descends jusqu\'à ce que les genoux forment un angle droit.', 'Les pieds sont à la largeur du bassin, genoux au-dessus des chevilles.', 'Tiens la position 20 à 45 secondes.'],
    keys: ['Respire normalement, ne bloque pas ta respiration.', 'Le bas du dos reste collé au mur.'],
    easier: 'Descends moins bas, avec un angle plus ouvert.',
    muscles: 'Cuisses', video: 'exercice chaise contre le mur',
  },
  'Rowing TRX': {
    how: ['Face au point d\'ancrage, tiens les poignées bras tendus, corps penché en arrière et droit comme une planche.', 'Tire les poignées vers la poitrine en serrant les omoplates.', 'Redescends lentement bras tendus.'],
    keys: ['Le corps reste aligné, sans casser au niveau des hanches.', 'Plus les pieds sont proches de l\'ancrage, plus c\'est dur.'],
    easier: 'Recule les pieds pour être plus debout.',
    muscles: 'Dos, arrière des épaules, biceps', video: 'rowing TRX débutant',
  },
  'Rowing haltère un bras': {
    how: ['Une main et un genou posés sur un banc ou une chaise, dos plat.', 'L\'autre main tient l\'haltère, bras tendu vers le sol.', 'Tire l\'haltère vers la hanche en gardant le coude près du corps.', 'Redescends lentement. Fais toutes les répétitions d\'un côté, puis change.'],
    keys: ['Le dos ne tourne pas : seul le bras bouge.', 'Pense à « mettre le coude dans la poche arrière ».'],
    easier: 'Prends un haltère plus léger ou une bouteille d\'eau.',
    muscles: 'Dos, biceps', video: 'rowing haltère un bras technique',
  },
  'Tirage élastique bras tendus': {
    how: ['Accroche l\'élastique en hauteur (porte, barre) et tiens-le à deux mains, bras tendus devant toi.', 'Tire l\'élastique vers le bas jusqu\'aux cuisses en gardant les bras tendus.', 'Reviens lentement.'],
    keys: ['Garde les épaules basses, loin des oreilles.', 'Contracte le ventre.'],
    easier: 'Prends un élastique plus souple.',
    muscles: 'Grand dorsal, gainage', video: 'tirage bras tendus élastique',
  },
  'Écartés élastique (face pull)': {
    how: ['Accroche l\'élastique à hauteur du visage.', 'Tiens-le à deux mains, bras tendus devant toi.', 'Tire vers le visage en écartant les mains, coudes hauts, comme pour faire un « W ».', 'Reviens lentement.'],
    keys: ['Serre les omoplates à la fin du mouvement.', 'Excellent pour la posture et les épaules.'],
    easier: 'Recule d\'un pas pour moins de tension.',
    muscles: 'Arrière des épaules, haut du dos', video: 'face pull élastique',
  },
  'Pompes inclinées (mains sur table)': {
    how: ['Mains posées sur le bord d\'une table stable, un peu plus écartées que les épaules.', 'Recule les pieds pour que le corps forme une ligne droite.', 'Plie les coudes pour amener la poitrine vers la table.', 'Repousse pour revenir bras tendus.'],
    keys: ['Le corps reste gainé, sans creuser le dos.', 'Les coudes partent légèrement vers l\'arrière, pas sur les côtés.'],
    easier: 'Mains contre un mur.',
    muscles: 'Pectoraux, triceps, épaules', video: 'pompes inclinées débutant',
  },
  'Développé couché haltères au sol': {
    how: ['Allongé au sol, genoux pliés, un haltère dans chaque main au niveau de la poitrine, coudes au sol.', 'Pousse les haltères vers le plafond jusqu\'à tendre les bras.', 'Redescends lentement jusqu\'à ce que les coudes touchent le sol.'],
    keys: ['Le sol limite l\'amplitude : c\'est plus doux pour les épaules.', 'Souffle en poussant.'],
    easier: 'Prends des haltères plus légers.',
    muscles: 'Pectoraux, triceps', video: 'floor press haltères',
  },
  'Curl biceps haltères': {
    how: ['Debout, un haltère dans chaque main, bras le long du corps, paumes vers l\'avant.', 'Plie les coudes pour monter les haltères vers les épaules.', 'Redescends lentement.'],
    keys: ['Les coudes restent collés au corps.', 'Ne te balance pas pour t\'aider.'],
    easier: 'Alterne bras droit et bras gauche.',
    muscles: 'Biceps', video: 'curl biceps haltères',
  },
  'Rotation externe élastique (épaule)': {
    how: ['Accroche l\'élastique à hauteur du nombril, sur le côté.', 'Tiens-le avec la main la plus éloignée, coude plié à 90° et collé au corps (une serviette roulée sous le bras aide).', 'Tourne l\'avant-bras vers l\'extérieur en gardant le coude collé.', 'Reviens lentement. 15 répétitions de chaque côté.'],
    keys: ['Mouvement doux et lent, sans douleur.', 'Idéal pour renforcer l\'épaule en cas de tendinite : arrête si ça fait mal.'],
    easier: 'Élastique plus souple ou sans élastique.',
    muscles: 'Coiffe des rotateurs (épaule)', video: 'rotation externe épaule élastique kiné',
  },
  'Gainage sur les avant-bras': {
    how: ['Au sol, appuyé sur les avant-bras (coudes sous les épaules) et sur la pointe des pieds.', 'Le corps forme une ligne droite de la tête aux talons.', 'Tiens 20 à 40 secondes en respirant normalement.'],
    keys: ['Ne laisse pas les fesses monter ni le dos se creuser.', 'Serre les fesses et rentre légèrement le ventre.'],
    easier: 'Genoux posés au sol.',
    muscles: 'Abdominaux, gainage', video: 'gainage planche débutant',
  },
  'Dead bug': {
    how: ['Allongé sur le dos, bras tendus vers le plafond, genoux pliés à 90° au-dessus des hanches.', 'Plaque le bas du dos au sol.', 'Descends lentement le bras droit derrière la tête et la jambe gauche vers le sol, sans les poser.', 'Reviens et fais l\'autre côté.'],
    keys: ['Le bas du dos ne décolle jamais du sol.', 'Souffle longuement pendant que tu tends bras et jambe.'],
    easier: 'Bouge seulement les jambes, ou seulement les bras.',
    muscles: 'Abdominaux profonds', video: 'dead bug exercice abdos',
  },
  'Bird dog (quadrupédie)': {
    how: ['À quatre pattes, mains sous les épaules, genoux sous les hanches.', 'Tends en même temps le bras droit devant et la jambe gauche derrière.', 'Tiens 2 secondes, puis reviens et change de côté.'],
    keys: ['Le dos reste plat comme une table : imagine un verre d\'eau posé dessus.', 'Regarde le sol, nuque dans l\'alignement.'],
    easier: 'Tends seulement la jambe.',
    muscles: 'Dos, fessiers, gainage', video: 'bird dog exercice',
  },
  'Gainage latéral sur les genoux': {
    how: ['Sur le côté, appuyé sur l\'avant-bras (coude sous l\'épaule), genoux pliés.', 'Soulève les hanches pour aligner épaules, hanches et genoux.', 'Tiens 15 à 30 secondes de chaque côté.'],
    keys: ['Les hanches ne retombent pas vers le sol.'],
    easier: 'Tiens moins longtemps, plusieurs fois.',
    muscles: 'Obliques, gainage', video: 'gainage latéral genoux',
  },
  'Pallof press élastique': {
    how: ['Accroche l\'élastique à hauteur de poitrine, sur le côté.', 'Tiens-le à deux mains contre la poitrine, pieds écartés.', 'Tends les bras droit devant toi en résistant à l\'élastique qui veut te faire tourner.', 'Tiens 2 secondes et reviens. Fais les deux côtés.'],
    keys: ['Le buste ne tourne pas : c\'est un exercice anti-rotation.'],
    easier: 'Rapproche-toi du point d\'ancrage.',
    muscles: 'Abdominaux, obliques', video: 'pallof press élastique',
  },
  'Respiration ventrale allongé, jambes fléchies': {
    how: ['Allongé sur le dos, genoux pliés, une main sur le ventre.', 'Inspire par le nez en gonflant le ventre (la main monte).', 'Expire longuement par la bouche en rentrant doucement le nombril.', 'Continue 1 à 2 minutes.'],
    keys: ['Les épaules et le cou restent relâchés.', 'Très doux pour la nuque et les côtes.'],
    easier: 'Assis sur une chaise, dos appuyé.',
    muscles: 'Diaphragme, abdominaux profonds', video: 'respiration abdominale allongé',
  },
  'Planche bras tendus': {
    how: ['Mains au sol sous les épaules, bras tendus, comme en haut d\'une pompe.', 'Recule les pieds pour que le corps forme une ligne droite de la tête aux talons.', 'Tiens 15 à 30 secondes en respirant normalement.'],
    keys: ['Pousse le sol avec les mains pour ne pas t\'affaisser entre les épaules.', 'Les fesses ne montent pas et le dos ne se creuse pas.'],
    easier: 'Genoux au sol, ou mains posées sur une chaise.',
    muscles: 'Abdominaux, épaules', video: 'planche bras tendus gainage',
  },
  'Superman allongé sur le ventre': {
    how: ['Allongé sur le ventre, bras tendus devant toi, front posé sur une serviette.', 'Décolle en même temps les bras et les jambes de quelques centimètres.', 'Tiens 2 à 3 secondes, puis repose doucement.'],
    keys: ['Garde le regard vers le sol : la nuque reste dans l\'alignement, sans relever la tête.', 'Petits décollements : pas besoin de monter haut.'],
    easier: 'Décolle seulement les bras, ou seulement les jambes.',
    muscles: 'Bas du dos, fessiers, haut du dos', video: 'exercice superman lombaires débutant',
  },
};

// Routine de gainage : ordre, dose et repos. Elle s'affiche dans les séances qui parlent de gainage.
export const GAINAGE = [
  { n: 'Gainage sur les avant-bras', dose: '3 × 20 à 40 s', rest: '30 s de repos' },
  { n: 'Gainage latéral sur les genoux', dose: '2 × 20 s de chaque côté', rest: '20 s de repos' },
  { n: 'Dead bug', dose: '2 × 10 (5 de chaque côté)', rest: '30 s de repos' },
  { n: 'Bird dog (quadrupédie)', dose: '2 × 10 (5 de chaque côté)', rest: '30 s de repos' },
  { n: 'Planche bras tendus', dose: '2 × 15 à 30 s', rest: '30 s de repos' },
  { n: 'Superman allongé sur le ventre', dose: '2 × 10', rest: '30 s de repos' },
  { n: 'Pont fessier', dose: '2 × 15', rest: '30 s de repos' },
];

// Explications des séances qui ne sont pas des circuits d'exercices.
export const SESSIONS = {
  renfo: { intro: 'Un circuit simple : enchaîne les exercices ci-dessous, puis recommence le tour. Choisis une charge qui te permet de faire toutes les répétitions proprement, avec 2 ou 3 répétitions « en réserve ».', tips: ['Échauffe-toi 5 à 10 min (vélo ou marche sur place, rotations des épaules et des hanches).', 'Repose-toi 1 min entre les exercices et 2 min entre les tours.', 'Une gêne légère est normale, une douleur vive non : arrête l\'exercice.'] },
  gainage: { intro: 'Le gainage renforce les muscles profonds du ventre et du dos : ils tiennent la colonne et protègent le dos au quotidien. Enchaîne les exercices ci-dessous dans l\'ordre, sur un tapis.', tips: ['Qualité avant durée : arrête la position dès que le dos se creuse ou que tu trembles trop.', 'Respire normalement pendant les positions tenues, ne bloque jamais ta respiration.', 'Au fil des semaines, ajoute 5 secondes aux positions tenues ou 2 répétitions.'] },
  velo: { intro: 'Pédalage à allure facile : tu dois pouvoir parler sans être essoufflé.', tips: ['Règle la selle : jambe presque tendue quand la pédale est en bas.', 'Vise une cadence régulière, environ 70 à 90 tours par minute, avec une résistance légère.', 'Termine par 2 à 3 min très tranquilles.'], video: 'réglage vélo d\'appartement position' },
  marche: { intro: 'Marche d\'un bon pas, plus vite qu\'en promenade : tu peux parler mais pas chanter.', tips: ['Balance les bras, regarde loin devant.', 'Commence et termine par 5 min plus tranquilles.', 'À deux, c\'est plus motivant : profitez-en pour discuter.'], video: 'marche active technique' },
  balade: { intro: 'Une longue marche tranquille, dehors si possible. Le but : bouger longtemps sans forcer.', tips: ['Choisis un parcours agréable (forêt, bord de l\'eau).', 'Prends de l\'eau.'] },
  course: { intro: 'Alternance course et marche à allure conversation : tu dois pouvoir parler en courant.', tips: ['5 min de marche d\'échauffement avant de commencer.', 'Petites foulées, pieds sous le corps, épaules relâchées.', 'Si ça tire ou si tu es essoufflé, marche : c\'est prévu et c\'est très bien.'], video: 'course à pied débutant alternance marche course' },
  mobilite: { intro: '10 minutes d\'étirements doux, sans à-coups. Tiens chaque position 30 secondes en respirant calmement.', tips: ['Nuque : incline doucement la tête vers une épaule, puis l\'autre (sans forcer en cas de douleur cervicale).', 'Épaules : grands cercles lents des bras, vers l\'avant puis vers l\'arrière.', 'Dos : à quatre pattes, arrondis puis creuse doucement le dos (chat et vache).', 'Hanches : en fente basse, genou arrière au sol, avance doucement le bassin.', 'Arrière des cuisses : assis, jambe tendue, penche-toi vers le pied, dos droit.'], video: 'étirements doux 10 minutes débutant' },
  respiration: { intro: 'Cohérence cardiaque : 5 minutes pour calmer le stress et mieux dormir.', tips: ['Assis, dos droit, pieds à plat, yeux fermés si tu veux.', 'Inspire par le nez pendant 5 secondes en gonflant le ventre.', 'Expire par la bouche pendant 5 secondes.', 'Recommence pendant 5 minutes (30 respirations). Une appli ou une vidéo de cohérence cardiaque peut te guider.'], video: 'cohérence cardiaque 5 minutes' },
};

export const videoUrl = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
