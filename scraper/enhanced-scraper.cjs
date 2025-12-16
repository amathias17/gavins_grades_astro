/**
 * Enhanced Skyward scraper that extracts detailed assignment information
 * including earned points and total possible points by clicking into each assignment.
 *
 * Usage:
 *   SKYWARD_USERNAME=... SKYWARD_PASSWORD=... node scraper/enhanced-scraper.cjs
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function loginAndNavigateToGradebook() {
  const username = process.env.SKYWARD_USERNAME;
  const password = process.env.SKYWARD_PASSWORD;

  if (!username || !password) {
    throw new Error('SKYWARD_USERNAME and SKYWARD_PASSWORD must be set');
  }

  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: false,  // Set to true for automation
    slowMo: 100
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Logging in to Skyward...');
  await page.goto('https://skyweb.aasdcat.com/scripts/wsisa.dll/WService=wsEAplus/seplog01.w');
  await page.fill('input[name="login"]', username);
  await page.fill('input[name="password"]', password);

  // Wait for popup after login
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.press('input[name="password"]', 'Enter')
  ]);

  await popup.waitForLoadState('networkidle');
  await popup.waitForTimeout(2000);

  // Handle password change prompt if it appears
  const pageContent = await popup.content();
  if (pageContent.toLowerCase().includes('password') &&
      (pageContent.toLowerCase().includes('change') || pageContent.toLowerCase().includes('update'))) {
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
        await popup.waitForLoadState('networkidle');
        break;
      } catch (e) {
        // Try next selector
      }
    }
  }

  // Navigate to Gradebook
  console.log('Navigating to Gradebook...');
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
      // Try next
    }
  }

  await popup.waitForLoadState('networkidle');
  await popup.waitForTimeout(2000);

  console.log('Successfully navigated to Gradebook');
  return { browser, popup };
}

async function expandAllClasses(page) {
  console.log('Expanding all classes...');

  // Click all expander links to show assignments
  await page.evaluate(() => {
    const expanders = document.querySelectorAll('a.sf_expander');
    expanders.forEach(expander => expander.click());
  });

  await page.waitForTimeout(1500);
}

async function getClassInfo(page) {
  console.log('Extracting class information...');

  return page.evaluate(() => {
    const classes = [];
    const classTables = document.querySelectorAll('table[id^="classDesc_"]');

    classTables.forEach(table => {
      const tableId = table.getAttribute('id');
      const groupId = tableId.replace('classDesc_', '');

      const classNameElement = table.querySelector('.classDesc a');
      if (!classNameElement) return;

      const className = classNameElement.textContent.trim();

      // Get period
      const cellText = table.textContent;
      const periodMatch = cellText.match(/Period\s*(\d+|[A-Z])/);
      const period = periodMatch ? periodMatch[1] : '';

      // Get teacher
      const teacherLinks = table.querySelectorAll('tr');
      let teacher = '';
      if (teacherLinks.length >= 3) {
        const teacherRow = teacherLinks[2];
        const teacherLink = teacherRow.querySelector('a');
        if (teacherLink) {
          teacher = teacherLink.textContent.trim();
        }
      }

      // Get current grade from the grade row
      const gradeRow = document.querySelector(`tr[group-parent="${groupId}"]`);
      let currentGrade = null;

      if (gradeRow) {
        const gradeCells = gradeRow.querySelectorAll('td');
        // Try Q2 first (second cell), then Q1 (first cell)
        if (gradeCells.length > 1) {
          const q2Link = gradeCells[1].querySelector('a[id="showGradeInfo"]');
          if (q2Link) {
            const gradeText = q2Link.textContent.trim();
            const grade = parseInt(gradeText);
            if (!isNaN(grade)) currentGrade = grade;
          }
        }
        if (currentGrade === null && gradeCells.length > 0) {
          const q1Link = gradeCells[0].querySelector('a[id="showGradeInfo"]');
          if (q1Link) {
            const gradeText = q1Link.textContent.trim();
            const grade = parseInt(gradeText);
            if (!isNaN(grade)) currentGrade = grade;
          }
        }
      }

      classes.push({
        className,
        teacher,
        period,
        groupId,
        currentGrade
      });
    });

    return classes;
  });
}

async function getAssignmentLinks(page) {
  console.log('Collecting assignment links...');

  return page.evaluate(() => {
    const assignments = [];
    const assignmentLinks = document.querySelectorAll('a#showAssignmentInfo');

    assignmentLinks.forEach((link, index) => {
      // Check if the assignment row is visible
      const row = link.closest('tr');
      if (!row || row.offsetParent === null) return;

      const assignmentId = link.getAttribute('data-aid');
      const classId = link.getAttribute('data-gid');
      const studentId = link.getAttribute('data-sid');
      const name = link.textContent.trim();

      // Get due date from the row
      const dueSpan = row.querySelector('span.fXs');
      const dueDate = dueSpan ? dueSpan.textContent.trim() : null;

      assignments.push({
        index,
        assignmentId,
        classId,
        studentId,
        name,
        dueDate
      });
    });

    return assignments;
  });
}

async function extractAssignmentDetails(page, assignmentIndex) {
  try {
    // Click the assignment link at the specified index
    const assignmentLinks = page.locator('a#showAssignmentInfo');
    const link = assignmentLinks.nth(assignmentIndex);

    // Wait for the link to be visible and click it
    await link.waitFor({ state: 'visible', timeout: 5000 });
    await link.click();

    // Wait for the detail modal/popup to appear
    await page.waitForTimeout(1000);

    // Extract the assignment details from the modal
    const details = await page.evaluate(() => {
      // Look for grade information in various possible locations
      const possibleSelectors = [
        // Common patterns for grade display
        'div.sf_Section:has-text("Grade")',
        'div:has-text("Points")',
        'span:has-text("/")',
        'td:has-text("/")',
      ];

      // Try to find the grade fraction (e.g., "87/100" or "87 / 100")
      const allText = document.body.innerText;
      const gradeMatch = allText.match(/(\d+)\s*\/\s*(\d+)/);

      if (gradeMatch) {
        return {
          earnedPoints: parseInt(gradeMatch[1]),
          totalPoints: parseInt(gradeMatch[2]),
          found: true
        };
      }

      // If no match found, look for specific elements
      const gradeElements = document.querySelectorAll('td, div, span');
      for (const el of gradeElements) {
        const text = el.textContent.trim();
        const match = text.match(/^(\d+)\s*\/\s*(\d+)$/);
        if (match) {
          return {
            earnedPoints: parseInt(match[1]),
            totalPoints: parseInt(match[2]),
            found: true
          };
        }
      }

      return { found: false };
    });

    // Close the modal (try various close methods)
    try {
      // Look for close button
      const closeSelectors = [
        'button:has-text("Close")',
        'button:has-text("OK")',
        'a:has-text("Close")',
        'button.close',
        '[aria-label="Close"]',
        'button[title="Close"]'
      ];

      for (const selector of closeSelectors) {
        try {
          await page.click(selector, { timeout: 1000 });
          break;
        } catch (e) {
          // Try next selector
        }
      }

      // If no close button found, press Escape
      await page.keyboard.press('Escape');
    } catch (e) {
      // Modal might have auto-closed
    }

    await page.waitForTimeout(500);

    return details;

  } catch (error) {
    console.error(`Error extracting details for assignment ${assignmentIndex}:`, error.message);
    return { found: false };
  }
}

async function scrapeAllAssignments(page, classes) {
  console.log('\nExtracting detailed assignment information...');

  // Get all assignment links
  const assignmentLinks = await getAssignmentLinks(page);
  console.log(`Found ${assignmentLinks.length} assignments total`);

  const assignmentDetails = [];

  // Process each assignment
  for (let i = 0; i < assignmentLinks.length; i++) {
    const assignment = assignmentLinks[i];
    console.log(`Processing ${i + 1}/${assignmentLinks.length}: ${assignment.name}`);

    // Extract detailed points by clicking the assignment
    const details = await extractAssignmentDetails(page, i);

    // Find which class this assignment belongs to
    const classInfo = classes.find(c => c.groupId === assignment.classId);

    const assignmentData = {
      className: classInfo ? classInfo.className : 'Unknown',
      teacher: classInfo ? classInfo.teacher : '',
      period: classInfo ? classInfo.period : '',
      assignmentName: assignment.name,
      dueDate: assignment.dueDate,
      earnedPoints: details.found ? details.earnedPoints : 0,
      totalPoints: details.found ? details.totalPoints : 0,
      graded: details.found
    };

    assignmentDetails.push(assignmentData);
  }

  return assignmentDetails;
}

function organizeByClass(assignments, classes) {
  const byClass = {};

  // Initialize with class info
  classes.forEach(classInfo => {
    byClass[classInfo.className] = {
      className: classInfo.className,
      teacher: classInfo.teacher,
      period: classInfo.period,
      currentGrade: classInfo.currentGrade,
      assignments: []
    };
  });

  // Add assignments to their respective classes
  assignments.forEach(assignment => {
    if (byClass[assignment.className]) {
      byClass[assignment.className].assignments.push({
        name: assignment.assignmentName,
        dueDate: assignment.dueDate,
        earnedPoints: assignment.earnedPoints,
        totalPoints: assignment.totalPoints,
        graded: assignment.graded
      });
    }
  });

  return Object.values(byClass);
}

async function main() {
  let browser;
  let popup;

  try {
    // Login and navigate
    const result = await loginAndNavigateToGradebook();
    browser = result.browser;
    popup = result.popup;

    // Expand all classes to show assignments
    await expandAllClasses(popup);

    // Get class information
    const classes = await getClassInfo(popup);
    console.log(`\nFound ${classes.length} classes`);

    // Scrape all assignment details
    const assignments = await scrapeAllAssignments(popup, classes);
    console.log(`\nSuccessfully extracted ${assignments.length} assignments`);

    // Organize data by class
    const dataByClass = organizeByClass(assignments, classes);

    // Save to file
    const outputPath = path.join(__dirname, 'detailed-grades.json');
    const outputData = {
      metadata: {
        scrapedAt: new Date().toISOString(),
        totalClasses: classes.length,
        totalAssignments: assignments.length
      },
      classes: dataByClass
    };

    await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`\n✓ Data saved to: ${outputPath}`);

    // Also save raw assignments for debugging
    const rawOutputPath = path.join(__dirname, 'detailed-grades-raw.json');
    await fs.writeFile(rawOutputPath, JSON.stringify(assignments, null, 2));
    console.log(`✓ Raw data saved to: ${rawOutputPath}`);

    await browser.close();
    console.log('\n✓ Scraping complete!');

  } catch (error) {
    console.error('\n✗ Error during scraping:', error);

    if (popup) {
      try {
        await popup.screenshot({
          path: path.join(__dirname, 'enhanced-scraper-error.png'),
          fullPage: true
        });
        console.log('Error screenshot saved');
      } catch (e) {
        // Ignore screenshot errors
      }
    }

    if (browser) {
      await browser.close();
    }

    process.exit(1);
  }
}

main();
