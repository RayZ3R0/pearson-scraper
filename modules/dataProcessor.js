const fs = require("fs").promises;
const path = require("path");

/**
 * Extract data from the All Scores view
 * @param {Page} page - Puppeteer page object
 * @param {Function} sleep - Sleep function
 * @returns {Object} - Extracted data
 */
async function extractAllScoresData(page, sleep) {
  // Allow time for the content to fully load
  await sleep(3000);

  // Direct extraction of grade rows without depending on tab-pane structure
  const extractedData = await page.evaluate(() => {
    console.log("Starting direct data extraction...");

    // Find all gradeRow elements anywhere in the document
    const rows = document.querySelectorAll(".gradeRow");
    console.log(`Found ${rows.length} grade rows in document`);

    if (rows.length === 0) {
      return { error: "No grade rows found" };
    }

    const extractedRows = [];

    rows.forEach((row) => {
      const columns = row.querySelectorAll(".gradeColumn");

      if (columns.length >= 3) {
        const rawText = columns[0].textContent.trim();
        const umsText = columns[1].textContent.trim();
        const gradeText = columns[2].textContent.trim();

        const raw = parseInt(rawText, 10);
        const ums = parseInt(umsText, 10);

        if (!isNaN(raw) && !isNaN(ums)) {
          extractedRows.push({
            RAW: raw,
            UMS: ums,
            GRADE: gradeText,
          });
        }
      }
    });

    console.log(`Successfully extracted ${extractedRows.length} data rows`);
    return { rows: extractedRows };
  });

  return extractedData;
}

/**
 * Process and normalize extracted data
 * @param {Object} rawData - Raw data extracted from page
 * @returns {Array} - Normalized and sorted data array
 */
function processData(rawData) {
  let data = [];

  // Check for direct extraction results
  if (rawData.rows && rawData.rows.length > 0) {
    data = rawData.rows;
  } else if (rawData.error) {
    console.error(`Error extracting data: ${rawData.error}`);
    return [];
  }

  // Check if we have enough data
  if (data.length <= 2) {
    console.warn(
      `Warning: Only ${data.length} data points found. This may be incomplete data.`
    );
  }

  // Sort by UMS in descending order
  return data.sort((a, b) => b.UMS - a.UMS);
}

/**
 * Save processed data to a JSON file with appropriate organization
 * @param {Array} processedData - The sorted and normalized data array
 * @param {Object} metadata - Metadata about the extraction
 * @returns {string} - Path to the saved file
 */
async function saveData(processedData, metadata) {
  const { qualificationType, session, subject, unit } = metadata;

  // Create clean names for directory structure
  const cleanName = (str) =>
    str.replace(/[\/\\:*?"<>|]/g, "-").replace(/\s+/g, "_");

  const qualDir = cleanName(qualificationType);
  const sessionDir = cleanName(session);
  const subjectDir = cleanName(subject);
  const filename = `${cleanName(unit)}.json`;

  // Create the directory structure
  const baseDir = path.join(__dirname, "..", "data");
  const qualPath = path.join(baseDir, qualDir);
  const sessionPath = path.join(qualPath, sessionDir);
  const subjectPath = path.join(sessionPath, subjectDir);

  await fs.mkdir(baseDir, { recursive: true });
  await fs.mkdir(qualPath, { recursive: true });
  await fs.mkdir(sessionPath, { recursive: true });
  await fs.mkdir(subjectPath, { recursive: true });

  const filepath = path.join(subjectPath, filename);

  // Combine data and metadata
  const fullData = {
    metadata: {
      ...metadata,
      recordCount: processedData.length,
      timestamp: new Date().toISOString(),
    },
    data: processedData,
  };

  // Write to file
  await fs.writeFile(filepath, JSON.stringify(fullData, null, 2), "utf8");
  console.log(`Data saved to ${filepath} (${processedData.length} records)`);

  return filepath;
}

module.exports = {
  extractAllScoresData,
  processData,
  saveData,
};
