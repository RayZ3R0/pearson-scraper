const { scrapeSeries, testSingleUnit } = require("./modules/scraper");
const fs = require("fs").promises;
const path = require("path");

/**
 * Parse command line arguments for subject filtering
 * @returns {Array|null} Array of subject keywords or null if none specified
 */
function parseSubjectFilter() {
  // Look for --subjects flag followed by comma-separated list
  const subjectsIndex = process.argv.findIndex((arg) => arg === "--subjects");

  if (subjectsIndex >= 0 && subjectsIndex < process.argv.length - 1) {
    const subjectsArg = process.argv[subjectsIndex + 1];
    const subjects = subjectsArg
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (subjects.length > 0) {
      return subjects;
    }
  }

  return null;
}

/**
 * Check if we're in test mode and should run a single unit test
 */
function checkForTestMode() {
  const testIndex = process.argv.findIndex((arg) => arg === "--test");

  if (testIndex >= 0 && testIndex < process.argv.length - 3) {
    const session = process.argv[testIndex + 1];
    const subject = process.argv[testIndex + 2];
    const unit = process.argv[testIndex + 3];

    return { isTest: true, session, subject, unit };
  }

  return { isTest: false };
}

async function main() {
  console.log("Starting Pearson Grade Conversion Scraper...");

  // Check for test mode
  const testMode = checkForTestMode();
  if (testMode.isTest) {
    console.log(
      `TEST MODE: Will only process ${testMode.session} / ${testMode.subject} / ${testMode.unit}`
    );
    await testSingleUnit(testMode.session, testMode.subject, testMode.unit);
    return;
  }

  // Get subject filter
  const subjectFilter = parseSubjectFilter();
  if (subjectFilter) {
    console.log(
      `Subject filter active: Will only process subjects matching: ${subjectFilter.join(
        ", "
      )}`
    );
  } else {
    console.log("No subject filter specified, will process all subjects");
  }

  console.log(
    "This will scrape all available exam sessions, subjects, and units"
  );
  console.log("Data will be saved to the 'data' directory");

  try {
    // Create base directories
    const dataDir = path.join(__dirname, "data");
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (err) {
      // Directory already exists, ignore
    }

    // Override the FILTER_SUBJECTS constant if provided on command line
    if (subjectFilter) {
      global.FILTER_SUBJECTS = subjectFilter;
    }

    // Run the scraper
    await scrapeSeries();

    console.log("Scraping completed successfully!");
  } catch (error) {
    console.error("Fatal error in main process:", error);
    process.exit(1);
  }
}

// Start the process
main();
