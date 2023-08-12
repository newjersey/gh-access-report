# GitHub Repository Access Report Generator

The **GitHub Repository Access Report Generator** is a simple Node.js application that fetches collaborator information from GitHub repositories and generates an access report in CSV format. This report provides insights into the access levels of collaborators (either admin or write permissions) for a list of specified repositories.

## Prerequisites

Before using this application, ensure that you have the following:

1. **Node.js**: Make sure you have Node.js installed on your system. You can download it from the [official Node.js website](https://nodejs.org/).

2. **GitHub Personal Access Token**: You need a GitHub personal access token to authenticate your requests to the GitHub API. Follow these steps to create one:

   - Log in to your GitHub account.
   - Go to **Settings** > **Developer settings** > **Personal access tokens**.
   - Click on **Generate new token**.
   - Provide a suitable name, and select the necessary permissions (at least `repo` scope for this application).
   - Click **Generate token** and make sure to copy the generated token.

## Installation

1. Clone or download this repository to your local machine.

2. Open a terminal window and navigate to the repository's directory.

3. Install the required Node.js packages by running:

   ```
   npm install
   ```

## Usage

1. Create a text file named `repos.txt` in the same directory as the application. This file should contain a list of repository names, each on a new line. For example:

   ```
   repository-1
   repository-2
   repository-3
   ```

2. Set `GITHUB_TOKEN` as an environment variable with your with your GitHub personal access token.

3. Run the application by executing the following command in the terminal:

   ```
   npm start
   ```

   The application will fetch collaborator information for each repository in the `repos.txt` file and generate an access report in CSV format named `access-report.csv`.

4. Once the application completes its execution, you can find the generated access report in the same directory as `access-report.csv`.

## Testing

The application tests may be run with the following command:

```
npm test
```

## Notes

- If any errors occur during the process, they will be logged to the console along with relevant error messages.

- This application uses the [axios](https://github.com/axios/axios) library to make HTTP requests to the GitHub API and the built-in `fs` module to read and write files.

- Be cautious when handling personal access tokens, as they grant various levels of access to your GitHub account. Keep your token secure and avoid sharing it in public repositories.

This application was generated using ChatGPT with the following prompts and some editing and additional testing

- `write a node.js application that loads a list of repositories from a "repos.txt" file and uses the github api to get a list of all of the members who have access to those repositories. All the repositories are under the "newjersey" organization. Output the list members as a csv with columns for repository, member username, and access level`
- `write jest tests for the previous application`
- `write a readme file for the previous application`
