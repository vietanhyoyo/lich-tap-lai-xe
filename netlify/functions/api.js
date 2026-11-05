const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz1yieMmCOnDdmFOGQ8rp-cjtwf-QMeTk0ff_jtfecBtF_EbK6_UdcCIxW6YGNQ1PTXLw/exec';
const ACTIONS = new Set([
  'getAvailability', 'getBookingOptions', 'listTeachers', 'createRecord',
  'loginAdmin', 'listRecords', 'listTeachersAdmin',
  'updateRecord', 'deleteRecord', 'exportWorkbook',
  'addTeacher', 'updateTeacher', 'deleteTeacher',
  'addCar', 'deleteCar', 'addTimeSlot', 'deleteTimeSlot'
]);
const json = (statusCode, body) => ({
  statusCode,
  headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'},
  body: JSON.stringify(body)
});

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, {ok: false, error: 'Phương thức không được hỗ trợ.'});
  if (!event.body || event.body.length > 100000) return json(413, {ok: false, error: 'Yêu cầu quá lớn.'});
  let request;
  try { request = JSON.parse(event.body); }
  catch { return json(400, {ok: false, error: 'Yêu cầu không hợp lệ.'}); }
  if (!request || !ACTIONS.has(request.action) || !Array.isArray(request.args) || request.args.length > 3) {
    return json(400, {ok: false, error: 'Chức năng không hợp lệ.'});
  }
  try {
    const response = await fetch(process.env.APPS_SCRIPT_URL || DEFAULT_SCRIPT_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain; charset=utf-8'},
      body: JSON.stringify(request),
      redirect: 'follow',
      signal: AbortSignal.timeout(50000)
    });
    if (!response.ok) return json(502, {ok: false, error: 'Google Apps Script không phản hồi.'});
    const result = await response.json();
    if (!result || typeof result.ok !== 'boolean') throw new Error('Invalid Apps Script response');
    return json(result.ok ? 200 : 400, result);
  } catch (error) {
    console.error('Apps Script API error:', error.message);
    return json(502, {ok: false, error: 'Không thể kết nối Google Sheets. Vui lòng thử lại.'});
  }
};
