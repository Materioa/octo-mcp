const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => {
    console.log('BROWSER CONSOLE:', msg.type(), msg.text());
    logs.push(msg.text());
  });
  page.on('pageerror', err => {
    console.log('BROWSER ERROR:', err.message);
  });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' }).catch(e => console.log('GOTO ERROR:', e.message));
  console.log('Page loaded');
  await browser.close();
})();
