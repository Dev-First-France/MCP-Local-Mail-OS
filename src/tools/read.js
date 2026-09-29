import { z } from 'zod';
import { allAccounts, defaultAccountOf, enabledAccounts } from '../accounts.js';
import { config } from '../config.js';
import { buildTree, isInside } from '../mailboxes.js';
import { runJxa } from '../osascript.js';
import { handler } from '../result.js';
import { MESSAGE_KEY, accountArg, mailboxArg, messageIdArg } from './shared.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const optionalAccount = accountArg.optional().describe('Compte de Mail (nom ou adresse). Omis : tous les comptes activés.');

const keyOf = (m) => `${m.account}\u0000${m.mailbox}\u0000${m.id}`;
const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '');
const byTimeDesc = (a, b) => b.t - a.t;

// Chaque appel s'arrête de lui-même avant le timeout et rend ce qui reste à traiter.
export async function fetchSummaries(items) {
  const found = new Map();
  let pending = items.map(({ id, account, mailbox }) => ({ id, account, mailbox }));
  while (pending.length > 0) {
    const res = await runJxa('message_summaries', { items: pending, budget_ms: config.jxaBudgetMs });
    for (const m of res.messages) found.set(keyOf(m), m);
    if (res.remaining.length >= pending.length) break;
    pending = res.remaining;
  }
  return items.map((item) => found.get(keyOf(item))).filter(Boolean);
}

async function accountNames(account) {
  return account ? [account] : (await enabledAccounts()).map((a) => a.name);
}

async function listAccounts() {
  const accounts = await allAccounts();
  return { default_account: defaultAccountOf(accounts), accounts };
}

async function listMailboxes({ account }) {
  const accounts = [];
  for (const name of await accountNames(account)) {
    const res = await runJxa('list_mailboxes', { account: name });
    accounts.push({
      account: res.account,
      special_mailboxes: res.special_mailboxes,
      mailbox_count: res.mailboxes.length,
      mailboxes: buildTree(res.mailboxes),
    });
  }
  return { accounts };
}

async function listMessages({ account, mailbox, limit, unread_only }) {
  if (account) {
    const sel = await runJxa('list_messages', {
      account,
      mailbox,
      limit,
      unread_only,
      budget_ms: config.jxaBudgetMs,
      bulk_threshold: config.bulkDetailsThreshold,
    });
    const messages = [...sel.messages, ...(await fetchSummaries(sel.remaining))].sort(byDateDesc);
    const box = { account: sel.account, mailbox: sel.mailbox, total: sel.total };
    if (unread_only) box.unread_total = sel.matching;
    return { mailboxes: [box], returned: messages.length, messages };
  }

  // Tous les comptes : on ne lit que les candidats (id, date) de chaque boîte, on fusionne,
  // puis on ne demande le détail que des messages retenus.
  const boxes = [];
  const skipped = [];
  let candidates = [];
  for (const name of await accountNames()) {
    const sel = await runJxa('list_messages', { account: name, mailbox, limit, unread_only, details: false, optional: true });
    if (!sel.found) {
      skipped.push({ account: sel.account, reason: `boîte « ${mailbox} » absente de ce compte` });
      continue;
    }
    const box = { account: sel.account, mailbox: sel.mailbox, total: sel.total };
    if (unread_only) box.unread_total = sel.matching;
    boxes.push(box);
    candidates.push(...sel.candidates);
  }
  candidates = candidates.sort(byTimeDesc).slice(0, limit);
  const messages = (await fetchSummaries(candidates)).sort(byDateDesc);
  const out = { mailboxes: boxes, returned: messages.length, messages };
  if (skipped.length > 0) out.skipped_accounts = skipped;
  return out;
}

// Périmètre par défaut d'un compte : toutes ses boîtes sauf corbeille, indésirables et « All Mail ».
async function defaultTargets(name) {
  const res = await runJxa('list_mailboxes', { account: name, with_counts: false });
  const { trash, junk, inbox } = res.special_mailboxes;
  const excluded = [];
  const kept = [];
  for (const box of res.mailboxes) {
    const out =
      (trash && isInside(box.path, trash)) || (junk && isInside(box.path, junk)) || config.allMailPattern.test(box.path);
    (out ? excluded : kept).push({ account: res.account, mailbox: box.path });
  }
  kept.sort((a, b) => (b.mailbox === inbox) - (a.mailbox === inbox));
  return { kept, excluded, inbox };
}

async function searchMessages({ query, account, mailbox, limit, content_scan_limit }) {
  let targets = [];
  const excluded = [];
  const names = await accountNames(account);
  if (mailbox) {
    targets = names.map((name) => ({ account: name, mailbox }));
  } else {
    const first = [];
    const rest = [];
    for (const name of names) {
      const scope = await defaultTargets(name);
      excluded.push(...scope.excluded);
      // Les boîtes de réception de tous les comptes passent avant le reste.
      for (const t of scope.kept) (t.mailbox === scope.inbox ? first : rest).push(t);
    }
    targets = [...first, ...rest];
  }

  const scope = new Map();
  const skipped = [];
  let matches = [];
  let candidates = [];
  let scannedHeaders = 0;
  let headerMatches = 0;
  const headersStarted = Date.now();
  while (targets.length > 0 && Date.now() - headersStarted < config.searchHeadersTotalBudgetMs) {
    const res = await runJxa('search_headers', {
      query,
      targets,
      match_limit: limit,
      candidate_limit: content_scan_limit,
      budget_ms: config.searchHeadersBudgetMs,
    });
    for (const s of res.searched) {
      const entry = scope.get(s.account) || { account: s.account, mailboxes_searched: 0, messages: 0 };
      entry.mailboxes_searched += 1;
      entry.messages += s.messages;
      scope.set(s.account, entry);
    }
    skipped.push(...res.skipped);
    scannedHeaders += res.scanned;
    headerMatches += res.total_matches;
    matches.push(...res.matches);
    candidates.push(...res.candidates);
    if (res.remaining.length >= targets.length) break;
    targets = res.remaining;
  }
  const notSearched = targets.length > 0 && scope.size + skipped.length > 0 ? targets : [];

  // Contenu : uniquement les messages les plus récents que sujet et expéditeur n'ont pas trouvés.
  candidates = candidates.sort(byTimeDesc).slice(0, content_scan_limit);
  let contentScanned = 0;
  let contentHits = 0;
  let budgetExhausted = false;
  const contentStarted = Date.now();
  while (candidates.length > 0) {
    if (Date.now() - contentStarted > config.contentScanBudgetMs) {
      budgetExhausted = true;
      break;
    }
    const res = await runJxa('search_content', { query, items: candidates, budget_ms: config.jxaBudgetMs });
    contentScanned += res.scanned;
    contentHits += res.hits.length;
    matches.push(...res.hits);
    if (res.remaining.length >= candidates.length) break;
    candidates = res.remaining;
  }

  const totalMatches = headerMatches + contentHits;
  matches = matches.sort(byTimeDesc).slice(0, limit);
  const matchedIn = new Map(matches.map((m) => [keyOf(m), m.matched_in]));
  const messages = (await fetchSummaries(matches)).map((m) => ({ ...m, matched_in: matchedIn.get(keyOf(m)) })).sort(byDateDesc);

  const out = {
    query,
    scope: [...scope.values()],
    messages_in_scope: scannedHeaders,
    total_matches: totalMatches,
    returned: messages.length,
    truncated: totalMatches > messages.length,
    search_complete: notSearched.length === 0,
    content_scanned: contentScanned,
    content_scan_complete: notSearched.length === 0 && contentScanned >= scannedHeaders - headerMatches,
    messages,
  };
  const notes = [];
  if (notSearched.length > 0) {
    out.not_searched = notSearched;
    notes.push(
      `Recherche interrompue au bout de ${Math.round(config.searchHeadersTotalBudgetMs / 1000)} s : ${notSearched.length} boîte(s) non parcourue(s), ` +
        'listées dans "not_searched". Précisez "account" ou "mailbox" pour les couvrir.',
    );
  }
  if (!out.content_scan_complete) {
    notes.push(
      content_scan_limit === 0
        ? "Le contenu n'a pas été parcouru (content_scan_limit = 0)."
        : `Sujet et expéditeur : ${scannedHeaders} messages parcourus. Contenu : seulement les ${contentScanned} plus récents` +
            `${budgetExhausted ? ' (budget de temps atteint)' : ''}. Augmentez content_scan_limit ou précisez une boîte pour aller plus loin.`,
    );
  }
  if (!mailbox) {
    notes.push('Boîtes exclues par défaut : corbeille, indésirables et « All Mail » de Gmail. Nommez-les dans "mailbox" pour y chercher.');
  }
  if (skipped.length > 0) out.skipped = skipped;
  if (notes.length > 0) out.notes = notes;
  return out;
}

async function readMessage({ account, mailbox, id }) {
  return runJxa('read_message', { account, mailbox, id, body_max: config.bodyMaxChars });
}

export function registerReadTools(server) {
  server.registerTool(
    'list_accounts',
    {
      title: 'Lister les comptes',
      description:
        'Comptes configurés dans Mail : nom, type, adresses, état activé ou non, et pour chaque compte activé le chemin de ses boîtes ' +
        'spéciales (réception, brouillons, envoyés, corbeille, indésirables), dont le nom varie selon le fournisseur. ' +
        '"default_account" est le compte utilisé pour écrire quand aucun n\'est précisé.',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    handler(listAccounts),
  );

  server.registerTool(
    'list_mailboxes',
    {
      title: 'Lister les boîtes',
      description:
        "Arborescence des boîtes d'un compte, ou de tous les comptes activés, avec pour chacune le nombre de messages et de non-lus. " +
        'Le champ "path" est l\'identifiant de la boîte ; "role" signale les boîtes spéciales.',
      inputSchema: { account: optionalAccount },
      annotations: READ_ONLY,
    },
    handler(listMailboxes),
  );

  server.registerTool(
    'list_messages',
    {
      title: 'Lister les messages',
      description:
        "Messages d'une boîte, du plus récent au plus ancien : id, compte, boîte, sujet, expéditeur, date, lu/non-lu, drapeau, pièces jointes. " +
        'Sans "account", fusionne la même boîte de tous les comptes activés : utiliser alors un nom générique ("INBOX", "Drafts", "Sent", "Trash", "Junk"). ' +
        MESSAGE_KEY,
      inputSchema: {
        account: optionalAccount,
        mailbox: mailboxArg.default('INBOX'),
        limit: z.number().int().min(1).max(config.listLimitMax).default(20).describe('Nombre maximal de messages (1 à 100).'),
        unread_only: z.boolean().default(false).describe('Ne renvoyer que les messages non lus.'),
      },
      annotations: READ_ONLY,
    },
    handler(listMessages),
  );

  server.registerTool(
    'search_messages',
    {
      title: 'Rechercher des messages',
      description:
        "Recherche insensible à la casse et aux accents dans le sujet, l'expéditeur et le contenu. " +
        'Sans "account", cherche dans tous les comptes activés ; sans "mailbox", dans toutes les boîtes sauf corbeille, indésirables et « All Mail » de Gmail. ' +
        'Sujet et expéditeur sont cherchés dans tous les messages ; le contenu seulement dans les "content_scan_limit" messages les plus récents. ' +
        'Les champs "search_complete" et "content_scan_complete" indiquent si tout a été parcouru. Préciser "account" ou "mailbox" accélère nettement la recherche.',
      inputSchema: {
        query: z.string().trim().min(2).max(200).describe('Texte recherché (2 caractères au minimum).'),
        account: optionalAccount,
        mailbox: mailboxArg.optional(),
        limit: z.number().int().min(1).max(config.listLimitMax).default(20).describe('Nombre maximal de résultats (1 à 100).'),
        content_scan_limit: z
          .number()
          .int()
          .min(0)
          .max(config.contentScanLimitMax)
          .default(config.contentScanLimitDefault)
          .describe(
            'Nombre de messages récents dont le contenu est parcouru (0 à 500, 30 par défaut ; 0 = sujet et expéditeur seulement). ' +
              "Compter 0,15 à 0,5 s par message ; le parcours s'arrête au bout de 15 s.",
          ),
      },
      annotations: READ_ONLY,
    },
    handler(searchMessages),
  );

  server.registerTool(
    'read_message',
    {
      title: 'Lire un message',
      description:
        'En-têtes complets, corps en texte (tronqué à 20 000 caractères, voir "body_truncated") et liste des pièces jointes (nom, taille) sans les extraire. ' +
        'Ne marque pas le message comme lu.',
      inputSchema: { account: accountArg, mailbox: mailboxArg, id: messageIdArg },
      annotations: READ_ONLY,
    },
    handler(readMessage),
  );
}
