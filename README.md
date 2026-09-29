# mail-mcp

Serveur MCP local qui pilote **Apple Mail** sur macOS pour **Claude Desktop** : tous les comptes activés dans Mail (iCloud, Gmail, Exchange/Outlook, IMAP).

- Lecture, recherche, organisation, pièces jointes, brouillons, transfert.
- **Aucune action irréversible sans confirmation** : l'envoi et la mise à la corbeille exigent `confirm: true`. Rien n'est jamais supprimé définitivement.
- Tout passe par `osascript` : aucun accès direct aux fichiers de Mail, aucun mot de passe, aucun pilotage de l'interface.

## Prérequis

- macOS avec Mail configuré sur au moins un compte
- Node.js 20 ou plus récent
- Claude Desktop
- Mail **ouvert** (le serveur ne le lance pas)

## Installation

```bash
git clone https://github.com/Dev-First-France/MCP-Local-Mail-OS.git
cd MCP-Local-Mail-OS
npm install
npm test
npm run smoke
```

`npm run smoke` est en lecture seule : il liste les tools, les comptes, les boîtes et les 5 derniers messages reçus, tous comptes confondus. Au premier lancement, macOS demande d'autoriser le Terminal à contrôler Mail : acceptez, puis relancez la commande si elle a dépassé le délai.

## Configuration dans Claude Desktop

### 1. Trouver le chemin absolu de Node

Claude Desktop ne lit pas la configuration de votre shell : il ne connaît ni nvm ni votre `PATH`. Il faut donc lui donner un **chemin absolu** vers Node, de préférence un chemin qui ne change pas à chaque mise à jour.

```bash
ls -l /usr/local/bin/node /opt/homebrew/bin/node 2>/dev/null   # installations stables
/usr/local/bin/node --version                                   # doit afficher v20 ou plus
```

Si `/usr/local/bin/node` ou `/opt/homebrew/bin/node` existe, utilisez-le. À défaut, `which node` donne le chemin du Node courant ; avec nvm, ce chemin contient le numéro de version et devra être corrigé après chaque mise à jour de Node.

### 2. Ouvrir le fichier de configuration

Dans Claude Desktop : menu **Claude > Réglages…** (Cmd+,), onglet **Développeur**, bouton **Modifier la configuration**. Le Finder s'ouvre sur le fichier `claude_desktop_config.json`.

Ou directement depuis le Terminal :

```bash
open -e ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### 3. Déclarer le serveur

Ajoutez l'entrée `Mail Mac Os` dans l'objet `mcpServers`. Le nom de l'entrée est celui que Claude Desktop affiche dans la liste des connecteurs : vous pouvez le choisir librement. Si le fichier ne contient pas encore de serveur :

```json
{
  "mcpServers": {
    "Mail Mac Os": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/vous/MCP-Local-Mail-OS/index.js"]
    }
  }
}
```

S'il en contient déjà, ajoutez `Mail Mac Os` **à côté** des autres, séparé par une virgule, sans toucher au reste du fichier :

```json
{
  "mcpServers": {
    "autre-serveur": {
      "command": "…",
      "args": ["…"]
    },
    "Mail Mac Os": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/vous/MCP-Local-Mail-OS/index.js"]
    }
  }
}
```

Remplacez `/Users/vous/MCP-Local-Mail-OS` par le dossier où vous avez cloné le projet (`pwd` l'affiche), et `/usr/local/bin/node` par votre chemin de Node.

Points d'attention :

- les chemins sont absolus : `~` n'est pas compris dans ce fichier ;
- une virgule manquante ou en trop rend tout le fichier illisible, et **aucun** serveur ne démarre. Pour vérifier la syntaxe :

```bash
node -e 'JSON.parse(require("fs").readFileSync(process.env.HOME + "/Library/Application Support/Claude/claude_desktop_config.json", "utf8")); console.log("JSON valide")'
```

Options, à déclarer dans un objet `"env"` de l'entrée `Mail Mac Os` :

| Variable | Effet |
|---|---|
| `MAIL_MCP_DEFAULT_ACCOUNT` | Compte utilisé pour écrire un nouveau message quand aucun n'est précisé : nom du compte dans Mail, ou une de ses adresses. Par défaut `iCloud`. |
| `MAIL_MCP_HIDE_DRAFTS` | `1` pour créer les brouillons sans ouvrir de fenêtre dans Mail (déconseillé avec Antidote). |

```json
"Mail Mac Os": {
  "command": "/usr/local/bin/node",
  "args": ["/Users/vous/MCP-Local-Mail-OS/index.js"],
  "env": { "MAIL_MCP_DEFAULT_ACCOUNT": "Travail" }
}
```

### 4. Relancer Claude Desktop

Quittez complètement l'application avec **Cmd+Q**, puis relancez-la. Fermer la fenêtre ne suffit pas : la configuration n'est lue qu'au démarrage.

### 5. Vérifier

- **Réglages > Développeur** : le serveur `Mail Mac Os` apparaît dans la liste, avec l'état « en cours d'exécution ».
- Dans une conversation, le menu des outils et connecteurs liste `Mail Mac Os` et ses 13 tools.
- Essai sans risque : demandez « Liste mes comptes de messagerie ».

### 6. Autoriser le contrôle de Mail

Au premier appel d'un tool, macOS affiche « Claude souhaite contrôler Mail » : cliquez sur **Autoriser**. Si ce premier appel échoue par dépassement de délai, relancez-le.

En cas de refus par erreur : **Réglages Système > Confidentialité et sécurité > Automatisation**, puis activez **Mail** sous **Claude**.

### Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Le serveur n'apparaît pas dans Claude Desktop | Application non relancée, ou fichier JSON invalide | Cmd+Q puis relancer ; vérifier la syntaxe (commande ci-dessus) |
| Le serveur apparaît en échec | Chemin de Node ou de `index.js` incorrect, ou `npm install` non lancé | Vérifier les deux chemins ; relancer `npm install` |
| Erreur `AUTOMATION_DENIED` | Autorisation refusée | Réglages Système > Confidentialité et sécurité > Automatisation |
| Erreur `MAIL_NOT_RUNNING` | Mail est fermé | Ouvrir Mail |
| Erreur `TIMEOUT` | Demande d'autorisation affichée, ou Mail occupé | Répondre à la demande, puis réessayer |

Journaux de Claude Desktop :

```bash
tail -n 50 ~/Library/Logs/Claude/"mcp-server-Mail Mac Os.log"   # ce serveur
tail -n 50 ~/Library/Logs/Claude/mcp.log                         # tous les serveurs
```

Un démarrage réussi s'y lit ainsi : `Server started and connected successfully`.

### Autre client : Claude Code (facultatif)

Le serveur fonctionne aussi avec Claude Code, qui a sa propre configuration, indépendante de celle de Claude Desktop :

```bash
claude mcp add --scope user mail -- node /Users/vous/MCP-Local-Mail-OS/index.js
```

## Tools

| Tool | Rôle |
|---|---|
| `list_accounts` | Comptes de Mail, avec leurs adresses et leurs boîtes spéciales |
| `list_mailboxes` | Arborescence des boîtes avec nombre de messages et de non-lus |
| `list_messages` | Messages d'une boîte, du plus récent au plus ancien |
| `search_messages` | Recherche dans le sujet, l'expéditeur et le contenu |
| `read_message` | En-têtes, corps en texte (20 000 caractères au plus), liste des pièces jointes |
| `move_message` | Déplace un message vers une boîte existante, du même compte ou d'un autre |
| `flag_message` | Pose ou retire le drapeau |
| `mark_read` | Marque lu ou non lu |
| `save_attachment` | Enregistre une pièce jointe sur disque, sans rien écraser |
| `draft_email` | Crée un brouillon (ou une réponse) et renvoie un aperçu ; n'envoie pas |
| `forward_email` | Crée un brouillon de transfert avec les pièces jointes d'origine ; n'envoie pas |
| `send_email` | Envoie un brouillon, uniquement avec `confirm: true` |
| `delete_message` | Met un message à la corbeille de son compte, uniquement avec `confirm: true` |

### Comptes, boîtes et messages

- Un **compte** est désigné par son nom dans Mail (`iCloud`, `Travail`…) ou par une de ses adresses. Les comptes désactivés dans Mail sont ignorés.
- Les tools de lecture (`list_mailboxes`, `list_messages`, `search_messages`) acceptent d'omettre le compte : ils portent alors sur **tous les comptes activés**. Tous les autres tools exigent le compte.
- Une **boîte** est désignée par son chemin complet, par exemple `Archives/Clients`, ou par un nom générique valable pour tout compte : `INBOX`, `Drafts`, `Sent`, `Trash`, `Junk`. Le serveur le traduit dans le nom propre au fournisseur (`[Gmail]/Trash`, `Éléments supprimés`, `Deleted Messages`…).
- Un **message** est identifié par le triplet `(account, mailbox, id)`. Après un déplacement, son id change : le résultat donne le nouveau.
- Un **nouveau message** part du compte par défaut, sauf si `from_account` est précisé. Une réponse ou un transfert part du compte qui a reçu le message.

## L'envoi, pas à pas

1. `draft_email` ou `forward_email` ouvre une fenêtre de composition dans Mail, enregistre le brouillon dans les brouillons du compte expéditeur et renvoie un **aperçu**, expéditeur compris.
2. L'assistant vous montre l'aperçu et attend votre accord.
3. `send_email` avec `confirm: true` demande l'envoi à Mail.
4. Le résultat dit ce qui s'est réellement passé :
   - `sent: true` : le message est parti ;
   - `sent: false`, `status: "awaiting_manual_send"` : une extension de Mail retient l'envoi. Avec le correcteur **Antidote**, sa fenêtre s'ouvre : validez la correction puis cliquez sur **Envoyer** dans Mail.

Si vous modifiez le brouillon dans Mail après l'aperçu, `send_email` refuse (`DRAFT_CHANGED`) et renvoie le nouvel aperçu à valider.

## Exemples de prompts

1. « Quels sont mes 10 derniers mails non lus ? Résume chacun en une ligne. »
2. « Cherche les mails de mon fournisseur d'électricité de cette année et dis-moi le montant de la dernière facture. »
3. « Enregistre la facture en pièce jointe du dernier mail de mon hébergeur dans ~/Documents/Factures puis transfère ce mail à mon comptable, comptable@exemple.fr. »
4. « Prépare une réponse au dernier mail de Marie pour lui proposer jeudi à 14 h. Montre-moi le brouillon avant de l'envoyer. »
5. « Range dans la boîte Newsletter tous les mails de la boîte de réception dont l'expéditeur contient "newsletter", puis mets un drapeau sur le dernier mail de ma banque. »
7. « Quels comptes de messagerie as-tu à disposition ? Montre-moi les non-lus de chacun. »
8. « Écris à Paul depuis mon compte professionnel pour confirmer la réunion de lundi, et montre-moi le brouillon. »
6. « Mets à la corbeille les trois mails promotionnels que tu viens de lister, après m'avoir montré lesquels. »

## Limites à connaître

- La recherche dans le **contenu** ne porte que sur les messages les plus récents (30 par défaut, réglable avec `content_scan_limit`) et s'arrête au bout de 15 s. Le sujet et l'expéditeur sont cherchés dans tous les messages. Le résultat indique toujours ce qui a été parcouru.
- Une recherche sur tous les comptes peut prendre 30 à 50 s ; au-delà de 35 s passées dans les sujets et expéditeurs, elle s'arrête et liste les boîtes non parcourues. Préciser le compte ou la boîte la ramène à quelques secondes.
- La recherche par défaut ignore la corbeille, les indésirables et la boîte « All Mail » de Gmail. Nommez la boîte pour y chercher.
- Lister 100 messages d'une très grosse boîte prend une quinzaine de secondes.
- Les boîtes locales « Sur mon Mac » ne sont pas gérées.
- Essais réels : tous les tools sur iCloud et Gmail. Sur Exchange/Outlook, la réponse, le transfert et le déplacement d'un message reçu n'ont pas été vérifiés.
- Un brouillon ne peut être envoyé par `send_email` que tant que Mail n'a pas été quitté. Après un redémarrage de Mail, il reste dans les brouillons du compte : envoyez-le depuis Mail ou recréez-le.
- Le transfert reprend le message d'origine en **texte** : la mise en forme HTML n'est pas conservée. Les pièces jointes le sont.
- Les brouillons sont en texte brut ; Mail y ajoute votre signature.
- Chaque brouillon ouvre une fenêtre dans Mail.
- Un brouillon abandonné reste dans les brouillons du compte : fermez sa fenêtre dans Mail, ou demandez sa mise à la corbeille.

## Développement

```bash
npm test          # tests unitaires, sans Mail
npm run smoke     # test de fumée en lecture seule
npm run inspect   # inspector MCP
```

Après toute modification du code, quittez Claude Desktop (Cmd+Q) et relancez-le : le serveur est démarré une seule fois, au lancement de l'application.

Conventions, contrat détaillé des tools et pièges rencontrés sur macOS 27 : voir `CLAUDE.md`.
