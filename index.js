const { scrapeSeries } = require("./modules/scraper");
const fs = require("fs").promises;
const path = require("path");

async function main() {
  console.log("Starting Pearson Grade Conversion Scraper...");
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
