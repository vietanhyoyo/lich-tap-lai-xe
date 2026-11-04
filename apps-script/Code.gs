/** Web app lưu lịch tập vào Google Sheets. */
const SPREADSHEET_ID = '1SeeNpu1kZIt8nAqD_7lfzi_4z14t0Pm_96_tsfbsf2Q';
const SHEET_NAME = 'Lịch tập lái xe';
const TEACHER_SHEET_NAME = 'Giáo viên';
const TEACHER_HEADERS = ['Mã', 'Tên giáo viên', 'Thời điểm tạo', 'Thời điểm sửa'];
const ADMIN_PASSWORD = '12345678';
const HEADERS = ['Mã', 'Ngày đăng ký', 'Tên thầy', 'Hạng xe', 'Xe', 'Khung giờ tập lái', 'Tên học viên', 'Thời điểm tạo', 'Thời điểm sửa'];
const KEYS = ['id', 'registrationDate', 'teacher', 'licenseClass', 'car', 'timeSlots', 'student', 'createdAt', 'updatedAt'];

function doGet(e) {
  const page = e && e.parameter && e.parameter.page === 'admin' ? 'Admin' : 'Index';
  const template = HtmlService.createTemplateFromFile(page);
  template.webAppUrl = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle(page === 'Admin' ? 'Quản trị lịch tập lái xe' : 'Đăng ký lịch tập lái xe')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
function getTeacherSheet_() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = book.getSheetByName(TEACHER_SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(TEACHER_SHEET_NAME);
    sheet.getRange(1, 1, 1, TEACHER_HEADERS.length).setValues([TEACHER_HEADERS]);
    sheet.getRange(1, 1, 1, TEACHER_HEADERS.length).setBackground('#493bd8').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 290);
    sheet.setColumnWidth(2, 240);
    const names = [...new Map(getRecords_(getSheet_()).map(item => [item.teacher.toLocaleLowerCase('vi-VN'), item.teacher])).values()].filter(Boolean);
    if (names.length) {
      const now = new Date().toISOString();
      const rows = names.map(name => [Utilities.getUuid(), safeText_(name), now, now]);
      sheet.getRange(2, 1, rows.length, TEACHER_HEADERS.length).setNumberFormat('@').setValues(rows);
    }
  } else {
    const actual = sheet.getRange(1, 1, 1, TEACHER_HEADERS.length).getDisplayValues()[0];
    if (TEACHER_HEADERS.some((value, index) => actual[index] !== value)) throw new Error('Trang tính giáo viên có tiêu đề cột không đúng.');
  }
  return sheet;
}
function getTeachers_() {
  const sheet = getTeacherSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, TEACHER_HEADERS.length).getDisplayValues()
    .filter(row => row[0] && row[1]).map(row => ({id: row[0], name: row[1]}));
}
function listTeachers() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return getTeachers_().map(item => item.name).sort((a, b) => a.localeCompare(b, 'vi')); }
  finally { lock.releaseLock(); }
}
function listTeachersAdmin(token) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return getTeachers_().sort((a, b) => a.name.localeCompare(b.name, 'vi')); }
  finally { lock.releaseLock(); }
}
function validateTeacherName_(name, teachers, excludeId) {
  name = clean_(name);
  if (!name || name.length > 120 || /^[=+@-]/.test(name)) throw new Error('Tên giáo viên phải có 1–120 ký tự hợp lệ.');
  if (teachers.some(item => item.id !== excludeId && item.name.toLocaleLowerCase('vi-VN') === name.toLocaleLowerCase('vi-VN'))) throw new Error('Giáo viên này đã có trong danh sách.');
  return name;
}
function addTeacher(token, name) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const teachers = getTeachers_();
    name = validateTeacherName_(name, teachers, null);
    const sheet = getTeacherSheet_();
    const now = new Date().toISOString();
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, TEACHER_HEADERS.length).setNumberFormat('@').setValues([[Utilities.getUuid(), safeText_(name), now, now]]);
    SpreadsheetApp.flush();
    return true;
  } finally { lock.releaseLock(); }
}
function updateTeacher(token, id, name) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const teachers = getTeachers_();
    const old = teachers.find(item => item.id === id);
    if (!old) throw new Error('Không tìm thấy giáo viên.');
    name = validateTeacherName_(name, teachers, id);
    const sheet = getTeacherSheet_();
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
    const row = ids.findIndex(item => item[0] === id) + 2;
    sheet.getRange(row, 2).setNumberFormat('@').setValue(safeText_(name));
    sheet.getRange(row, 4).setNumberFormat('@').setValue(new Date().toISOString());
    if (old.name !== name) {
      const bookings = getSheet_();
      getRecords_(bookings).forEach(item => {
        if (item.teacher === old.name) bookings.getRange(findRowById_(bookings, item.id), 3).setNumberFormat('@').setValue(safeText_(name));
      });
    }
    SpreadsheetApp.flush();
    return true;
  } finally { lock.releaseLock(); }
}
function deleteTeacher(token, id) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getTeacherSheet_();
    if (sheet.getLastRow() < 2) throw new Error('Không tìm thấy giáo viên.');
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
    const row = ids.findIndex(item => item[0] === id) + 2;
    if (row < 2) throw new Error('Không tìm thấy giáo viên.');
    sheet.deleteRow(row);
    SpreadsheetApp.flush();
    return true;
  } finally { lock.releaseLock(); }
}
// Chỉ công khai ngày, xe và khung giờ đã đặt. Không trả về tên hoặc mã đăng ký.
function getAvailability(month) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Tháng cần xem không hợp lệ.');
  const days = {};
  getRecords_(getSheet_()).forEach(item => {
    if (!item.registrationDate.startsWith(month)) return;
    if (!days[item.registrationDate]) days[item.registrationDate] = [];
    item.timeSlots.forEach(slot => days[item.registrationDate].push({car: item.car, slot}));
  });
  return days;
}
function clean_(value) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''; }
function safeText_(value) { return /^[=+@-]/.test(value) ? "'" + value : value; }
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
    if (!getTeachers_().some(teacher => teacher.name === item.teacher)) throw new Error('Vui lòng chọn giáo viên trong danh sách hiện có.');
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
    if (item.teacher !== records[index].teacher && !getTeachers_().some(teacher => teacher.name === item.teacher)) throw new Error('Vui lòng chọn giáo viên trong danh sách hiện có.');
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

// Cổng JSON cho Netlify Function. Danh sách thao tác cố định; mọi quyền quản trị
// vẫn được xác minh bởi các hàm có requireAdmin_.
function doPost(e) {
  let payload;
  try {
    const request = JSON.parse(e && e.postData && e.postData.contents || '{}');
    const args = request.args;
    if (!Array.isArray(args) || args.length > 3) throw new Error('Yêu cầu không hợp lệ.');
    const actions = {
      getAvailability: () => getAvailability(args[0]),
      listTeachers: () => listTeachers(),
      createRecord: () => createRecord(args[0]),
      loginAdmin: () => loginAdmin(args[0]),
      listRecords: () => listRecords(args[0]),
      listTeachersAdmin: () => listTeachersAdmin(args[0]),
      updateRecord: () => updateRecord(args[0], args[1], args[2]),
      deleteRecord: () => deleteRecord(args[0], args[1]),
      exportWorkbook: () => exportWorkbook(args[0]),
      addTeacher: () => addTeacher(args[0], args[1]),
      updateTeacher: () => updateTeacher(args[0], args[1], args[2]),
      deleteTeacher: () => deleteTeacher(args[0], args[1])
    };
    if (!Object.prototype.hasOwnProperty.call(actions, request.action)) throw new Error('Chức năng không hợp lệ.');
    payload = {ok: true, result: actions[request.action]()};
  } catch (error) {
    payload = {ok: false, error: error && error.message ? error.message : 'Có lỗi xảy ra.'};
  }
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
