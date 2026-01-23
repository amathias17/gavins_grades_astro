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

                // We only care about the current marking period (Q3). Keep placeholders for schema compatibility.
                let q1Grade = null;
                let q2Grade = null;
                let q3Grade = null;
                let isQ3Highlighted = false;

                if (gradeRow) {
                    isQ3Highlighted = gradeRow.querySelector('.sf_highlightYellow') !== null;

                    const gradeCells = gradeRow.querySelectorAll('td');

                    // Grab Q1/Q2 if present (for compatibility, but not used for current)
                    const q1Link = gradeCells[0]?.querySelector('a[id="showGradeInfo"]');
                    if (q1Link) {
                        const gradeText = q1Link.textContent?.trim().replace(/%/g, '');
                        const grade = Number(gradeText);
                        if (Number.isFinite(grade) && grade >= 0 && grade <= 100) {
                            q1Grade = grade;
                        }
                    }

                    const q2Link = gradeCells[1]?.querySelector('a[id="showGradeInfo"]');
                    if (q2Link) {
                        const gradeText = q2Link.textContent?.trim().replace(/%/g, '');
                        const grade = Number(gradeText);
                        if (Number.isFinite(grade) && grade >= 0 && grade <= 100) {
                            q2Grade = grade;
                        }
                    }

                    // Q3: if cell exists, parse; if highlighted but empty, default to 0
                    const q3Link = gradeCells[2]?.querySelector('a[id="showGradeInfo"]');
                    if (q3Link) {
                        const gradeText = q3Link.textContent?.trim().replace(/%/g, '');
                        const grade = Number(gradeText);
                        if (Number.isFinite(grade) && grade >= 0 && grade <= 100) {
                            q3Grade = grade;
                        }
                    } else if (isQ3Highlighted) {
                        q3Grade = 0;
                    }
                }

                // Only include classes marked as current (highlighted), even if no grade yet
                if (isQ3Highlighted) {
                    // Default empty Q3 to 0 so current classes surface with a placeholder grade
                    if (q3Grade === null) {
                        q3Grade = 0;
                    }
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

                    let q3LetterGrade = null;
                    if (q3Grade !== null) {
                        if (q3Grade >= 90) q3LetterGrade = 'A';
                        else if (q3Grade >= 80) q3LetterGrade = 'B';
                        else if (q3Grade >= 70) q3LetterGrade = 'C';
                        else if (q3Grade >= 60) q3LetterGrade = 'D';
                        else q3LetterGrade = 'F';
                    }

                    classes.push({
                        class_name: className,
                        teacher: teacher,
                        period: period,
                        q1_grade: q1Grade,
                        q1_letter_grade: q1LetterGrade,
                        q2_grade: q2Grade,
                        q2_letter_grade: q2LetterGrade,
                        q3_grade: q3Grade,
                        q3_letter_grade: q3LetterGrade
                    });
                }
            });

            return classes;
        });

        console.log(`Found ${gradeData.length} classes with grades`);

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

                            const dateRaw = cells[0]?.textContent.trim() || '';
                            const date = dateRaw;
                            const assignmentName = cells[1]?.textContent.trim() || '';
                            const className = cells[2]?.textContent.trim() || '';
                            const teacher = cells[3]?.textContent.trim() || '';
                            const category = cells.length >= 5 ? cells[4]?.textContent.trim() || '' : '';
                            const maxPoints = cells.length >= 6 ? cells[5]?.textContent.trim() || '' : '';
                            const absent = cells.length >= 7 ? cells[6]?.textContent.trim() || '' : '';

                            // Only keep Q3-marked rows
                            if (!dateRaw.toLowerCase().includes('q3')) return;

                            // Skip if this looks like header text or empty
                            if (!date || !assignmentName || !className) return;
                            if (date.toLowerCase().includes('due') || date.toLowerCase().includes('gavin')) return;
                            if (assignmentName.toLowerCase().includes('due') || assignmentName.toLowerCase().includes('gavin')) return;

                            // Skip rows that don't have a date pattern (should have "/" or "Q")
                            if (!date.match(/\d+\/\d+\/\d+/) && !date.includes('Q')) return;

                            const normalizedDate = date
                                .replace(/\u00a0/g, ' ')
                                .replace(/\s*\(Q\d+\)/i, '')
                                .trim();

                            // Create a unique key to check for duplicates
                            const uniqueKey = `${normalizedDate}|${className}|${assignmentName}`;

                            // Only add if we haven't seen this exact assignment before
                            if (!seen.has(uniqueKey)) {
                                seen.add(uniqueKey);
                                const assignment = {
                                    due_date: normalizedDate,
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
        q3_grade: cls.q3_grade,
        q3_letter_grade: cls.q3_letter_grade,
        // Use Q3 grade if available, otherwise Q2 then Q1
        current_grade: cls.q3_grade !== null ? cls.q3_grade : (cls.q2_grade !== null ? cls.q2_grade : cls.q1_grade),
        letter_grade: cls.q3_letter_grade !== null
            ? cls.q3_letter_grade
            : (cls.q2_letter_grade !== null ? cls.q2_letter_grade : cls.q1_letter_grade)
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

    // Calculate streak (consecutive days with no missing assignments)
    const streakHistory = existingData.streak_history || {};
    const hasMissingAssignments = missingAssignments.length > 0;

    // Get all dates in chronological order
    const allDates = Object.keys(averageHistory).sort((a, b) => {
        return new Date(a) - new Date(b);
    });

    // Calculate current streak by going backwards from today
    let currentStreak = 0;
    for (let i = allDates.length - 1; i >= 0; i--) {
        const date = allDates[i];
        const missingStat = streakHistory[date];

        // If this is today's date, record the current missing status
        if (date === dateKey) {
            streakHistory[date] = hasMissingAssignments ? 0 : (i > 0 && streakHistory[allDates[i-1]] !== undefined ? streakHistory[allDates[i-1]] + 1 : 1);
            if (!hasMissingAssignments) {
                currentStreak = streakHistory[date];
            }
            break;
        }

        // Count backwards from most recent date before today
        if (missingStat === undefined || missingStat === 0) {
            break;
        }
        currentStreak = missingStat;
    }

    // If there are missing assignments today, reset streak to 0
    if (hasMissingAssignments) {
        currentStreak = 0;
        streakHistory[dateKey] = 0;
    } else if (streakHistory[dateKey] === undefined) {
        // Calculate streak for today if not set yet
        const previousDate = allDates[allDates.indexOf(dateKey) - 1];
        const previousStreak = previousDate && streakHistory[previousDate] !== undefined ? streakHistory[previousDate] : 0;
        currentStreak = previousStreak === 0 ? 1 : previousStreak + 1;
        streakHistory[dateKey] = currentStreak;
    }

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
        average_history: averageHistory,
        streak: currentStreak,
        streak_history: streakHistory
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
