import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ErrorCode, MailMcpError, codeFromAppleError } from '../src/errors.js';
import { handler } from '../src/result.js';

test('traduit les numéros d\'erreur Apple Event', () => {
  assert.equal(codeFromAppleError(-1743), ErrorCode.AUTOMATION_DENIED);
  assert.equal(codeFromAppleError(undefined, 'Not authorized to send Apple events to Mail. (-1743)'), ErrorCode.AUTOMATION_DENIED);
  assert.equal(codeFromAppleError(-1712), ErrorCode.TIMEOUT);
  assert.equal(codeFromAppleError(-600), ErrorCode.MAIL_NOT_RUNNING);
  assert.equal(codeFromAppleError(-1728), ErrorCode.OSASCRIPT_ERROR);
});

test('un handler renvoie le résultat en texte JSON et en contenu structuré', async () => {
  const res = await handler(async (args) => ({ echo: args.x }))({ x: 1 });
  assert.equal(res.isError, undefined);
  assert.deepEqual(JSON.parse(res.content[0].text), { echo: 1 });
  assert.deepEqual(res.structuredContent, { echo: 1 });
});

test('une MailMcpError devient une réponse d\'erreur exploitable', async () => {
  const res = await handler(async () => {
    throw new MailMcpError(ErrorCode.MAILBOX_NOT_FOUND, 'Boîte introuvable', { existing_mailboxes: ['INBOX'] });
  })({});
  assert.equal(res.isError, true);
  assert.deepEqual(JSON.parse(res.content[0].text).error, {
    code: 'MAILBOX_NOT_FOUND',
    message: 'Boîte introuvable',
    details: { existing_mailboxes: ['INBOX'] },
  });
});
