const fs = require("fs").promises;
const path = require("path");

class ProgressTracker {
  constructor(filePath) {
    this.filePath = filePath;
    this.progress = {
      completed: {},
      failed: {},
      lastUpdate: null,
      stats: {
        totalSessions: 0,
        totalSubjects: 0,
        totalUnits: 0,
        completedUnits: 0,
        failedUnits: 0,
      },
    };
  }

  /**
   * Initialize the progress tracker
   * Creates the progress file if it doesn't exist
   */
  async initialize() {
    try {
      const data = await fs.readFile(this.filePath, "utf8");
      this.progress = JSON.parse(data);
      console.log("Progress tracker loaded successfully");
    } catch (error) {
      // If file doesn't exist or is invalid, create a new one
      console.log("Creating new progress tracker");
      await this.save();
    }
  }

  /**
   * Save the current progress to file
   */
  async save() {
    this.progress.lastUpdate = new Date().toISOString();
    await fs.writeFile(
      this.filePath,
      JSON.stringify(this.progress, null, 2),
      "utf8"
    );
  }

  /**
   * Check if a unit has already been processed
   * @param {string} qualificationType - The qualification type
   * @param {string} session - The exam session
   * @param {string} subject - The subject
   * @param {string} unit - The unit
   * @returns {boolean} - Whether the unit has been processed
   */
  isCompleted(qualificationType, session, subject, unit) {
    if (!this.progress.completed[qualificationType]) {
      return false;
    }
    if (!this.progress.completed[qualificationType][session]) {
      return false;
    }
    if (!this.progress.completed[qualificationType][session][subject]) {
      return false;
    }
    return this.progress.completed[qualificationType][session][
      subject
    ].includes(unit);
  }

  /**
   * Check if a unit has failed processing
   * @param {string} qualificationType - The qualification type
   * @param {string} session - The exam session
   * @param {string} subject - The subject
   * @param {string} unit - The unit
   * @returns {boolean} - Whether the unit has failed processing
   */
  hasFailed(qualificationType, session, subject, unit) {
    if (!this.progress.failed[qualificationType]) {
      return false;
    }
    if (!this.progress.failed[qualificationType][session]) {
      return false;
    }
    if (!this.progress.failed[qualificationType][session][subject]) {
      return false;
    }
    return this.progress.failed[qualificationType][session][subject].includes(
      unit
    );
  }

  /**
   * Mark a unit as completed
   * @param {string} qualificationType - The qualification type
   * @param {string} session - The exam session
   * @param {string} subject - The subject
   * @param {string} unit - The unit
   */
  markAsCompleted(qualificationType, session, subject, unit) {
    // Initialize nested objects if they don't exist
    this.progress.completed[qualificationType] =
      this.progress.completed[qualificationType] || {};
    this.progress.completed[qualificationType][session] =
      this.progress.completed[qualificationType][session] || {};
    this.progress.completed[qualificationType][session][subject] =
      this.progress.completed[qualificationType][session][subject] || [];

    // Add the unit if it's not already marked as completed
    if (
      !this.progress.completed[qualificationType][session][subject].includes(
        unit
      )
    ) {
      this.progress.completed[qualificationType][session][subject].push(unit);
      this.progress.stats.completedUnits++;
    }
  }

  /**
   * Mark a unit as failed
   * @param {string} qualificationType - The qualification type
   * @param {string} session - The exam session
   * @param {string} subject - The subject
   * @param {string} unit - The unit
   * @param {string} error - The error message
   */
  markAsFailed(qualificationType, session, subject, unit, error) {
    // Initialize nested objects if they don't exist
    this.progress.failed[qualificationType] =
      this.progress.failed[qualificationType] || {};
    this.progress.failed[qualificationType][session] =
      this.progress.failed[qualificationType][session] || {};
    this.progress.failed[qualificationType][session][subject] =
      this.progress.failed[qualificationType][session][subject] || [];

    // Add the unit with error if it's not already marked as failed
    if (
      !this.progress.failed[qualificationType][session][subject].includes(unit)
    ) {
      this.progress.failed[qualificationType][session][subject].push(unit);
      this.progress.stats.failedUnits++;
    }
  }

  /**
   * Update the statistics for total sessions, subjects, and units
   * @param {number} totalSessions - Total number of sessions
   * @param {number} totalSubjects - Total number of subjects
   * @param {number} totalUnits - Total number of units
   */
  updateStats(totalSessions, totalSubjects, totalUnits) {
    this.progress.stats.totalSessions = totalSessions;
    this.progress.stats.totalSubjects = totalSubjects;
    this.progress.stats.totalUnits = totalUnits;
  }

  /**
   * Get the progress summary
   * @returns {object} - The progress summary
   */
  getSummary() {
    const { stats } = this.progress;
    return {
      totalSessions: stats.totalSessions,
      totalSubjects: stats.totalSubjects,
      totalUnits: stats.totalUnits,
      completedUnits: stats.completedUnits,
      failedUnits: stats.failedUnits,
      progress:
        stats.totalUnits > 0
          ? `${Math.round((stats.completedUnits / stats.totalUnits) * 100)}%`
          : "0%",
      lastUpdate: this.progress.lastUpdate,
    };
  }
}

module.exports = ProgressTracker;
