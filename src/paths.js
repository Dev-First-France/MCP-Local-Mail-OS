import { constants } from 'node:fs';
import { access, mkdir, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ErrorCode, MailMcpError } from './errors.js';

export function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Un nom de pièce jointe est un simple nom de fichier : aucun séparateur, aucune remontée.
export function validateAttachmentName(name) {
  const invalid = (why) =>
    new MailMcpError(ErrorCode.INVALID_ARGUMENT, `Nom de pièce jointe refusé (${why}) : ${JSON.stringify(name)}`);
  if (typeof name !== 'string' || name.length === 0) throw invalid('vide');
  if (name.includes('\0')) throw invalid('caractère nul');
  if (name.includes('/') || name.includes('\\')) throw invalid('séparateur de chemin');
  if (name.includes('..')) throw invalid('séquence « .. »');
  if (name === '.' || name.trim() === '') throw invalid('nom réservé');
  if (name.length > 255) throw invalid('trop long');
  return name;
}

export async function ensureTargetDir(targetDir) {
  if (typeof targetDir !== 'string' || targetDir.length === 0 || targetDir.includes('\0')) {
    throw new MailMcpError(ErrorCode.INVALID_ARGUMENT, 'Dossier cible invalide.');
  }
  const expanded = expandHome(targetDir);
  if (!path.isAbsolute(expanded)) {
    throw new MailMcpError(ErrorCode.INVALID_ARGUMENT, `Le dossier cible doit être un chemin absolu ou commencer par ~ : ${targetDir}`);
  }
  const dir = path.resolve(expanded);
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    throw new MailMcpError(ErrorCode.INVALID_ARGUMENT, `Impossible de créer le dossier ${dir} : ${error.message}`);
  }
  return realpath(dir);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// facture.pdf, facture-1.pdf, facture-2.pdf…
export async function uniqueDestination(dir, name) {
  const ext = path.extname(name);
  const base = ext ? name.slice(0, -ext.length) : name;
  for (let n = 0; n < 10_000; n++) {
    const candidate = path.join(dir, n === 0 ? name : `${base}-${n}${ext}`);
    assertInside(dir, candidate);
    if (!(await exists(candidate))) return { path: candidate, renamed: n > 0 };
  }
  throw new MailMcpError(ErrorCode.INVALID_ARGUMENT, `Trop de fichiers nommés ${name} dans ${dir}.`);
}

export function assertInside(dir, candidate) {
  const rel = path.relative(dir, candidate);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep)) {
    throw new MailMcpError(ErrorCode.INVALID_ARGUMENT, `Chemin hors du dossier cible : ${candidate}`);
  }
}

// Vérifie les fichiers à joindre AVANT toute création de brouillon.
export async function checkAttachmentFiles(paths = []) {
  const files = [];
  const problems = [];
  for (const p of paths) {
    if (typeof p !== 'string' || !path.isAbsolute(p)) {
      problems.push({ path: p, reason: 'chemin non absolu' });
      continue;
    }
    try {
      const info = await stat(p);
      if (!info.isFile()) {
        problems.push({ path: p, reason: "n'est pas un fichier" });
        continue;
      }
      await access(p, constants.R_OK);
      files.push({ path: p, name: path.basename(p), size: info.size });
    } catch (error) {
      problems.push({ path: p, reason: error.code === 'ENOENT' ? 'fichier introuvable' : `illisible (${error.code})` });
    }
  }
  if (problems.length > 0) {
    throw new MailMcpError(
      ErrorCode.ATTACHMENT_NOT_FOUND,
      'Pièce(s) jointe(s) inutilisable(s) : ' + problems.map((x) => `${x.path} (${x.reason})`).join(' ; ') + '. Aucun brouillon créé.',
      { problems },
    );
  }
  return files;
}

export function formatSize(bytes) {
  if (bytes == null) return 'taille inconnue';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
