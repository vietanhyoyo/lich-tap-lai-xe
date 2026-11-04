import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = name => readFileSync(join(root, 'apps-script', name), 'utf8');
const write = (name, value) => writeFileSync(join(root, 'public', name), value);
function html(name) {
  let output = read(name);
  output = output.replace('<base target="_top">', '');
  output = output.replace("<?!= include_('Styles'); ?>", '<link rel="stylesheet" href="/style.css">');
  output = output.replaceAll('<?= webAppUrl ?>?page=admin', '/admin.html');
  output = output.replaceAll('<?= webAppUrl ?>', '/');
  output = output.replace("<?!= include_('Client'); ?>", '<script src="/app.js"></script>');
  if (output.includes('<?')) throw new Error(`Unconverted Apps Script template in ${name}`);
  return output;
}
write('index.html', html('Index.html'));
write('admin.html', html('Admin.html'));
write('style.css', [...read('Styles.html').matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n'));
let client = read('Client.html').replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, '');
const oldCall = `  function call(name, ...args) {
    return new Promise((resolve, reject) => {
      google.script.run.withSuccessHandler(resolve).withFailureHandler(error => reject(new Error(error && error.message ? error.message : 'Không thể kết nối Google Sheets.')))[name](...args);
    });
  }`;
const newCall = `  async function call(name, ...args) {
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
  }`;
if (!client.includes(oldCall)) throw new Error('Apps Script client transport has changed; update sync-public.mjs');
client = client.replace(oldCall, newCall);
if (client.includes('google.script.run')) throw new Error('Apps Script transport remains in public client');
write('app.js', client);
console.log('Synced Apps Script UI to public/');
