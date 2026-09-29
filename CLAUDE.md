# mail-mcp

Serveur MCP local (Node.js ESM, transport stdio) qui pilote Apple Mail sur macOS 27 via `osascript` (JXA, plus un script AppleScript). Utilisé depuis **Claude Desktop uniquement**.

## État d'avancement

| Lot | Contenu | État |
|---|---|---|
| 0 | Socle (runner osascript, erreurs, config, serveur) | fait |
| 1 | Lecture : `list_mailboxes`, `list_messages`, `search_messages`, `read_message` | fait |
| 2 | Organisation : `move_message`, `flag_message`, `mark_read` | fait |
| 3 | Pièces jointes : `save_attachment` | fait |
| 4 | Écriture : `draft_email`, `forward_email`, `send_email` | fait |
| 5 | Suppression : `delete_message` | fait |

Les 12 tools ont été essayés sur le vrai compte le 2026-09-29, sur des messages de test `[mail-mcp test]` envoyés à soi-même puis mis à la corbeille.

Mise en service dans Claude Desktop faite le 2026-09-29 : démarrage confirmé par le journal (`Server started and connected successfully`, puis `tools/list`).

## Structure

```
index.js              serveur MCP stdio, enregistrement des tools
src/config.js         constantes (compte, timeout, limites, boîtes spéciales)
src/errors.js         MailMcpError + codes d'erreur
src/osascript.js      runner unique : runJxa (script statique via -e, entrée JSON via stdin) et
                      runAppleScript (fichier statique, valeurs par argv), timeout 15 s
src/escape.js         échappement AppleScript (non utilisé par le serveur : filet de sécurité testé)
src/result.js         mise en forme des réponses MCP (succès / erreur)
src/mailboxes.js      fonctions pures sur les boîtes (arbre, inclusion)
src/paths.js          expansion de ~, validation des noms, anti-collision, contrôle des fichiers à joindre
src/preview.js        aperçu texte d'un brouillon, empreinte, draft_id
src/quote.js          citation (réponse) et reprise du message d'origine (transfert)
src/tools/shared.js   schémas communs, règle de confirmation
src/tools/read.js     list_mailboxes, list_messages, search_messages, read_message
src/tools/organize.js move_message, flag_message, mark_read
src/tools/attachments.js  save_attachment
src/tools/compose.js  draft_email, send_email
src/tools/reply.js    réponse native (appelée par draft_email)
src/tools/forward.js  forward_email
src/tools/delete.js   delete_message
src/jxa/_prelude.js   helpers JXA communs + fonction run() (enveloppe {ok,data} / {ok:false,code})
src/jxa/_compose.js   helpers de composition, ajoutés au prélude pour les opérations de brouillon
src/jxa/<op>.js       un script statique par opération, expose main(input, Mail)
src/applescript/fill_draft.applescript   seul script AppleScript : écrit sujet, corps et pièces jointes d'un brouillon
scripts/smoke.js      test de fumée en lecture seule (client MCP stdio)
test/                 tests unitaires sans Mail (node --test)
```

## Commandes

```bash
npm test           # tests unitaires (ne touchent pas à Mail) — `node --test` sans argument
npm run smoke      # lecture seule : liste des tools, list_mailboxes, list_messages sur INBOX
npm run inspect    # inspector MCP : npx @modelcontextprotocol/inspector node index.js
```

- Mail doit être **ouvert** : le serveur ne le lance pas (erreur `MAIL_NOT_RUNNING`).
- `npm run smoke` et `npm run inspect` lancent leur propre instance du serveur : ils fonctionnent que Claude Desktop soit ouvert ou non.

## Configuration dans Claude Desktop

Fichier : `~/Library/Application Support/Claude/claude_desktop_config.json` (Réglages > Développeur > Modifier la configuration).

```json
"Mail Mac Os": {
  "command": "/usr/local/bin/node",
  "args": ["/Users/vous/MCP-Local-Mail-OS/index.js"]
}
```

- L'entrée `Mail Mac Os` est placée dans `mcpServers`, à côté des serveurs déjà présents. **La clé de l'entrée est le nom affiché dans Claude Desktop** ; elle s'appelait `mail` avant d'être renommée le 2026-09-29 à la demande de l'utilisateur. Le nom interne du serveur (`mail-mcp`, dans `index.js`) n'est pas affiché et n'a pas changé. Ne jamais réécrire le fichier entier : il contient aussi `preferences` et `coworkUserFilesPath`.
- Toujours faire une copie de sauvegarde du fichier avant de le modifier.
- **Commande = chemin absolu de Node.** Claude Desktop ne lit pas la configuration du shell : le Node de nvm (`~/.nvm/versions/node/<version>/bin/node`) lui est invisible, et son chemin change à chaque mise à jour. Préférer un chemin stable comme `/usr/local/bin/node` (Node ≥ 20).
- Les chemins du fichier sont absolus : `~` n'y est pas développé.
- **Après toute modification du code ou de la configuration : quitter Claude Desktop avec Cmd+Q puis le relancer.** Fermer la fenêtre ne suffit pas ; le serveur n'est démarré qu'au lancement de l'application.
- L'autorisation Automation est accordée par application : sous Claude Desktop, c'est **Claude** qui doit être autorisé à contrôler **Mail** (Réglages Système > Confidentialité et sécurité > Automatisation). L'autorisation donnée au Terminal pour `npm run smoke` ne vaut pas pour Claude.
- Journaux : `~/Library/Logs/Claude/mcp-server-Mail Mac Os.log` (ce serveur, y compris tout ce qu'il écrit sur stderr ; le fichier porte le nom de l'entrée, l'ancien `mcp-server-mail.log` n'est plus alimenté) et `~/Library/Logs/Claude/mcp.log` (tous les serveurs).
- Variable d'environnement facultative, à déclarer dans `"env"` : `MAIL_MCP_HIDE_DRAFTS=1` (brouillons sans fenêtre, déconseillé avec Antidote).

### Claude Code

Le serveur n'est déclaré dans **aucune** configuration de Claude Code. Il l'avait été en portée locale pour ce dossier (`claude mcp add mail -- node …`), puis retiré le 2026-09-29 à la demande de l'utilisateur (`claude mcp remove mail`). Ne pas le redéclarer sans demande explicite.

## Conventions (à respecter dans tout nouveau code)

### 1. Périmètre : compte iCloud uniquement
- Toute opération part de `Mail.accounts.byName("iCloud")` via `getAccount()` du prélude, qui vérifie aussi que le type du compte est `iCloud`.
- Ne jamais utiliser les objets globaux de Mail (`inbox`, `trash mailbox`, `drafts mailbox`, `Mail.mailboxes`) : ils agrègent tous les comptes.
- Le nom du compte est une constante (`src/config.js`), volontairement non surchargeable.

### 2. Confirmation en deux temps
- `send_email` et `delete_message` n'agissent que si `confirm === true` (comparaison stricte), vérifié **côté Node avant tout appel osascript**.
- `draft_email` et `forward_email` créent un brouillon et renvoient un aperçu ; ils n'envoient jamais.
- Suppression = déplacement vers `Deleted Messages` du compte. Jamais de commande `delete`, jamais de vidage de corbeille. Un message déjà dans la corbeille est refusé.
- `send_email` refuse aussi si le brouillon a changé depuis l'aperçu (`DRAFT_CHANGED`) : l'erreur contient le nouvel aperçu et le nouveau `draft_id`, à remontrer à l'utilisateur.
- **Ne jamais annoncer un envoi sur la foi du retour de `send`** : seul `sent: true` dans la réponse de `send_email` fait foi.

### 3. Aucune injection dans les scripts
- Les scripts JXA sont des **fichiers statiques**. Le texte exécuté = `_prelude.js` + `<op>.js`, sans aucune donnée utilisateur.
- Les entrées passent en JSON sur **stdin** et sont lues par `readInput()`. `spawn` est appelé sans shell.
- AppleScript (`fill_draft.applescript`) : fichier statique, valeurs passées par **argv** (`on run argv`), copiées dans des variables locales **avant** le bloc `tell`.
- `src/escape.js` n'est utilisé par aucun script : il ne servirait que si un littéral devait un jour être généré.
- Tous les contrôles de chemin (`save_attachment`, `attachments[]`) ont lieu côté Node, avant tout appel à Mail.

### 4. Identification
- Message = couple `(id, mailbox)`. L'`id` seul n'est pas fiable entre boîtes.
- Boîte = **chemin complet** (`Archives/Clients/Paie`), sensible aux espaces finaux (`Projets `).
- Résolution d'une boîte : correspondance exacte, sinon correspondance unique insensible à la casse et aux espaces de bord. Les sorties renvoient toujours le chemin canonique.

### 5. Performance (timeout de 15 s par appel osascript)
- **Interdit** : accès aux messages par index (`messages[i]`), plages, filtres `whose` sur une grosse boîte.
- **À utiliser** : propriété en masse sur toute la boîte (`mb.messages.id()`), puis accès par id (`mb.messages.byId(id)`).
- Une opération longue est découpée en plusieurs appels osascript, orchestrés par Node.
- **Budget de temps interne** : toute boucle par message ou par boîte dans un script JXA teste `outOfTime(input)` et renvoie le reste à traiter (`remaining`, `remaining_mailboxes`) ; Node rappelle le script tant qu'il reste du travail. Budget : 8 s (6 s pour `search_headers`, car une lecture en masse ne s'interrompt pas).
- Les durées varient du simple au triple selon l'activité de Mail : ne jamais dimensionner un lot fixe au plus juste.

### 6. Divers
- Journalisation sur **stderr** uniquement : stdout est réservé au protocole MCP.
- Sortie d'un tool : JSON dans `content[0].text` + `structuredContent`. Erreur : `isError: true` avec `{code, message, details?}`.

## Contrat des tools

`MessageSummary` = `{id, mailbox, subject, sender, date (ISO 8601), read, flagged, has_attachments}`

| Tool | Entrée | Sortie |
|---|---|---|
| `list_mailboxes` | — | `{account, mailbox_count, mailboxes:[{name, path, message_count, unread_count, children}]}` |
| `list_messages` | `mailbox="INBOX"`, `limit=20` (1–100), `unread_only=false` | `{mailbox, total, returned, unread_total?, messages: MessageSummary[]}`, du plus récent au plus ancien |
| `search_messages` | `query` (≥ 2 car.), `mailbox?`, `limit=20` (1–100), `content_scan_limit=30` (0–500) | `{query, searched_mailboxes, messages_in_scope, total_matches, returned, truncated, content_scanned, content_scan_complete, note?, messages:(MessageSummary & {matched_in})[]}` |
| `read_message` | `id`, `mailbox` | `{id, mailbox, message_id, subject, sender, reply_to, to, cc, bcc, date_sent, date_received, read, flagged, headers_raw, body, body_length, body_truncated, attachments:[{name, size, mime_type, downloaded}]}` |

Précisions sur `search_messages` :
- insensible à la casse et aux accents ;
- `matched_in` vaut `subject`, `sender` ou `content` ; le contenu n'est parcouru que pour les messages que sujet et expéditeur n'ont pas trouvés ;
- le parcours du contenu s'arrête à `content_scan_limit` messages ou au bout de 25 s ; `content_scanned` donne le nombre réel.

Un argument invalide (type, borne) est rejeté par le SDK avant d'atteindre le handler, avec un message `Input validation error`. C'est pourquoi `confirm` est déclaré optionnel : le refus vient du handler, avec le code `CONFIRMATION_REQUIRED`.

| Tool | Entrée | Sortie |
|---|---|---|
| `move_message` | `id`, `from_mailbox`, `to_mailbox` | `{moved, id, subject, from, to, new_id, note?}` — boîte cible absente : `MAILBOX_NOT_FOUND` avec `existing_mailboxes`, aucune création |
| `flag_message` | `id`, `mailbox`, `flagged=true` | `{id, mailbox, subject, flagged}` (valeur relue dans Mail) |
| `mark_read` | `id`, `mailbox`, `read=true` | `{id, mailbox, subject, read}` (valeur relue dans Mail) |
| `save_attachment` | `id`, `mailbox`, `attachment_name`, `target_dir="~/Downloads/mail-mcp"` | `{path (absolu), name, original_name, size, renamed, note?}` |
| `draft_email` | `to[]`, `cc[]?`, `bcc[]?`, `subject`, `body`, `reply_to_id?`, `reply_to_mailbox?`, `attachments[]?` | `DraftResult` ; pour une réponse, `to` et `subject` peuvent être vides |
| `forward_email` | `id`, `mailbox`, `to[]`, `cc[]?`, `body?`, `attachments[]?` | `DraftResult` avec `details.forward_mode = "fallback"` |
| `send_email` | `draft_id`, `confirm` | `{sent, status: "sent" \| "awaiting_manual_send", draft_id, to, cc, bcc, subject, message?}` |
| `delete_message` | `id`, `mailbox`, `confirm` | `{deleted, moved_to: "Deleted Messages", id, subject, from, new_id, undo, note?}` |

`DraftResult` = `{draft_id, sent: false, saved_in: "Drafts", draft_message: {id, mailbox} \| null, preview (texte), details: {from, to, cc, bcc, subject, body, attachments: [{name, size, path?}], in_reply_to?, forward_mode?}, warnings[], next_step}`

- `draft_id` a la forme `<id de composition>-<empreinte>` (ex. `7-d31ee58fbc`).
- `draft_message` désigne la copie enregistrée dans `Drafts` : c'est avec elle qu'on met un brouillon à la corbeille (`delete_message`).
- Après un déplacement, l'id du message change : utiliser `new_id` avec la nouvelle boîte.
- Destinataires : `adresse@exemple.fr` ou `Prénom Nom <adresse@exemple.fr>`, un par élément de tableau.

### Codes d'erreur
`ACCOUNT_NOT_FOUND`, `MAILBOX_NOT_FOUND` (avec la liste des boîtes), `MESSAGE_NOT_FOUND`, `ATTACHMENT_NOT_FOUND` (pièce absente du message, ou fichier à joindre absent du disque), `DRAFT_NOT_FOUND`, `DRAFT_CHANGED`, `INVALID_ARGUMENT`, `CONFIRMATION_REQUIRED`, `AUTOMATION_DENIED`, `MAIL_NOT_RUNNING`, `TIMEOUT`, `OSASCRIPT_ERROR`.

## Constats et pièges sur macOS 27 (Mail 16.0)

Mesures faites le 2026-09-29 sur un compte réel (boîte de réception d'environ 43 000 messages, environ 80 boîtes).

| Piège | Solution retenue |
|---|---|
| Accès à un message par index ≈ 0,5 s par événement Apple (20 messages = 21 s). Plage AppleScript `messages 1 thru 20` = 29 s | Ids et dates en masse (≈ 1,5 s pour toute la boîte), tri en JS, puis détails par `byId` (≈ 100 ms par message) |
| `whose subject contains …` sur INBOX = 57 s | Sujets et expéditeurs récupérés en masse puis filtrés en JS (≈ 3,5 s) |
| Lecture du corps : 150 à 500 ms par message (23 messages en 8,3 s mesurés) | Recherche dans le contenu limitée aux messages les plus récents : 30 par défaut, budget global de 25 s |
| Une boîte qui ne sert que de conteneur (elle ne contient que des sous-boîtes) refuse la lecture en masse avec `-1728`, alors qu'une boîte vide ordinaire renvoie une liste vide | `bulk()` traite `-1728` comme une boîte vide |
| Coût fixe ≈ 85 ms par boîte en lecture en masse ; résoudre le chemin relisait la liste des boîtes à chaque fois (+50 ms) | Liste des chemins mise en cache pour la durée du script ; recherche globale ≈ 15 s pour environ 80 boîtes |
| `account.mailboxes` est une liste **à plat** ; `name` renvoie le nom feuille, l'adresse réelle est un chemin | Chemin extrait du spécificateur renvoyé par Mail (`Automation.getDisplayString`), repli sur la chaîne des `container` |
| Compte, boîte ou message introuvable : même erreur `-1728` | Résolution étape par étape dans le prélude pour produire des codes distincts |
| Chaque propriété lue par id coûte un événement Apple (16 à 40 ms) : 100 messages = 10 à 24 s | Budget de temps interne et rappel du script ; pour une boîte de moins de 5 000 messages, détails lus en masse |
| `properties()` d'un message renvoie aussi `content` et `source` (≈ 1 s par message) | Non utilisé |
| Les tableaux récupérés en masse peuvent être désalignés si un mail arrive entre deux événements | Contrôle des longueurs et nouvel essai ; les valeurs renvoyées sont toujours relues par id |
| Premier appel depuis un nouveau client : boîte de dialogue d'autorisation, l'appel peut dépasser 15 s | Erreur `TIMEOUT` explicite ; relancer après avoir autorisé (Réglages Système > Confidentialité et sécurité > Automatisation) |
| `osascript` : script sur stdin ou via `-e` | Script statique via `-e`, données via stdin lues avec `NSFileHandle` (pas de limite de taille d'argument) |

### Composition et envoi (sondes du 2026-09-29)

| Piège | Solution retenue |
|---|---|
| **Antidote** (extension Mail `com.druide.Connectix`) intercepte tout envoi pour sa correction. `send` renvoie `true` alors que rien ne part : le message reste dans `Drafts` et dans `outgoing messages` | `send_email` ne fait jamais confiance au retour de `send` : il vérifie que le message a quitté la composition. Sinon il répond `sent:false, status:"awaiting_manual_send"` et l'utilisateur termine dans Mail (choix de l'utilisateur : il clique lui-même sur Envoyer) |
| `visible` d'un `outgoing message` ne peut plus être modifié après création (reste `false`, en JXA comme en AppleScript) | La visibilité se décide à la création. Les brouillons sont créés **avec fenêtre visible**, sinon l'utilisateur ne peut ni voir Antidote ni cliquer sur Envoyer |
| L'`id` d'un `outgoing message` est un compteur de session (0, 1, 2…) remis à zéro au redémarrage de Mail | `draft_id` = `<id>-<empreinte>` ; l'empreinte (sujet, destinataires, corps) est revérifiée avant l'envoi |
| `content.attachments` d'un `outgoing message` relu depuis un autre processus renvoie 0, alors que la copie dans `Drafts` contient bien la pièce jointe | Les pièces jointes sont vérifiées sur la copie enregistrée dans `Drafts` (`mail attachments`) |
| `close saving no` fonctionne sur un message visible ; sur un message invisible il répond sans erreur mais le message reste listé | Encore une raison de créer les brouillons visibles |
| `reply` sur un message de la boîte `Drafts` : délai dépassé (-1712) et Mail bloqué, fermeture forcée nécessaire | Ne jamais appeler `reply`/`forward` sur un message de `Drafts`. Commandes natives à n'essayer que sur un message reçu |
| Un script envoyé à Mail après sa fermeture le **relance** | `run()` vérifie `Mail.running()` avant tout |
| Plusieurs demandes d'envoi en attente derrière Antidote finissent par bloquer Mail | Une seule demande d'envoi à la fois pendant les essais ; ne jamais enchaîner des `send` sans vérifier l'état |
| Une fois la fenêtre affichée, Mail réécrit le texte (ligne vide → espace, espace en fin de ligne) | Empreinte calculée sur le texte sans tenir compte des espaces |
| Après un envoi réel (clic de l'utilisateur), le message quitte `outgoing messages`, sa copie quitte `Drafts` et il apparaît dans `Sent Messages` | C'est le critère de `sent: true` |
| `reply` natif sur un message **reçu** : fonctionne (0,4 s), pose In-Reply-To et References, mais n'insère aucune citation et `content` se lit vide | La citation est construite par le serveur (`src/quote.js`) |
| En JXA, `msg.content = …` est ignoré sans erreur sur une réponse native | Écriture par `fill_draft.applescript` ; la signature de Mail est conservée |
| En AppleScript, `item n of argv` utilisé **dans** un bloc `tell application "Mail"` est pris pour un objet de Mail (erreur -1700, ou écriture ignorée sans erreur) | Copier les arguments dans des variables locales avant le `tell` ; idem pour `POSIX file` |
| `forward` natif : le brouillon contient bien le message d'origine et ses pièces jointes, mais y écrire un texte les **efface** (il ne reste que la signature) | `forward_email` n'utilise pas `forward` : nouveau message `Fwd: …`, message d'origine repris dans le corps, pièces jointes extraites dans un dossier temporaire puis réattachées. Vérifié par un envoi réel : pièce jointe identique à l'octet près |
| Mail renvoie les noms de pièces jointes en forme décomposée (NFD) | Comparaison après normalisation NFC |
| Déplacement vers une grosse boîte : lire les `message id` en masse dépasse le timeout | Ids en masse, puis `message id` lu par id sur les seuls nouveaux venus ; budget de 5 s |
| Mail, application en bac à sable, écrit sans difficulté dans `~/Downloads`, dans le dossier temporaire du système et dans un dossier quelconque créé par Node | Aucun dossier intermédiaire nécessaire |

## Décisions d'architecture

- **JXA plutôt qu'AppleScript** : JSON natif, et les accès en masse / par id y sont simples. AppleScript reste un repli ponctuel.
- **Client utilisé : Claude Desktop uniquement** (choix de l'utilisateur, 2026-09-29). Détails dans la section « Configuration dans Claude Desktop ».
- **Emplacement** : le projet n'a pas d'emplacement imposé ; les chemins des exemples (`/Users/vous/MCP-Local-Mail-OS`) sont à adapter.
- **Dépôt public** : `https://github.com/Dev-First-France/MCP-Local-Mail-OS`. Aucun fichier du dépôt ne doit contenir de donnée tirée d'une vraie messagerie (nom de boîte, expéditeur, sujet, adresse, chemin personnel) : n'utiliser que des exemples génériques.
- **Recherche sans boîte** : toutes les boîtes du compte sauf `Deleted Messages` et `Junk` (choix de l'utilisateur).
- **Mail n'est pas lancé automatiquement** : un lancement à froid dépasse le timeout et déclenche une synchronisation.
- **Écart par rapport au plan** : `content_scan_limit` vaut 30 par défaut (et non 100) et le parcours du contenu est plafonné à 25 s, car la lecture des corps s'est révélée jusqu'à trois fois plus lente que la première mesure. Une recherche reste ainsi sous les 45 s.
- **Lecture sans effet de bord** : `read_message` ne marque pas le message comme lu.
- **Brouillons** : `draft_id` repose sur l'`id` de l'`outgoing message`, seul objet accepté par `send`. Aucun état côté serveur : un brouillon reste envoyable après un redémarrage de Claude Desktop, tant que Mail n'a pas été quitté. Si Mail est quitté, le brouillon reste dans `Drafts` mais n'est plus envoyable par `send_email` (`DRAFT_NOT_FOUND` ou `DRAFT_CHANGED`).
- **Fenêtre de composition visible** par défaut, à cause d'Antidote. `MAIL_MCP_HIDE_DRAFTS=1` crée des brouillons sans fenêtre (à réserver à un Mac sans extension d'envoi).
- **Envoi en deux temps réels** (choix de l'utilisateur) : `send_email` déclenche l'envoi, Antidote s'ouvre, l'utilisateur valide et clique sur Envoyer. Le serveur ne contourne pas Antidote et n'utilise pas de pilotage d'interface (aucune autorisation Accessibilité demandée).
- **Transfert toujours par repli**, même sans texte d'accompagnement : un seul chemin de code, et un corps relisible donc vérifiable par l'empreinte.
- **Réponse** : `to` vide = répondre à l'expéditeur ; `to` fourni = remplace les destinataires proposés par Mail.
- **Écart par rapport au plan** : code d'erreur `DRAFT_CHANGED` et statut `awaiting_manual_send` ajoutés ; `to` et `subject` facultatifs pour une réponse.

## Essais sur le vrai compte : précautions

- N'utiliser que des messages de test dont le sujet commence par `[mail-mcp test]`, adressés à soi-même.
- Toute sonde lancée à la main doit avoir un garde-fou de temps ; tuer `osascript` ne débloque pas Mail.
- Après les essais : fermer les fenêtres de composition restantes (`close_draft`) et mettre les messages de test à la corbeille avec `delete_message`.
