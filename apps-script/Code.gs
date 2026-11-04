/** Web app lưu lịch tập vào Google Sheets. */
const SPREADSHEET_ID = '1SeeNpu1kZIt8nAqD_7lfzi_4z14t0Pm_96_tsfbsf2Q';
const SHEET_NAME = 'Lịch tập lái xe';
const ADMIN_PASSWORD = '12345678';
const HEADERS = ['Mã', 'Ngày đăng ký', 'Tên thầy', 'Hạng xe', 'Xe', 'Khung giờ tập lái', 'Tên học viên', 'Thời điểm tạo', 'Thời điểm sửa'];
const KEYS = ['id', 'registrationDate', 'teacher', 'licenseClass', 'car', 'timeSlots', 'student', 'createdAt', 'updatedAt'];

function doGet(e) {
  const page = e && e.parameter && e.parameter.page === 'admin' ? 'Admin' : 'Index';
  const template = HtmlService.createTemplateFromFile(page);
  template.webAppUrl = ScriptApp.getService().getUrl();
  return template.evaluate().setTitle(page === 'Admin' ? 'Quản trị lịch tập lái xe' : 'Đăng ký lịch tập lái xe');
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

function loginAdmin(password) {
  if (String(password || '') !== ADMIN_PASSWORD) throw new Error('Mật khẩu không đúng.');
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('admin:' + token, '1', 21600);
  return token;
}
function logoutAdmin(token) {
  if (token) CacheService.getScriptCache().remove('admin:' + String(token));
  return true;
}
function requireAdmin_(token) {
  if (!token || CacheService.getScriptCache().get('admin:' + String(token)) !== '1') {
    throw new Error('Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.');
  }
}
function getSheet_() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setBackground('#493bd8').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, HEADERS.length, 150);
    sheet.setColumnWidth(1, 290);
    sheet.setColumnWidth(2, 140);
    sheet.setColumnWidth(6, 210);
  } else {
    const actual = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0];
    if (HEADERS.some((value, index) => actual[index] !== value)) throw new Error('Trang tính lịch tập có tiêu đề cột không đúng. Hãy kiểm tra trang "' + SHEET_NAME + '".');
  }
  return sheet;
}
function getRecords_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HEADERS.length).getDisplayValues().filter(row => row[0]).map(row => {
    const item = {};
    KEYS.forEach((key, index) => { item[key] = row[index]; });
    item.timeSlots = item.timeSlots ? item.timeSlots.split(' | ') : [];
    return item;
  });
}
function findRowById_(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return -1;
  const ids = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  const index = ids.findIndex(row => row[0] === id);
  return index < 0 ? -1 : index + 2;
}
function listRecords(token) {
  requireAdmin_(token);
  return getRecords_(getSheet_());
}
function clean_(value) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''; }
function validateRecord_(input) {
  if (!input || typeof input !== 'object') throw new Error('Dữ liệu đăng ký không hợp lệ.');
  const item = {
    registrationDate: clean_(input.registrationDate), teacher: clean_(input.teacher),
    licenseClass: clean_(input.licenseClass), car: clean_(input.car),
    timeSlots: Array.isArray(input.timeSlots) ? [...new Set(input.timeSlots.map(clean_))] : [],
    student: clean_(input.student)
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.registrationDate)) throw new Error('Ngày đăng ký không hợp lệ.');
  const [year, month, day] = item.registrationDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) throw new Error('Ngày đăng ký không hợp lệ.');
  if (!item.teacher || !item.student || item.teacher.length > 120 || item.student.length > 120) throw new Error('Vui lòng nhập tên thầy và học viên (tối đa 120 ký tự).');
  if (!['B.01', 'B', 'C1'].includes(item.licenseClass)) throw new Error('Hạng xe không hợp lệ.');
  if (!['Xe 1', 'Xe 2', 'Xe 3', 'Xe 4', 'Xe 5'].includes(item.car)) throw new Error('Xe không hợp lệ.');
  if (!item.timeSlots.length || item.timeSlots.some(slot => !['6h - 7h', '7h - 8h'].includes(slot))) throw new Error('Vui lòng chọn ít nhất một khung giờ hợp lệ.');
  return item;
}
function checkConflict_(candidate, records, excludeId) {
  const conflict = records.find(item => item.id !== excludeId && item.registrationDate === candidate.registrationDate && item.car === candidate.car && item.timeSlots.some(slot => candidate.timeSlots.includes(slot)));
  if (conflict) {
    const overlap = conflict.timeSlots.filter(slot => candidate.timeSlots.includes(slot));
    throw new Error(candidate.car + ' đã có lịch vào ngày ' + candidate.registrationDate + ', khung giờ ' + overlap.join(', ') + '. Vui lòng chọn xe hoặc giờ khác.');
  }
}
function rowValues_(item) {
  return KEYS.map(key => {
    const value = key === 'timeSlots' ? item.timeSlots.join(' | ') : String(item[key] || '');
    // Tiền tố nháy đơn giữ nội dung người dùng nhập ở dạng văn bản, tránh công thức Sheets.
    return /^[=+@-]/.test(value) ? "'" + value : value;
  });
}
function createRecord(input) {
  const item = validateRecord_(input);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSheet_();
    checkConflict_(item, getRecords_(sheet), null);
    const now = new Date().toISOString();
    const saved = Object.assign({id: Utilities.getUuid()}, item, {createdAt: now, updatedAt: now});
    const row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, HEADERS.length).setNumberFormat('@').setValues([rowValues_(saved)]);
    SpreadsheetApp.flush();
    return saved;
  } finally { lock.releaseLock(); }
}
function updateRecord(token, id, input) {
  requireAdmin_(token);
  const item = validateRecord_(input);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSheet_();
    const records = getRecords_(sheet);
    const index = records.findIndex(record => record.id === id);
    if (index < 0) throw new Error('Không tìm thấy lịch đăng ký.');
    checkConflict_(item, records, id);
    const saved = Object.assign({}, records[index], item, {updatedAt: new Date().toISOString()});
    sheet.getRange(findRowById_(sheet, id), 1, 1, HEADERS.length).setNumberFormat('@').setValues([rowValues_(saved)]);
    SpreadsheetApp.flush();
    return saved;
  } finally { lock.releaseLock(); }
}
function deleteRecord(token, id) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSheet_();
    const row = findRowById_(sheet, id);
    if (row < 0) throw new Error('Không tìm thấy lịch đăng ký.');
    sheet.deleteRow(row);
    SpreadsheetApp.flush();
    return true;
  } finally { lock.releaseLock(); }
}
function exportWorkbook(token) {
  requireAdmin_(token);
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(SPREADSHEET_ID) + '/export?format=xlsx';
  const response = UrlFetchApp.fetch(url, {
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Không thể xuất file Excel từ Google Sheets (mã ' + response.getResponseCode() + ').');
  return {name: 'lich-tap-lai-xe.xlsx', mimeType: mime, base64: Utilities.base64Encode(response.getContent())};
}
