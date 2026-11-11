/** Validadores para datos españoles y bancarios. */

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

export function isValidDni(v: string): boolean {
  const m = /^(\d{8})([A-Z])$/.exec(v);
  if (!m) return false;
  return DNI_LETTERS[Number(m[1]) % 23] === m[2];
}

export function isValidNie(v: string): boolean {
  const m = /^([XYZ])(\d{7})([A-Z])$/.exec(v);
  if (!m) return false;
  const prefix = { X: '0', Y: '1', Z: '2' }[m[1] as 'X' | 'Y' | 'Z'];
  return DNI_LETTERS[Number(prefix + m[2]) % 23] === m[3];
}

export function isValidCif(v: string): boolean {
  const m = /^([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-J])$/.exec(v);
  if (!m) return false;
  const digits = m[2];
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(digits[i]);
    if (i % 2 === 0) {
      const x = d * 2;
      sumB += Math.floor(x / 10) + (x % 10);
    } else sumA += d;
  }
  const control = (10 - ((sumA + sumB) % 10)) % 10;
  const letter = 'JABCDEFGHI'[control];
  const c = m[3];
  if ('PQRSNW'.includes(m[1])) return c === letter;
  if ('ABEH'.includes(m[1])) return c === String(control);
  return c === String(control) || c === letter;
}

export function normalizeNif(v: string): string {
  return v.toUpperCase().replace(/[\s.-]/g, '');
}

export function isValidNif(raw: string): boolean {
  const v = normalizeNif(raw);
  return isValidDni(v) || isValidNie(v) || isValidCif(v) || /^[KLM]\d{7}[A-Z]$/.test(v);
}

export function isValidIban(raw: string): boolean {
  const v = raw.toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  if (v.startsWith('ES') && v.length !== 24) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

export function formatIban(v: string): string {
  return v.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/** Identificador de acreedor SEPA (AT-02) a partir del NIF: ES + control + sufijo + NIF. */
export function sepaCreditorId(nif: string, suffix = '000'): string {
  const n = normalizeNif(nif);
  const base = n + 'ES00';
  const numeric = base.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  const check = String(98 - rem).padStart(2, '0');
  return `ES${check}${suffix}${n}`;
}

export function isValidEan13(v: string): boolean {
  if (!/^\d{13}$/.test(v)) return false;
  const sum = v
    .slice(0, 12)
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(v[12]);
}
