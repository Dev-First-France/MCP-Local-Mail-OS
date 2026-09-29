import { config } from '../config.js';
import { ErrorCode, MailMcpError } from '../errors.js';
import { runAppleScript, runJxa } from '../osascript.js';
import { replyBody } from '../quote.js';
import { draftResult } from './compose.js';

// Réponse : commande native « reply » (fil conservé), corps et citation écrits par le serveur.
export async function replyDraft({ recipients, subject, body, source, files }) {
  const original = await runJxa('read_message', { ...source, body_max: config.forwardBodyMaxChars });
  const content = replyBody(body, original);

  const created = await runJxa('reply_draft', {
    ...recipients,
    source,
    visible: config.draftWindowVisible,
    drafts_mailbox: config.draftsMailbox,
  });

  try {
    const written = await runAppleScript('fill_draft', [created.outgoing_id, subject.trim(), content, ...files.map((f) => f.path)]);
    if (Number(written) === 0) {
      throw new MailMcpError(ErrorCode.OSASCRIPT_ERROR, "Mail n'a pas accepté le corps de la réponse.");
    }
    const state = await runJxa('finish_draft', {
      outgoing_id: created.outgoing_id,
      drafts_before: created.drafts_before,
      drafts_mailbox: config.draftsMailbox,
      expected_attachments: files.length,
      budget_ms: config.jxaBudgetMs,
    });
    const result = draftResult(state, files, {
      in_reply_to: {
        id: original.id,
        mailbox: original.mailbox,
        subject: original.subject,
        sender: original.sender,
        message_id: original.message_id,
        thread_headers: state.draft_copy ? Boolean(state.draft_copy.in_reply_to || state.draft_copy.references) : null,
      },
    });
    if (original.body_truncated) {
      result.warnings.push(`Le message d'origine est cité partiellement (${config.forwardBodyMaxChars} premiers caractères).`);
    }
    return result;
  } catch (error) {
    // Pas de fenêtre de réponse vide laissée derrière un échec.
    await runJxa('close_draft', { outgoing_id: created.outgoing_id }).catch(() => {});
    throw error;
  }
}
