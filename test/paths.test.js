import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { assertInside, checkAttachmentFiles, ensureTargetDir, expandHome, uniqueDestination, validateAttachmentName } from '../src/paths.js';

const rejects = (fn, code) => assert.throws(fn, (e) => e.code === code);

test('refuse toute traversée de répertoire dans un nom de pièce jointe', () => {
  for (const bad of ['../secret.txt', '../../etc/passwd', 'a/b.pdf', 'a\\b.pdf', '..', 'fichier..pdf', '/etc/passwd', '', '.', '   ', 'a\0b']) {
    rejects(() => validateAttachmentName(bad), 'INVALID_ARGUMENT');
  }
  rejects(() => validateAttachmentName(undefined), 'INVALID_ARGUMENT');
});

test('accepte les noms ordinaires, accents et espaces compris', () => {
  for (const good of ['facture.pdf', 'Facture août 2026.pdf', 'archive.tar.gz', '.cache', "l'été.txt"]) {
    assert.equal(validateAttachmentName(good), good);
  }
});

test('expandHome ne développe que ~ et ~/', () => {
  assert.equal(expandHome('~'), os.homedir());
  assert.equal(expandHome('~/Documents'), path.join(os.homedir(), 'Documents'));
  assert.equal(expandHome('/tmp/~/x'), '/tmp/~/x');
  assert.equal(expandHome('~autre/x'), '~autre/x');
});

test('suffixe -1, -2… sans jamais écraser', async () => {
  const dir = await ensureTargetDir(await mkdtemp(path.join(os.tmpdir(), 'mail-mcp-test-')));
  try {
    assert.deepEqual(await uniqueDestination(dir, 'facture.pdf'), { path: path.join(dir, 'facture.pdf'), renamed: false });
    await writeFile(path.join(dir, 'facture.pdf'), 'a');
    assert.deepEqual(await uniqueDestination(dir, 'facture.pdf'), { path: path.join(dir, 'facture-1.pdf'), renamed: true });
    await writeFile(path.join(dir, 'facture-1.pdf'), 'b');
    assert.equal((await uniqueDestination(dir, 'facture.pdf')).path, path.join(dir, 'facture-2.pdf'));
    await writeFile(path.join(dir, 'README'), 'c');
    assert.equal((await uniqueDestination(dir, 'README')).path, path.join(dir, 'README-1'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('crée le dossier cible et refuse un chemin relatif', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'mail-mcp-test-'));
  try {
    const dir = await ensureTargetDir(path.join(base, 'a', 'b é'));
    assert.ok(dir.endsWith(path.join('a', 'b é')));
    await assert.rejects(() => ensureTargetDir('relatif/dossier'), (e) => e.code === 'INVALID_ARGUMENT');
    await assert.rejects(() => ensureTargetDir(''), (e) => e.code === 'INVALID_ARGUMENT');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('assertInside refuse tout ce qui sort du dossier', () => {
  assert.doesNotThrow(() => assertInside('/a/b', '/a/b/c.txt'));
  rejects(() => assertInside('/a/b', '/a/c.txt'), 'INVALID_ARGUMENT');
  rejects(() => assertInside('/a/b', '/a/b/c/d.txt'), 'INVALID_ARGUMENT');
  rejects(() => assertInside('/a/b', '/a/b'), 'INVALID_ARGUMENT');
});

test('vérifie les fichiers à joindre avant toute création', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mail-mcp-test-'));
  try {
    const file = path.join(dir, 'ok.txt');
    await writeFile(file, 'bonjour');
    assert.deepEqual(await checkAttachmentFiles([file]), [{ path: file, name: 'ok.txt', size: 7 }]);
    assert.deepEqual(await checkAttachmentFiles(undefined), []);
    await assert.rejects(
      () => checkAttachmentFiles([file, path.join(dir, 'absent.pdf'), 'relatif.txt', dir]),
      (e) => e.code === 'ATTACHMENT_NOT_FOUND' && e.details.problems.length === 3 && /absent\.pdf/.test(e.message),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
