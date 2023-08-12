const axios = require("axios");
const fs = require("fs");
const main = require("./get-users");

jest.mock("axios");

describe("GitHub Access Report", () => {
  let originalEnv;
  let originalReadFile;
  let originalWriteFile;

  beforeAll(() => {
    originalEnv = process.env.GITHUB_TOKEN;
    originalReadFile = fs.readFile;
    originalWriteFile = fs.writeFile;

    process.env.GITHUB_TOKEN = "mock-token";
  });

  afterAll(() => {
    process.env.GITHUB_TOKEN = originalEnv;
    fs.readFile = originalReadFile;
    fs.writeFile = originalWriteFile;
  });

  beforeEach(() => {
    fs.readFile = jest.fn();
    fs.writeFile = jest.fn();
    axios.get.mockReset();
  });

  it("fetches collaborators and generates access report", async () => {
    // Mocking fs.readFile
    fs.readFile.mockImplementation((path, encoding, callback) => {
      callback(null, "repo1\nrepo2\nrepo3");
    });

    const writeFileMock = jest.spyOn(fs, "writeFile");
    writeFileMock.mockImplementation((path, data, encoding, callback) => {
      expect(path).toBe("access-report.csv");
      expect(data).toBe(
        "repository,member,access\n" +
          "repo1,user1,admin\nrepo1,user2,write\n" +
          "repo2,user1,admin\nrepo2,user2,write\n" +
          "repo3,user1,admin\nrepo3,user2,write"
      );
      expect(encoding).toBe("utf8");
      callback();
    });

    // Mocking axios.get
    axios.get.mockResolvedValue({
      data: [
        { login: "user1", permissions: { admin: true } },
        { login: "user2", permissions: { admin: false } },
      ],
    });

    // Call the program or the relevant function here
    await main.generateAccessReport();

    // Assertions
    expect(fs.readFile).toHaveBeenCalledWith(
      "repos.txt",
      "utf8",
      expect.any(Function)
    );
    expect(axios.get).toHaveBeenCalledWith(
      "https://api.github.com/repos/newjersey/repo1/collaborators",
      {
        headers: {
          Authorization: "Bearer mock-token",
        },
      }
    );

    expect(axios.get).toHaveBeenCalledWith(
      "https://api.github.com/repos/newjersey/repo2/collaborators",
      {
        headers: {
          Authorization: "Bearer mock-token",
        },
      }
    );
  });

  // Add more test cases as needed
});
