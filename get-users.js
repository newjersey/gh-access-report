const axios = require("axios");
const fs = require("fs");

const generateAccessReport = () => {
  // GitHub API token (replace with your own token)
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

  // Read the list of repositories from repos.txt
  fs.readFile("repos.txt", "utf8", async (err, data) => {
    if (err) {
      console.error("Error reading repos.txt:", err);
      return;
    }

    const repositories = data.trim().split("\n");

    const csvRows = [];

    for (const repo of repositories) {
      try {
        const response = await axios.get(
          `https://api.github.com/repos/newjersey/${repo}/collaborators`,
          {
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
            },
          }
        );

        const collaborators = response.data;

        for (const collaborator of collaborators) {
          csvRows.push(
            `${repo},${collaborator.login},${
              collaborator.permissions.admin ? "admin" : "write"
            }`
          );
        }
      } catch (error) {
        console.error(
          `Error fetching collaborators for ${repo}:`,
          error.response ? error.response.data : error.message
        );
      }
    }

    // Write CSV data to access-report.csv
    fs.writeFile(
      "access-report.csv",
      "repository,member,access\n" + csvRows.join("\n"),
      "utf8",
      (err) => {
        if (err) {
          console.error("Error writing access-report.csv:", err);
          return;
        }
        console.log("Access report saved as access-report.csv");
      }
    );
  });
};

module.exports = {
  generateAccessReport,
};
