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

const CACHE_FILENAME = 'detailed-grades-cache.json';

async function readJsonIfExists(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function loadCache() {
  const cachePath = path.join(__dirname, CACHE_FILENAME);
  const existing = await readJsonIfExists(cachePath);

  return {
    path: cachePath,
    assignments: existing?.assignments ?? {},
    updatedAt: existing?.updatedAt ?? null
  };
}

async function saveCache(cachePath, assignments) {
  const payload = {
    updatedAt: new Date().toISOString(),
    assignments
  };

  await fs.writeFile(cachePath, JSON.stringify(payload, null, 2));
}

async function loginAndNavigateToGradebook() {
  const username = process.env.SKYWARD_USERNAME;
  const password = process.env.SKYWARD_PASSWORD;

  if (!username || !password) {
    throw new Error('SKYWARD_USERNAME and SKYWARD_PASSWORD must be set');
  }

  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true
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

  await page.waitForTimeout(500);
}

async function expandAllAssignments(page) {
  console.log('Expanding assignments within each class (Next ... links) until exhausted...');
  for (let i = 0; i < 50; i++) {
    const clicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[id^="moreAssignmentsEvents_"]'));
      const nextLink = links.find((link) => link.offsetParent !== null);
      if (nextLink) {
        nextLink.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      break;
    }

    await page.waitForTimeout(300);
  }
}

async function getClassInfo(page) {
  console.log('Extracting class information...');

  return page.evaluate(() => {
    const classes = [];
    const classIdMap = {};

    const recordClass = (id, info) => {
      if (!id) return;
      classIdMap[id] = classIdMap[id]
        ? { ...info, ...classIdMap[id] }
        : info;
    };
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

      const entry = {
        className,
        teacher,
        period,
        groupId,
        currentGrade
      };

      classes.push(entry);
      recordClass(groupId, entry);
    });

    // Map assignment class ids to class info when possible
    document.querySelectorAll('a#showAssignmentInfo').forEach(link => {
      const classId = link.getAttribute('data-gid');
      if (!classId) return;

      const row = link.closest('tr');
      const container = row?.closest('table');
      const classTable = container?.previousElementSibling?.matches?.('table[id^="classDesc_"]')
        ? container.previousElementSibling
        : container?.parentElement?.querySelector?.('table[id^="classDesc_"]');

      const className = classTable?.querySelector?.('.classDesc a')?.textContent?.trim() || '';
      const periodMatch = classTable?.textContent?.match(/Period\s*(\d+|[A-Z])/);
      const period = periodMatch ? periodMatch[1] : '';
      const teacherLink = classTable?.querySelector?.('tr:nth-of-type(3) a');
      const teacher = teacherLink ? teacherLink.textContent.trim() : '';

      if (className || teacher || period) {
        recordClass(classId, { className, teacher, period, groupId: classId, currentGrade: null });
      }
    });

    return { classes, classIdMap };
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
    const dialogLocator = page.locator('.sf_Dialog, .ui-dialog, [role="dialog"]').first();
    await dialogLocator.waitFor({ state: 'visible', timeout: 5000 });

    // Extract the assignment details from the modal
    const details = await page.evaluate(() => {
      const dialog = document.querySelector('.sf_Dialog, .ui-dialog, [role="dialog"]');
      const scope = dialog || document.body;
      const text = scope.innerText || '';

      const getTextAtXPath = (xpath) => {
        try {
          const result = document.evaluate(xpath, document, null, XPathResult.STRING_TYPE, null);
          const value = result.stringValue?.trim();
          return value || null;
        } catch (e) {
          return null;
        }
      };

      const parseNumber = (raw) => {
        if (!raw) return { value: null, hasStar: false };
        const trimmed = raw.trim();
        const hasStar = trimmed === '*';
        const numeric = parseFloat(trimmed.replace(/[^0-9.]/g, ''));
        if (Number.isNaN(numeric)) {
          return { value: null, hasStar };
        }
        return { value: numeric, hasStar };
      };

      // Strategy: Try multiple approaches to extract points earned and total
      let earnedRaw = null;
      let totalRaw = null;

      // Approach 1: Search for "Points Earned" or similar labels in the full dialog text
      const pointsPatterns = [
        /Points\s*Earned[:\s]*([*]|[\d.]+)\s*(?:\/|out\s*of)\s*([\d.]+)/i,
        /Earned\s*Points[:\s]*([*]|[\d.]+)\s*(?:\/|out\s*of)\s*([\d.]+)/i,
        /Score[:\s]*([*]|[\d.]+)\s*(?:\/|out\s*of)\s*([\d.]+)/i,
        /Grade[:\s]*([*]|[\d.]+)\s*(?:\/|out\s*of)\s*([\d.]+)/i,
        // More generic: any number/star followed by slash and another number
        // But only if it appears AFTER "Points" or similar keyword
        /(?:Points|Earned|Score)[^0-9*]{0,50}([*]|[\d.]+)\s*\/\s*([\d.]+)/i
      ];

      for (const pattern of pointsPatterns) {
        const match = text.match(pattern);
        if (match) {
          earnedRaw = match[1];
          totalRaw = match[2];
          break;
        }
      }

      // Approach 2: Look in specific table cells
      if (!earnedRaw || !totalRaw) {
        // Try to find the points cell more reliably
        const allTables = scope.querySelectorAll('table');
        for (const table of allTables) {
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const rowText = row.textContent || '';
            // If this row mentions "Points" or "Earned", look for the pattern
            if (/Points|Earned|Score/i.test(rowText)) {
              const cellMatch = rowText.match(/([*]|[\d.]+)\s*\/\s*([\d.]+)/);
              if (cellMatch && !earnedRaw && !totalRaw) {
                earnedRaw = cellMatch[1];
                totalRaw = cellMatch[2];
                break;
              }
            }
          }
          if (earnedRaw && totalRaw) break;
        }
      }

      // Approach 3: Generic slash pattern as last resort (but filter out dates)
      if (!earnedRaw || !totalRaw) {
        // Find all X / Y patterns and pick the first one that doesn't look like a date
        const allMatches = text.matchAll(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g);
        for (const match of allMatches) {
          const val1 = parseFloat(match[1]);
          const val2 = parseFloat(match[2]);
          // Filter out dates (numbers > 2000 are likely years)
          // Also filter out ratios that don't make sense for grades (e.g., > 1000)
          if (val1 < 1000 && val2 < 1000 && val2 > 0) {
            earnedRaw = match[1];
            totalRaw = match[2];
            break;
          }
        }
      }

      // Get dates from selectors (but validate they look like dates, not points)
      const assignDateRaw = scope.querySelector('div:nth-of-type(2) div table tbody tr:nth-of-type(2) td:nth-of-type(1) label')?.textContent?.trim() || null;
      const dueDateRaw = scope.querySelector('div:nth-of-type(2) div table tbody tr:nth-of-type(2) td:nth-of-type(4)')?.textContent?.trim() || null;

      const normalizeDate = (raw) => {
        if (!raw) return null;
        const val = raw.trim();
        const looksLikeDate =
          /[0-9]{1,2}\/[0-9]{1,2}/.test(val) ||
          /[A-Za-z]{3}/.test(val) ||
          /[0-9]{4}/.test(val);
        const looksLikePointsOnly = /^[0-9]+(\.[0-9]+)?$/.test(val);
        if (looksLikePointsOnly && !looksLikeDate) return null;
        if (/Assign\s*Date/i.test(val) || /Points\s*Earned/i.test(val)) return null;
        return val;
      };

      const earnedParsed = parseNumber(earnedRaw);
      const totalParsed = parseNumber(totalRaw);

      let earnedPoints = earnedParsed.value;
      let totalPoints = totalParsed.value;
      let graded = Boolean(earnedPoints !== null && !earnedParsed.hasStar);
      let hasStar = earnedParsed.hasStar;

      // If we still don't have totalPoints, it's truly missing
      if (totalPoints === null || totalPoints === 0) {
        // Keep as null - this assignment doesn't have a total points value
        totalPoints = null;
      }

      // Explicitly mark star rows as ungraded 0 out of X so they do not cache
      if (hasStar) {
        graded = false;
        earnedPoints = 0;
      }

      // Weight: look for "Weight: 15%" or "Weight 15%"
      const weightMatch = text.match(/Weight[^0-9]*([\d.]+)%?/i);
      const weight = weightMatch ? parseFloat(weightMatch[1]) : null;

      const assignDateMatch = text.match(/Assign(?:ment)?\s*Date[^0-9]*([0-9/]+)/i);
      const dateDueMatch =
        text.match(/Date\s*Due[^0-9]*([0-9/]+)/i) ||
        text.match(/Due\s*Date[^0-9]*([0-9/]+)/i);

      return {
        graded,
        earnedPoints,
        totalPoints,
        weight,
        assignDate: normalizeDate(assignDateRaw) || (assignDateMatch ? normalizeDate(assignDateMatch[1]) : null),
        dateDue: normalizeDate(dueDateRaw) || (dateDueMatch ? normalizeDate(dateDueMatch[1]) : null),
        hasStar
      };
    });

    // Close the modal (try various close methods)
    try {
      // Look for close button
      const closeSelectors = [
        '.sf_DialogClose',
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

    try {
      const dialogLocator = page.locator('.sf_Dialog, .ui-dialog, [role="dialog"]').first();
      await dialogLocator.waitFor({ state: 'hidden', timeout: 2000 });
    } catch (e) {
      await page.waitForTimeout(200);
    }

    return details;

  } catch (error) {
    console.error(`Error extracting details for assignment ${assignmentIndex}:`, error.message);
    return {
      graded: false,
      earnedPoints: 0,
      totalPoints: null,
      weight: null,
      assignDate: null,
      dateDue: null,
      hasStar: false
    };
  }
}

async function scrapeAllAssignments(page, classes, cacheAssignments = {}, classIdMap = {}) {
  console.log('\nExtracting detailed assignment information...');

  // Get all assignment links
  const assignmentLinks = await getAssignmentLinks(page);
  console.log(`Found ${assignmentLinks.length} assignments total`);

  const assignmentDetails = [];
  const updatedCache = { ...cacheAssignments };
  let cacheHits = 0;

  // Process each assignment
  for (let i = 0; i < assignmentLinks.length; i++) {
    const assignment = assignmentLinks[i];
    // Only keep Q2 (due date text typically contains (Q2))
    if (!assignment.dueDate || !/\(Q2\)/i.test(assignment.dueDate)) {
      continue;
    }

    console.log(`Processing ${i + 1}/${assignmentLinks.length}: ${assignment.name}`);

    const cacheKeyParts = [assignment.assignmentId, assignment.classId, assignment.studentId].filter(Boolean);
    const cacheKey = cacheKeyParts.join(':');
    const cached = cacheKey ? cacheAssignments[cacheKey] : null;

    let details = cached && cached.graded ? cached : null;
    if (details) {
      cacheHits += 1;
    } else {
      // Extract detailed points by clicking the assignment
      details = await extractAssignmentDetails(page, i);
    }

    // Find which class this assignment belongs to
    const classInfo =
      classIdMap[assignment.classId] ||
      classes.find(c => c.groupId === assignment.classId);

    const className = classInfo?.className || cached?.className || assignment.classId || 'Unknown';
    const teacher = classInfo?.teacher || cached?.teacher || '';
    const period = classInfo?.period || cached?.period || '';
    const dateDue = details.dateDue || assignment.dueDate || null;
    const graded = Boolean(details.graded);
    const earnedPoints = graded ? details.earnedPoints ?? 0 : 0;
    const totalPoints = details.totalPoints ?? 0;

    const assignmentData = {
      classId: assignment.classId,
      assignmentId: assignment.assignmentId,
      studentId: assignment.studentId,
      className,
      teacher,
      period,
      currentGrade: classInfo?.currentGrade ?? cached?.currentGrade ?? null,
      assignmentName: assignment.name,
      assignDate: details.assignDate || null,
      dateDue,
      dueDate: dateDue,
      earnedPoints,
      totalPoints,
      weight: details.weight ?? null,
      graded
    };

    if (graded && cacheKey) {
      updatedCache[cacheKey] = {
        ...assignmentData,
        graded: true,
        cachedAt: new Date().toISOString()
      };
    } else if (cacheKey && updatedCache[cacheKey]) {
      // Keep pending items uncached so they are refreshed when grades land
      delete updatedCache[cacheKey];
    }

    assignmentDetails.push(assignmentData);
  }

  console.log(`Cache hits: ${cacheHits}`);

  return { assignmentDetails, updatedCache };
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
    const key = assignment.className || 'Unknown';
    if (!byClass[key]) {
      byClass[key] = {
        className: key,
        teacher: assignment.teacher || '',
        period: assignment.period || '',
        currentGrade: assignment.currentGrade ?? null,
        assignments: []
      };
    }

    byClass[key].assignments.push({
      name: assignment.assignmentName,
      assignDate: assignment.assignDate || null,
      dueDate: assignment.dateDue || assignment.dueDate || null,
      earnedPoints: assignment.earnedPoints,
      totalPoints: assignment.totalPoints,
      weight: assignment.weight,
      graded: assignment.graded
    });
  });

  return Object.values(byClass).filter(entry => entry.assignments.length > 0);
}

async function main() {
  let browser;
  let popup;
  const cache = await loadCache();

  try {
    // Login and navigate
    const result = await loginAndNavigateToGradebook();
    browser = result.browser;
    popup = result.popup;

    // Expand all classes to show assignments and paginate within each class
    await expandAllClasses(popup);
    await expandAllAssignments(popup);

    // Get class information
    const { classes, classIdMap } = await getClassInfo(popup);
    console.log(`\nFound ${classes.length} classes`);

    // Scrape all assignment details
    const { assignmentDetails, updatedCache } = await scrapeAllAssignments(
      popup,
      classes,
      cache.assignments,
      classIdMap
    );
    console.log(`\nSuccessfully extracted ${assignmentDetails.length} assignments`);

    // Organize data by class
    const dataByClass = organizeByClass(assignmentDetails, classes);

    // Save to file
    const outputPath = path.join(__dirname, 'detailed-grades.json');
    const outputData = {
      metadata: {
        scrapedAt: new Date().toISOString(),
        totalClasses: classes.length,
        totalAssignments: assignmentDetails.length
      },
      classes: dataByClass
    };

    await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`\n✓ Data saved to: ${outputPath}`);

    // Also save raw assignments for debugging
    const rawOutputPath = path.join(__dirname, 'detailed-grades-raw.json');
    await fs.writeFile(rawOutputPath, JSON.stringify(assignmentDetails, null, 2));
    console.log(`✓ Raw data saved to: ${rawOutputPath}`);

    // Persist cache for future runs
    await saveCache(cache.path, updatedCache);
    console.log(`Cache updated at: ${cache.path}`);

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
