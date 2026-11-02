/* Рабочая форма REG.RU: текущие PHP API, CSRF, подтверждённый приём в БД. */
(() => {
  const form = document.getElementById('tgForm');
  if (!form) return;
  const status = document.getElementById('formStatus');
  const button = form.querySelector('button[type="submit"]');
  const buttonText = button.querySelector('.btn__text');
  const name = form.elements.name;
  const phone = form.elements.phone;
  const consent = form.elements.consent;
  let session = null;
  let loading = null;
  let sending = false;
  let accepted = false;
  let pending = null;
  const controls = [...form.elements].filter(el => el !== button);
  const say = (text, type = '') => {
    status.textContent = text;
    status.className = 'form__status' + (type ? ' is-' + type : '');
  };
  const request = async (options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api/request.php', {
        credentials: 'same-origin', cache: 'no-store', ...options, signal: controller.signal,
      });
      let result;
      try { result = await response.json(); }
      catch (_) { throw new Error('Не удалось получить подтверждение от сервера.'); }
      if (!response.ok || result.ok !== true) {
        const error = new Error(result.message || 'Не удалось принять заявку.');
        error.httpStatus = response.status;
        throw error;
      }
      return result;
    } finally { clearTimeout(timeout); }
  };
  const initialize = () => {
    if (loading) return loading;
    loading = request().then(result => {
      if (result.consent_version !== form.elements.consent_version.value ||
          typeof result.csrf !== 'string' || typeof result.request_id !== 'string') {
        throw new Error('Параметры формы обновились. Обновите страницу.');
      }
      session = result;
    }).finally(() => { loading = null; });
    return loading;
  };
  const unlock = () => controls.forEach(el => { el.disabled = false; });
  name.addEventListener('input', () => name.closest('.field').classList.remove('is-invalid'));
  phone.addEventListener('input', () => phone.closest('.field').classList.remove('is-invalid'));
  consent.addEventListener('change', () => consent.closest('.consent').classList.remove('is-invalid'));
  initialize().catch(() => {
    if (!sending && !accepted) say('Форма временно недоступна. Можно повторить отправку или позвонить +7 978 127-13-02.', 'error');
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || accepted) return;
    if (!pending) {
      let digits = phone.value.replace(/\D/g, '');
      if (digits.startsWith('8')) digits = '7' + digits.slice(1);
      const errors = [];
      if (!name.value.trim()) { name.closest('.field').classList.add('is-invalid'); errors.push(name); }
      if (!/^7\d{10}$/.test(digits)) { phone.closest('.field').classList.add('is-invalid'); errors.push(phone); }
      if (!consent.checked) { consent.closest('.consent').classList.add('is-invalid'); errors.push(consent); }
      if (errors.length) {
        say(errors.length === 1 && !consent.checked ? 'Необходимо дать согласие на обработку данных.' : 'Заполните имя, корректный номер телефона и согласие.', 'error');
        errors[0].focus();
        return;
      }
    }
    sending = true;
    button.disabled = true;
    buttonText.textContent = 'Отправляем…';
    say('');
    try {
      if (!session) await initialize();
      if (!pending) {
        pending = Object.fromEntries(new FormData(form).entries());
        delete pending.package_choice;
        let digits = pending.phone.replace(/\D/g, '');
        if (digits.startsWith('8')) digits = '7' + digits.slice(1);
        pending.phone = '+' + digits;
        pending.csrf = session.csrf;
        pending.request_id = session.request_id;
      }
      controls.forEach(el => { el.disabled = true; });
      const result = await request({
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending),
      });
      if (result.id !== pending.request_id) throw new Error('Не удалось подтвердить номер заявки.');
      accepted = true;
      pending = null;
      form.reset();
      form.elements.package.value = '';
      buttonText.textContent = 'Заявка принята';
      say('Спасибо! Заявка принята. Маргарита свяжется с вами.', 'ok');
    } catch (error) {
      // При неопределённом сетевом результате повторяем те же данные с тем же ID.
      // Так повторное нажатие не создаёт вторую заявку.
      if ([400, 403, 413, 415, 422, 429].includes(error.httpStatus)) {
        pending = null;
        if (error.httpStatus === 403) session = null;
      }
      if (!pending) unlock();
      buttonText.textContent = pending ? 'Повторить отправку' : 'Оставить заявку';
      say(pending
        ? 'Не удалось подтвердить приём заявки. Нажмите «Повторить отправку» — повторим ту же заявку без дублирования.'
        : (error.httpStatus ? error.message : 'Форма временно недоступна. Повторите отправку или позвоните +7 978 127-13-02.'), 'error');
    } finally {
      sending = false;
      button.disabled = accepted;
    }
  });
})();
