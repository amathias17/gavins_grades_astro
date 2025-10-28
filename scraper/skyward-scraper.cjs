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
        console.log('Login successful!');

        console.log('Navigating to Gradebook...');
        await popup.click('text=Gradebook');
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

        await browser.close();
        return gradeData;

    } catch (error) {
        await browser.close();
        throw error;
    }
}

// Save grades to JSON file
async function saveGradesToFile(grades) {
    const outputPath = path.join(__dirname, '../src/data/grades.json');

    // Read existing data if it exists
    let existingData = {
        metadata: {},
        classes: [],
        grade_history: {},
        overall_average: 0,
        average_history: {}
    };

    try {
        const existingContent = await fs.readFile(outputPath, 'utf-8');
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
        hour12: true
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

    // Create the output data
    const outputData = {
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

    // Write to file
    await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`\nGrades saved to: ${outputPath}`);
    console.log(`Overall average: ${overallAverage}`);
}

// Test the scraper
async function main() {
    const username = process.env.SKYWARD_USERNAME || 'amathias1';
    const password = process.env.SKYWARD_PASSWORD || 'diib7VD4cwA4D7';

    try {
        const grades = await scrapeGrades(username, password);
        console.log('Scraping complete!');
        console.log(JSON.stringify(grades, null, 2));

        // Save to file
        await saveGradesToFile(grades);
    } catch (error) {
        console.error('Error scraping grades:', error);
    }
}

main();