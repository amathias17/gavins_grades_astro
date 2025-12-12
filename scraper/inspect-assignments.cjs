/**
 * Playwright script to inspect Skyward assignment data
 * This helps identify network requests and DOM structure for assignments
 */

const { chromium } = require('playwright');

async function inspectAssignments() {
    console.log('Starting Skyward assignment inspector...');

    const browser = await chromium.launch({
        headless: false,  // Show browser for inspection
        slowMo: 1000      // Slow down for observation
    });

    const context = await browser.newContext();

    // Enable network request logging
    context.on('request', request => {
        if (request.url().includes('gradebook') ||
            request.url().includes('assignment') ||
            request.url().includes('sfgradebook')) {
            console.log('REQUEST:', request.method(), request.url());
        }
    });

    context.on('response', async response => {
        if (response.url().includes('gradebook') ||
            response.url().includes('assignment') ||
            response.url().includes('sfgradebook')) {
            console.log('RESPONSE:', response.status(), response.url());
            try {
                const contentType = response.headers()['content-type'];
                if (contentType && contentType.includes('application/json')) {
                    const json = await response.json();
                    console.log('JSON DATA:', JSON.stringify(json, null, 2));
                }
            } catch (e) {
                // Not JSON or can't parse
            }
        }
    });

    const page = await context.newPage();

    try {
        // Get credentials from environment
        const username = process.env.SKYWARD_USERNAME;
        const password = process.env.SKYWARD_PASSWORD;

        if (!username || !password) {
            throw new Error('SKYWARD_USERNAME and SKYWARD_PASSWORD must be set');
        }

        // Navigate to login page
        console.log('Navigating to Skyward login...');
        await page.goto('https://skyweb.aasdcat.com/scripts/wsisa.dll/WService=wsEAplus/seplog01.w');

        // Fill in login credentials
        console.log('Logging in...');
        await page.fill('input[name="login"]', username);
        await page.fill('input[name="password"]', password);

        // Wait for the popup to open
        const [popup] = await Promise.all([
            context.waitForEvent('page'),
            page.press('input[name="password"]', 'Enter')
        ]);

        console.log('Login popup opened!');
        await popup.waitForLoadState('networkidle');

        // Wait for navigation after login
        try {
            await popup.waitForURL(url => !url.includes('seplog01.w'), { timeout: 15000 });
        } catch (e) {
            console.log('URL did not change, proceeding...');
        }

        await popup.waitForLoadState('networkidle');
        await popup.waitForTimeout(2000);

        // Handle password change prompt if it appears
        const pageContent = await popup.content();
        if (pageContent.toLowerCase().includes('password') &&
            (pageContent.toLowerCase().includes('change') ||
             pageContent.toLowerCase().includes('update'))) {
            console.log('Attempting to skip password change...');
            const skipSelectors = [
                'button:has-text("Skip")',
                'button:has-text("Cancel")',
                'button:has-text("Later")',
                'a:has-text("Skip")'
            ];

            for (const selector of skipSelectors) {
                try {
                    await popup.click(selector, { timeout: 2000 });
                    console.log(`Clicked: ${selector}`);
                    await popup.waitForLoadState('networkidle');
                    break;
                } catch (e) {
                    // Try next
                }
            }
        }

        console.log('Login successful!');
        console.log('Navigating to Gradebook...');

        // Click Gradebook link
        const gradebookSelectors = [
            'a:has-text("Gradebook")',
            'text=Gradebook',
            '[title*="Gradebook"]'
        ];

        for (const selector of gradebookSelectors) {
            try {
                await popup.waitForSelector(selector, { timeout: 10000 });
                await popup.click(selector);
                console.log(`Clicked Gradebook using: ${selector}`);
                break;
            } catch (e) {
                console.log(`Selector ${selector} not found, trying next...`);
            }
        }

        await popup.waitForLoadState('networkidle');
        await popup.waitForTimeout(2000);

        console.log('\n=== INSPECTING GRADEBOOK PAGE ===\n');

        // Take screenshot of main gradebook
        await popup.screenshot({ path: 'scraper/gradebook-main.png', fullPage: true });
        console.log('Screenshot saved: gradebook-main.png');

        // Find all expandable class rows
        const classRows = await popup.$$('tr[group-parent]');
        console.log(`Found ${classRows.length} class rows with group-parent attribute`);

        // Also try finding class description tables
        const classTables = await popup.$$('table[id^="classDesc_"]');
        console.log(`Found ${classTables.length} class description tables`);

        // Get information about the first class
        if (classTables.length > 0) {
            console.log('\n=== INSPECTING FIRST CLASS ===\n');

            const firstTable = classTables[0];
            const tableId = await firstTable.getAttribute('id');
            console.log('Table ID:', tableId);

            // Try to find the class name link
            const classNameLink = await firstTable.$('.classDesc a');
            if (classNameLink) {
                const className = await classNameLink.textContent();
                console.log('Class Name:', className.trim());

                console.log('\nClicking class to expand assignments...');

                // Enable request/response tracking specifically for this action
                console.log('\n=== NETWORK ACTIVITY WHEN CLICKING CLASS ===\n');

                // Click the class name to see assignments
                await classNameLink.click();
                await popup.waitForTimeout(3000); // Wait for assignments to load

                // Take screenshot after clicking
                await popup.screenshot({ path: 'scraper/class-expanded.png', fullPage: true });
                console.log('Screenshot saved: class-expanded.png');

                // Try to find assignment rows
                console.log('\n=== LOOKING FOR ASSIGNMENT DATA ===\n');

                // Look for various assignment-related selectors
                const possibleSelectors = [
                    'tr[data-assignment]',
                    'tr.assignment',
                    'tr[id*="assignment"]',
                    'table[id*="grid"] tr',
                    'div[id*="Assignment"] tr',
                    '.sf_grid tr'
                ];

                for (const selector of possibleSelectors) {
                    const elements = await popup.$$(selector);
                    if (elements.length > 0) {
                        console.log(`Found ${elements.length} elements with selector: ${selector}`);
                    }
                }

                // Get all table rows and examine them
                const allRows = await popup.$$('tr');
                console.log(`\nTotal TR elements on page: ${allRows.length}`);

                // Sample the HTML content to understand structure
                const bodyHTML = await popup.evaluate(() => {
                    // Find tables that might contain assignments
                    const tables = document.querySelectorAll('table');
                    const tableInfo = [];

                    tables.forEach((table, i) => {
                        const id = table.getAttribute('id');
                        const className = table.getAttribute('class');
                        const rowCount = table.querySelectorAll('tr').length;

                        if (rowCount > 0) {
                            tableInfo.push({
                                index: i,
                                id: id,
                                class: className,
                                rows: rowCount
                            });
                        }
                    });

                    return tableInfo;
                });

                console.log('\nTables on page:', JSON.stringify(bodyHTML, null, 2));

                // Try to extract assignment data from visible elements
                const assignmentData = await popup.evaluate(() => {
                    const assignments = [];

                    // Look for grid tables (Skyward often uses sf_grid)
                    const gridTables = document.querySelectorAll('table.sf_grid, table[id*="grid"]');

                    gridTables.forEach(table => {
                        const rows = table.querySelectorAll('tr');

                        rows.forEach((row, i) => {
                            // Skip header rows
                            if (i === 0 && row.querySelector('th')) return;

                            const cells = row.querySelectorAll('td');
                            if (cells.length >= 3) {
                                const cellData = Array.from(cells).map(cell => cell.textContent.trim());
                                assignments.push({
                                    rowIndex: i,
                                    cellCount: cells.length,
                                    data: cellData
                                });
                            }
                        });
                    });

                    return assignments;
                });

                console.log('\nExtracted assignment data:', JSON.stringify(assignmentData, null, 2));
            }
        }

        console.log('\n=== INSPECTION COMPLETE ===\n');
        console.log('Review the screenshots and network logs above.');
        console.log('Press Ctrl+C to close the browser when done inspecting.');

        // Keep browser open for manual inspection
        await new Promise(() => {}); // Infinite wait

    } catch (error) {
        console.error('Error during inspection:', error);
        await page.screenshot({ path: 'scraper/error-screenshot.png' });
        throw error;
    }
}

inspectAssignments().catch(console.error);
