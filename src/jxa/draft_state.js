// Relit un brouillon en cours de composition, sans rien modifier.
function main(input, Mail) {
  return stateOf(outgoingById(Mail, input.outgoing_id), input.outgoing_id);
}
