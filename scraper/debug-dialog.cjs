const { chromium } = require('playwright');
const fs = require('fs');

async function debugDialog() {
  console.log('Starting debug session...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Login
    console.log('Logging in to Skyward...');
    await page.goto('https://skyweb.aasdcat.com/scripts/wsisa.dll/WService=wsEAplus/seplog01.w');
    await page.fill('input[name="login"]', process.env.SKYWARD_USERNAME);
    await page.fill('input[name="password"]', process.env.SKYWARD_PASSWORD);

    // Wait for popup after login
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.press('input[name="password"]', 'Enter')
    ]);

    await popup.waitForLoadState('networkidle');
    await popup.waitForTimeout(2000);

    // Navigate to Gradebook
    console.log('Navigating to gradebook...');
    const gradebookSelectors = [
      'a:has-text("Gradebook")',
      'a:has-text("Grades")',
      'a[href*="gradebook"]',
      'a[href*="sfgradebook"]'
    ];

    let gradebookClicked = false;
    for (const selector of gradebookSelectors) {
      try {
        await popup.click(selector, { timeout: 5000 });
        gradebookClicked = true;
        break;
      } catch (e) {
        // Try next selector
      }
    }

    if (!gradebookClicked) {
      throw new Error('Could not find Gradebook link');
    }

    await popup.waitForLoadState('networkidle');

    // Use the popup page from now on
    const gradebookPage = popup;

    // Wait for assignments to load
    await gradebookPage.waitForSelector('a#showAssignmentInfo', { timeout: 10000 });

    // Click on the first visible assignment
    console.log('Clicking first assignment...');
    const firstLink = gradebookPage.locator('a#showAssignmentInfo').first();
    const assignmentName = await firstLink.textContent();
    console.log(`Assignment: ${assignmentName}`);

    await firstLink.click();

    // Wait for dialog
    const dialogLocator = gradebookPage.locator('.sf_Dialog, .ui-dialog, [role="dialog"]').first();
    await dialogLocator.waitFor({ state: 'visible', timeout: 5000 });

    // Extract debug information
    const debugInfo = await gradebookPage.evaluate(() => {
      const dialog = document.querySelector('.sf_Dialog, .ui-dialog, [role="dialog"]');
      const scope = dialog || document.body;

      // Get all the text content
      const fullText = scope.innerText || '';

      // Try to find the points cell with different selectors
      const selectors = [
        'div:nth-of-type(4) div table tbody tr:nth-of-type(2) td:nth-of-type(2)',
        'table tbody tr td:has-text("Points Earned")',
        'td:has-text("Points")',
        'tr:has-text("Points Earned") td',
      ];

      const cells = [];
      selectors.forEach(sel => {
        const el = scope.querySelector(sel);
        if (el) {
          cells.push({
            selector: sel,
            html: el.innerHTML,
            text: el.textContent,
            childNodeCount: el.childNodes.length,
            childNodes: Array.from(el.childNodes).map((node, idx) => ({
              index: idx,
              nodeType: node.nodeType,
              nodeName: node.nodeName,
              textContent: node.textContent?.trim(),
              data: node.data?.trim()
            }))
          });
        }
      });

      // Get the dialog HTML
      const dialogHTML = dialog ? dialog.outerHTML : 'NO DIALOG FOUND';

      return {
        fullText,
        cells,
        dialogHTML
      };
    });

    // Save debug info
    console.log('\n=== FULL DIALOG TEXT ===');
    console.log(debugInfo.fullText);
    console.log('\n=== CELL ANALYSIS ===');
    debugInfo.cells.forEach((cell, idx) => {
      console.log(`\nCell ${idx + 1}:`);
      console.log(`Selector: ${cell.selector}`);
      console.log(`Text: ${cell.text}`);
      console.log(`HTML: ${cell.html}`);
      console.log(`Child Nodes (${cell.childNodeCount}):`);
      cell.childNodes.forEach(node => {
        console.log(`  [${node.index}] ${node.nodeName} (type ${node.nodeType}): "${node.textContent}" | data: "${node.data}"`);
      });
    });

    // Save to file
    fs.writeFileSync(
      'scraper/dialog-debug.json',
      JSON.stringify(debugInfo, null, 2)
    );
    console.log('\n✓ Debug info saved to scraper/dialog-debug.json');

    // Keep browser open for manual inspection
    console.log('\nBrowser will stay open for 60 seconds for manual inspection...');
    await gradebookPage.waitForTimeout(60000);

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

debugDialog().catch(console.error);
