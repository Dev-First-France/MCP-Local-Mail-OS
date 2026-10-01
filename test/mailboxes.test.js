import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTree, isInside, mailboxNameProblem } from '../src/mailboxes.js';

const box = (path) => ({ name: path.split('/').pop(), path, message_count: 1, unread_count: 0 });

test('reconstruit l\'arbre à partir de la liste à plat', () => {
  // Mail renvoie les enfants avant ou après leur parent, sans ordre garanti.
  const tree = buildTree([box('Archives/Clients/Paie'), box('Archives/Projets'), box('Archives'), box('Archives/Clients'), box('INBOX')]);
  assert.deepEqual(tree.map((n) => n.path), ['Archives', 'INBOX']);
  const archives = tree[0];
  assert.deepEqual(archives.children.map((n) => n.path).sort(), ['Archives/Clients', 'Archives/Projets']);
  const clients = archives.children.find((n) => n.name === 'Clients');
  assert.deepEqual(clients.children.map((n) => n.path), ['Archives/Clients/Paie']);
});

test('une boîte dont le parent est absent reste à la racine', () => {
  const tree = buildTree([box('Orphelin/Enfant')]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].name, 'Enfant');
});

test('isInside ne confond pas les préfixes', () => {
  assert.equal(isInside('Junk', 'Junk'), true);
  assert.equal(isInside('Junk/Vieux', 'Junk'), true);
  assert.equal(isInside('Junk mail perso', 'Junk'), false);
});

test('mailboxNameProblem accepte un nom simple et refuse les chemins', () => {
  assert.equal(mailboxNameProblem('Projets'), null);
  assert.equal(mailboxNameProblem('Clients 2026 – été'), null);
  assert.match(mailboxNameProblem(''), /vide/);
  assert.match(mailboxNameProblem('Archives/Clients'), /"parent"/);
  assert.match(mailboxNameProblem('Projets '), /espace/);
  assert.match(mailboxNameProblem(' Projets'), /espace/);
  assert.match(mailboxNameProblem('Nom\tTab'), /contrôle/);
  assert.match(mailboxNameProblem('x'.repeat(201)), /trop long/);
  assert.match(mailboxNameProblem(undefined), /vide/);
});
