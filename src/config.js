import os from 'node:os';
import path from 'node:path';

export const config = Object.freeze({
  // Compte utilisé pour écrire un nouveau message quand aucun n'est précisé.
  // Nom du compte dans Mail, ou une de ses adresses.
  defaultAccount: process.env.MAIL_MCP_DEFAULT_ACCOUNT || 'iCloud',

  osascriptTimeoutMs: 15_000,

  bodyMaxChars: 20_000,
  listLimitMax: 100,

  // Budget interne d'un script JXA : il rend la main avant d'être tué par le timeout.
  jxaBudgetMs: 8_000,
  // Déplacement : la relecture de la boîte cible (en masse) ne s'interrompt pas, d'où un budget court.
  moveBudgetMs: 5_000,
  // En dessous de ce nombre de messages, les détails sont lus en masse plutôt que par id.
  bulkDetailsThreshold: 5_000,

  // Recherche : une lecture en masse ne peut pas être interrompue, d'où un budget plus court.
  searchHeadersBudgetMs: 6_000,
  // Budget global de la recherche dans les sujets et expéditeurs, tous comptes confondus.
  searchHeadersTotalBudgetMs: 35_000,
  // Lire un corps coûte 0,15 à 0,5 s : la recherche dans le contenu est bornée en nombre et en temps.
  contentScanLimitDefault: 30,
  contentScanLimitMax: 500,
  contentScanBudgetMs: 15_000,

  // Gmail range une copie de chaque message dans cette boîte : la parcourir doublerait les résultats.
  allMailPattern: /^\[(Gmail|Google Mail)\]\/(All Mail|Tous les messages|Tous les courriers)$/i,

  // Fenêtre de composition visible : indispensable pour qu'une extension comme Antidote
  // puisse s'afficher et que l'utilisateur termine l'envoi. Non modifiable après création.
  draftWindowVisible: process.env.MAIL_MCP_HIDE_DRAFTS !== '1',
  sendCheckBudgetMs: 6_000,
  forwardBodyMaxChars: 200_000,

  defaultDownloadDir: path.join(os.homedir(), 'Downloads', 'mail-mcp'),
});
