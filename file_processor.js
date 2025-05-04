const fs = require("fs").promises;
const path = require("path");

// Directory constants
const SOURCE_DIR = path.join(__dirname, "data");
const TARGET_DIR = path.join(__dirname, "processed_data");

/**
 * Get base subject name by removing year designations
 * @param {string} subject - Subject folder name
 * @returns {string} - Base subject name
 */
function getBaseSubjectName(subject) {
  // Remove year designations like (2015), (2018), etc. and clean up any trailing underscores
  return subject.replace(/\s*\(\d{4}\)\s*/g, "").replace(/_+$/, "");
}

/**
 * Check if a subject is a math-related subject
 * @param {string} subject - Subject folder name
 * @returns {boolean} - Whether the subject is math-related
 */
function isMathSubject(subject) {
  const mathSubjects = [
    "Mathematics",
    "Further_Mathematics",
    "Pure_Mathematics",
  ];
  return mathSubjects.includes(subject);
}

/**
 * Parse unit code from filename
 * @param {string} filename - Filename including unit code
 * @returns {string} - Unit code
 */
function parseUnitCode(filename) {
  // Extract the unit code (e.g., WPH01-01, WMA02-01C)
  const match = filename.match(/^([A-Z]{2,3}\d{2}(?:-\d{2})?[A-Z]?)/);
  return match ? match[1] : null;
}

/**
 * Create directory recursively
 * @param {string} dir - Directory path to create
 */
async function createDirectoryIfNotExists(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") {
      throw err;
    }
  }
}

/**
 * Organize data files by restructuring and removing duplicates
 */
async function organizeData() {
  console.log("Starting data organization...");

  // Track the number of files processed and duplicates found
  let totalFiles = 0;
  let duplicates = 0;
  let processedFiles = new Set();

  try {
    // Create the target directory
    await createDirectoryIfNotExists(TARGET_DIR);

    // Get all qualification type directories
    const qualTypes = await fs.readdir(SOURCE_DIR);

    // Process each qualification type
    for (const qualType of qualTypes) {
      const qualPath = path.join(SOURCE_DIR, qualType);
      const qualStat = await fs.stat(qualPath);

      // Skip if not a directory
      if (!qualStat.isDirectory()) continue;

      console.log(`Processing qualification type: ${qualType}`);
      const targetQualPath = path.join(TARGET_DIR, qualType);
      await createDirectoryIfNotExists(targetQualPath);

      // Get all sessions for this qualification
      const sessions = await fs.readdir(qualPath);

      // Process each session
      for (const session of sessions) {
        const sessionPath = path.join(qualPath, session);
        const sessionStat = await fs.stat(sessionPath);

        // Skip if not a directory
        if (!sessionStat.isDirectory()) continue;

        console.log(`Processing session: ${session}`);
        const targetSessionPath = path.join(targetQualPath, session);
        await createDirectoryIfNotExists(targetSessionPath);

        // Get all subjects for this session
        const subjects = await fs.readdir(sessionPath);

        // Group subjects by base name (without year designation)
        const subjectGroups = {};

        for (const subject of subjects) {
          const baseName = getBaseSubjectName(subject);
          if (!subjectGroups[baseName]) {
            subjectGroups[baseName] = [];
          }
          subjectGroups[baseName].push(subject);
        }

        // Process each grouped subject
        for (const [baseSubject, subjectVariants] of Object.entries(
          subjectGroups
        )) {
          // Special handling for math subjects - merge them all into Mathematics
          if (subjectVariants.some((subject) => isMathSubject(subject))) {
            const result = await processMathSubjects(
              sessionPath,
              subjectVariants,
              targetSessionPath
            );
            totalFiles += result.processedFiles;
            duplicates += result.duplicatesFound;
          } else {
            // Process regular subjects
            const result = await processRegularSubjects(
              sessionPath,
              baseSubject,
              subjectVariants,
              targetSessionPath
            );
            totalFiles += result.processedFiles;
            duplicates += result.duplicatesFound;
          }
        }
      }
    }

    console.log("\nData organization complete!");
    console.log(`Total files processed: ${totalFiles}`);
    console.log(`Duplicate files found and handled: ${duplicates}`);
  } catch (error) {
    console.error("Error organizing data:", error);
    throw error;
  }
}

/**
 * Process math-related subjects by consolidating them all into Mathematics
 * @param {string} sessionPath - Path to the session directory
 * @param {Array} mathSubjects - Array of math subject variants
 * @param {string} targetSessionPath - Path to target session directory
 * @returns {Object} - Stats about processed files and duplicates
 */
async function processMathSubjects(
  sessionPath,
  mathSubjects,
  targetSessionPath
) {
  const unifiedMathPath = path.join(targetSessionPath, "Mathematics");
  await createDirectoryIfNotExists(unifiedMathPath);

  console.log(`  Consolidating math subjects into Mathematics folder`);

  // Set to track unit codes we've already processed to avoid duplicates
  const processedUnitCodes = new Set();
  let processedFiles = 0;
  let duplicatesFound = 0;

  // Process each math subject variant
  for (const subject of mathSubjects) {
    const subjectPath = path.join(sessionPath, subject);

    try {
      // Get all files in this math subject
      const files = await fs.readdir(subjectPath);

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const unitCode = parseUnitCode(file);
        if (!unitCode) {
          console.warn(`  Warning: Could not parse unit code from ${file}`);
          continue;
        }

        processedFiles++;

        // Check if we've already processed this unit code
        if (processedUnitCodes.has(unitCode)) {
          duplicatesFound++;
          console.log(`  Skipping duplicate math unit: ${file} (${unitCode})`);
          continue;
        }

        // Mark this unit code as processed
        processedUnitCodes.add(unitCode);

        // Copy file to unified math folder
        const sourcePath = path.join(subjectPath, file);
        const targetPath = path.join(unifiedMathPath, file);

        await fs.copyFile(sourcePath, targetPath);
        console.log(`  Copied ${subject}/${file} to Mathematics/${file}`);
      }
    } catch (error) {
      // If the path doesn't exist or isn't a directory, log and continue
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        console.warn(`  Warning: Could not read subject directory ${subject}`);
        continue;
      }
      throw error;
    }
  }

  return { processedFiles, duplicatesFound };
}

/**
 * Process regular (non-math) subjects
 * @param {string} sessionPath - Path to the session directory
 * @param {string} baseSubject - Base subject name
 * @param {Array} subjectVariants - Array of subject variants
 * @param {string} targetSessionPath - Path to target session directory
 * @returns {Object} - Stats about processed files and duplicates
 */
async function processRegularSubjects(
  sessionPath,
  baseSubject,
  subjectVariants,
  targetSessionPath
) {
  const targetSubjectPath = path.join(targetSessionPath, baseSubject);
  await createDirectoryIfNotExists(targetSubjectPath);

  console.log(
    `  Processing subject: ${baseSubject} (${subjectVariants.length} variants)`
  );

  // Set to track unit codes we've already processed to avoid duplicates
  const processedUnitCodes = new Set();
  let processedFiles = 0;
  let duplicatesFound = 0;

  // Process each subject variant
  for (const subject of subjectVariants) {
    const subjectPath = path.join(sessionPath, subject);

    try {
      // Get all files in this subject
      const files = await fs.readdir(subjectPath);

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const unitCode = parseUnitCode(file);
        if (!unitCode) {
          console.warn(`  Warning: Could not parse unit code from ${file}`);
          continue;
        }

        processedFiles++;

        // Check if we've already processed this unit code
        if (processedUnitCodes.has(unitCode)) {
          duplicatesFound++;
          console.log(`  Skipping duplicate unit: ${file} (${unitCode})`);
          continue;
        }

        // Mark this unit code as processed
        processedUnitCodes.add(unitCode);

        // Copy file to unified subject folder
        const sourcePath = path.join(subjectPath, file);
        const targetPath = path.join(targetSubjectPath, file);

        await fs.copyFile(sourcePath, targetPath);
        console.log(`  Copied ${subject}/${file} to ${baseSubject}/${file}`);
      }
    } catch (error) {
      // If the path doesn't exist or isn't a directory, log and continue
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        console.warn(`  Warning: Could not read subject directory ${subject}`);
        continue;
      }
      throw error;
    }
  }

  return { processedFiles, duplicatesFound };
}

// Check if running as main script
if (require.main === module) {
  // Run the organization process
  organizeData()
    .then(() => console.log("Organization complete!"))
    .catch((err) => console.error("Error during organization:", err));
}

module.exports = { organizeData };
