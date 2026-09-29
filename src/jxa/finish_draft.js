// Enregistre un brouillon déjà rempli et relit son état. N'ENVOIE JAMAIS.
function main(input, Mail) {
  const account = getAccount(Mail, input.from_account);
  const drafts = draftsBoxOf(Mail, account);
  const msg = outgoingById(Mail, input.outgoing_id);
  msg.save();
  const state = stateOf(msg, input.outgoing_id);
  state.from_account = account.name;
  state.draft_copy = waitForDraftCopy(drafts, input.drafts_before || [], state.subject, input.expected_attachments || 0, input);
  return state;
}
