(function(){
  const $ = (sel) => document.querySelector(sel);
  const messages = $('#messages');
  const input = $('#prompt');
  const sendBtn = $('#send');

  function push(role, text){
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  sendBtn?.addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) return;
    push('me', text);
    input.value = '';
    // Placeholder response to show wiring works.
    setTimeout(() => push('bot', 'Це заглушка відповіді з chat.js. (Модель ще не підключено)'), 300);
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendBtn?.click();
  });
})();
