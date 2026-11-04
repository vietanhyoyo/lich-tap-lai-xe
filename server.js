const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');

const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';
const ROOT = __dirname;
const CONFIG_FILE = process.env.CONFIG_FILE || path.join(ROOT, '.storage-config.json');
const HEADERS = ['Mã', 'Ngày đăng ký', 'Tên thầy', 'Hạng xe', 'Xe', 'Khung giờ tập lái', 'Tên học viên', 'Thời điểm tạo', 'Thời điểm sửa'];
const COLUMNS = ['id', 'registrationDate', 'teacher', 'licenseClass', 'car', 'timeSlots', 'student', 'createdAt', 'updatedAt'];
let selectedPath = null;
let mutationQueue = Promise.resolve();

function send(res, status, data) {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(data));
}
function fail(res, error) {
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  send(res, status, {error: status >= 500 ? 'Không thể xử lý file Excel. Hãy kiểm tra quyền truy cập và thử lại.' : error.message});
}
function bad(message, status = 400) { const error = new Error(message); error.status = status; return error; }
async function readBody(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 100_000) throw bad('Dữ liệu gửi lên quá lớn.', 413);
  }
  try { return JSON.parse(text || '{}'); } catch { throw bad('Dữ liệu JSON không hợp lệ.'); }
}
function normalizePath(input) {
  if (typeof input !== 'string' || !input.trim()) throw bad('Vui lòng nhập đường dẫn file Excel.');
  const full = path.resolve(input.trim().replace(/^~(?=\/|$)/, os.homedir()));
  if (path.extname(full).toLowerCase() !== '.xlsx') throw bad('Đường dẫn phải kết thúc bằng .xlsx.');
  return full;
}
function cleanText(value) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''; }
function validateRecord(input) {
  const record = {
    registrationDate: cleanText(input.registrationDate), teacher: cleanText(input.teacher),
    licenseClass: cleanText(input.licenseClass), car: cleanText(input.car),
    timeSlots: Array.isArray(input.timeSlots) ? [...new Set(input.timeSlots.map(cleanText))] : [],
    student: cleanText(input.student)
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.registrationDate) || Number.isNaN(Date.parse(record.registrationDate + 'T00:00:00'))) throw bad('Ngày đăng ký không hợp lệ.');
  if (!record.teacher || !record.student || record.teacher.length > 120 || record.student.length > 120) throw bad('Vui lòng nhập tên thầy và tên học viên (tối đa 120 ký tự).');
  if (!['B.01', 'B', 'C1'].includes(record.licenseClass)) throw bad('Hạng xe không hợp lệ.');
  if (!['Xe 1', 'Xe 2', 'Xe 3', 'Xe 4', 'Xe 5'].includes(record.car)) throw bad('Xe không hợp lệ.');
  if (!record.timeSlots.length || record.timeSlots.some(s => !['6h - 7h', '7h - 8h'].includes(s))) throw bad('Vui lòng chọn ít nhất một khung giờ hợp lệ.');
  return record;
}
async function workbookAt(file) {
  const book = new ExcelJS.Workbook();
  try {
    await fs.access(file);
    await book.xlsx.readFile(file);
    const sheet = book.getWorksheet('Lịch tập lái xe') || book.worksheets[0];
    if (!sheet || HEADERS.some((h, i) => String(sheet.getRow(1).getCell(i + 1).value || '') !== h)) throw bad('File Excel này không có cấu trúc lịch tập lái xe. Hãy chọn file khác.', 422);
    return {book, sheet};
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const sheet = initializeSheet(book);
    return {book, sheet};
  }
}
function initializeSheet(book) {
  const sheet = book.addWorksheet('Lịch tập lái xe');
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = {bold: true, color: {argb: 'FFFFFFFF'}};
  sheet.getRow(1).fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FF493BD8'}};
  sheet.getRow(1).height = 27;
  sheet.columns = [{width: 38}, {width: 19}, {width: 26}, {width: 16}, {width: 14}, {width: 27}, {width: 30}, {width: 29}, {width: 29}];
  sheet.views = [{state: 'frozen', ySplit: 1}];
  sheet.autoFilter = 'A1:I1';
  return sheet;
}
async function saveWorkbook(book, file) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  try { await book.xlsx.writeFile(temp); await fs.rename(temp, file); }
  finally { await fs.rm(temp, {force: true}).catch(() => {}); }
}
function rows(sheet) {
  const result = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const item = Object.fromEntries(COLUMNS.map((key, i) => [key, String(row.getCell(i + 1).text || '')]));
    item.timeSlots = item.timeSlots ? item.timeSlots.split(' | ') : [];
    if (item.id) result.push(item);
  });
  return result;
}
function assertNoScheduleConflict(candidate, existing, excludeId = null) {
  const conflict = existing.find(item =>
    item.id !== excludeId &&
    item.registrationDate === candidate.registrationDate &&
    item.car === candidate.car &&
    item.timeSlots.some(slot => candidate.timeSlots.includes(slot))
  );
  if (conflict) {
    const overlap = conflict.timeSlots.filter(slot => candidate.timeSlots.includes(slot));
    throw bad(`${candidate.car} đã có lịch vào ngày ${candidate.registrationDate}, khung giờ ${overlap.join(', ')}. Vui lòng chọn xe hoặc giờ khác.`, 409);
  }
}
function replaceRows(book, sheet, records) {
  book.removeWorksheet(sheet.id);
  const freshSheet = initializeSheet(book);
  for (const item of records) freshSheet.addRow(COLUMNS.map(key => key === 'timeSlots' ? item.timeSlots.join(' | ') : item[key]));
}
function withMutation(fn) {
  const work = mutationQueue.then(fn);
  mutationQueue = work.catch(() => {});
  return work;
}
async function handleApi(req, res, pathname) {
  if (pathname === '/api/config' && req.method === 'GET') return send(res, 200, {path: selectedPath});
  if (pathname === '/api/config' && req.method === 'POST') {
    const body = await readBody(req);
    const full = normalizePath(body.path);
    const parent = path.dirname(full);
    let stat;
    try { stat = await fs.stat(parent); } catch { throw bad('Thư mục chứa file không tồn tại.'); }
    if (!stat.isDirectory()) throw bad('Thư mục chứa file không hợp lệ.');
    const {book} = await workbookAt(full);
    try { await fs.access(full); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await saveWorkbook(book, full);
    }
    await fs.writeFile(CONFIG_FILE, JSON.stringify({path: full}, null, 2));
    selectedPath = full;
    return send(res, 200, {path: full});
  }
  if (!selectedPath) throw bad('Hãy chọn đường dẫn lưu file Excel trước.', 409);
  if (pathname === '/api/records' && req.method === 'GET') {
    const {sheet} = await workbookAt(selectedPath);
    return send(res, 200, {records: rows(sheet)});
  }
  if (pathname === '/api/export' && req.method === 'GET') {
    const content = await fs.readFile(selectedPath);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="lich-tap-lai-xe.xlsx"; filename*=UTF-8''${encodeURIComponent(path.basename(selectedPath))}`,
      'Content-Length': content.length,
      'Cache-Control': 'no-store'
    });
    return res.end(content);
  }
  if (pathname === '/api/records' && req.method === 'POST') {
    const record = validateRecord(await readBody(req));
    return send(res, 201, await withMutation(async () => {
      const {book, sheet} = await workbookAt(selectedPath);
      assertNoScheduleConflict(record, rows(sheet));
      const now = new Date().toISOString();
      const item = {id: crypto.randomUUID(), ...record, createdAt: now, updatedAt: now};
      sheet.addRow(COLUMNS.map(key => key === 'timeSlots' ? item.timeSlots.join(' | ') : item[key]));
      await saveWorkbook(book, selectedPath);
      return {record: item};
    }));
  }
  const match = pathname.match(/^\/api\/records\/([a-f0-9-]{36})$/i);
  if (match && ['PUT', 'DELETE'].includes(req.method)) {
    const replacement = req.method === 'PUT' ? validateRecord(await readBody(req)) : null;
    const result = await withMutation(async () => {
      const {book, sheet} = await workbookAt(selectedPath);
      const all = rows(sheet);
      const index = all.findIndex(item => item.id === match[1]);
      if (index < 0) throw bad('Không tìm thấy lịch đăng ký.', 404);
      const previous = all[index];
      if (replacement) assertNoScheduleConflict(replacement, all, match[1]);
      if (replacement) all[index] = {...previous, ...replacement, updatedAt: new Date().toISOString()};
      else all.splice(index, 1);
      replaceRows(book, sheet, all);
      await saveWorkbook(book, selectedPath);
      return replacement ? {record: all[index]} : {deleted: true};
    });
    return send(res, 200, result);
  }
  throw bad('Đường dẫn API không tồn tại.', 404);
}
async function serveStatic(res, pathname) {
  const files = {'/': 'index.html', '/admin': 'admin.html', '/app.js': 'app.js', '/style.css': 'style.css'};
  const file = files[pathname];
  if (!file) throw bad('Không tìm thấy trang.', 404);
  const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
  const content = await fs.readFile(path.join(ROOT, 'public', file));
  res.writeHead(200, {'Content-Type': `${types[path.extname(file)]}; charset=utf-8`, 'Cache-Control': 'no-store'});
  res.end(content);
}
async function main() {
  try {
    const config = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
    selectedPath = normalizePath(config.path);
  } catch (error) { if (error.code !== 'ENOENT') console.warn('Không đọc được cấu hình Excel:', error.message); }
  http.createServer((req, res) => {
    const pathname = new URL(req.url, `http://${HOST}:${PORT}`).pathname;
    (pathname.startsWith('/api/') ? handleApi(req, res, pathname) : serveStatic(res, pathname)).catch(error => fail(res, error));
  }).listen(PORT, HOST, () => console.log(`Lịch tập lái xe: http://${HOST}:${PORT}`));
}
main();
