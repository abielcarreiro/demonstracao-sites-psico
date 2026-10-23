/**
 * Criptografia de ponta a ponta dos textos clínicos (Web Crypto, sem bibliotecas).
 *
 * - O consultório tem um par de chaves ECDH P-256. A chave pública fica nas configurações
 *   públicas: qualquer navegador (inclusive o do paciente, ao agendar) consegue criptografar.
 * - A chave privada só existe aberta na memória do navegador da psicóloga, depois que ela
 *   digita a senha de criptografia. No banco ela fica guardada criptografada duas vezes:
 *   com a senha (PBKDF2 + AES-GCM) e com a chave de recuperação.
 * - Cada texto é criptografado com uma chave temporária (ECDH efêmero → HKDF → AES-GCM),
 *   no formato "enc1:<chave efêmera>.<iv>.<texto cifrado>". Nem o Supabase nem quem
 *   administra o banco conseguem ler esses campos.
 */

const PREFIX = 'enc1:'
const CURVE = { name: 'ECDH', namedCurve: 'P-256' }
const PBKDF2_ITERATIONS = 600_000
const HKDF_INFO = new TextEncoder().encode('psico-agenda/enc1')

const subtle = globalThis.crypto?.subtle

/* ------------------------------ Utilidades ------------------------------- */

const toB64 = (buf) => {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64 = (str) => {
  const s = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const random = (n) => crypto.getRandomValues(new Uint8Array(n))

export const cryptoSupported = () => !!subtle

export const isEncrypted = (value) => typeof value === 'string' && value.startsWith(PREFIX)

/* -------------------------- Chave da senha (KEK) -------------------------- */

async function keyFromSecret(secret, salt, iterations) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function wrapPrivateKey(pkcs8, secret) {
  const salt = random(16)
  const iv = random(12)
  const kek = await keyFromSecret(secret, salt, PBKDF2_ITERATIONS)
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, kek, pkcs8)
  return { v: 1, kdf: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) }
}

/** Abre a chave privada guardada. Lança erro "senha_incorreta" se o segredo não confere. */
async function unwrapPrivateKey(wrapped, secret, extractable = false) {
  const kek = await keyFromSecret(secret, fromB64(wrapped.salt), wrapped.iterations)
  let pkcs8
  try {
    pkcs8 = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(wrapped.iv) }, kek, fromB64(wrapped.ct))
  } catch {
    throw Object.assign(new Error('senha_incorreta'), { code: 'senha_incorreta' })
  }
  return { key: await subtle.importKey('pkcs8', pkcs8, CURVE, extractable, ['deriveBits']), pkcs8 }
}

/* --------------------------- Chave de recuperação ------------------------- */

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem 0/O e 1/I para não confundir ao digitar

function newRecoveryKey() {
  const bytes = random(20)
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return out.match(/.{4}/g).join('-')
}

/** Aceita a chave com ou sem traços, maiúsculas ou minúsculas */
export const normalizeRecoveryKey = (key) => key.toUpperCase().replace(/[^A-Z0-9]/g, '').match(/.{1,4}/g)?.join('-') ?? ''

/* ------------------------------ Sessão aberta ----------------------------- */

let privateKey = null
const cache = new Map()

export const isUnlocked = () => !!privateKey

export function lock() {
  privateKey = null
  cache.clear()
}

/**
 * Cria o par de chaves do consultório.
 * Retorna o que deve ser gravado no banco e a chave de recuperação (mostrada uma única vez).
 */
export async function createKeys(passphrase) {
  const pair = await subtle.generateKey(CURVE, true, ['deriveBits'])
  const publicJwk = await subtle.exportKey('jwk', pair.publicKey)
  const pkcs8 = await subtle.exportKey('pkcs8', pair.privateKey)
  const recoveryKey = newRecoveryKey()
  const [wrappedPassword, wrappedRecovery] = await Promise.all([wrapPrivateKey(pkcs8, passphrase), wrapPrivateKey(pkcs8, recoveryKey)])
  privateKey = (await subtle.importKey('pkcs8', pkcs8, CURVE, false, ['deriveBits']))
  cache.clear()
  return {
    publicJwk: { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y },
    wrappedPassword,
    wrappedRecovery,
    recoveryKey,
  }
}

/** Abre os prontuários com a senha de criptografia */
export async function unlockWithPassphrase(keyRow, passphrase) {
  const { key } = await unwrapPrivateKey(keyRow.wrapped_password, passphrase)
  privateKey = key
  cache.clear()
}

/** Abre com a chave de recuperação e devolve a chave guardada com a nova senha */
export async function unlockWithRecovery(keyRow, recoveryKey, newPassphrase) {
  const { pkcs8 } = await unwrapPrivateKey(keyRow.wrapped_recovery, normalizeRecoveryKey(recoveryKey), true)
  privateKey = await subtle.importKey('pkcs8', pkcs8, CURVE, false, ['deriveBits'])
  cache.clear()
  return wrapPrivateKey(pkcs8, newPassphrase)
}

/** Troca a senha de criptografia (exige a senha atual) */
export async function rewrapWithNewPassphrase(keyRow, currentPassphrase, newPassphrase) {
  const { pkcs8 } = await unwrapPrivateKey(keyRow.wrapped_password, currentPassphrase, true)
  return wrapPrivateKey(pkcs8, newPassphrase)
}

/* --------------------------- Textos dos campos ---------------------------- */

async function aesKeyFrom(privKey, pubKey, ephemeralRaw) {
  const shared = await subtle.deriveBits({ name: 'ECDH', public: pubKey }, privKey, 256)
  const hkdf = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: ephemeralRaw, info: HKDF_INFO }, hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/** Criptografa um texto com a chave pública do consultório (JWK) */
export async function encryptText(text, publicJwk) {
  if (!text) return text
  const recipient = await subtle.importKey('jwk', { ...publicJwk, ext: true }, CURVE, false, [])
  const eph = await subtle.generateKey(CURVE, true, ['deriveBits'])
  const ephRaw = new Uint8Array(await subtle.exportKey('raw', eph.publicKey))
  const key = await aesKeyFrom(eph.privateKey, recipient, ephRaw)
  const iv = random(12)
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text))
  return `${PREFIX}${toB64(ephRaw)}.${toB64(iv)}.${toB64(ct)}`
}

/** Abre um texto criptografado. Textos antigos (sem criptografia) voltam como estão. */
export async function decryptText(value) {
  if (!isEncrypted(value)) return value
  if (!privateKey) throw new Error('prontuarios_bloqueados')
  const hit = cache.get(value)
  if (hit !== undefined) return hit
  const [ephB64, ivB64, ctB64] = value.slice(PREFIX.length).split('.')
  const ephRaw = fromB64(ephB64)
  const eph = await subtle.importKey('raw', ephRaw, CURVE, false, [])
  const key = await aesKeyFrom(privateKey, eph, ephRaw)
  const plain = new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ctB64)))
  cache.set(value, plain)
  return plain
}
