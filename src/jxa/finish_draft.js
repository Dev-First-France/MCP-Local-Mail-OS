// Enregistre un brouillon déjà rempli et relit son état. N'ENVOIE JAMAIS.
function main(input, Mail) {
  const acc = getAccount(Mail, input);
  const msg = outgoingById(Mail, input.outgoing_id);
  const before = { box: getMailbox(acc, input.drafts_mailbox), seen: {} };
  (input.drafts_before || []).forEach(function (id) { before.seen[id] = true; });
  msg.save();
  const state = stateOf(msg, input.outgoing_id);
  state.draft_copy = waitForDraftCopy(before, state.subject, input.expected_attachments || 0, input);
  if (state.draft_copy) {
    const copy = before.box.ref.messages.byId(state.draft_copy.id);
    const headers = orNull(function () { return copy.allHeaders(); }) || '';
    state.draft_copy.in_reply_to = /^in-reply-to:/im.test(headers);
    state.draft_copy.references = /^references:/im.test(headers);
  }
  return state;
}
