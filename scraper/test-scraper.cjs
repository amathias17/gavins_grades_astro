const { chromium } = require('playwright');

async function testPlaywright() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('Navigating to example.com...');
  await page.goto('https://example.com');
  
  console.log('Page title:', await page.title());
  
  await page.waitForTimeout(3000); // Wait 3 seconds so you can see it
  
  await browser.close();
  console.log('Test complete!');
}

testPlaywright();