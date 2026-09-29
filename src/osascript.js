import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { AUTOMATION_HELP, ErrorCode, MailMcpError, codeFromAppleError } from './errors.js';

const JXA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'jxa');
const OP_NAME = /^[a-z][a-z0-9_]*$/;
const scriptCache = new Map();

// Le texte exécuté est toujours « prélude + opération », deux fichiers
// statiques du dépôt. Aucune donnée d'appel n'y est jamais insérée.
// Opérations qui ont besoin des helpers de composition en plus du prélude.
const COMPOSE_OPS = new Set(['create_draft', 'draft_state', 'send_draft', 'reply_draft', 'finish_draft']);

async function loadScript(op) {
  if (!OP_NAME.test(op)) throw new Error(`Nom d'opération JXA invalide : ${op}`);
  let script = scriptCache.get(op);
  if (!script) {
    const files = ['_prelude.js', ...(COMPOSE_OPS.has(op) ? ['_compose.js'] : []), `${op}.js`];
    const parts = await Promise.all(files.map((f) => readFile(path.join(JXA_DIR, f), 'utf8')));
    script = `${parts.join('\n')}\n`;
    scriptCache.set(op, script);
  }
  return script;
}

function execOsascript(args, stdin, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('/usr/bin/osascript', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => err.push(c));
    child.stdin.on('error', () => {});
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ spawnError: error });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code,
        timedOut,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
    child.stdin.end(stdin);
  });
}

function errorFromStderr(stderr) {
  const text = stderr.trim();
  const match = text.match(/\((-?\d+)\)\s*$/);
  const errorNumber = match ? Number(match[1]) : undefined;
  const code = codeFromAppleError(errorNumber, text);
  const message = code === ErrorCode.AUTOMATION_DENIED ? AUTOMATION_HELP : `osascript a échoué : ${text || 'erreur inconnue'}`;
  return new MailMcpError(code, message, { errorNumber, stderr: text });
}

/**
 * Exécute une opération JXA et renvoie son champ `data`.
 * @param {string} op nom du fichier dans src/jxa (sans extension)
 * @param {object} input données d'entrée, sérialisées en JSON sur stdin
 */
export async function runJxa(op, input = {}, { timeoutMs = config.osascriptTimeoutMs } = {}) {
  const script = await loadScript(op);
  const payload = JSON.stringify({ account: config.accountName, accountType: config.accountType, ...input });
  const started = Date.now();
  const res = await execOsascript(['-l', 'JavaScript', '-e', script], payload, timeoutMs);
  const elapsed = Date.now() - started;
  console.error(`[mail-mcp] ${op} ${elapsed} ms${res.timedOut ? ' (timeout)' : ''}`);

  if (res.spawnError) {
    throw new MailMcpError(ErrorCode.OSASCRIPT_ERROR, `Impossible de lancer osascript : ${res.spawnError.message}`);
  }
  if (res.timedOut) {
    throw new MailMcpError(
      ErrorCode.TIMEOUT,
      `Mail n'a pas répondu en ${Math.round(timeoutMs / 1000)} s (opération « ${op} »). ` +
        "Causes possibles : une demande d'autorisation Automation est affichée à l'écran, Mail est occupé " +
        '(synchronisation en cours) ou la boîte est très volumineuse. Réessayez.',
      { op, timeoutMs },
    );
  }
  if (res.code !== 0) throw errorFromStderr(res.stderr);

  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    throw new MailMcpError(ErrorCode.OSASCRIPT_ERROR, 'Réponse de osascript illisible (JSON attendu).', {
      op,
      stdout: res.stdout.slice(0, 500),
    });
  }
  if (parsed && parsed.ok === true) return parsed.data;

  const code = parsed?.code && ErrorCode[parsed.code] ? parsed.code : codeFromAppleError(parsed?.errorNumber, parsed?.message);
  const message = code === ErrorCode.AUTOMATION_DENIED ? AUTOMATION_HELP : parsed?.message || 'Erreur inconnue dans le script Mail.';
  throw new MailMcpError(code, message, parsed?.details);
}

const APPLESCRIPT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'applescript');

/**
 * Exécute un fichier AppleScript statique. Les valeurs passent par argv (« on run argv ») :
 * spawn est appelé sans shell et rien n'est inséré dans le texte du script.
 * Réservé aux rares opérations que JXA ne sait pas faire (voir CLAUDE.md).
 */
export async function runAppleScript(name, args = [], { timeoutMs = config.osascriptTimeoutMs } = {}) {
  if (!OP_NAME.test(name)) throw new Error(`Nom de script AppleScript invalide : ${name}`);
  const argv = args.map((a) => String(a));
  if (argv.some((a) => a.includes('\0'))) {
    throw new MailMcpError(ErrorCode.INVALID_ARGUMENT, 'Caractère nul interdit dans un argument.');
  }
  const started = Date.now();
  const res = await execOsascript([path.join(APPLESCRIPT_DIR, `${name}.applescript`), ...argv], '', timeoutMs);
  console.error(`[mail-mcp] ${name}.applescript ${Date.now() - started} ms${res.timedOut ? ' (timeout)' : ''}`);
  if (res.spawnError) {
    throw new MailMcpError(ErrorCode.OSASCRIPT_ERROR, `Impossible de lancer osascript : ${res.spawnError.message}`);
  }
  if (res.timedOut) {
    throw new MailMcpError(ErrorCode.TIMEOUT, `Mail n'a pas répondu en ${Math.round(timeoutMs / 1000)} s (script « ${name} »).`, { op: name, timeoutMs });
  }
  if (res.code !== 0) throw errorFromStderr(res.stderr);
  return res.stdout.trim();
}
