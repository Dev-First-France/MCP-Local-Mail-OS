// Prélude JXA commun à toutes les opérations.
// Chaque opération définit main(input, Mail) ; run() gère l'entrée, la sortie et les erreurs.
ObjC.import('Foundation');

function readInput() {
  const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  const text = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
  return text ? JSON.parse(text) : {};
}

function fail(code, message, details) {
  const e = new Error(message);
  e.mailMcp = { code: code, message: message };
  if (details !== undefined) e.mailMcp.details = details;
  throw e;
}

function iso(d) {
  try {
    return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : null;
  } catch (e) {
    return null;
  }
}

function orNull(fn) {
  try {
    const v = fn();
    return v === undefined ? null : v;
  } catch (e) {
    return null;
  }
}

function looseKey(s) {
  return String(s).normalize('NFC').trim().toLowerCase();
}

// Comparaison insensible à la casse et aux accents.
function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ---------------------------------------------------------------------------------------------
// Comptes
// ---------------------------------------------------------------------------------------------

const ACCOUNTS = {};

// Un compte est désigné par son nom dans Mail, ou par une de ses adresses.
// Seuls les comptes activés sont utilisables. Renvoie { ref, name, id }.
function getAccount(Mail, wanted) {
  if (typeof wanted !== 'string' || wanted === '') {
    fail('INVALID_ARGUMENT', 'Le paramètre "account" est obligatoire (voir list_accounts).');
  }
  if (ACCOUNTS[wanted]) return ACCOUNTS[wanted];
  const refs = Mail.accounts();
  const names = Mail.accounts.name();
  const enabled = Mail.accounts.enabled();
  const usable = [];
  names.forEach(function (n, i) { if (enabled[i]) usable.push(i); });

  let hit = usable.filter(function (i) { return names[i] === wanted; });
  if (hit.length !== 1) hit = usable.filter(function (i) { return looseKey(names[i]) === looseKey(wanted); });
  if (hit.length !== 1) {
    hit = usable.filter(function (i) {
      const addresses = orNull(function () { return refs[i].emailAddresses(); }) || [];
      return addresses.some(function (a) { return looseKey(a) === looseKey(wanted); });
    });
  }
  if (hit.length !== 1) {
    const disabled = names.filter(function (n, i) { return !enabled[i] && looseKey(n) === looseKey(wanted); });
    fail(
      'ACCOUNT_NOT_FOUND',
      disabled.length > 0
        ? 'Le compte « ' + wanted + ' » est désactivé dans Mail.'
        : 'Compte « ' + wanted + ' » introuvable dans Mail. Utilisez un des comptes activés.',
      { enabled_accounts: usable.map(function (i) { return names[i]; }) },
    );
  }
  const i = hit[0];
  const account = { ref: refs[i], name: names[i], id: refs[i].id() };
  ACCOUNTS[wanted] = account;
  ACCOUNTS[account.name] = account;
  return account;
}

// ---------------------------------------------------------------------------------------------
// Boîtes
// ---------------------------------------------------------------------------------------------

// Le nom d'une boîte imbriquée est son nom feuille ; son adresse réelle est un chemin.
function pathOfMailbox(spec) {
  const shown = Automation.getDisplayString(spec);
  const m = shown.match(/\.mailboxes\.byName\((".*")\)$/);
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch (e) {}
  }
  const parts = [spec.name()];
  let cur = spec;
  for (let depth = 0; depth < 20; depth++) {
    let parent;
    try {
      parent = cur.container();
    } catch (e) {
      break;
    }
    if (!/\.mailboxes\./.test(Automation.getDisplayString(parent))) break;
    parts.unshift(parent.name());
    cur = parent;
  }
  return parts.join('/');
}

// Un seul passage par compte et par exécution.
const MAILBOX_PATHS = {};
function mailboxPaths(account) {
  if (!MAILBOX_PATHS[account.id]) MAILBOX_PATHS[account.id] = account.ref.mailboxes().map(pathOfMailbox);
  return MAILBOX_PATHS[account.id];
}

// Boîtes spéciales. Leur nom dépend du fournisseur (« Deleted Messages », « [Gmail]/Trash »,
// « Éléments supprimés »…) : on le lit dans les boîtes globales de Mail, dont chaque enfant
// appartient à un compte. C'est le SEUL usage permis des objets globaux de Mail.
const ROLES = ['inbox', 'drafts', 'sent', 'trash', 'junk'];
const SPECIAL = { done: false, byAccount: {} };
function specialMailboxes(Mail) {
  if (SPECIAL.done) return SPECIAL.byAccount;
  const globals = {
    inbox: function () { return Mail.inbox.mailboxes(); },
    drafts: function () { return Mail.draftsMailbox.mailboxes(); },
    sent: function () { return Mail.sentMailbox.mailboxes(); },
    trash: function () { return Mail.trashMailbox.mailboxes(); },
    junk: function () { return Mail.junkMailbox.mailboxes(); },
  };
  ROLES.forEach(function (role) {
    const children = orNull(globals[role]) || [];
    children.forEach(function (child) {
      // Le compte se lit dans le spécificateur, sans événement Apple supplémentaire.
      const m = Automation.getDisplayString(child).match(/\.accounts\.byId\("([^"]+)"\)\.mailboxes\.byName\((".*")\)$/);
      if (!m) return;
      let path;
      try {
        path = JSON.parse(m[2]);
      } catch (e) {
        return;
      }
      if (!SPECIAL.byAccount[m[1]]) SPECIAL.byAccount[m[1]] = {};
      if (!SPECIAL.byAccount[m[1]][role]) SPECIAL.byAccount[m[1]][role] = path;
    });
  });
  SPECIAL.done = true;
  return SPECIAL.byAccount;
}

function specialOf(Mail, account) {
  const found = specialMailboxes(Mail)[account.id] || {};
  const out = {};
  ROLES.forEach(function (role) { out[role] = found[role] || null; });
  return out;
}

function roleOf(Mail, account, path) {
  const special = specialOf(Mail, account);
  for (let i = 0; i < ROLES.length; i++) if (special[ROLES[i]] === path) return ROLES[i];
  return null;
}

function isInsidePath(path, ancestor) {
  return ancestor !== null && (path === ancestor || path.indexOf(ancestor + '/') === 0);
}

// Noms génériques acceptés à la place du nom propre au fournisseur (clés sans accents).
const ALIASES = {
  inbox: 'inbox', 'boite de reception': 'inbox', reception: 'inbox',
  drafts: 'drafts', draft: 'drafts', brouillons: 'drafts', brouillon: 'drafts',
  sent: 'sent', 'sent messages': 'sent', 'sent mail': 'sent', 'sent items': 'sent',
  envoyes: 'sent', 'elements envoyes': 'sent', 'messages envoyes': 'sent',
  trash: 'trash', corbeille: 'trash', bin: 'trash', 'deleted messages': 'trash', 'deleted items': 'trash',
  'elements supprimes': 'trash',
  junk: 'junk', spam: 'junk', indesirables: 'junk', 'courrier indesirable': 'junk',
};

// 1. chemin exact ; 2. nom générique (INBOX, Drafts, Sent, Trash, Junk…) ;
// 3. correspondance unique insensible à la casse et aux espaces de bord.
function resolveMailboxPath(Mail, account, wanted, optional) {
  const paths = mailboxPaths(account);
  if (paths.indexOf(wanted) !== -1) return wanted;
  const role = ALIASES[fold(wanted).trim()];
  if (role) {
    const path = specialOf(Mail, account)[role];
    if (path && paths.indexOf(path) !== -1) return path;
  }
  const key = looseKey(wanted);
  const close = paths.filter(function (p) { return looseKey(p) === key; });
  if (close.length === 1) return close[0];
  if (optional) return null;
  fail(
    'MAILBOX_NOT_FOUND',
    'Boîte « ' + wanted + ' » introuvable dans le compte ' + account.name + '. Utilisez un des chemins existants (aucune boîte n\'est créée automatiquement).',
    { account: account.name, existing_mailboxes: paths },
  );
}

function getMailbox(Mail, account, wanted, optional) {
  const path = resolveMailboxPath(Mail, account, wanted, optional);
  if (path === null) return null;
  return { account: account, path: path, ref: account.ref.mailboxes.byName(path) };
}

// Raccourci pour les opérations désignant une boîte par (compte, boîte).
const BOXES = {};
function boxOf(Mail, accountName, mailbox) {
  const key = accountName + '\u0000' + mailbox;
  if (!BOXES[key]) BOXES[key] = getMailbox(Mail, getAccount(Mail, accountName), mailbox);
  return BOXES[key];
}

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------

function getMessage(mb, id) {
  const msg = mb.ref.messages.byId(id);
  try {
    msg.id();
  } catch (e) {
    fail(
      'MESSAGE_NOT_FOUND',
      'Message ' + id + ' introuvable dans la boîte « ' + mb.path + ' » du compte ' + mb.account.name +
        '. L\'id change quand un message est déplacé : relancez list_messages ou search_messages.',
      { id: id, account: mb.account.name, mailbox: mb.path },
    );
  }
  return msg;
}

function summaryOf(msg, id, mb) {
  return {
    id: id,
    account: mb.account.name,
    mailbox: mb.path,
    subject: orNull(function () { return msg.subject(); }) || '',
    sender: orNull(function () { return msg.sender(); }) || '',
    date: iso(orNull(function () { return msg.dateReceived(); })),
    read: msg.readStatus(),
    flagged: msg.flaggedStatus(),
    has_attachments: (orNull(function () { return msg.mailAttachments.length; }) || 0) > 0,
  };
}

// Récupère plusieurs propriétés en masse ; recommence si un mail est arrivé entre deux événements.
// Une boîte qui ne sert que de conteneur (uniquement des sous-boîtes) refuse la lecture en masse
// avec -1728 : elle est traitée comme une boîte vide.
function bulk(mb, getters) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let cols;
    try {
      cols = getters.map(function (g) { return g(mb.ref.messages); });
    } catch (e) {
      if (e.errorNumber === -1728) return getters.map(function () { return []; });
      throw e;
    }
    const n = cols[0].length;
    if (cols.every(function (c) { return c.length === n; })) return cols;
  }
  fail('OSASCRIPT_ERROR', 'La boîte « ' + mb.path + ' » (' + mb.account.name + ') change pendant la lecture. Réessayez dans quelques secondes.');
}

// Chaque appel osascript est tué au bout de 15 s : les boucles par message s'arrêtent
// d'elles-mêmes avant, et renvoient ce qui reste à traiter à l'appel suivant.
const STARTED_AT = Date.now();
function outOfTime(input) {
  return Date.now() - STARTED_AT > (input.budget_ms || 8000);
}

function run(argv) {
  try {
    const input = readInput();
    const Mail = Application('Mail');
    if (!Mail.running()) {
      fail('MAIL_NOT_RUNNING', 'Mail n\'est pas ouvert. Ouvrez l\'application Mail puis réessayez.');
    }
    return JSON.stringify({ ok: true, data: main(input, Mail) });
  } catch (e) {
    if (e && e.mailMcp) return JSON.stringify(Object.assign({ ok: false }, e.mailMcp));
    return JSON.stringify({
      ok: false,
      errorNumber: e && e.errorNumber !== undefined ? e.errorNumber : null,
      message: e && e.message ? String(e.message) : String(e),
    });
  }
}
