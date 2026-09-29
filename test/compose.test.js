import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fingerprint, makeDraftId, parseDraftId, renderPreview } from '../src/preview.js';
import { forwardBody, prefixSubject, replyBody } from '../src/quote.js';
import { parseRecipient } from '../src/tools/compose.js';
import { requireConfirmation } from '../src/tools/shared.js';

const state = {
  outgoing_id: 3,
  sender: 'Moi <moi@exemple.fr>',
  subject: 'Bonjour',
  to: [{ name: 'Alice', address: 'alice@exemple.fr' }],
  cc: [],
  bcc: [],
  content: 'Ligne 1\n\nLigne 2\n',
};

test('la confirmation exige exactement true', () => {
  for (const v of [undefined, null, false, 'true', 1, 'oui', {}]) {
    assert.throws(() => requireConfirmation(v, "rien n'a été fait"), (e) => e.code === 'CONFIRMATION_REQUIRED');
  }
  assert.doesNotThrow(() => requireConfirmation(true, 'x'));
});

test("l'empreinte ignore les espaces réécrits par Mail mais pas le texte", () => {
  const rewritten = { ...state, content: 'Ligne 1\n \nLigne 2 \n￼' };
  assert.equal(fingerprint(rewritten), fingerprint(state));
  assert.notEqual(fingerprint({ ...state, content: 'Ligne 1\n\nLigne 3\n' }), fingerprint(state));
  assert.notEqual(fingerprint({ ...state, subject: 'Bonsoir' }), fingerprint(state));
  assert.notEqual(fingerprint({ ...state, to: [{ address: 'bob@exemple.fr' }] }), fingerprint(state));
  assert.notEqual(fingerprint({ ...state, bcc: [{ address: 'espion@exemple.fr' }] }), fingerprint(state));
  assert.equal(fingerprint({ ...state, to: [{ name: 'A.', address: 'ALICE@exemple.fr' }] }), fingerprint(state));
});

test('draft_id : aller-retour et rejet des formes invalides', () => {
  const id = makeDraftId(state);
  assert.match(id, /^3-[0-9a-f]{10}$/);
  assert.deepEqual(parseDraftId(id), { outgoingId: 3, fingerprint: id.slice(2) });
  for (const bad of ['3', 'abc', '3-xyz', '-3-0123456789', '3-0123456789-1', '']) assert.equal(parseDraftId(bad), null);
});

test("l'aperçu liste destinataires, sujet, corps et pièces jointes avec leur taille", () => {
  const text = renderPreview({ state, attachments: [{ name: 'facture.pdf', size: 123456 }, { name: 'note.txt', size: 50 }] });
  assert.match(text, /NON ENVOYÉ/);
  assert.match(text, /À {7}: Alice <alice@exemple\.fr>/);
  assert.match(text, /Objet {3}: Bonjour/);
  assert.match(text, /Pièces jointes \(2\)/);
  assert.match(text, /facture\.pdf \(120\.6 Ko\)/);
  assert.match(text, /note\.txt \(50 o\)/);
  assert.match(text, /Ligne 1\n\nLigne 2/);
  assert.match(renderPreview({ state }), /Pièces jointes : aucune/);
});

test('analyse des destinataires', () => {
  assert.deepEqual(parseRecipient('alice@exemple.fr'), { address: 'alice@exemple.fr' });
  assert.deepEqual(parseRecipient(' Alice Martin <alice@exemple.fr> '), { name: 'Alice Martin', address: 'alice@exemple.fr' });
  assert.deepEqual(parseRecipient('"Martin, Alice" <alice@exemple.fr>'), { name: 'Martin, Alice', address: 'alice@exemple.fr' });
  for (const bad of ['alice', 'alice@', '@exemple.fr', 'a b@exemple.fr', 'alice@exemple.fr\nBcc: x@y.fr', 'a@b.fr, c@d.fr']) {
    assert.throws(() => parseRecipient(bad), (e) => e.code === 'INVALID_ARGUMENT');
  }
});

test('préfixes de sujet sans doublon', () => {
  assert.equal(prefixSubject('Fwd', 'Facture'), 'Fwd: Facture');
  assert.equal(prefixSubject('Fwd', 'Fwd: Facture'), 'Fwd: Facture');
  assert.equal(prefixSubject('Fwd', 'TR : Facture'), 'TR : Facture');
  assert.equal(prefixSubject('Re', 'RE: Facture'), 'RE: Facture');
});

test('citation de réponse et corps de transfert', () => {
  const original = {
    sender: 'Bob <bob@exemple.fr>',
    subject: 'Facture',
    date_sent: '2026-09-29T15:19:02.000Z',
    to: [{ name: 'Moi', address: 'moi@exemple.fr' }],
    cc: [],
    body: 'Bonjour, \n \nVoici la facture. ￼\n\n\n\nBob',
  };
  const reply = replyBody('Merci.\n', original);
  assert.match(reply, /^Merci\.\n\nLe .*2026.*, Bob <bob@exemple\.fr> a écrit :\n\n> Bonjour,\n>\n> Voici la facture\.\n>\n> Bob\n$/);
  const fwd = forwardBody('Pour info.', original);
  assert.match(fwd, /^Pour info\.\n\nDébut du message réexpédié :\n\nDe : Bob <bob@exemple\.fr>\nObjet : Facture\nDate : .*\nÀ : Moi <moi@exemple\.fr>\n\nBonjour,\n\nVoici la facture\.\n\nBob\n$/);
  assert.match(forwardBody(undefined, original), /^Début du message réexpédié/);
});
