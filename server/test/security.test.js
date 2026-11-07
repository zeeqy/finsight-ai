const test = require('node:test');
const assert = require('node:assert/strict');
const { passwordProblem } = require('../src/services/passwordPolicy');

test('password rule: length, common passwords, email or name', () => {
  assert.match(passwordProblem('abc1234'), /at least 8/);
  assert.match(passwordProblem('password123'), /too common/);
  assert.match(passwordProblem('Malaysia123'), /too common/); // case does not help
  assert.match(passwordProblem('aaaaaaaaaa'), /too common/);
  assert.match(passwordProblem('aina.rahman', { email: 'aina.rahman@example.com' }), /email or your name/);
  assert.match(passwordProblem('ainarahman', { fullName: 'Aina Rahman' }), /email or your name/);
  assert.match(passwordProblem('x'.repeat(73)), /72 characters or fewer/);
  assert.equal(passwordProblem('kopi-o-ais-26', { email: 'aina@example.com', fullName: 'Aina' }), null);
  assert.equal(passwordProblem('correct horse battery'), null); // spaces and passphrases are fine
});

test('per-user limit: counts each user separately and says when to retry', () => {
  process.env.TEST_LIMIT = '2';
  const { makeUserLimiter } = require('../src/middleware/userLimiter');
  const limiter = makeUserLimiter({ envVar: 'TEST_LIMIT', productionMax: 99, code: 'TEST_LIMIT', what: 'tests' });
  const run = (userId) => {
    const out = { passed: false, status: 200, headers: {}, body: null };
    const res = {
      set: (k, v) => (out.headers[k] = v),
      status: (s) => ((out.status = s), { json: (b) => (out.body = b) }),
    };
    limiter({ user: { id: userId } }, res, () => (out.passed = true));
    return out;
  };
  assert.equal(run(1).passed, true);
  assert.equal(run(1).passed, true);
  const third = run(1);
  assert.equal(third.passed, false);
  assert.equal(third.status, 429);
  assert.equal(third.body.code, 'TEST_LIMIT');
  assert.ok(Number(third.headers['Retry-After']) > 3500);
  assert.equal(run(2).passed, true); // another user is not affected
});
