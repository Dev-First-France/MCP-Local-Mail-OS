import os from 'node:os';
import path from 'node:path';

// Le compte est volontairement une constante : toutes les opérations sont
// limitées au compte iCloud, jamais aux autres comptes de Mail.app.
export const config = Object.freeze({
  accountName: 'iCloud',
  accountType: 'iCloud',

  osascriptTimeoutMs: 15_000,

  inboxMailbox: 'INBOX',
  draftsMailbox: 'Drafts',
  trashMailbox: 'Deleted Messages',
  junkMailbox: 'Junk',

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
  // Lire un corps coûte 0,15 à 0,5 s : la recherche dans le contenu est bornée en nombre et en temps.
  contentScanLimitDefault: 30,
  contentScanLimitMax: 500,
  contentScanBudgetMs: 25_000,

  // Fenêtre de composition visible : indispensable pour qu'une extension comme Antidote
  // puisse s'afficher et que l'utilisateur termine l'envoi. Non modifiable après création.
  draftWindowVisible: process.env.MAIL_MCP_HIDE_DRAFTS !== '1',
  sendCheckBudgetMs: 6_000,
  forwardBodyMaxChars: 200_000,

  defaultDownloadDir: path.join(os.homedir(), 'Downloads', 'mail-mcp'),
});
