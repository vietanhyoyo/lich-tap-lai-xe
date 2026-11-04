const http = require('node:http');
const APP_URL = 'https://script.google.com/macros/s/AKfycbz1yieMmCOnDdmFOGQ8rp-cjtwf-QMeTk0ff_jtfecBtF_EbK6_UdcCIxW6YGNQ1PTXLw/exec';
const port = Number(process.env.PORT || 3000);
http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const target = url.pathname === '/admin' || url.searchParams.get('page') === 'admin' ? APP_URL + '?page=admin' : APP_URL;
  res.writeHead(302, {Location: target, 'Cache-Control': 'no-store'});
  res.end();
}).listen(port, '127.0.0.1', () => console.log(`Google Sheets web app: ${APP_URL}`));
