/**
 * Builds a small, made-up bank statement PDF for tests (no real data): text placed at fixed
 * positions like a real e-statement, optionally locked with a password (PDF standard security,
 * 40-bit RC4, which every PDF reader supports). Used by the unit tests and the functional suite.
 */
const crypto = require('crypto');

const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
const md5 = (...parts) => crypto.createHash('md5').update(Buffer.concat(parts)).digest();
const padPw = (pw) => Buffer.concat([Buffer.from(pw || '', 'latin1'), PAD]).subarray(0, 32);

function rc4(key, data) {
  const s = [...Array(256).keys()];
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[n] = data[n] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

const esc = (s) => String(s).replace(/[\\()]/g, (c) => `\\${c}`);
const fmt = (n) => (n < 1 ? `.${Math.round(n * 100).toString().padStart(2, '0')}` : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/**
 * @param {object} o
 * @param {string} o.bankLine     text at the top (decides which bank the reader detects)
 * @param {string} o.holder       account holder's name, printed top left
 * @param {number} o.opening      opening balance
 * @param {Array}  o.rows         [{ date: 'DD/MM/YYYY', type, details: [], amount, dir: 'out'|'in' }]
 * @param {boolean} [o.totals]    print TOTAL DEBIT / TOTAL CREDIT at the end
 * @param {boolean} [o.closing]   print a CLOSING BALANCE line
 * @param {string} [o.password]   lock the PDF with this password
 * @param {number} [o.rowsPerPage]
 */
function makeStatementPdf({ bankLine, holder, opening, rows, totals = false, closing = true, password, rowsPerPage = 12 }) {
  const pages = [];
  let balance = opening;
  let page = null;
  let y = 0;
  const text = (x, s, size = 8) => page.push(`BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${esc(s)}) Tj ET`);
  const newPage = () => {
    page = [];
    pages.push(page);
    y = 800;
    text(40, bankLine, 10);
    y = 770;
    text(40, holder);
    y = 700;
    for (const [x, s] of [[40, 'Date'], [110, 'Description'], [320, 'Debit'], [400, 'Credit'], [490, 'Balance']]) text(x, s);
    y = 690;
  };

  newPage();
  y -= 14;
  text(110, 'OPENING BALANCE');
  text(520, fmt(opening));
  rows.forEach((r, i) => {
    if (i > 0 && i % rowsPerPage === 0) newPage();
    balance = Math.round((balance + (r.dir === 'in' ? r.amount : -r.amount)) * 100) / 100;
    y -= 16;
    text(40, r.date);
    text(110, r.type);
    text(r.dir === 'in' ? 410 : 330, fmt(r.amount));
    text(500, fmt(balance));
    for (const d of r.details || []) {
      y -= 10;
      text(110, d);
    }
  });
  y -= 16;
  if (closing) {
    text(300, 'CLOSING BALANCE');
    text(500, fmt(balance));
  }
  if (totals) {
    const sum = (dir) => rows.filter((r) => r.dir === dir).reduce((s, r) => s + r.amount, 0);
    y -= 14;
    text(60, `TOTAL DEBIT ${rows.filter((r) => r.dir === 'out').length} ${fmt(sum('out'))}`);
    y -= 12;
    text(60, `TOTAL CREDIT ${rows.filter((r) => r.dir === 'in').length} ${fmt(sum('in'))}`);
  }

  // Objects: 1 catalog, 2 pages, 3 font, then a page + content pair per page, then the encrypt dict
  const objects = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  const streams = {};
  pages.forEach((p, i) => {
    const pid = pageIds[i];
    objects[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pid + 1} 0 R >>`;
    streams[pid + 1] = Buffer.from(p.join('\n'), 'latin1');
  });

  const fileId = crypto.createHash('md5').update(`${bankLine}${opening}${rows.length}`).digest();
  let encryptId = null;
  let key = null;
  if (password) {
    const P = -44; // print + copy allowed
    const pBytes = Buffer.alloc(4);
    pBytes.writeInt32LE(P);
    const O = rc4(md5(padPw(password)).subarray(0, 5), padPw(password));
    key = md5(padPw(password), O, pBytes, fileId).subarray(0, 5);
    const U = rc4(key, PAD);
    encryptId = 4 + pages.length * 2;
    objects[encryptId] = `<< /Filter /Standard /V 1 /R 2 /O <${O.toString('hex')}> /U <${U.toString('hex')}> /P ${P} >>`;
  }

  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = [];
  let length = parts[0].length;
  const push = (buf) => {
    parts.push(buf);
    length += buf.length;
  };
  const count = Math.max(objects.length, ...Object.keys(streams).map(Number).map((n) => n + 1));
  for (let id = 1; id < count; id++) {
    offsets[id] = length;
    if (streams[id]) {
      let data = streams[id];
      if (key) {
        const objKey = md5(key, Buffer.from([id & 255, (id >> 8) & 255, (id >> 16) & 255, 0, 0])).subarray(0, 10);
        data = rc4(objKey, data);
      }
      push(Buffer.from(`${id} 0 obj\n<< /Length ${data.length} >>\nstream\n`, 'latin1'));
      push(data);
      push(Buffer.from('\nendstream\nendobj\n', 'latin1'));
    } else {
      push(Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, 'latin1'));
    }
  }
  const xrefAt = length;
  const xref = [`xref\n0 ${count}\n0000000000 65535 f \n`, ...offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  const trailer = `trailer\n<< /Size ${count} /Root 1 0 R${encryptId ? ` /Encrypt ${encryptId} 0 R` : ''} /ID [<${fileId.toString('hex')}> <${fileId.toString('hex')}>] >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  push(Buffer.from(xref + trailer, 'latin1'));
  return Buffer.concat(parts);
}

module.exports = { makeStatementPdf };
