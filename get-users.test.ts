import fs from 'fs/promises';
import * as getUsersModule from './get-users';

// Mock dependencies
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('GitHub Access Report', () => {
  let originalEnv: string | undefined;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    originalEnv = process.env.GITHUB_TOKEN;
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterAll(() => {
    process.env.GITHUB_TOKEN = originalEnv;
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_TOKEN = 'mock-token';
  });

  describe('Token Validation', () => {
    it('should throw error when GitHub token is missing', async () => {
      delete process.env.GITHUB_TOKEN;
      
      await expect(getUsersModule.generateAccessReport()).rejects.toThrow(
        'GitHub token is missing. Please set GITHUB_TOKEN environment variable.'
      );
    });

    it('should throw error when GitHub token is empty', async () => {
      process.env.GITHUB_TOKEN = '';
      
      await expect(getUsersModule.generateAccessReport()).rejects.toThrow(
        'GitHub token is missing. Please set GITHUB_TOKEN environment variable.'
      );
    });

    it('should throw error when GitHub token is only whitespace', async () => {
      process.env.GITHUB_TOKEN = '   ';
      
      await expect(getUsersModule.generateAccessReport()).rejects.toThrow(
        'GitHub token is missing. Please set GITHUB_TOKEN environment variable.'
      );
    });
  });

  describe('GitHub API Token Testing', () => {
    it('should validate token successfully', async () => {
      const mockUserResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ login: 'testuser' })
      };
      mockFetch.mockResolvedValueOnce(mockUserResponse as any);
      mockFs.readFile.mockResolvedValue('repo1\nrepo2');
      mockFs.writeFile.mockResolvedValue(undefined);

      // Mock repository access checks and collaborator fetches
      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };
      const mockCollabResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };
      const mockTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      mockFetch
        .mockResolvedValueOnce(mockUserResponse as any) // Token validation
        .mockResolvedValueOnce(mockRepoResponse as any) // Repo1 access check
        .mockResolvedValueOnce(mockCollabResponse as any) // Repo1 direct collaborators
        .mockResolvedValueOnce(mockCollabResponse as any) // Repo1 all collaborators
        .mockResolvedValueOnce(mockTeamsResponse as any) // Repo1 teams
        .mockResolvedValueOnce(mockRepoResponse as any) // Repo2 access check
        .mockResolvedValueOnce(mockCollabResponse as any) // Repo2 direct collaborators
        .mockResolvedValueOnce(mockCollabResponse as any) // Repo2 all collaborators
        .mockResolvedValueOnce(mockTeamsResponse as any); // Repo2 teams

      await getUsersModule.generateAccessReport();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token'
          })
        })
      );
    });

    it('should throw error when token validation fails', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: jest.fn().mockResolvedValue('{"message": "Bad credentials"}')
      };
      mockFetch.mockResolvedValueOnce(mockResponse as any);

      await expect(getUsersModule.generateAccessReport()).rejects.toThrow(
        'GitHub token validation failed: 401 Unauthorized'
      );
    });
  });

  describe('Repository List Reading', () => {
    it('should handle file reading errors', async () => {
      const mockUserResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ login: 'testuser' })
      };
      mockFetch.mockResolvedValueOnce(mockUserResponse as any);
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(getUsersModule.generateAccessReport()).rejects.toThrow(
        'Failed to read repos.txt: File not found'
      );
    });

    it('should filter out empty lines from repos.txt', async () => {
      const mockUserResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ login: 'testuser' })
      };
      mockFetch.mockResolvedValueOnce(mockUserResponse as any);
      mockFs.readFile.mockResolvedValue('repo1\n\nrepo2\n   \nrepo3');
      mockFs.writeFile.mockResolvedValue(undefined);

      // Mock successful repository processing for 3 repos
      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };
      const mockCollabResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };
      const mockTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      // Mock responses for 3 repos × 4 calls each (access check + direct + all + teams)
      for (let i = 0; i < 12; i++) {
        const responseIndex = i % 4;
        if (responseIndex === 0) {
          mockFetch.mockResolvedValueOnce(mockRepoResponse as any);
        } else if (responseIndex === 3) {
          mockFetch.mockResolvedValueOnce(mockTeamsResponse as any);
        } else {
          mockFetch.mockResolvedValueOnce(mockCollabResponse as any);
        }
      }

      await getUsersModule.generateAccessReport();

      // Should process 3 repositories (empty lines filtered out)
      expect(mockFetch).toHaveBeenCalledTimes(13); // 1 token validation + 3×4 repo calls
    });
  });

  describe('Repository Processing', () => {
    beforeEach(() => {
      const mockUserResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ login: 'testuser' })
      };
      mockFetch.mockResolvedValueOnce(mockUserResponse as any);
      mockFs.readFile.mockResolvedValue('test-repo');
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should handle successful collaborator fetching', async () => {
      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };
      const mockDirectResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'user1', permissions: { admin: true, push: false, pull: true } }
        ])
      };
      const mockAllResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'user1', permissions: { admin: true, push: false, pull: true } },
          { login: 'user2', permissions: { admin: false, push: true, pull: true } },
          { login: 'user3', permissions: { admin: false, push: false, pull: true } }
        ])
      };
      const mockTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce(mockDirectResponse as any)
        .mockResolvedValueOnce(mockAllResponse as any)
        .mockResolvedValueOnce(mockTeamsResponse as any);

      await getUsersModule.generateAccessReport();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'access-report.csv',
        expect.stringContaining('"test-repo","user1","admin","direct","success"'),
        'utf8'
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'access-report.csv',
        expect.stringContaining('"test-repo","user2","write","organization","success"'),
        'utf8'
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'access-report.csv',
        expect.stringContaining('"test-repo","user3","read","organization","success"'),
        'utf8'
      );
    });

    it('should handle repository not found (404)', async () => {
      const mockRepoResponse = {
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('{"message": "Not Found"}')
      };

      mockFetch.mockResolvedValueOnce(mockRepoResponse as any);
      await getUsersModule.generateAccessReport();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'access-report.csv',
        expect.stringContaining('"test-repo","N/A","N/A","unknown","not_found"'),
        'utf8'
      );
    });

    it('should handle access forbidden (403)', async () => {
      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: true,
          permissions: { admin: false }
        })
      };
      const mockCollabResponse = {
        ok: false,
        status: 403,
        text: jest.fn().mockResolvedValue('{"message": "Resource not accessible by personal access token"}')
      };

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce(mockCollabResponse as any)
        .mockResolvedValueOnce(mockCollabResponse as any)
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue([]) } as any);

      await getUsersModule.generateAccessReport();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'access-report.csv',
        expect.stringContaining('"test-repo","N/A","N/A","unknown","no_access"'),
        'utf8'
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await getUsersModule.generateAccessReport();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'access-report.csv',
        expect.stringContaining('"test-repo","N/A","N/A","unknown","error"'),
        'utf8'
      );
    });
  });

  describe('Permission Level Determination', () => {
    beforeEach(() => {
      const mockUserResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ login: 'testuser' })
      };
      mockFetch.mockResolvedValueOnce(mockUserResponse as any);
      mockFs.readFile.mockResolvedValue('test-repo');
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should correctly identify admin permissions', async () => {
      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };
      const mockDirectResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'admin-user', permissions: { admin: true, push: true, pull: true } }
        ])
      };
      const mockAllResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'admin-user', permissions: { admin: true, push: true, pull: true } }
        ])
      };
      const mockTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce(mockDirectResponse as any)
        .mockResolvedValueOnce(mockAllResponse as any)
        .mockResolvedValueOnce(mockTeamsResponse as any);

      await getUsersModule.generateAccessReport();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'access-report.csv',
        expect.stringContaining('"test-repo","admin-user","admin","direct","success"'),
        'utf8'
      );
    });

    it('should correctly identify maintain permissions', async () => {
      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };
      const mockDirectResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'maintain-user', permissions: { admin: false, maintain: true, push: true, pull: true } }
        ])
      };
      const mockAllResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'maintain-user', permissions: { admin: false, maintain: true, push: true, pull: true } }
        ])
      };
      const mockTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce(mockDirectResponse as any)
        .mockResolvedValueOnce(mockAllResponse as any)
        .mockResolvedValueOnce(mockTeamsResponse as any);

      await getUsersModule.generateAccessReport();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'access-report.csv',
        expect.stringContaining('"test-repo","maintain-user","maintain","direct","success"'),
        'utf8'
      );
    });

    it('should correctly identify write permissions', async () => {
      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };
      const mockDirectResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'write-user', permissions: { admin: false, maintain: false, push: true, pull: true } }
        ])
      };
      const mockAllResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'write-user', permissions: { admin: false, maintain: false, push: true, pull: true } }
        ])
      };
      const mockTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce(mockDirectResponse as any)
        .mockResolvedValueOnce(mockAllResponse as any)
        .mockResolvedValueOnce(mockTeamsResponse as any);

      await getUsersModule.generateAccessReport();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'access-report.csv',
        expect.stringContaining('"test-repo","write-user","write","direct","success"'),
        'utf8'
      );
    });

    it('should correctly identify triage permissions', async () => {
      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };
      const mockDirectResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'triage-user', permissions: { admin: false, maintain: false, push: false, triage: true, pull: true } }
        ])
      };
      const mockAllResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'triage-user', permissions: { admin: false, maintain: false, push: false, triage: true, pull: true } }
        ])
      };
      const mockTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce(mockDirectResponse as any)
        .mockResolvedValueOnce(mockAllResponse as any)
        .mockResolvedValueOnce(mockTeamsResponse as any);

      await getUsersModule.generateAccessReport();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'access-report.csv',
        expect.stringContaining('"test-repo","triage-user","triage","direct","success"'),
        'utf8'
      );
    });

    it('should correctly identify read permissions', async () => {
      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };
      const mockDirectResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'read-user', permissions: { admin: false, maintain: false, push: false, triage: false, pull: true } }
        ])
      };
      const mockAllResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'read-user', permissions: { admin: false, maintain: false, push: false, triage: false, pull: true } }
        ])
      };
      const mockTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce(mockDirectResponse as any)
        .mockResolvedValueOnce(mockAllResponse as any)
        .mockResolvedValueOnce(mockTeamsResponse as any);

      await getUsersModule.generateAccessReport();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'access-report.csv',
        expect.stringContaining('"test-repo","read-user","read","direct","success"'),
        'utf8'
      );
    });
  });

  describe('Team-specific Access Type Determination', () => {
    beforeEach(() => {
      const mockUserResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ login: 'testuser' })
      };
      mockFetch.mockResolvedValueOnce(mockUserResponse as any);
      mockFs.readFile.mockResolvedValue('test-repo');
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should identify specific team names for team-based access', async () => {
      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };

      const directCollaborators = [
        { login: 'direct-user', permissions: { admin: true, push: true, pull: true } }
      ];
      const allCollaborators = [
        { login: 'direct-user', permissions: { admin: true, push: true, pull: true } },
        { login: 'team-user', permissions: { admin: false, push: true, pull: true } }
      ];
      const teams = [
        { id: 1, name: 'Development Team', slug: 'dev-team', description: 'Dev team', permission: 'push', permissions: { admin: false, push: true, pull: true } },
        { id: 2, name: 'QA Team', slug: 'qa-team', description: 'QA team', permission: 'pull', permissions: { admin: false, push: false, pull: true } }
      ];

      const mockDirectResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(directCollaborators)
      };
      const mockAllResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(allCollaborators)
      };
      const mockTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue(teams)
      };
      const mockMembershipResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ state: 'active' })
      };

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce(mockDirectResponse as any)
        .mockResolvedValueOnce(mockAllResponse as any)
        .mockResolvedValueOnce(mockTeamsResponse as any)
        .mockResolvedValueOnce(mockMembershipResponse as any) // team membership check for team-user, team 1
        .mockResolvedValueOnce({ ok: false, status: 404 } as any); // team membership check for team-user, team 2 (not a member)

      await getUsersModule.generateAccessReport();

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('"test-repo","direct-user","admin","direct","success"');
      expect(writtenContent).toContain('"test-repo","team-user","write","team:Development Team","success"');
    });

    it('should handle multiple team memberships', async () => {
      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };

      const allCollaborators = [
        { login: 'multi-team-user', permissions: { admin: false, push: true, pull: true } }
      ];
      const teams = [
        { id: 1, name: 'Frontend Team', slug: 'frontend', description: 'Frontend', permission: 'push', permissions: { admin: false, push: true, pull: true } },
        { id: 2, name: 'Backend Team', slug: 'backend', description: 'Backend', permission: 'push', permissions: { admin: false, push: true, pull: true } }
      ];

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue([]) } as any) // direct collaborators
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue(allCollaborators) } as any) // all collaborators
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue(teams) } as any) // teams
        .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue({ state: 'active' }) } as any) // member of team 1
        .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue({ state: 'active' }) } as any); // member of team 2

      await getUsersModule.generateAccessReport();

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('"team:Frontend Team,Backend Team"');
    });

    it('should handle team API access failures gracefully', async () => {
      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };

      const allCollaborators = [
        { login: 'team-user', permissions: { admin: false, push: true, pull: true } }
      ];

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue([]) } as any) // direct collaborators
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue(allCollaborators) } as any) // all collaborators
        .mockResolvedValueOnce({ ok: false, status: 403 } as any); // teams API fails

      await getUsersModule.generateAccessReport();

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('"test-repo","team-user","write","organization","success"');
    });

    it('should include team breakdown in summary report', async () => {
      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };

      const allCollaborators = [
        { login: 'user1', permissions: { admin: false, push: true, pull: true } },
        { login: 'user2', permissions: { admin: false, push: true, pull: true } }
      ];
      const teams = [
        { id: 1, name: 'Development Team', slug: 'dev', description: 'Dev', permission: 'push', permissions: { admin: false, push: true, pull: true } }
      ];

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue([]) } as any) // direct collaborators
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue(allCollaborators) } as any) // all collaborators
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue(teams) } as any) // teams
        .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue({ state: 'active' }) } as any) // user1 membership
        .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue({ state: 'active' }) } as any); // user2 membership

      await getUsersModule.generateAccessReport();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('👥 TEAM BREAKDOWN:')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Development Team: 2 access grants')
      );
    });
  });

  describe('CSV Generation', () => {
    it('should generate proper CSV headers', async () => {
      const mockUserResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ login: 'testuser' })
      };
      mockFetch.mockResolvedValueOnce(mockUserResponse as any);
      mockFs.readFile.mockResolvedValue('test-repo');
      mockFs.writeFile.mockResolvedValue(undefined);

      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };
      const mockCollabResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };
      const mockTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce(mockCollabResponse as any)
        .mockResolvedValueOnce(mockCollabResponse as any)
        .mockResolvedValueOnce(mockTeamsResponse as any);

      await getUsersModule.generateAccessReport();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'access-report.csv',
        expect.stringMatching(/^repository,member,access,access_type,status/),
        'utf8'
      );
    });

    it('should properly quote CSV values', async () => {
      const mockUserResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ login: 'testuser' })
      };
      mockFetch.mockResolvedValueOnce(mockUserResponse as any);
      mockFs.readFile.mockResolvedValue('test/repo-name');
      mockFs.writeFile.mockResolvedValue(undefined);

      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };
      const mockDirectResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'test-user', permissions: { admin: true, push: true, pull: true } }
        ])
      };
      const mockAllResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'test-user', permissions: { admin: true, push: true, pull: true } }
        ])
      };
      const mockTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce(mockDirectResponse as any)
        .mockResolvedValueOnce(mockAllResponse as any)
        .mockResolvedValueOnce(mockTeamsResponse as any);

      await getUsersModule.generateAccessReport();

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('"test/repo-name","test-user","admin","direct","success"');
    });
  });

  describe('Error Handling', () => {
    it('should handle file write errors', async () => {
      const mockUserResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ login: 'testuser' })
      };
      mockFetch.mockResolvedValueOnce(mockUserResponse as any);
      mockFs.readFile.mockResolvedValue('test-repo');
      mockFs.writeFile.mockRejectedValue(new Error('Permission denied'));

      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };
      const mockCollabResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };
      const mockTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce(mockCollabResponse as any)
        .mockResolvedValueOnce(mockCollabResponse as any)
        .mockResolvedValueOnce(mockTeamsResponse as any);

      await expect(getUsersModule.generateAccessReport()).rejects.toThrow('Permission denied');
    });

    it('should exit with code 1 on critical errors', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      delete process.env.GITHUB_TOKEN;

      await expect(getUsersModule.generateAccessReport()).rejects.toThrow();
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });
  });

  describe('Integration Tests', () => {
    it('should process multiple repositories with mixed results', async () => {
      const mockUserResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ login: 'testuser' })
      };
      mockFetch.mockResolvedValueOnce(mockUserResponse as any);
      mockFs.readFile.mockResolvedValue('success-repo\nnot-found-repo\nno-access-repo');
      mockFs.writeFile.mockResolvedValue(undefined);

      // Success repo
      const mockSuccessRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };
      const mockSuccessDirectResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'user1', permissions: { admin: true, push: true, pull: true } }
        ])
      };
      const mockSuccessAllResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'user1', permissions: { admin: true, push: true, pull: true } }
        ])
      };
      const mockSuccessTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      // Not found repo
      const mockNotFoundResponse = {
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('{"message": "Not Found"}')
      };

      // No access repo
      const mockNoAccessRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: true,
          permissions: { admin: false }
        })
      };
      const mockNoAccessCollabResponse = {
        ok: false,
        status: 403,
        text: jest.fn().mockResolvedValue('{"message": "Resource not accessible by personal access token"}')
      };
      const mockNoAccessTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      mockFetch
        .mockResolvedValueOnce(mockSuccessRepoResponse as any)
        .mockResolvedValueOnce(mockSuccessDirectResponse as any)
        .mockResolvedValueOnce(mockSuccessAllResponse as any)
        .mockResolvedValueOnce(mockSuccessTeamsResponse as any)
        .mockResolvedValueOnce(mockNotFoundResponse as any)
        .mockResolvedValueOnce(mockNoAccessRepoResponse as any)
        .mockResolvedValueOnce(mockNoAccessCollabResponse as any)
        .mockResolvedValueOnce(mockNoAccessCollabResponse as any)
        .mockResolvedValueOnce(mockNoAccessTeamsResponse as any);

      await getUsersModule.generateAccessReport();

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('"success-repo","user1","admin","direct","success"');
      expect(writtenContent).toContain('"not-found-repo","N/A","N/A","unknown","not_found"');
      expect(writtenContent).toContain('"no-access-repo","N/A","N/A","unknown","no_access"');
    });

    it('should generate comprehensive summary report', async () => {
      const mockUserResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ login: 'testuser' })
      };
      mockFetch.mockResolvedValueOnce(mockUserResponse as any);
      mockFs.readFile.mockResolvedValue('test-repo');
      mockFs.writeFile.mockResolvedValue(undefined);

      const mockRepoResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          private: false,
          permissions: { admin: true }
        })
      };
      const mockDirectResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'direct-user', permissions: { admin: true, push: true, pull: true } }
        ])
      };
      const mockAllResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { login: 'direct-user', permissions: { admin: true, push: true, pull: true } },
          { login: 'team-user1', permissions: { admin: false, push: true, pull: true } },
          { login: 'team-user2', permissions: { admin: false, push: false, pull: true } }
        ])
      };
      const mockTeamsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          { id: 1, name: 'Dev Team', slug: 'dev', description: 'Development', permission: 'push', permissions: { admin: false, push: true, pull: true } }
        ])
      };

      mockFetch
        .mockResolvedValueOnce(mockRepoResponse as any)
        .mockResolvedValueOnce(mockDirectResponse as any)
        .mockResolvedValueOnce(mockAllResponse as any)
        .mockResolvedValueOnce(mockTeamsResponse as any)
        .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue({ state: 'active' }) } as any) // team-user1 membership
        .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue({ state: 'active' }) } as any); // team-user2 membership

      await getUsersModule.generateAccessReport();

      // Check that comprehensive summary was generated
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('📊 SUMMARY REPORT:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('🔐 ACCESS TYPE BREAKDOWN:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('👥 TEAM BREAKDOWN:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Direct collaborators: 1'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Team-based access: 2'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Dev Team: 2 access grants'));
    });
  });
});