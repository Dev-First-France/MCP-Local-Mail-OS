import { config } from '../config.js';
import { ErrorCode, MailMcpError } from '../errors.js';
import { runAppleScript, runJxa } from '../osascript.js';
import { replyBody } from '../quote.js';
import { draftResult } from './compose.js';

// Réponse : commande native « reply » (fil conservé), corps et citation écrits par le serveur.
export async function replyDraft({ recipients, subject, body, source, files, from_account, from_address }) {
  const original = await runJxa('read_message', { ...source, body_max: config.forwardBodyMaxChars });
  const content = replyBody(body, original);

  const created = await runJxa('reply_draft', {
    ...recipients,
    source,
    from_account,
    from_address,
    visible: config.draftWindowVisible,
  });

  try {
    const written = await runAppleScript('fill_draft', [
      created.outgoing_id,
      created.sender,
      subject.trim(),
      content,
      ...files.map((f) => f.path),
    ]);
    if (Number(written) === 0) {
      throw new MailMcpError(ErrorCode.OSASCRIPT_ERROR, "Mail n'a pas accepté le corps de la réponse.");
    }
    const state = await runJxa('finish_draft', {
      outgoing_id: created.outgoing_id,
      from_account: created.from_account,
      drafts_before: created.drafts_before,
      expected_attachments: files.length,
      budget_ms: config.jxaBudgetMs,
    });
    const result = draftResult(state, files, {
      in_reply_to: {
        account: original.account,
        mailbox: original.mailbox,
        id: original.id,
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
