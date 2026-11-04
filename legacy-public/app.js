const $ = selector => document.querySelector(selector);
const page = document.body.dataset.page;
let records = [];
let editingId = null;
const formatDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN') : '—';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
async function api(url, options = {}) {
  const response = await fetch(url, {headers: {'Content-Type': 'application/json'}, ...options});
  let data;
  try { data = await response.json(); } catch { throw new Error('Máy chủ không phản hồi.'); }
  if (!response.ok) throw new Error(data.error || 'Có lỗi xảy ra.');
  return data;
}
function setMessage(message, isError = false) {
  const box = $('#form-message');
  box.textContent = message;
  box.classList.toggle('error', isError);
  box.classList.toggle('success', !isError && !!message);
}
function recordFromForm(form) {
  const data = new FormData(form);
  const item = Object.fromEntries(['registrationDate','teacher','licenseClass','car','student'].map(key => [key, String(data.get(key) || '').trim()]));
  item.timeSlots = data.getAll('timeSlots');
  if (!item.timeSlots.length) throw new Error('Vui lòng chọn ít nhất một khung giờ.');
  return item;
}
function fillForm(form, item) {
  form.reset();
  for (const key of ['registrationDate','teacher','licenseClass','car','student']) form.elements[key].value = item?.[key] || (key === 'registrationDate' ? today() : '');
  form.querySelectorAll('[name="timeSlots"]').forEach(el => { el.checked = !!item?.timeSlots.includes(el.value); });
  setMessage('');
}
async function setup() {
  const config = await api('/api/config');
  $('#excel-path').value = config.path || '';
  const confirmed = sessionStorage.getItem('excel-path-confirmed') === config.path && !!config.path;
  $('#setup').hidden = confirmed;
  if (page === 'admin') $('#storage-path').textContent = config.path || 'Chưa chọn';
  $('#setup-form').addEventListener('submit', async event => {
    event.preventDefault();
    $('#setup-error').textContent = '';
    const button = event.submitter;
    button.disabled = true;
    try {
      const result = await api('/api/config', {method: 'POST', body: JSON.stringify({path: $('#excel-path').value})});
      sessionStorage.setItem('excel-path-confirmed', result.path);
      $('#setup').hidden = true;
      if (page === 'admin') { $('#storage-path').textContent = result.path; await loadRecords(); }
    } catch (error) { $('#setup-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  return confirmed;
}
async function loadRecords() {
  try { records = (await api('/api/records')).records; renderAdmin(); }
  catch (error) { $('#result-count').textContent = error.message; }
}
function renderAdmin() {
  const search = $('#filter-name').value.trim().toLocaleLowerCase('vi-VN');
  const license = $('#filter-class').value;
  const date = $('#filter-date').value;
  const filtered = records.filter(item => (!search || `${item.teacher} ${item.student}`.toLocaleLowerCase('vi-VN').includes(search)) && (!license || item.licenseClass === license) && (!date || item.registrationDate === date));
  filtered.sort((a,b) => b.registrationDate.localeCompare(a.registrationDate) || b.createdAt.localeCompare(a.createdAt));
  $('#stat-total').textContent = records.length;
  $('#stat-days').textContent = new Set(records.map(item => item.registrationDate)).size;
  $('#stat-date').textContent = date ? records.filter(item => item.registrationDate === date).length : '—';
  $('#stat-date-label').textContent = date ? formatDate(date) : 'Chọn ngày để xem';
  $('#result-count').textContent = `${filtered.length} trong ${records.length} lượt đăng ký`;
  $('#records-body').innerHTML = filtered.map(item => `<tr><td><strong>${formatDate(item.registrationDate)}</strong></td><td>${escapeHtml(item.teacher)}</td><td>${escapeHtml(item.student)}</td><td><span class="badge">${escapeHtml(item.licenseClass)}</span></td><td>${escapeHtml(item.car)}</td><td>${item.timeSlots.map(slot => `<span class="slot">${escapeHtml(slot)}</span>`).join('')}</td><td><div class="row-actions"><button class="action-edit" data-edit="${item.id}" aria-label="Sửa lịch của ${escapeHtml(item.student)}">Sửa</button><button class="action-delete" data-delete="${item.id}" aria-label="Xóa lịch của ${escapeHtml(item.student)}">Xóa</button></div></td></tr>`).join('');
  $('#empty-state').hidden = filtered.length > 0;
  const grouped = new Map();
  for (const item of records) grouped.set(item.registrationDate, (grouped.get(item.registrationDate) || 0) + 1);
  const daily = [...grouped].sort((a,b) => b[0].localeCompare(a[0]));
  const max = Math.max(1, ...daily.map(pair => pair[1]));
  $('#daily-stats').innerHTML = daily.length ? daily.map(([day,count]) => `<div class="daily-row"><span>${formatDate(day)}</span><div class="bar-track"><div style="width:${count/max*100}%"></div></div><strong>${count}</strong></div>`).join('') : '<p class="muted">Chưa có dữ liệu thống kê.</p>';
}
async function init() {
  let confirmed;
  try { confirmed = await setup(); } catch (error) { $('#setup').hidden = false; $('#setup-error').textContent = error.message; return; }
  const form = $('#record-form');
  fillForm(form, null);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    try {
      const item = recordFromForm(form);
      button.disabled = true;
      if (page === 'admin' && editingId) await api(`/api/records/${editingId}`, {method:'PUT',body:JSON.stringify(item)});
      else await api('/api/records', {method:'POST',body:JSON.stringify(item)});
      if (page === 'admin') { $('#record-dialog').close(); await loadRecords(); }
      else { fillForm(form, null); setMessage('Đăng ký thành công! Lịch đã được lưu vào file Excel.'); window.scrollTo({top:0,behavior:'smooth'}); }
    } catch (error) { setMessage(error.message, true); }
    finally { button.disabled = false; }
  });
  if (page !== 'admin') return;
  if (confirmed) await loadRecords();
  for (const selector of ['#filter-name','#filter-class','#filter-date']) $(selector).addEventListener('input', renderAdmin);
  $('#clear-filters').addEventListener('click', () => { $('#filter-name').value = ''; $('#filter-class').value = ''; $('#filter-date').value = ''; renderAdmin(); });
  $('#change-path').addEventListener('click', () => { $('#setup').hidden = false; $('#excel-path').focus(); });
  const dialog = $('#record-dialog');
  $('#add-record').addEventListener('click', () => { editingId = null; $('#dialog-title').textContent = 'Thêm lịch tập'; fillForm(form, null); dialog.showModal(); });
  $('#close-dialog').addEventListener('click', () => dialog.close());
  $('#cancel-dialog').addEventListener('click', () => dialog.close());
  $('#records-body').addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit]');
    const del = event.target.closest('[data-delete]');
    if (edit) { const item = records.find(record => record.id === edit.dataset.edit); if (!item) return; editingId = item.id; $('#dialog-title').textContent = 'Sửa lịch tập'; fillForm(form, item); dialog.showModal(); }
    if (del) {
      const item = records.find(record => record.id === del.dataset.delete);
      if (!item || !window.confirm(`Xóa lịch của ${item.student} ngày ${formatDate(item.registrationDate)}?`)) return;
      try { await api(`/api/records/${item.id}`, {method:'DELETE'}); await loadRecords(); }
      catch (error) { window.alert(error.message); }
    }
  });
}
init();
