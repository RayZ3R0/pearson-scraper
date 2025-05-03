/**
 * Functions for navigating through the Pearson grade conversion site
 */

/**
 * Sleep function to add delay between actions
 * @param {number} ms - Milliseconds to sleep
 */
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Navigate to a specific exam series/session
 * @param {Page} page - Puppeteer page object
 * @param {string} sessionName - Name of the exam session to select (e.g., "October 2024")
 */
async function navigateToSession(page, sessionName) {
  console.log(`Navigating to session: ${sessionName}`);

  await sleep(1000); // Add delay before navigation

  const sessionFound = await page.evaluate((session) => {
    const links = Array.from(
      document.querySelectorAll("#gcstep2 .step-option-list a")
    );
    const targetLink = links.find(
      (link) => link.textContent.trim() === session
    );

    if (targetLink) {
      console.log(`Found link for session: ${session}`);
      targetLink.click();
      return true;
    } else {
      console.log(`Could not find link for session: ${session}`);
      return false;
    }
  }, sessionName);

  if (!sessionFound) {
    throw new Error(`Session not found: ${sessionName}`);
  }

  // Wait for the subjects to load
  console.log("Waiting for subjects to load...");
  await page.waitForSelector("#gcstep3", { timeout: 30000 });
  await sleep(1000); // Add delay to ensure content is fully loaded
}

/**
 * Select a subject for the selected session
 * @param {Page} page - Puppeteer page object
 * @param {string} subjectName - Name of the subject to select
 */
async function selectSubject(page, subjectName) {
  console.log(`Selecting subject: ${subjectName}`);

  await sleep(1000); // Add delay before selection

  const subjectFound = await page.evaluate((subject) => {
    const links = Array.from(
      document.querySelectorAll("#gcstep3 .step-option-list a")
    );
    const targetLink = links.find(
      (link) => link.textContent.trim() === subject
    );

    if (targetLink) {
      console.log(`Found link for subject: ${subject}`);
      targetLink.click();
      return true;
    } else {
      console.log(`Could not find link for subject: ${subject}`);
      return false;
    }
  }, subjectName);

  if (!subjectFound) {
    throw new Error(`Subject not found: ${subjectName}`);
  }

  // Wait for the units to load
  console.log("Waiting for units to load...");
  await page.waitForSelector("#gcstep4", { timeout: 30000 });
  await sleep(1000); // Add delay to ensure content is fully loaded
}

/**
 * Select a unit for the selected subject
 * @param {Page} page - Puppeteer page object
 * @param {string} unitName - Name of the unit to select
 */
async function selectUnit(page, unitName) {
  console.log(`Selecting unit: ${unitName}`);

  await sleep(1000); // Add delay before selection

  const unitFound = await page.evaluate((unit) => {
    const links = Array.from(
      document.querySelectorAll("#gcstep4 .step-option-list a")
    );
    const targetLink = links.find((link) => link.textContent.trim() === unit);

    if (targetLink) {
      console.log(`Found link for unit: ${unit}`);
      targetLink.click();
      return true;
    } else {
      console.log(`Could not find link for unit: ${unit}`);
      return false;
    }
  }, unitName);

  if (!unitFound) {
    throw new Error(`Unit not found: ${unitName}`);
  }

  // Wait for the tabs to load
  console.log("Waiting for tabs to load...");
  await page.waitForSelector("#gcstep5", { timeout: 30000 });
  await sleep(1500); // Add extra delay to ensure content is fully loaded
}

/**
 * Select the "All Scores" tab
 * @param {Page} page - Puppeteer page object
 */
async function selectAllScoresTab(page) {
  console.log("Selecting 'All Scores' tab...");

  await sleep(1500); // Add delay before tab selection

  let tabClicked = await page.evaluate(() => {
    // Method 1: Find by text content
    const allLinks = Array.from(document.querySelectorAll("a"));
    const allScoresLink = allLinks.find(
      (a) =>
        a.textContent.trim() === "All scores" ||
        a.textContent.trim() === "All Scores" ||
        a.textContent.trim() === "All"
    );

    if (allScoresLink) {
      console.log("Found All Scores link by text content");
      allScoresLink.click();
      return true;
    }

    // Method 2: Find tabs and click the last one, which is typically "All Scores"
    const tabs = document.querySelectorAll("#gcstep5 ul.nav.nav-tabs li a");
    if (tabs.length > 0) {
      console.log(`Found ${tabs.length} tabs`);
      // Usually "All Scores" is the last tab
      const lastTab = tabs[tabs.length - 1];
      console.log(`Clicking last tab: ${lastTab.textContent}`);
      lastTab.click();
      return true;
    }

    // Method 3: Find by ng-click attribute
    const ngClickLinks = Array.from(
      document.querySelectorAll('a[ng-click*="showTab"]')
    );
    if (ngClickLinks.length > 0) {
      // Try to find the All Scores tab or just click the last one
      let targetTab = ngClickLinks.find(
        (link) =>
          link.textContent.trim().toLowerCase().includes("all score") ||
          link.textContent.trim().toLowerCase() === "all"
      );

      // If we can't find a specific All Scores tab, use the last tab
      if (!targetTab) targetTab = ngClickLinks[ngClickLinks.length - 1];

      console.log(`Clicking tab: ${targetTab.textContent}`);
      targetTab.click();
      return true;
    }

    return false;
  });

  if (!tabClicked) {
    console.warn(
      "Could not find All Scores tab with JavaScript, trying direct click"
    );
    try {
      // Try several potential selectors
      const tabSelectors = [
        "#gcstep5 ul.nav.nav-tabs li:last-child a",
        "#gcstep5 ul.nav.nav-tabs li:nth-child(4) a",
        "#gcstep5 ul.nav.nav-tabs li:nth-child(3) a",
        'a[ng-click*="showTab"]:last-child',
      ];

      for (const selector of tabSelectors) {
        try {
          await page.click(selector);
          console.log(`Successfully clicked tab with selector: ${selector}`);
          tabClicked = true;
          break;
        } catch (err) {
          // Continue to next selector
        }
      }
    } catch (clickError) {
      console.error("Failed to click All Scores tab:", clickError);
    }
  }

  if (!tabClicked) {
    console.warn(
      "Unable to click All Scores tab after multiple attempts. Will try to continue anyway."
    );
  }

  // Wait for the scores data to load
  console.log("Waiting for scores data to load...");
  await sleep(3000); // Add extra delay to ensure the tab content loads
}

module.exports = {
  navigateToSession,
  selectSubject,
  selectUnit,
  selectAllScoresTab,
  sleep,
};
