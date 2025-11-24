const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function scrapeGrades(username, password) {
    console.log('Starting Skyward scraper...');

    const browser = await chromium.launch({
        headless: true  // Set to true later for automation
    });

    const page = await browser.newPage();

    try {
        // Navigate to login page
        console.log('Navigating to Skyward login...');
        await page.goto('https://skyweb.aasdcat.com/scripts/wsisa.dll/WService=wsEAplus/seplog01.w');

        // Fill in login credentials
        console.log('Logging in...');
        await page.fill('input[name="login"]', username);
        await page.fill('input[name="password"]', password);

        // Wait for the popup to open
        const [popup] = await Promise.all([
            page.context().waitForEvent('page'),
            page.press('input[name="password"]', 'Enter')
        ]);

        console.log('Login popup opened!');
        await popup.waitForLoadState('networkidle');

        // Wait for navigation after login - the popup should navigate to a new page
        console.log('Waiting for post-login navigation...');
        try {
            // Wait for URL to change (indicates navigation happened)
            await popup.waitForURL(url => !url.includes('seplog01.w'), { timeout: 15000 });
            console.log(`Navigated to: ${popup.url()}`);
        } catch (e) {
            console.log(`Current URL: ${popup.url()}`);
            console.log('URL did not change, attempting to proceed anyway...');
        }

        // Give extra time for the page to fully load
        await popup.waitForLoadState('networkidle');
        await popup.waitForTimeout(2000);

        // Check if we're on a password change page
        const pageContent = await popup.content();
        if (pageContent.toLowerCase().includes('password') &&
            (pageContent.toLowerCase().includes('change') ||
             pageContent.toLowerCase().includes('update') ||
             pageContent.toLowerCase().includes('new password'))) {
            console.log('Password change prompt detected!');

            // Look for a skip/cancel button
            const skipSelectors = [
                'button:has-text("Skip")',
                'button:has-text("Cancel")',
                'button:has-text("Later")',
                'button:has-text("Remind Me Later")',
                'a:has-text("Skip")',
                'a:has-text("Cancel")',
                'a:has-text("Later")',
                'input[value*="Skip"]',
                'input[value*="Cancel"]',
                'input[value*="Later"]'
            ];

            let skipped = false;
            for (const selector of skipSelectors) {
                try {
                    await popup.click(selector, { timeout: 2000 });
                    console.log(`Clicked skip button: ${selector}`);
                    skipped = true;
                    await popup.waitForLoadState('networkidle');
                    await popup.waitForTimeout(2000);
                    break;
                } catch (e) {
                    // Try next selector
                }
            }

            if (!skipped) {
                throw new Error('Password change required. Please update your password in Skyward before running the scraper.');
            }
        }

        console.log('Login successful!');

        console.log('Navigating to Gradebook...');

        // Try multiple selectors for the Gradebook link with increased timeout
        const gradebookSelectors = [
            'a:has-text("Gradebook")',
            'text=Gradebook',
            '[title*="Gradebook"]',
            'a[href*="gradebook"]'
        ];

        let gradebookFound = false;
        for (const selector of gradebookSelectors) {
            try {
                console.log(`Trying selector: ${selector}`);
                await popup.waitForSelector(selector, { timeout: 10000, state: 'visible' });
                await popup.click(selector);
                gradebookFound = true;
                console.log(`Successfully clicked Gradebook using: ${selector}`);
                break;
            } catch (e) {
                console.log(`Selector ${selector} not found, trying next...`);
            }
        }

        if (!gradebookFound) {
            // Take a screenshot for debugging
            await popup.screenshot({ path: 'debug-screenshot.png' });
            console.log('Available links on page:');
            const links = await popup.evaluate(() => {
                return Array.from(document.querySelectorAll('a')).map(a => ({
                    text: a.textContent.trim(),
                    href: a.href,
                    title: a.title
                }));
            });
            console.log(JSON.stringify(links, null, 2));
            throw new Error('Could not find Gradebook link with any selector');
        }

        await popup.waitForLoadState('networkidle');

        // Wait a moment for the page to fully load
        await popup.waitForTimeout(2000);

        console.log('Extracting grades...');

        // Helper function to extract assignments for a specific class
        async function scrapeClassAssignments(page, gradeLink, className) {
            try {
                console.log(`  Scraping assignments for: ${className}`);

                // Click the grade link to open assignment details
                await gradeLink.click();

                // Wait for the assignment details to load (could be a modal, popup, or new section)
                await page.waitForTimeout(2000);

                // Extract assignment data from the page
                const assignments = await page.evaluate(() => {
                    const assignmentData = [];

                    // Look for assignment rows - Skyward typically uses tables for assignment lists
                    // Common patterns: rows with assignment details in a gradebook modal/section
                    const assignmentRows = document.querySelectorAll('tr[data-assignment], .assignment-row, table.sf_gridContent tr');

                    assignmentRows.forEach((row, index) => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length < 3) return; // Skip header rows or incomplete data

                        // Try to extract assignment information
                        // Common Skyward format: Date | Assignment Name | Category | Score | Possible Points
                        let assignmentName = '';
                        let category = '';
                        let dueDate = '';
                        let score = null;
                        let maxPoints = 0;

                        // Look for assignment name (usually in a specific cell with a link or bold text)
                        for (let i = 0; i < cells.length; i++) {
                            const cellText = cells[i].textContent.trim();
                            const cellHTML = cells[i].innerHTML;

                            // Assignment name typically has a link or is in a specific column
                            if (i === 1 || cellHTML.includes('<a') || cellHTML.includes('<b')) {
                                if (!assignmentName && cellText && cellText.length > 3) {
                                    assignmentName = cellText;
                                }
                            }

                            // Look for date patterns (MM/DD/YYYY or similar)
                            if (cellText.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/)) {
                                dueDate = cellText;
                            }

                            // Look for score patterns (e.g., "85/100" or "85" in a score column)
                            const scoreMatch = cellText.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
                            if (scoreMatch) {
                                score = parseFloat(scoreMatch[1]);
                                maxPoints = parseFloat(scoreMatch[2]);
                            } else if (cellText === 'Missing' || cellText.toLowerCase().includes('miss')) {
                                score = null;
                                // Try to find max points in next cell or nearby
                                if (i + 1 < cells.length) {
                                    const nextCell = cells[i + 1].textContent.trim();
                                    const pointsMatch = nextCell.match(/(\d+(?:\.\d+)?)/);
                                    if (pointsMatch) {
                                        maxPoints = parseFloat(pointsMatch[1]);
                                    }
                                }
                            }

                            // Category is often in a specific column (could be "Homework", "Test", "Quiz", etc.)
                            if (cellText && !category && (
                                cellText.toLowerCase().includes('homework') ||
                                cellText.toLowerCase().includes('test') ||
                                cellText.toLowerCase().includes('quiz') ||
                                cellText.toLowerCase().includes('project') ||
                                cellText.toLowerCase().includes('lab') ||
                                cellText.toLowerCase().includes('classwork')
                            )) {
                                category = cellText;
                            }
                        }

                        // Only add if we have at least a name and max points
                        if (assignmentName && maxPoints > 0) {
                            const percentage = score !== null ? Math.round((score / maxPoints) * 100) : null;
                            const status = score === null ? 'missing' : 'graded';

                            assignmentData.push({
                                id: `${assignmentName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${index}`,
                                name: assignmentName,
                                category: category || 'Assignment',
                                dueDate: dueDate || 'N/A',
                                score: score,
                                maxPoints: maxPoints,
                                percentage: percentage,
                                status: status
                            });
                        }
                    });

                    return assignmentData;
                });

                console.log(`    Found ${assignments.length} assignments`);

                // Close the modal/popup if needed (try clicking close button or pressing Escape)
                try {
                    const closeButton = await page.locator('button:has-text("Close"), button:has-text("×"), .close, [aria-label="Close"]').first();
                    if (await closeButton.isVisible({ timeout: 1000 })) {
                        await closeButton.click();
                    } else {
                        await page.keyboard.press('Escape');
                    }
                    await page.waitForTimeout(500);
                } catch (e) {
                    // Close button not found, that's okay
                }

                return assignments;
            } catch (error) {
                console.log(`    Error scraping assignments for ${className}: ${error.message}`);
                return [];
            }
        }

        // Extract grade data from the page
        const gradeData = await popup.evaluate(() => {
            const classes = [];

            // Find all class description tables - these are in the left column
            const classTables = document.querySelectorAll('table[id^="classDesc_"]');

            classTables.forEach(classTable => {
                // Extract the group identifier from the table ID
                // Format: classDesc_1396_35985_0_20
                const tableId = classTable.getAttribute('id');
                const groupId = tableId.replace('classDesc_', '');

                // Get class name
                const classNameElement = classTable.querySelector('.classDesc a');
                if (!classNameElement) return;
                const className = classNameElement.textContent.trim();

                // Get period - it's in the second row after "Period" label
                const cellText = classTable.textContent;
                const periodMatch = cellText.match(/Period\s*(\d+|[A-Z])/);
                const period = periodMatch ? periodMatch[1] : '';

                // Extract teacher name - it's in the third row in a link
                const teacherLinks = classTable.querySelectorAll('tr');
                let teacher = '';
                if (teacherLinks.length >= 3) {
                    const teacherRow = teacherLinks[2];
                    const teacherLink = teacherRow.querySelector('a');
                    if (teacherLink) {
                        teacher = teacherLink.textContent.trim();
                    }
                }

                // Now find the corresponding grade row in the right table using the group ID
                const gradeRow = document.querySelector(`tr[group-parent="${groupId}"]`);

                let q1Grade = null;
                let q2Grade = null;

                if (gradeRow) {
                    const gradeCells = gradeRow.querySelectorAll('td');

                    // First td contains Q1 grade
                    if (gradeCells.length > 0) {
                        const q1Link = gradeCells[0].querySelector('a[id="showGradeInfo"]');
                        if (q1Link) {
                            const gradeText = q1Link.textContent.trim();
                            const grade = parseInt(gradeText);
                            if (!isNaN(grade) && grade >= 0 && grade <= 100) {
                                q1Grade = grade;
                            }
                        }
                    }

                    // Second td contains Q2 grade
                    if (gradeCells.length > 1) {
                        const q2Link = gradeCells[1].querySelector('a[id="showGradeInfo"]');
                        if (q2Link) {
                            const gradeText = q2Link.textContent.trim();
                            const grade = parseInt(gradeText);
                            if (!isNaN(grade) && grade >= 0 && grade <= 100) {
                                q2Grade = grade;
                            }
                        }
                    }
                }

                // Only include classes that have at least one grade
                if (q1Grade !== null || q2Grade !== null) {
                    // Calculate letter grades
                    let q1LetterGrade = null;
                    if (q1Grade !== null) {
                        if (q1Grade >= 90) q1LetterGrade = 'A';
                        else if (q1Grade >= 80) q1LetterGrade = 'B';
                        else if (q1Grade >= 70) q1LetterGrade = 'C';
                        else if (q1Grade >= 60) q1LetterGrade = 'D';
                        else q1LetterGrade = 'F';
                    }

                    let q2LetterGrade = null;
                    if (q2Grade !== null) {
                        if (q2Grade >= 90) q2LetterGrade = 'A';
                        else if (q2Grade >= 80) q2LetterGrade = 'B';
                        else if (q2Grade >= 70) q2LetterGrade = 'C';
                        else if (q2Grade >= 60) q2LetterGrade = 'D';
                        else q2LetterGrade = 'F';
                    }

                    classes.push({
                        class_name: className,
                        teacher: teacher,
                        period: period,
                        q1_grade: q1Grade,
                        q1_letter_grade: q1LetterGrade,
                        q2_grade: q2Grade,
                        q2_letter_grade: q2LetterGrade
                    });
                }
            });

            return classes;
        });

        console.log(`Found ${gradeData.length} classes with grades`);

        // Now scrape assignments for each class with a Q2 grade
        console.log('Scraping individual class assignments...');
        for (const classData of gradeData) {
            try {
                // Find the grade link for Q2 (current quarter) to click
                const gradeLinks = await popup.locator(`a[id="showGradeInfo"]`).all();

                // Match by finding the link that's in the same row as this class
                // This is a simplified approach - we'll click each Q2 grade link sequentially
                const classIndex = gradeData.indexOf(classData);

                if (classIndex < gradeLinks.length && classData.q2_grade !== null) {
                    // Click on the Q2 grade link (usually second link for each class)
                    // Skip Q1, take Q2 (every other link starting from index 1, 3, 5...)
                    const q2LinkIndex = classIndex * 2 + 1; // Q2 is the second link per class

                    if (q2LinkIndex < gradeLinks.length) {
                        const assignments = await scrapeClassAssignments(
                            popup,
                            gradeLinks[q2LinkIndex],
                            classData.class_name
                        );

                        classData.assignments = assignments;
                        classData.class_id = classData.period;
                    }
                } else {
                    // No Q2 grade or link, use period as ID anyway
                    classData.class_id = classData.period;
                    classData.assignments = [];
                }

                // Small delay between classes to avoid overwhelming the server
                await popup.waitForTimeout(500);
            } catch (error) {
                console.log(`Error processing assignments for ${classData.class_name}: ${error.message}`);
                classData.class_id = classData.period;
                classData.assignments = [];
            }
        }

        // Now scrape missing assignments
        console.log('Checking for missing assignments...');
        let missingAssignments = [];

        try {
            // Click the missing assignments button
            const missingButton = await popup.locator('#missingAssignments');
            if (await missingButton.isVisible({ timeout: 5000 })) {
                await missingButton.click();
                console.log('Clicked missing assignments button');

                // Wait for the missing assignments content to load
                await popup.waitForTimeout(2000);

                // Check if there are no missing assignments
                const noMissingText = await popup.locator('text=No Missing Assignments!').count();

                if (noMissingText > 0) {
                    console.log('No missing assignments found');
                } else {
                    console.log('Extracting missing assignments...');

                    // Take a screenshot for debugging
                    await popup.screenshot({ path: 'missing-assignments-screenshot.png' });

                    // Extract missing assignments data
                    missingAssignments = await popup.evaluate(() => {
                        const assignments = [];
                        const seen = new Set(); // Track unique assignments

                        // Look for rows that have actual assignment data
                        // Structure: Due | Assignment | Class | Teacher | Category | Max Points | Absent
                        const rows = document.querySelectorAll('table tr');

                        rows.forEach(row => {
                            const cells = row.querySelectorAll('td');

                            // We need at least 4 cells for a valid assignment row
                            if (cells.length < 4) return;

                            const date = cells[0]?.textContent.trim() || '';
                            const assignmentName = cells[1]?.textContent.trim() || '';
                            const className = cells[2]?.textContent.trim() || '';
                            const teacher = cells[3]?.textContent.trim() || '';
                            const category = cells.length >= 5 ? cells[4]?.textContent.trim() || '' : '';
                            const maxPoints = cells.length >= 6 ? cells[5]?.textContent.trim() || '' : '';
                            const absent = cells.length >= 7 ? cells[6]?.textContent.trim() || '' : '';

                            // Skip if this looks like header text or empty
                            if (!date || !assignmentName || !className) return;
                            if (date.toLowerCase().includes('due') || date.toLowerCase().includes('gavin')) return;
                            if (assignmentName.toLowerCase().includes('due') || assignmentName.toLowerCase().includes('gavin')) return;

                            // Skip rows that don't have a date pattern (should have "/" or "Q")
                            if (!date.match(/\d+\/\d+\/\d+/) && !date.includes('Q')) return;

                            // Create a unique key to check for duplicates
                            const uniqueKey = `${date}|${className}|${assignmentName}`;

                            // Only add if we haven't seen this exact assignment before
                            if (!seen.has(uniqueKey)) {
                                seen.add(uniqueKey);
                                const assignment = {
                                    due_date: date,
                                    assignment_name: assignmentName,
                                    class_name: className,
                                    teacher: teacher
                                };

                                if (category) assignment.category = category;
                                if (maxPoints) assignment.max_points = maxPoints;
                                if (absent) assignment.absent = absent;

                                assignments.push(assignment);
                            }
                        });

                        return assignments;
                    });

                    console.log(`Found ${missingAssignments.length} missing assignments`);
                }
            } else {
                console.log('Missing assignments button not found');
            }
        } catch (error) {
            console.log('Error checking missing assignments:', error.message);
            // Don't fail the whole scrape if missing assignments fails
        }

        await browser.close();
        return { grades: gradeData, missingAssignments };

    } catch (error) {
        await browser.close();
        throw error;
    }
}

// Save grades to JSON file
async function saveGradesToFile(grades, missingAssignments = []) {
    const gradesOutputPath = path.join(__dirname, '../src/data/grades.json');
    const missingOutputPath = path.join(__dirname, '../src/data/missing_assignments.json');

    // Read existing data if it exists
    let existingData = {
        metadata: {},
        classes: [],
        grade_history: {},
        overall_average: 0,
        average_history: {}
    };

    try {
        const existingContent = await fs.readFile(gradesOutputPath, 'utf-8');
        existingData = JSON.parse(existingContent);
    } catch (error) {
        console.log('No existing grades.json found, creating new file...');
    }

    // Get current date in M/D/YYYY format
    const now = new Date();
    const dateKey = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    const timestamp = now.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York'
    });

    // Helper function to normalize class names to title case
    const toTitleCase = (str) => {
        return str
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
            .trim()
            .replace(/\s+/g, ' '); // Remove extra spaces
    };

    // Transform grades data to match the existing format
    const transformedClasses = grades.map(cls => ({
        class_name: toTitleCase(cls.class_name),
        teacher: cls.teacher,
        period: cls.period,
        q1_grade: cls.q1_grade,
        q1_letter_grade: cls.q1_letter_grade,
        q2_grade: cls.q2_grade,
        q2_letter_grade: cls.q2_letter_grade,
        // Use Q2 grade if available, otherwise Q1
        current_grade: cls.q2_grade !== null ? cls.q2_grade : cls.q1_grade,
        letter_grade: cls.q2_letter_grade !== null ? cls.q2_letter_grade : cls.q1_letter_grade
    }));

    // Update grade history
    const gradeHistory = existingData.grade_history || {};
    transformedClasses.forEach(cls => {
        if (!gradeHistory[cls.class_name]) {
            gradeHistory[cls.class_name] = {};
        }
        gradeHistory[cls.class_name][dateKey] = cls.current_grade;
    });

    // Calculate overall average
    const validGrades = transformedClasses
        .map(c => c.current_grade)
        .filter(g => g !== null && g > 0);
    const overallAverage = validGrades.length > 0
        ? Math.round(validGrades.reduce((a, b) => a + b, 0) / validGrades.length)
        : 0;

    // Update average history
    const averageHistory = existingData.average_history || {};
    averageHistory[dateKey] = overallAverage;

    // Create the grades output data (without missing assignments)
    const gradesOutputData = {
        metadata: {
            last_updated: timestamp,
            most_recent_date: dateKey,
            total_classes: transformedClasses.length
        },
        classes: transformedClasses,
        grade_history: gradeHistory,
        overall_average: overallAverage,
        average_history: averageHistory
    };

    // Create the missing assignments output data
    const missingAssignmentsData = {
        metadata: {
            last_updated: timestamp,
            count: missingAssignments.length
        },
        missing_assignments: missingAssignments
    };

    // Write grades to file
    await fs.writeFile(gradesOutputPath, JSON.stringify(gradesOutputData, null, 2));
    console.log(`\nGrades saved to: ${gradesOutputPath}`);
    console.log(`Overall average: ${overallAverage}`);

    // Write missing assignments to file
    await fs.writeFile(missingOutputPath, JSON.stringify(missingAssignmentsData, null, 2));
    console.log(`Missing assignments saved to: ${missingOutputPath}`);
    console.log(`Missing assignments count: ${missingAssignments.length}`);
}

// Test the scraper
async function main() {
    const username = process.env.SKYWARD_USERNAME;
    const password = process.env.SKYWARD_PASSWORD;

    // Validate credentials
    if (!username || !password) {
        console.error('Error: SKYWARD_USERNAME and SKYWARD_PASSWORD environment variables must be set');
        console.error('Current values:');
        console.error(`  SKYWARD_USERNAME: ${username ? '[SET]' : '[NOT SET]'}`);
        console.error(`  SKYWARD_PASSWORD: ${password ? '[SET]' : '[NOT SET]'}`);
        process.exit(1);
    }

    try {
        const result = await scrapeGrades(username, password);
        console.log('Scraping complete!');
        console.log('Grades:', JSON.stringify(result.grades, null, 2));
        console.log('Missing Assignments:', JSON.stringify(result.missingAssignments, null, 2));

        // Save to file
        await saveGradesToFile(result.grades, result.missingAssignments);
    } catch (error) {
        console.error('Error scraping grades:', error);
        process.exit(1);
    }
}

main();