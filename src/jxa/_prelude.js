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

// Toutes les opérations passent par ici : compte désigné par son nom, type vérifié.
function getAccount(Mail, input) {
  const names = Mail.accounts.name();
  if (names.indexOf(input.account) === -1) {
    fail('ACCOUNT_NOT_FOUND', 'Compte « ' + input.account + ' » introuvable dans Mail.', { existing_accounts: names });
  }
  const acc = Mail.accounts.byName(input.account);
  const type = String(acc.accountType());
  if (input.accountType && type !== input.accountType) {
    fail('ACCOUNT_NOT_FOUND', 'Le compte « ' + input.account + ' » n\'est pas de type ' + input.accountType + ' (type trouvé : ' + type + ').');
  }
  return acc;
}

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

// Un seul compte par exécution : la liste des chemins n'est lue qu'une fois.
let MAILBOX_PATHS = null;
function mailboxPaths(acc) {
  if (MAILBOX_PATHS === null) MAILBOX_PATHS = acc.mailboxes().map(pathOfMailbox);
  return MAILBOX_PATHS;
}

function looseKey(s) {
  return String(s).normalize('NFC').trim().toLowerCase();
}

// Correspondance exacte, sinon correspondance unique insensible à la casse et aux espaces de bord.
function resolveMailboxPath(acc, wanted) {
  const paths = mailboxPaths(acc);
  if (paths.indexOf(wanted) !== -1) return wanted;
  const key = looseKey(wanted);
  const close = paths.filter(function (p) {
    return looseKey(p) === key;
  });
  if (close.length === 1) return close[0];
  fail(
    'MAILBOX_NOT_FOUND',
    'Boîte « ' + wanted + ' » introuvable dans le compte ' + acc.name() + '. Utilisez un des chemins existants (aucune boîte n\'est créée automatiquement).',
    { existing_mailboxes: paths },
  );
}

function getMailbox(acc, wanted) {
  const path = resolveMailboxPath(acc, wanted);
  return { path: path, ref: acc.mailboxes.byName(path) };
}

function getMessage(mb, id) {
  const msg = mb.ref.messages.byId(id);
  try {
    msg.id();
  } catch (e) {
    fail('MESSAGE_NOT_FOUND', 'Message ' + id + ' introuvable dans la boîte « ' + mb.path + ' ». L\'id change quand un message est déplacé : relancez list_messages ou search_messages.', {
      id: id,
      mailbox: mb.path,
    });
  }
  return msg;
}

function summaryOf(msg, id, mailboxPath) {
  return {
    id: id,
    mailbox: mailboxPath,
    subject: orNull(function () { return msg.subject(); }) || '',
    sender: orNull(function () { return msg.sender(); }) || '',
    date: iso(orNull(function () { return msg.dateReceived(); })),
    read: msg.readStatus(),
    flagged: msg.flaggedStatus(),
    has_attachments: (orNull(function () { return msg.mailAttachments.length; }) || 0) > 0,
  };
}

// Recherche insensible à la casse et aux accents.
function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Récupère plusieurs propriétés en masse ; recommence si un mail est arrivé entre deux événements.
// Une boîte qui ne sert que de conteneur (uniquement des sous-boîtes) refuse la lecture en masse avec -1728 :
// elle est traitée comme une boîte vide.
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
  fail('OSASCRIPT_ERROR', 'La boîte « ' + mb.path + ' » change pendant la lecture. Réessayez dans quelques secondes.');
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
