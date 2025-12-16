/**
 * Fetch all graded assignments from Skyward gradebook.
 *
 * Usage:
 *   SKYWARD_USERNAME=... SKYWARD_PASSWORD=... node scraper/fetch-graded-assignments.cjs
 *
 * Outputs:
 *   scraper/graded-assignments.json          - graded assignments per class
 *   scraper/graded-assignments-error.png     - screenshot on failure
 */

const { chromium } = require("playwright");
const fs = require("fs").promises;

async function loginAndOpenGradebook() {
  const username = process.env.SKYWARD_USERNAME;
  const password = process.env.SKYWARD_PASSWORD;

  if (!username || !password) {
    throw new Error("SKYWARD_USERNAME and SKYWARD_PASSWORD must be set");
  }

  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 300
  });

  const context = await browser.newContext();
  const page = await context.newPage();

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
    console.log('Skipping password change...');
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

  console.log('At Gradebook page');
  return { browser, popup };
}

async function ensureAssignmentsVisible(page) {
  await page.evaluate(() => {
    // Toggle "Show Assignments" for all classes
    document
      .querySelectorAll('a[id^="showAssignmentsLink_"]')
      .forEach((link) => {
        if (link.getAttribute("data-show") === "no") {
          link.click();
        }
      });

    // Expand pagination within assignment lists
    document
      .querySelectorAll('a[id^="moreAssignmentsEvents_"]')
      .forEach((link) => {
        link.click();
      });
  });
}

async function expandAllClasses(page) {
  const expanders = page.locator("a.sf_expander");
  const count = await expanders.count();
  for (let i = 0; i < count; i++) {
    const expander = expanders.nth(i);
    await expander.click();
  }
}

async function collectGradedAssignments(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("tr[group-child]"));
    const graded = [];

    for (const row of rows) {
      if (row.offsetParent === null) continue; // hidden

      const anchor = row.querySelector("a#showAssignmentInfo");
      if (!anchor) continue;

      // Extract numeric score from grade columns
      const gradeCells = Array.from(row.querySelectorAll("td.cPd div"))
        .map((el) => el.textContent.trim())
        .filter(Boolean);

      const scoreText = gradeCells.find((txt) => /^[0-9]+(?:\.[0-9]+)?$/.test(txt));
      if (!scoreText) continue; // skip ungraded/missing

      const dueText = row.querySelector("span.fXs")?.textContent.trim() || null;

      graded.push({
        assignmentId: anchor.getAttribute("data-aid"),
        classId: anchor.getAttribute("data-gid"),
        studentId: anchor.getAttribute("data-sid"),
        name: anchor.textContent.trim(),
        due: dueText,
        score: parseFloat(scoreText),
        rawGrades: gradeCells,
      });
    }

    return graded;
  });
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 300
  });
  const context = await browser.newContext();

  try {
    const gradebookPage = await loginAndOpenGradebook(context);

    await ensureAssignmentsVisible(gradebookPage);
    await expandAllClasses(gradebookPage);
    await gradebookPage.waitForTimeout(1000);

    const gradedAssignments = await collectGradedAssignments(gradebookPage);

    await fs.writeFile(
      "scraper/graded-assignments.json",
      JSON.stringify(gradedAssignments, null, 2)
    );

    console.log(
      `Captured ${gradedAssignments.length} graded assignments -> scraper/graded-assignments.json`
    );

    await browser.close();
  } catch (error) {
    console.error("Scrape failed:", error);
    try {
      const pages = context.pages();
      if (pages.length > 0) {
        await pages[0].screenshot({
          path: "scraper/graded-assignments-error.png",
          fullPage: true,
        });
      }
    } catch {
      // ignore screenshot errors
    }
    await browser.close();
    process.exit(1);
  }
}

main();
