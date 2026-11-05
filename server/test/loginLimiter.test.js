const test = require('node:test');
const assert = require('node:assert/strict');
const { loginLimiter, recordLoginFailure, clearLoginFailures, _failures } = require('../src/middleware/loginLimiter');

const req = (email, ip = '10.0.0.1') => ({ ip, body: { email } });
function run(r) {
  let status = 200;
  let passed = false;
  const res = { set() {}, status(s) { status = s; return this; }, json() { return this; } };
  loginLimiter(r, res, () => { passed = true; });
  return passed ? 200 : status;
}

test('five wrong passwords lock that email for this IP, other accounts still work', () => {
  _failures.clear();
  for (let i = 0; i < 5; i++) {
    assert.equal(run(req('a@x.my')), 200);
    recordLoginFailure(req('a@x.my'));
  }
  assert.equal(run(req('A@x.my ')), 429); // same address, any case or spacing
  assert.equal(run(req('b@x.my')), 200);
  assert.equal(run(req('a@x.my', '10.0.0.2')), 200);
});

test('a correct sign-in clears that account\'s failures', () => {
  _failures.clear();
  for (let i = 0; i < 4; i++) recordLoginFailure(req('c@x.my'));
  clearLoginFailures(req('c@x.my'));
  recordLoginFailure(req('c@x.my'));
  assert.equal(run(req('c@x.my')), 200);
});

test('one IP trying many accounts is stopped too', () => {
  _failures.clear();
  for (let i = 0; i < 30; i++) recordLoginFailure(req(`user${i}@x.my`, '10.0.0.9'));
  assert.equal(run(req('new@x.my', '10.0.0.9')), 429);
  assert.equal(run(req('new@x.my', '10.0.0.10')), 200);
});
