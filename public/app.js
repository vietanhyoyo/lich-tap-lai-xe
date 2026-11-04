(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const page = document.body.dataset.page;
  let records = [];
  let teachers = [];
  let editingTeacherId = null;
  let editingId = null;
  let adminToken = '';
  let busyCount = 0;
  let availability = {};
  let visibleMonth = '';
  let availabilityRequest = 0;
  const cars = ['Xe 1', 'Xe 2', 'Xe 3', 'Xe 4', 'Xe 5'];
  const slots = ['6h - 7h', '7h - 8h'];
  const formatDate = value => value ? new Date(value + 'T00:00:00').toLocaleDateString('vi-VN') : '—';
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  visibleMonth = today().slice(0, 7);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  async function call(name, ...args) {
    let response;
    try {
      response = await fetch('/.netlify/functions/api', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: name, args})
      });
    } catch { throw new Error('Không thể kết nối máy chủ. Vui lòng thử lại.'); }
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('Máy chủ phản hồi không hợp lệ. Vui lòng thử lại.'); }
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Không thể kết nối Google Sheets.');
    return payload.result;
  }
  async function withBusy(task, text) {
    busyCount++;
    $('#loading-overlay').hidden = false;
    $('#loading-overlay strong').textContent = text || 'Đang xử lý...';
    try { return await task(); }
    finally { busyCount--; if (!busyCount) $('#loading-overlay').hidden = true; }
  }
  function message(text, error) {
    const box = $('#form-message');
    box.textContent = text || '';
    box.classList.toggle('error', !!error);
    box.classList.toggle('success', !error && !!text);
  }
  function fromForm(form) {
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
    message('');
  }
  function renderTeacherOptions(selected = '') {
    const select = $('#record-form').elements.teacher;
    const names = teachers.map(item => typeof item === 'string' ? item : item.name);
    const unavailable = selected && !names.includes(selected);
    select.innerHTML = '<option value="">Chọn giáo viên</option>' +
      names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('') +
      (unavailable && page === 'admin' ? `<option value="${escapeHtml(selected)}">${escapeHtml(selected)} (đã xóa khỏi danh sách)</option>` : '');
    select.disabled = names.length === 0;
    select.value = selected || '';
  }
  async function loadTeachers() {
    teachers = await call(page === 'admin' ? 'listTeachersAdmin' : 'listTeachers', ...(page === 'admin' ? [adminToken] : []));
    renderTeacherOptions($('#record-form').elements.teacher.value);
    if (page === 'admin') renderTeachersAdmin();
    else $('#teacher-status').textContent = teachers.length ? '' : 'Chưa có giáo viên. Vui lòng liên hệ quản trị viên.';
  }
  function renderTeachersAdmin() {
    $('#teachers-list').innerHTML = teachers.length ? teachers.map(item =>
      `<div class="teacher-row"><strong>${escapeHtml(item.name)}</strong><div class="row-actions"><button type="button" class="action-edit" data-teacher-edit="${escapeHtml(item.id)}">Sửa</button><button type="button" class="action-delete" data-teacher-delete="${escapeHtml(item.id)}">Xóa</button></div></div>`
    ).join('') : '<p class="muted">Chưa có giáo viên. Bấm “Thêm giáo viên” để bắt đầu.</p>';
  }
  function bookedSlots(date) {
    return new Set((availability[date] || []).map(item => item.car + '|' + item.slot));
  }
  function updateSlotChoices() {
    if (page !== 'register') return;
    const form = $('#record-form');
    const date = form.elements.registrationDate.value;
    const car = form.elements.car.value;
    const booked = bookedSlots(date);
    form.querySelectorAll('[name="timeSlots"]').forEach(input => {
      const occupied = !!car && booked.has(car + '|' + input.value);
      input.disabled = occupied;
      if (occupied) input.checked = false;
      input.closest('.choice').classList.toggle('is-unavailable', occupied);
      input.closest('.choice').querySelector('.choice-note').textContent = occupied ? 'Đã đặt' : '';
    });
  }
  function renderCalendar() {
    const [year, month] = visibleMonth.split('-').map(Number);
    const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    const selectedDate = $('#registrationDate').value;
    $('#calendar-month').textContent = 'Tháng ' + month + '/' + year;
    const cells = Array.from({length: firstWeekday}, () => '<span class="calendar-padding" aria-hidden="true"></span>');
    for (let day = 1; day <= daysInMonth; day++) {
      const date = visibleMonth + '-' + String(day).padStart(2, '0');
      const count = bookedSlots(date).size;
      const status = count === 10 ? 'full' : count > 0 ? 'booked' : 'available';
      cells.push(`<button type="button" class="calendar-day ${status}${selectedDate === date ? ' selected' : ''}${today() === date ? ' today' : ''}" data-day="${date}" aria-label="Ngày ${day} tháng ${month}: ${count} trên 10 khung giờ đã đặt" aria-pressed="${selectedDate === date}"><strong>${day}</strong><span>${count ? count + '/10' : 'Trống'}</span></button>`);
    }
    $('#calendar-grid').innerHTML = cells.join('');
    renderDayDetails();
  }
  function renderDayDetails() {
    const date = $('#registrationDate').value;
    if (!date || !date.startsWith(visibleMonth)) {
      $('#selected-date-title').textContent = 'Tình trạng ngày đã chọn';
      $('#selected-date-summary').textContent = 'Chọn ngày trong tháng đang xem để xem chi tiết.';
      $('#day-availability').innerHTML = '';
      return;
    }
    const booked = bookedSlots(date);
    $('#selected-date-title').textContent = 'Ngày ' + formatDate(date);
    $('#selected-date-summary').textContent = booked.size + '/10 lượt xe và khung giờ đã được đăng ký.';
    $('#day-availability').innerHTML = cars.map(car => `<div class="availability-car"><strong>${car}</strong><div>${slots.map(slot => booked.has(car + '|' + slot) ? `<span class="availability-slot taken">${slot} · Đã đặt</span>` : `<button type="button" class="availability-slot free" data-pick-car="${car}" data-pick-slot="${slot}" aria-label="Chọn ${car}, ${slot}, ngày ${formatDate(date)}">${slot} · Còn trống</button>`).join('')}</div></div>`).join('');
    updateSlotChoices();
  }
  async function loadAvailability(month = visibleMonth) {
    visibleMonth = month;
    const request = ++availabilityRequest;
    $('#calendar-status').textContent = 'Đang tải lịch đã đăng ký...';
    $('#calendar-grid').setAttribute('aria-busy', 'true');
    try {
      const result = await call('getAvailability', month);
      if (request !== availabilityRequest) return;
      availability = result || {};
      renderCalendar();
      $('#calendar-status').textContent = Object.keys(availability).length + ' ngày có lịch trong tháng này.';
    } catch (error) {
      if (request === availabilityRequest) $('#calendar-status').textContent = 'Không tải được lịch: ' + error.message + ' Hãy bấm Làm mới.';
    } finally {
      if (request === availabilityRequest) $('#calendar-grid').removeAttribute('aria-busy');
    }
  }
  function initAvailability(form) {
    const changeMonth = delta => {
      const [year, month] = visibleMonth.split('-').map(Number);
      const next = new Date(year, month - 1 + delta, 1);
      loadAvailability(next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0'));
    };
    $('#calendar-prev').addEventListener('click', () => changeMonth(-1));
    $('#calendar-next').addEventListener('click', () => changeMonth(1));
    $('#calendar-refresh').addEventListener('click', () => loadAvailability());
    $('#calendar-grid').addEventListener('click', event => {
      const day = event.target.closest('[data-day]');
      if (!day) return;
      form.elements.registrationDate.value = day.dataset.day;
      renderCalendar();
    });
    $('#day-availability').addEventListener('click', event => {
      const choice = event.target.closest('[data-pick-car]');
      if (!choice) return;
      form.elements.car.value = choice.dataset.pickCar;
      updateSlotChoices();
      form.querySelector('[name="timeSlots"][value="' + choice.dataset.pickSlot + '"]').checked = true;
      $('#selected-date-summary').textContent = 'Đã chọn ' + choice.dataset.pickCar + ', ' + choice.dataset.pickSlot + '. Hoàn tất biểu mẫu bên dưới.';
    });
    form.elements.registrationDate.addEventListener('change', () => {
      const month = form.elements.registrationDate.value.slice(0, 7);
      if (month && month !== visibleMonth) loadAvailability(month);
      else renderCalendar();
    });
    form.elements.car.addEventListener('change', updateSlotChoices);
    loadAvailability();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadAvailability(); });
  }
  function showLogin(errorText) {
    adminToken = '';
    records = [];
    renderAdmin();
    $('#admin-login').hidden = false;
    $('#login-error').textContent = errorText || '';
  }
  async function loadRecords() {
    records = await call('listRecords', adminToken);
    renderAdmin();
  }
  function renderAdmin() {
    const search = $('#filter-name').value.trim().toLocaleLowerCase('vi-VN');
    const license = $('#filter-class').value;
    const date = $('#filter-date').value;
    const filtered = records.filter(item => (!search || (item.teacher + ' ' + item.student).toLocaleLowerCase('vi-VN').includes(search)) && (!license || item.licenseClass === license) && (!date || item.registrationDate === date));
    filtered.sort((a,b) => b.registrationDate.localeCompare(a.registrationDate) || b.createdAt.localeCompare(a.createdAt));
    $('#stat-total').textContent = records.length;
    $('#stat-days').textContent = new Set(records.map(item => item.registrationDate)).size;
    $('#stat-date').textContent = date ? records.filter(item => item.registrationDate === date).length : '—';
    $('#stat-date-label').textContent = date ? formatDate(date) : 'Chọn ngày để xem';
    $('#result-count').textContent = filtered.length + ' trong ' + records.length + ' lượt đăng ký';
    $('#records-body').innerHTML = filtered.map(item => `<tr><td><strong>${formatDate(item.registrationDate)}</strong></td><td>${escapeHtml(item.teacher)}</td><td>${escapeHtml(item.student)}</td><td><span class="badge">${escapeHtml(item.licenseClass)}</span></td><td>${escapeHtml(item.car)}</td><td>${item.timeSlots.map(slot => `<span class="slot">${escapeHtml(slot)}</span>`).join('')}</td><td><div class="row-actions"><button class="action-edit" data-edit="${item.id}">Sửa</button><button class="action-delete" data-delete="${item.id}">Xóa</button></div></td></tr>`).join('');
    $('#empty-state').hidden = filtered.length > 0;
    const grouped = new Map();
    records.forEach(item => grouped.set(item.registrationDate, (grouped.get(item.registrationDate) || 0) + 1));
    const daily = [...grouped].sort((a,b) => b[0].localeCompare(a[0]));
    const max = Math.max(1, ...daily.map(pair => pair[1]));
    $('#daily-stats').innerHTML = daily.length ? daily.map(([day,count]) => `<div class="daily-row"><span>${formatDate(day)}</span><div class="bar-track"><div style="width:${count/max*100}%"></div></div><strong>${count}</strong></div>`).join('') : '<p class="muted">Chưa có dữ liệu thống kê.</p>';
  }
  async function init() {
    const form = $('#record-form');
    fillForm(form, null);
    if (page === 'register') {
      initAvailability(form);
      loadTeachers().catch(error => { $('#teacher-status').textContent = 'Không tải được danh sách giáo viên: ' + error.message; });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) loadTeachers().catch(error => { $('#teacher-status').textContent = 'Không tải được danh sách giáo viên: ' + error.message; });
      });
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      let item;
      try { item = fromForm(form); } catch (error) { message(error.message, true); return; }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      if (page === 'admin') $('#record-dialog').close();
      try {
        await withBusy(async () => {
          if (page === 'admin') {
            if (editingId) await call('updateRecord', adminToken, editingId, item);
            else await call('createRecord', item);
            await loadRecords();
          } else {
            await call('createRecord', item);
            fillForm(form, null);
            visibleMonth = today().slice(0, 7);
            await loadAvailability();
            await loadTeachers();
            message('Đăng ký thành công! Lịch đã được lưu vào Google Sheets.');
            window.scrollTo({top:0, behavior:'smooth'});
          }
        }, 'Đang lưu vào Google Sheets...');
      } catch (error) {
        message(error.message, true);
        if (page === 'admin') {
          if (/Phiên quản trị/.test(error.message)) showLogin(error.message);
          else $('#record-dialog').showModal();
        }
      }
      finally { button.disabled = false; }
    });
    if (page !== 'admin') return;
    $('#login-form').addEventListener('submit', async event => {
      event.preventDefault();
      $('#login-error').textContent = '';
      const button = event.submitter;
      button.disabled = true;
      try {
        await withBusy(async () => {
          adminToken = await call('loginAdmin', $('#admin-password').value);
          await loadTeachers();
          await loadRecords();
          $('#admin-password').value = '';
          $('#admin-login').hidden = true;
        }, 'Đang đăng nhập...');
      } catch (error) { showLogin(error.message); }
      finally { button.disabled = false; }
    });
    if (adminToken) {
      try { await withBusy(async () => { await loadTeachers(); await loadRecords(); }, 'Đang tải lịch tập...'); $('#admin-login').hidden = true; }
      catch (error) { showLogin(error.message); }
    }
    for (const selector of ['#filter-name','#filter-class','#filter-date']) $(selector).addEventListener('input', renderAdmin);
    $('#clear-filters').addEventListener('click', () => { $('#filter-name').value = ''; $('#filter-class').value = ''; $('#filter-date').value = ''; renderAdmin(); });
    const dialog = $('#record-dialog');
    $('#add-record').addEventListener('click', () => { editingId = null; $('#dialog-title').textContent = 'Thêm lịch tập'; fillForm(form, null); renderTeacherOptions(); dialog.showModal(); });
    $('#close-dialog').addEventListener('click', () => dialog.close());
    $('#cancel-dialog').addEventListener('click', () => dialog.close());
    $('#records-body').addEventListener('click', async event => {
      const edit = event.target.closest('[data-edit]');
      const del = event.target.closest('[data-delete]');
      if (edit) {
        const item = records.find(record => record.id === edit.dataset.edit);
        if (!item) return;
        editingId = item.id;
        $('#dialog-title').textContent = 'Sửa lịch tập';
        fillForm(form, item);
        renderTeacherOptions(item.teacher);
        dialog.showModal();
      }
      if (del) {
        const item = records.find(record => record.id === del.dataset.delete);
        if (!item || !window.confirm('Xóa lịch của ' + item.student + ' ngày ' + formatDate(item.registrationDate) + '?')) return;
        try { await withBusy(async () => { await call('deleteRecord', adminToken, item.id); await loadRecords(); }, 'Đang xóa lịch...'); }
        catch (error) { window.alert(error.message); if (/Phiên quản trị/.test(error.message)) showLogin(error.message); }
      }
    });
    const teacherDialog = $('#teacher-dialog');
    const openTeacherDialog = item => {
      editingTeacherId = item?.id || null;
      $('#teacher-dialog-title').textContent = item ? 'Sửa giáo viên' : 'Thêm giáo viên';
      $('#teacher-name').value = item?.name || '';
      $('#teacher-dialog-error').textContent = '';
      teacherDialog.showModal();
    };
    $('#add-teacher').addEventListener('click', () => openTeacherDialog(null));
    $('#close-teacher-dialog').addEventListener('click', () => teacherDialog.close());
    $('#cancel-teacher-dialog').addEventListener('click', () => teacherDialog.close());
    $('#teacher-form').addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;
      $('#teacher-dialog-error').textContent = '';
      try {
        await withBusy(async () => {
          const name = $('#teacher-name').value;
          if (editingTeacherId) await call('updateTeacher', adminToken, editingTeacherId, name);
          else await call('addTeacher', adminToken, name);
          await loadTeachers();
          await loadRecords();
          teacherDialog.close();
          $('#teachers-message').textContent = editingTeacherId ? 'Đã cập nhật giáo viên.' : 'Đã thêm giáo viên.';
        }, 'Đang lưu giáo viên...');
      } catch (error) {
        $('#teacher-dialog-error').textContent = error.message;
        if (/Phiên quản trị/.test(error.message)) { teacherDialog.close(); showLogin(error.message); }
      } finally { button.disabled = false; }
    });
    $('#teachers-list').addEventListener('click', async event => {
      const edit = event.target.closest('[data-teacher-edit]');
      const del = event.target.closest('[data-teacher-delete]');
      if (edit) {
        const item = teachers.find(teacher => teacher.id === edit.dataset.teacherEdit);
        if (item) openTeacherDialog(item);
      }
      if (del) {
        const item = teachers.find(teacher => teacher.id === del.dataset.teacherDelete);
        if (!item || !window.confirm('Xóa giáo viên ' + item.name + ' khỏi danh sách chọn? Lịch đã đăng ký vẫn được giữ.')) return;
        try {
          await withBusy(async () => {
            await call('deleteTeacher', adminToken, item.id);
            await loadTeachers();
            $('#teachers-message').textContent = 'Đã xóa giáo viên khỏi danh sách chọn.';
          }, 'Đang xóa giáo viên...');
        } catch (error) {
          $('#teachers-message').textContent = error.message;
          if (/Phiên quản trị/.test(error.message)) showLogin(error.message);
        }
      }
    });
    $('#export-excel').addEventListener('click', async () => {
      try {
        await withBusy(async () => {
          const result = await call('exportWorkbook', adminToken);
          const raw = atob(result.base64);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          const url = URL.createObjectURL(new Blob([bytes], {type: result.mimeType}));
          const link = document.createElement('a');
          link.href = url;
          link.download = result.name;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }, 'Đang xuất Excel...');
      } catch (error) { window.alert(error.message); if (/Phiên quản trị/.test(error.message)) showLogin(error.message); }
    });
  }
  init();
})();
