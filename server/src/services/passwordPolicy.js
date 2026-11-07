/**
 * Password rule for sign-up and password changes, following NIST SP 800-63B: a minimum length,
 * no forced mix of character types, and a check against passwords that are known to be common.
 * Existing passwords are not re-checked at sign-in, so nobody is locked out by the change.
 */

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt only uses the first 72 bytes, so a longer password would be silently cut

// A short list of passwords that appear at the top of public leaked-password lists, plus a few
// local favourites. It is a guard against the obvious ones, not a full breached-password database.
const COMMON = new Set(
  `password password1 password12 password123 password1234 passw0rd p@ssw0rd p@ssword 12345678 123456789 1234567890
  11111111 00000000 88888888 12341234 11223344 87654321 987654321 12121212 abcd1234 abc12345 abcdefgh 1q2w3e4r
  1qaz2wsx qwertyui qwerty12 qwerty123 qwertyuiop asdfghjk zxcvbnm1 iloveyou iloveyou1 sunshine princess football
  baseball superman batman123 starwars trustno1 welcome1 welcome123 letmein1 monkey123 dragon123 master123 admin123
  administrator changeme secret123 test1234 testing1 computer internet whatever michelle jennifer charlie1
  malaysia malaysia1 malaysia123 sayang123 sayangku bismillah alhamdulillah kualalumpur selangor finsight finsight1
  finsight123`
    .split(/\s+/)
    .filter(Boolean)
);

/** Returns a sentence saying what is wrong with the password, or null when it can be used. */
function passwordProblem(password, { email = '', fullName = '' } = {}) {
  const p = String(password ?? '');
  if (p.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (Buffer.byteLength(p, 'utf8') > MAX_PASSWORD_BYTES) return `Password must be ${MAX_PASSWORD_BYTES} characters or fewer.`;
  const lower = p.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(p)) return 'That password is too common and easy to guess. Choose another one.';
  const local = String(email).toLowerCase().split('@')[0];
  const name = String(fullName).toLowerCase().replace(/\s+/g, '');
  if ((local.length >= 4 && lower === local) || lower === String(email).toLowerCase() || (name.length >= 4 && lower === name)) {
    return 'Your password cannot be your email or your name.';
  }
  return null;
}

module.exports = { passwordProblem, MIN_PASSWORD_LENGTH, MAX_PASSWORD_BYTES };
