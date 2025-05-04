const puppeteer = require("puppeteer");
const path = require("path");
const {
  navigateToSession,
  selectSubject,
  selectUnit,
  selectAllScoresTab,
  sleep,
} = require("./navigation");
const {
  extractAllScoresData,
  processData,
  saveData,
} = require("./dataProcessor");
const ProgressTracker = require("./progressTracker");
const fs = require("fs").promises;

// Base URL for the grade conversion tool
const BASE_URL =
  "https://qualifications.pearson.com/en/support/support-topics/results-certification/understanding-marks-and-grades/converting-marks-points-and-grades.html?QualFamily=International%20A%20Level#gcstep1";

// Qualification type to scrape
const QUALIFICATION_TYPE = "International A Level";

// Array of subjects to filter for (can be modified to include only subjects you want)
// Set to null or empty array to scrape all subjects
const FILTER_SUBJECTS = [
  "Physics",
  "Chemistry",
  "Biology",
  "Mathematics",
  "Further Mathematics",
  "Pure Mathematics",
  "Accounting",
  "Economics",
  "Business",
]; // Only scrape subjects containing these strings

/**
 * Check if a subject matches our filter criteria
 * @param {string} subject - Subject name to check
 * @returns {boolean} - Whether the subject should be processed
 */
function shouldProcessSubject(subject) {
  // If no filter is set, process all subjects
  if (!FILTER_SUBJECTS || FILTER_SUBJECTS.length === 0) {
    return true;
  }

  // Check if the subject contains any of our filter terms
  return FILTER_SUBJECTS.some((filterTerm) =>
    subject.toLowerCase().includes(filterTerm.toLowerCase())
  );
}

/**
 * Main function to scrape all available exam sessions
 */
async function scrapeSeries() {
  // Initialize progress tracker
  const tracker = new ProgressTracker(
    path.join(__dirname, "..", "data", "progress.json")
  );
  await tracker.initialize();

  console.log("Starting browser...");
  const browser = await puppeteer.launch({
    headless: true, // Run headless for production
    defaultViewport: null,
    args: ["--window-size=1200,800"],
  });

  try {
    const page = await browser.newPage();

    // Enable console logging from the page
    page.on("console", (msg) => {
      console.log(`PAGE LOG: ${msg.text()}`);
    });

    // Navigate to the main page with direct qualification parameter
    console.log("Navigating to Pearson qualifications page...");
    await page.goto(BASE_URL, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Handle cookie consent banner if present
    try {
      console.log("Checking for cookie consent banner...");
      const cookieBannerSelector = "#onetrust-reject-all-handler";
      const cookieBannerExists = await page.evaluate((selector) => {
        const banner = document.querySelector(selector);
        return !!banner && banner.offsetParent !== null; // Check if visible
      }, cookieBannerSelector);

      if (cookieBannerExists) {
        console.log("Dismissing cookie banner...");
        await page.click(cookieBannerSelector);
        await sleep(2000);
        console.log("Cookie banner dismissed");
      }
    } catch (cookieError) {
      console.log(
        "No cookie banner found or error dismissing it:",
        cookieError.message
      );
    }

    await sleep(3000); // Add longer delay to ensure page is fully loaded

    // Check if we need to manually navigate to the A Level section
    console.log("Checking if we need to select qualification type...");
    const needsQualificationSelection = await page.evaluate(() => {
      // Look for International A Level link or button
      const qualLinks = Array.from(
        document.querySelectorAll("a, button")
      ).filter((el) => el.textContent.includes("International A Level"));

      return qualLinks.length > 0;
    });

    if (needsQualificationSelection) {
      console.log("Need to select International A Level qualification...");
      await page.evaluate(() => {
        // Try to find and click International A Level link
        const qualLinks = Array.from(
          document.querySelectorAll("a, button")
        ).filter((el) => el.textContent.includes("International A Level"));

        if (qualLinks.length > 0) {
          console.log("Found qualification link, clicking...");
          qualLinks[0].click();
          return true;
        }
        return false;
      });

      await sleep(3000);
    }

    // Wait for sessions list with a more flexible selector
    console.log("Waiting for sessions list to load...");
    try {
      // First try the original selector
      await page.waitForSelector("#gcstep2 .step-option-list a", {
        timeout: 10000,
      });
      console.log("Found sessions with original selector");
    } catch (err) {
      console.log("Original selector failed, trying alternative selectors");

      // Try a more general selector for links within any step-option-list
      await page
        .waitForSelector(".step-option-list a", {
          timeout: 10000,
        })
        .catch(async () => {
          console.log(
            "Alternative selector also failed, looking for any clickable element"
          );

          // Look for any list of options
          await page
            .waitForSelector("ul li a", {
              timeout: 10000,
            })
            .catch(() => {
              throw new Error("Could not find session selection elements");
            });
        });
    }

    // Extract all available exam sessions with a more flexible approach
    const sessionsList = await page.evaluate(() => {
      // First try the original selector
      let sessionLinks = Array.from(
        document.querySelectorAll("#gcstep2 .step-option-list a")
      );

      // If that fails, try a more general selector
      if (sessionLinks.length === 0) {
        sessionLinks = Array.from(
          document.querySelectorAll(".step-option-list a")
        );
      }

      // If that also fails, look for any list items that might be sessions
      if (sessionLinks.length === 0) {
        sessionLinks = Array.from(document.querySelectorAll("ul li a"));
      }

      // Extract text content from the links
      return sessionLinks.map((link) => link.textContent.trim());
    });

    console.log(`Found ${sessionsList.length} potential session items`);

    // Filter out non-session items if any
    const validSessions = sessionsList.filter((session) =>
      /^(January|June|October)\s+\d{4}$/.test(session)
    );

    console.log(`Filtered to ${validSessions.length} valid sessions`);

    if (validSessions.length === 0) {
      console.error(
        "No valid exam sessions found. Check the website structure."
      );
      throw new Error("No valid exam sessions found");
    }

    // Track total counts for progress reporting
    let totalSubjects = 0;
    let totalUnits = 0;

    // Count sessions for the progress tracker
    tracker.updateStats(validSessions.length, 0, 0);
    await tracker.save();

    // Process each exam session
    for (const session of validSessions) {
      console.log(
        `\n========== Processing exam session: ${session} ==========`
      );

      // Skip sessions that are already fully completed
      if (tracker.isSessionCompleted(QUALIFICATION_TYPE, session)) {
        console.log(`Session ${session} is already fully processed, skipping`);
        continue;
      }

      try {
        // Navigate to the specific session
        await navigateToSession(page, session);

        // Get all available subjects for this session with flexible selectors
        const subjects = await page.evaluate(() => {
          // First try the original selector
          let subjectLinks = Array.from(
            document.querySelectorAll("#gcstep3 .step-option-list a")
          );

          // If that fails, try more general selectors
          if (subjectLinks.length === 0) {
            subjectLinks = Array.from(
              document.querySelectorAll(".step-option-list a")
            );
          }

          // If that still fails, try all links that might be subjects
          if (subjectLinks.length === 0) {
            subjectLinks = Array.from(document.querySelectorAll("ul li a"));
          }

          return subjectLinks.map((item) => item.textContent.trim());
        });

        console.log(`Found ${subjects.length} subjects for ${session}`);

        // Filter subjects based on our subject filter
        const filteredSubjects = subjects.filter((subject) =>
          shouldProcessSubject(subject)
        );
        console.log(`Filtered to ${filteredSubjects.length} matching subjects`);

        totalSubjects += filteredSubjects.length;

        // Update progress tracker with the subjects count
        tracker.updateStats(validSessions.length, totalSubjects, totalUnits);
        await tracker.save();

        // Track the total units and processed units for this session
        let sessionTotalUnits = 0;
        let sessionProcessedUnits = 0;

        // Process each subject
        for (const subject of filteredSubjects) {
          try {
            const subjectResult = await processSubject(
              page,
              tracker,
              QUALIFICATION_TYPE,
              session,
              subject
            );

            // Update session unit counts
            if (subjectResult) {
              sessionTotalUnits += subjectResult.totalUnits;
              sessionProcessedUnits += subjectResult.processedUnits;
            }
          } catch (subjectError) {
            console.error(`Error processing subject ${subject}:`, subjectError);
            // Continue with next subject
          }
        }

        // Check if all units in this session have been processed
        if (
          sessionTotalUnits > 0 &&
          sessionProcessedUnits === sessionTotalUnits
        ) {
          console.log(
            `All units for session ${session} have been processed. Marking session as complete.`
          );
          tracker.markSessionAsCompleted(QUALIFICATION_TYPE, session);
          await tracker.save();
        }
      } catch (error) {
        console.error(`Error processing session ${session}:`, error);
      }
    }

    // Final save of progress
    await tracker.save();

    // Display final summary
    const summary = tracker.getSummary();
    console.log("\n========== Scraping Summary ==========");
    console.log(`Total Sessions: ${summary.totalSessions}`);
    console.log(`Completed Sessions: ${summary.completedSessions}`);
    console.log(`Total Subjects: ${summary.totalSubjects}`);
    console.log(`Total Units: ${summary.totalUnits}`);
    console.log(`Completed Units: ${summary.completedUnits}`);
    console.log(`Failed Units: ${summary.failedUnits}`);
    console.log(`Overall Progress: ${summary.progress}`);
    console.log(`Last Update: ${summary.lastUpdate}`);

    if (FILTER_SUBJECTS && FILTER_SUBJECTS.length > 0) {
      console.log(
        `\nNote: Only processed subjects matching: ${FILTER_SUBJECTS.join(
          ", "
        )}`
      );
    }
  } catch (error) {
    console.error("Error during scraping:", error);
    throw error;
  } finally {
    await sleep(1000); // Final delay before closing
    console.log("Closing browser...");
    await browser.close();
  }
}

/**
 * Process a single subject for a given exam session
 */
async function processSubject(page, tracker, qualType, session, subject) {
  console.log(`\n-- Processing subject: ${subject} --`);

  try {
    // Select this subject
    await selectSubject(page, subject);

    // Get all units for this subject with more flexible selectors
    const units = await page.evaluate(() => {
      // Try different selectors in order of specificity
      let unitLinks = Array.from(
        document.querySelectorAll("#gcstep4 .step-option-list a")
      );

      if (unitLinks.length === 0) {
        unitLinks = Array.from(
          document.querySelectorAll(".step-option-list a")
        );
      }

      if (unitLinks.length === 0) {
        unitLinks = Array.from(document.querySelectorAll("ul li a"));
      }

      return unitLinks.map((item) => item.textContent.trim());
    });

    console.log(`Found ${units.length} units for ${subject}`);

    // Update the tracker's total unit count
    const currentStats = tracker.getSummary();
    tracker.updateStats(
      currentStats.totalSessions,
      currentStats.totalSubjects,
      currentStats.totalUnits + units.length
    );
    await tracker.save();

    if (units.length === 0) {
      console.log("No units found for this subject, skipping");
      return { totalUnits: 0, processedUnits: 0 };
    }

    // Track units processed for this subject
    let processedUnits = 0;

    // Process each unit
    for (const unit of units) {
      try {
        // Skip if this unit has already been successfully processed
        if (tracker.isCompleted(qualType, session, subject, unit)) {
          console.log(`Unit already processed: ${unit}`);
          processedUnits++;
          continue;
        }

        // Skip if this unit previously failed (to avoid repeatedly trying problematic units)
        if (tracker.hasFailed(qualType, session, subject, unit)) {
          console.log(`Unit previously failed, skipping: ${unit}`);
          processedUnits++; // Count as processed since we're skipping it
          continue;
        }

        const success = await processUnit(
          page,
          tracker,
          qualType,
          session,
          subject,
          unit
        );
        if (success) {
          processedUnits++;
        }
      } catch (unitError) {
        console.error(`Error processing unit ${unit}:`, unitError);
        tracker.markAsFailed(
          qualType,
          session,
          subject,
          unit,
          unitError.message
        );
        await tracker.save();
        processedUnits++; // Count as processed since we've marked it as failed
      }
    }

    // Return the unit counts for this subject
    return { totalUnits: units.length, processedUnits };
  } catch (error) {
    throw error;
  }
}

/**
 * Process a single unit and extract its grade conversion data
 */
async function processUnit(page, tracker, qualType, session, subject, unit) {
  console.log(`\n- Processing unit: ${unit} -`);

  try {
    // Select this unit
    await selectUnit(page, unit);

    // Check if the tabs area is visible with more flexible selectors
    console.log("Checking for tabs section...");
    const hasTabsSection = await page.evaluate(() => {
      // Try different selectors that might indicate tabs
      const tabsSection =
        document.querySelector("#gcstep5") ||
        document.querySelector(".nav.nav-tabs") ||
        document.querySelector("ul[role='tablist']");
      return !!tabsSection;
    });

    if (!hasTabsSection) {
      console.log("No tabs section found, skipping to next unit");
      tracker.markAsFailed(
        qualType,
        session,
        subject,
        unit,
        "No tabs section found"
      );
      await tracker.save();
      return false;
    }

    // Select the All Scores tab
    await selectAllScoresTab(page);

    // Extract the data from div-based table
    console.log("Extracting grade conversion data...");
    const rawData = await extractAllScoresData(page, sleep); // Pass the sleep function here

    // Process the data (normalize and sort)
    const processedData = processData(rawData);

    if (processedData.length === 0) {
      console.error("No data extracted for this unit");
      tracker.markAsFailed(
        qualType,
        session,
        subject,
        unit,
        "No data extracted"
      );
      await tracker.save();
      return false;
    }

    // Save the data
    const metadata = {
      qualificationType: qualType,
      session,
      subject,
      unit,
    };

    await saveData(processedData, metadata);

    // Mark as completed in the tracker
    tracker.markAsCompleted(qualType, session, subject, unit);
    await tracker.save();

    console.log(`Successfully processed unit: ${unit}`);
    await sleep(1000); // Add delay to avoid overloading server
    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * Test extraction for a single unit
 * @param {string} session - Exam session (e.g. "June 2019")
 * @param {string} subject - Subject name
 * @param {string} unit - Unit name
 */
async function testSingleUnit(session, subject, unit) {
  console.log("Starting browser for test...");
  const browser = await puppeteer.launch({
    headless: false, // Use headed browser for visual debugging
    defaultViewport: null,
    args: ["--window-size=1200,800"],
  });

  try {
    const page = await browser.newPage();

    // Enable verbose console logging for testing
    page.on("console", (msg) => console.log(`PAGE LOG: ${msg.text()}`));

    // Navigate to the main page with direct qualification parameter
    console.log("Navigating to Pearson qualifications page...");
    await page.goto(BASE_URL, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Handle cookie banner
    try {
      console.log("Checking for cookie consent banner...");
      const cookieBannerSelector = "#onetrust-reject-all-handler";
      const cookieBannerExists = await page.evaluate((selector) => {
        const banner = document.querySelector(selector);
        return !!banner && banner.offsetParent !== null; // Check if visible
      }, cookieBannerSelector);

      if (cookieBannerExists) {
        console.log("Dismissing cookie banner...");
        await page.click(cookieBannerSelector);
        await sleep(2000);
      }
    } catch (cookieError) {
      console.log("No cookie banner found or error dismissing it");
    }

    await sleep(3000); // Add delay to ensure page is fully loaded

    console.log(`Testing extraction for: ${session} / ${subject} / ${unit}`);

    // Navigate to session
    await navigateToSession(page, session);

    // Select subject
    await selectSubject(page, subject);

    // Select unit
    await selectUnit(page, unit);

    // Check for tabs
    const hasTabsSection = await page.evaluate(() => {
      const tabsSection =
        document.querySelector("#gcstep5") ||
        document.querySelector(".nav.nav-tabs") ||
        document.querySelector("ul[role='tablist']");
      return !!tabsSection;
    });

    if (!hasTabsSection) {
      console.log("No tabs section found!");
      throw new Error("No tabs section found for this unit");
    }

    // Select All Scores tab
    await selectAllScoresTab(page);

    // Extract data
    console.log("Extracting data...");
    const rawData = await extractAllScoresData(page, sleep);

    // Process the data
    const processedData = processData(rawData);
    console.log(`Processed ${processedData.length} data rows`);

    if (processedData.length <= 2) {
      console.error("ERROR: Only extracted a small amount of data!");
    }

    // Save the data
    const metadata = {
      qualificationType: QUALIFICATION_TYPE,
      session,
      subject,
      unit,
    };

    await saveData(processedData, metadata);

    // Wait for user to examine the page
    console.log("Test complete. Browser will close in 10 seconds...");
    await sleep(10000);
  } catch (error) {
    console.error("Error during test:", error);
    // Keep browser open for 30 seconds on error for debugging
    console.log("Error occurred. Browser will close in 30 seconds...");
    await sleep(30000);
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = {
  scrapeSeries,
  processSubject,
  processUnit,
  testSingleUnit,
};
