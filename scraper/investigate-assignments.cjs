/**
 * Focused investigation script to capture assignment data structure
 * Clicks sf_expander elements and monitors network/DOM
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;

async function investigateAssignments() {
    console.log('Starting focused assignment investigation...');

    const browser = await chromium.launch({
        headless: false,
        slowMo: 500
    });

    const context = await browser.newContext();

    // Track all network requests
    const networkLog = [];

    context.on('request', request => {
        networkLog.push({
            type: 'request',
            method: request.method(),
            url: request.url(),
            headers: request.headers()
        });
    });

    context.on('response', async response => {
        const entry = {
            type: 'response',
            status: response.status(),
            url: response.url(),
            contentType: response.headers()['content-type']
        };

        // Try to capture JSON responses
        if (entry.contentType && entry.contentType.includes('application/json')) {
            try {
                entry.body = await response.json();
            } catch (e) {
                entry.body = '[Could not parse JSON]';
            }
        }

        networkLog.push(entry);
    });

    const page = await context.newPage();

    try {
        const username = process.env.SKYWARD_USERNAME;
        const password = process.env.SKYWARD_PASSWORD;

        if (!username || !password) {
            throw new Error('SKYWARD_USERNAME and SKYWARD_PASSWORD must be set');
        }

        // Login sequence
        console.log('Logging in...');
        await page.goto('https://skyweb.aasdcat.com/scripts/wsisa.dll/WService=wsEAplus/seplog01.w');
        await page.fill('input[name="login"]', username);
        await page.fill('input[name="password"]', password);

        const [popup] = await Promise.all([
            context.waitForEvent('page'),
            page.press('input[name="password"]', 'Enter')
        ]);

        await popup.waitForLoadState('networkidle');
        await popup.waitForTimeout(2000);

        // Skip password change if needed
        const pageContent = await popup.content();
        if (pageContent.toLowerCase().includes('password') &&
            pageContent.toLowerCase().includes('change')) {
            const skipSelectors = [
                'button:has-text("Skip")',
                'button:has-text("Cancel")',
                'button:has-text("Later")'
            ];
            for (const selector of skipSelectors) {
                try {
                    await popup.click(selector, { timeout: 2000 });
                    await popup.waitForLoadState('networkidle');
                    break;
                } catch (e) {}
            }
        }

        // Navigate to Gradebook
        console.log('Navigating to Gradebook...');
        const gradebookSelectors = [
            'a:has-text("Gradebook")',
            'text=Gradebook'
        ];

        for (const selector of gradebookSelectors) {
            try {
                await popup.waitForSelector(selector, { timeout: 10000 });
                await popup.click(selector);
                break;
            } catch (e) {}
        }

        await popup.waitForLoadState('networkidle');
        await popup.waitForTimeout(2000);

        console.log('\n=== GRADEBOOK LOADED ===\n');

        // Find all expander buttons (user confirmed selector)
        const expanders = await popup.$$('a.sf_expander');
        console.log(`Found ${expanders.length} expander buttons`);

        if (expanders.length === 0) {
            console.log('No expanders found. Taking screenshot for debugging.');
            await popup.screenshot({ path: 'scraper/no-expanders.png', fullPage: true });
            throw new Error('No expander elements found');
        }

        // Clear network log before expansion
        networkLog.length = 0;

        // Click the FIRST expander to reveal assignments
        console.log('\n=== CLICKING FIRST CLASS EXPANDER ===\n');
        const firstExpander = expanders[0];

        // Get the group ID from the expander
        const expanderId = await firstExpander.getAttribute('id');
        console.log(`Expander ID: ${expanderId}`);

        await firstExpander.click();
        console.log('Clicked expander, waiting for content to load...');

        // Wait for assignments to load
        await popup.waitForTimeout(3000);

        // Take screenshot after expansion
        await popup.screenshot({ path: 'scraper/expanded-class.png', fullPage: true });
        console.log('Screenshot saved: expanded-class.png');

        // Look for network requests that happened during expansion
        console.log('\n=== NETWORK ACTIVITY DURING EXPANSION ===\n');
        const relevantRequests = networkLog.filter(entry =>
            entry.url.includes('gradebook') ||
            entry.url.includes('assignment') ||
            entry.url.includes('sfgradebook') ||
            entry.url.includes('grade')
        );

        if (relevantRequests.length > 0) {
            console.log(`Found ${relevantRequests.length} relevant network requests:`);
            relevantRequests.forEach((entry, i) => {
                console.log(`\n[${i + 1}] ${entry.type.toUpperCase()}: ${entry.method || 'GET'} ${entry.url}`);
                if (entry.body) {
                    console.log('Response body:', JSON.stringify(entry.body, null, 2));
                }
            });

            // Save full network log
            await fs.writeFile(
                'scraper/network-log.json',
                JSON.stringify(relevantRequests, null, 2)
            );
            console.log('\nFull network log saved to: network-log.json');
        } else {
            console.log('No API requests detected during expansion (likely client-side DOM manipulation)');
        }

        // Inspect the DOM structure after expansion
        console.log('\n=== EXTRACTING ASSIGNMENT DATA FROM DOM ===\n');

        const assignmentData = await popup.evaluate(() => {
            const results = {
                tables: [],
                assignments: []
            };

            // Find all tables that might contain assignments
            const tables = document.querySelectorAll('table');

            tables.forEach((table, index) => {
                const id = table.getAttribute('id');
                const className = table.getAttribute('class');
                const rows = table.querySelectorAll('tr');

                // Look for tables with assignment-like data
                if (rows.length > 1) {
                    const firstRow = rows[0];
                    const headers = Array.from(firstRow.querySelectorAll('th, td')).map(cell =>
                        cell.textContent.trim()
                    );

                    // Check if headers look like assignment headers
                    const hasAssignmentHeaders = headers.some(h =>
                        h.toLowerCase().includes('assignment') ||
                        h.toLowerCase().includes('due') ||
                        h.toLowerCase().includes('score') ||
                        h.toLowerCase().includes('points') ||
                        h.toLowerCase().includes('category')
                    );

                    if (hasAssignmentHeaders || className?.includes('grid') || id?.includes('grid')) {
                        const tableInfo = {
                            index,
                            id,
                            className,
                            headers,
                            rowCount: rows.length,
                            sampleRows: []
                        };

                        // Extract first 3 data rows as samples
                        for (let i = 1; i < Math.min(4, rows.length); i++) {
                            const cells = rows[i].querySelectorAll('td');
                            const rowData = Array.from(cells).map(cell => ({
                                text: cell.textContent.trim(),
                                html: cell.innerHTML.substring(0, 200),
                                classes: cell.className
                            }));
                            tableInfo.sampleRows.push(rowData);
                        }

                        results.tables.push(tableInfo);
                    }
                }
            });

            // Also try specific selectors that might contain assignments
            const possibleAssignmentContainers = [
                'table.sf_grid',
                'table[id*="grid"]',
                'table[id*="Grade"]',
                'div[id*="Assignment"]',
                'tr[data-sid]',
                'tr.sf_Section'
            ];

            possibleAssignmentContainers.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    results.assignments.push({
                        selector,
                        count: elements.length,
                        samples: Array.from(elements).slice(0, 2).map(el => ({
                            tag: el.tagName,
                            id: el.id,
                            className: el.className,
                            textContent: el.textContent.trim().substring(0, 200)
                        }))
                    });
                }
            });

            return results;
        });

        console.log('Assignment data structure:');
        console.log(JSON.stringify(assignmentData, null, 2));

        // Save the extracted data
        await fs.writeFile(
            'scraper/assignment-structure.json',
            JSON.stringify(assignmentData, null, 2)
        );
        console.log('\nAssignment structure saved to: assignment-structure.json');

        console.log('\n=== INVESTIGATION COMPLETE ===\n');
        console.log('Files created:');
        console.log('  - expanded-class.png (screenshot)');
        console.log('  - network-log.json (API requests)');
        console.log('  - assignment-structure.json (DOM structure)');
        console.log('\nReview these files to determine extraction strategy.');

        await browser.close();

    } catch (error) {
        console.error('Error during investigation:', error);
        await page.screenshot({ path: 'scraper/investigation-error.png' });
        await browser.close();
        throw error;
    }
}

investigateAssignments().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
