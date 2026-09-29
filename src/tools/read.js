import { z } from 'zod';
import { config } from '../config.js';
import { buildTree, isInside } from '../mailboxes.js';
import { runJxa } from '../osascript.js';
import { handler } from '../result.js';
import { mailboxArg, messageIdArg } from './shared.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const keyOf = (m) => `${m.mailbox}\u0000${m.id}`;

// Chaque appel s'arrête de lui-même avant le timeout et rend ce qui reste à traiter.
export async function fetchSummaries(items) {
  const found = new Map();
  let pending = items.map(({ id, mailbox }) => ({ id, mailbox }));
  while (pending.length > 0) {
    const res = await runJxa('message_summaries', { items: pending, budget_ms: config.jxaBudgetMs });
    for (const m of res.messages) found.set(keyOf(m), m);
    if (res.remaining.length >= pending.length) break;
    pending = res.remaining;
  }
  return items.map((item) => found.get(keyOf(item))).filter(Boolean);
}

const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '');

async function listMailboxes() {
  const res = await runJxa('list_mailboxes');
  return { account: res.account, mailbox_count: res.mailboxes.length, mailboxes: buildTree(res.mailboxes) };
}

async function listMessages({ mailbox, limit, unread_only }) {
  const sel = await runJxa('list_messages', {
    mailbox,
    limit,
    unread_only,
    budget_ms: config.jxaBudgetMs,
    bulk_threshold: config.bulkDetailsThreshold,
  });
  const messages = [...sel.messages, ...(await fetchSummaries(sel.remaining))];
  messages.sort(byDateDesc);
  const out = { mailbox: sel.mailbox, total: sel.total, returned: messages.length, messages };
  if (unread_only) out.unread_total = sel.matching;
  return out;
}

async function searchMessages({ query, mailbox, limit, content_scan_limit }) {
  let pendingBoxes;
  if (mailbox) {
    pendingBoxes = [mailbox];
  } else {
    const all = await runJxa('list_mailboxes', { with_counts: false });
    const excluded = [config.trashMailbox, config.junkMailbox];
    pendingBoxes = all.mailboxes.map((b) => b.path).filter((p) => !excluded.some((x) => isInside(p, x)));
    // La boîte de réception, souvent la plus grosse, passe en premier pour disposer de tout le budget.
    pendingBoxes.sort((x, y) => (y === config.inboxMailbox) - (x === config.inboxMailbox));
  }

  const searched = [];
  let matches = [];
  let candidates = [];
  let scannedHeaders = 0;
  let totalMatches = 0;
  while (pendingBoxes.length > 0) {
    const res = await runJxa('search_headers', {
      query,
      mailboxes: pendingBoxes,
      match_limit: limit,
      candidate_limit: content_scan_limit,
      budget_ms: config.searchHeadersBudgetMs,
    });
    searched.push(...res.searched_mailboxes);
    scannedHeaders += res.scanned;
    totalMatches += res.total_matches;
    matches.push(...res.matches);
    candidates.push(...res.candidates);
    if (res.remaining_mailboxes.length >= pendingBoxes.length) break;
    pendingBoxes = res.remaining_mailboxes;
  }

  // Contenu : uniquement les messages les plus récents que sujet et expéditeur n'ont pas trouvés.
  candidates = candidates.sort((a, b) => b.t - a.t).slice(0, content_scan_limit);
  let contentScanned = 0;
  let budgetExhausted = false;
  const started = Date.now();
  let contentHits = 0;
  while (candidates.length > 0) {
    if (Date.now() - started > config.contentScanBudgetMs) {
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
  const headerMatches = totalMatches;
  totalMatches += contentHits;

  matches = matches.sort((a, b) => b.t - a.t).slice(0, limit);
  const matchedIn = new Map(matches.map((m) => [keyOf(m), m.matched_in]));
  const messages = (await fetchSummaries(matches)).map((m) => ({ ...m, matched_in: matchedIn.get(keyOf(m)) }));
  messages.sort(byDateDesc);

  const notMatchedByHeaders = scannedHeaders - headerMatches;
  const out = {
    query,
    searched_mailboxes: searched,
    messages_in_scope: scannedHeaders,
    total_matches: totalMatches,
    returned: messages.length,
    truncated: totalMatches > messages.length,
    content_scanned: contentScanned,
    content_scan_complete: contentScanned >= notMatchedByHeaders,
    messages,
  };
  if (!out.content_scan_complete) {
    const where =
      content_scan_limit === 0
        ? "le contenu n'a pas été parcouru (content_scan_limit = 0)"
        : `le contenu seulement dans les ${contentScanned} plus récents${budgetExhausted ? ' (budget de temps atteint)' : ''}`;
    out.note =
      `Sujet et expéditeur ont été cherchés dans les ${scannedHeaders} messages du périmètre ; ${where}. ` +
      'Augmentez content_scan_limit ou précisez une boîte pour aller plus loin.';
  }
  return out;
}

async function readMessage({ id, mailbox }) {
  return runJxa('read_message', { id, mailbox, body_max: config.bodyMaxChars });
}

export function registerReadTools(server) {
  server.registerTool(
    'list_mailboxes',
    {
      title: 'Lister les boîtes',
      description:
        'Arborescence des boîtes du compte iCloud de Mail, avec pour chacune le nombre de messages et de non-lus. ' +
        'Le champ "path" est l\'identifiant à passer aux autres tools.',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    handler(listMailboxes),
  );

  server.registerTool(
    'list_messages',
    {
      title: 'Lister les messages',
      description:
        'Messages d\'une boîte du compte iCloud, du plus récent au plus ancien : id, sujet, expéditeur, date, lu/non-lu, drapeau, présence de pièces jointes. ' +
        'Un message est identifié par le couple (id, mailbox).',
      inputSchema: {
        mailbox: mailboxArg.default(config.inboxMailbox),
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
        'Recherche insensible à la casse et aux accents dans le sujet, l\'expéditeur et le contenu. ' +
        'Sans "mailbox", cherche dans toutes les boîtes du compte iCloud sauf la corbeille et les indésirables. ' +
        'Sujet et expéditeur sont cherchés dans tous les messages ; le contenu seulement dans les "content_scan_limit" messages les plus récents ' +
        '(le champ "content_scan_complete" indique si tout le contenu a été parcouru).',
      inputSchema: {
        query: z.string().trim().min(2).max(200).describe('Texte recherché (2 caractères au minimum).'),
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
              'Compter 0,15 à 0,5 s par message ; le parcours s\'arrête au bout de 25 s.',
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
      inputSchema: {
        id: messageIdArg,
        mailbox: mailboxArg,
      },
      annotations: READ_ONLY,
    },
    handler(readMessage),
  );
}
