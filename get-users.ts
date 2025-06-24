import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// Types
interface GitHubCollaborator {
  login: string;
  permissions: {
    admin: boolean;
    maintain?: boolean;
    push: boolean;
    triage?: boolean;
    pull: boolean;
  };
  type: 'User' | 'Bot';
  site_admin: boolean;
}

interface GitHubTeam {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  permission: string;
  permissions: {
    admin: boolean;
    maintain?: boolean;
    push: boolean;
    triage?: boolean;
    pull: boolean;
  };
}

interface GitHubRepository {
  name: string;
  full_name: string;
  private: boolean;
  permissions?: {
    admin: boolean;
    maintain?: boolean;
    push: boolean;
    triage?: boolean;
    pull: boolean;
  };
}

interface AccessReportRow {
  repository: string;
  member: string;
  access: string;
  access_type: string; // Now includes specific team names
  status: 'success' | 'no_access' | 'not_found' | 'error';
}

interface RepositoryStatus {
  repository: string;
  status: 'accessible' | 'no_access' | 'not_found' | 'error';
  error?: string;
  isPrivate?: boolean;
  hasAdminAccess?: boolean;
}

// Constants
const GITHUB_API_BASE = 'https://api.github.com';

// Utility functions
const validateGitHubToken = (token: string | undefined): string => {
  if (!token || token.trim().length === 0) {
    throw new Error('GitHub token is missing. Please set GITHUB_TOKEN environment variable.');
  }
  return token.trim();
};

const testGitHubToken = async (token: string): Promise<void> => {
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'GitHub-Access-Reporter',
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`GitHub token validation failed: ${response.status} ${response.statusText}. ${errorData}`);
  }

  const userData = await response.json();
  console.log(`✓ Authenticated as: ${userData.login}`);
};

const readRepositoriesList = async (filename: string): Promise<string[]> => {
  try {
    const data = await fs.readFile(filename, 'utf8');
    return data.trim().split('\n').filter(repo => repo.trim().length > 0);
  } catch (error) {
    throw new Error(`Failed to read ${filename}: ${error instanceof Error ? error.message : error}`);
  }
};

const checkRepositoryAccess = async (repo: string, token: string): Promise<RepositoryStatus> => {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'GitHub-Access-Reporter',
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (response.status === 404) {
      return {
        repository: repo,
        status: 'not_found',
        error: 'Repository not found or not accessible'
      };
    }

    if (!response.ok) {
      const errorData = await response.text();
      return {
        repository: repo,
        status: 'error',
        error: `HTTP ${response.status}: ${errorData}`
      };
    }

    const repoData: GitHubRepository = await response.json();
    return {
      repository: repo,
      status: 'accessible',
      isPrivate: repoData.private,
      hasAdminAccess: repoData.permissions?.admin || false
    };
  } catch (error) {
    return {
      repository: repo,
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const fetchCollaboratorsByAffiliation = async (
  repo: string, 
  token: string, 
  affiliation: 'direct' | 'outside' | 'all' = 'all'
): Promise<GitHubCollaborator[]> => {
  const url = new URL(`${GITHUB_API_BASE}/repos/${repo}/collaborators`);
  url.searchParams.set('affiliation', affiliation);
  
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'GitHub-Access-Reporter',
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorData}`);
  }

  return response.json();
};

const fetchRepositoryTeams = async (repo: string, token: string): Promise<GitHubTeam[]> => {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}/teams`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'GitHub-Access-Reporter',
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      // If we can't access teams, return empty array
      return [];
    }

    return response.json();
  } catch (error) {
    console.log(`    ⚠️  Could not fetch teams for ${repo}: ${error instanceof Error ? error.message : error}`);
    return [];
  }
};

const checkTeamMembership = async (teamId: number, username: string, token: string): Promise<boolean> => {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/teams/${teamId}/memberships/${username}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'GitHub-Access-Reporter',
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (response.status === 200) {
      const membership = await response.json();
      return membership.state === 'active';
    }

    return false;
  } catch (error) {
    return false;
  }
};

const determineAccessLevel = (permissions: GitHubCollaborator['permissions']): string => {
  if (permissions.admin) return 'admin';
  if (permissions.maintain) return 'maintain';
  if (permissions.push) return 'write';
  if (permissions.triage) return 'triage';
  return 'read';
};

const determineAccessType = async (
  user: GitHubCollaborator,
  directCollaborators: GitHubCollaborator[],
  allCollaborators: GitHubCollaborator[],
  teams: GitHubTeam[],
  token: string
): Promise<string> => {
  // Check if user is in direct collaborators list
  const isDirectCollaborator = directCollaborators.some(collab => collab.login === user.login);
  
  if (isDirectCollaborator) {
    return 'direct';
  }
  
  // If they're in all collaborators but not direct, check team membership
  const isInAllCollaborators = allCollaborators.some(collab => collab.login === user.login);
  
  if (isInAllCollaborators && teams.length > 0) {
    // Check which teams the user belongs to
    const userTeams: string[] = [];
    
    for (const team of teams) {
      const isMember = await checkTeamMembership(team.id, user.login, token);
      if (isMember) {
        userTeams.push(team.name);
      }
    }
    
    if (userTeams.length > 0) {
      return `team:${userTeams.join(',')}`;
    }
  }
  
  // If they have access but we can't determine the specific team, 
  // it might be through organization membership or inherited permissions
  if (isInAllCollaborators) {
    return 'organization';
  }
  
  return 'unknown';
};

const processRepository = async (repo: string, token: string): Promise<{
  rows: AccessReportRow[];
  status: RepositoryStatus;
}> => {
  // First check if we can access the repository
  const repoStatus = await checkRepositoryAccess(repo, token);
  
  if (repoStatus.status !== 'accessible') {
    return {
      rows: [{
        repository: repo,
        member: 'N/A',
        access: 'N/A',
        access_type: 'unknown',
        status: repoStatus.status as any
      }],
      status: repoStatus
    };
  }

  // If we can access the repo but don't have admin access, warn about collaborators
  if (!repoStatus.hasAdminAccess) {
    console.log(`  ⚠️  Warning: No admin access to ${repo}, collaborator list may be incomplete`);
  }

  try {
    // Fetch collaborators and teams in parallel
    const [directCollaborators, allCollaborators, teams] = await Promise.all([
      fetchCollaboratorsByAffiliation(repo, token, 'direct').catch(() => []),
      fetchCollaboratorsByAffiliation(repo, token, 'all'),
      fetchRepositoryTeams(repo, token)
    ]);

    console.log(`  Found ${allCollaborators.length} total collaborators (${directCollaborators.length} direct, ${teams.length} teams)`);

    // Process each collaborator to determine their access type
    const rows: AccessReportRow[] = [];
    
    for (const collaborator of allCollaborators) {
      const accessType = await determineAccessType(
        collaborator, 
        directCollaborators, 
        allCollaborators, 
        teams, 
        token
      );

      rows.push({
        repository: repo,
        member: collaborator.login,
        access: determineAccessLevel(collaborator.permissions),
        access_type: accessType,
        status: 'success'
      });
    }

    return { rows, status: repoStatus };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Handle specific permission errors
    if (errorMessage.includes('Resource not accessible by personal access token')) {
      return {
        rows: [{
          repository: repo,
          member: 'N/A',
          access: 'N/A',
          access_type: 'unknown',
          status: 'no_access'
        }],
        status: {
          repository: repo,
          status: 'no_access',
          error: 'Personal access token cannot access collaborators endpoint'
        }
      };
    }

    return {
      rows: [{
        repository: repo,
        member: 'N/A',
        access: 'N/A',
        access_type: 'unknown',
        status: 'error'
      }],
      status: {
        repository: repo,
        status: 'error',
        error: errorMessage
      }
    };
  }
};

const generateCsvContent = (rows: AccessReportRow[]): string => {
  const header = 'repository,member,access,access_type,status';
  const csvRows = rows.map(row => 
    `"${row.repository}","${row.member}","${row.access}","${row.access_type}","${row.status}"`
  );
  return [header, ...csvRows].join('\n');
};

const generateSummaryReport = (statuses: RepositoryStatus[], rows: AccessReportRow[]): string => {
  const summary = statuses.reduce((acc, status) => {
    acc[status.status] = (acc[status.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const accessTypeSummary = rows
    .filter(row => row.status === 'success')
    .reduce((acc, row) => {
      const accessType = row.access_type.startsWith('team:') ? 'team' : row.access_type;
      acc[accessType] = (acc[accessType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  // Get specific team breakdown
  const teamBreakdown = rows
    .filter(row => row.status === 'success' && row.access_type.startsWith('team:'))
    .reduce((acc, row) => {
      const teams = row.access_type.replace('team:', '').split(',');
      teams.forEach(team => {
        acc[team] = (acc[team] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

  const total = statuses.length;
  let report = `\n📊 SUMMARY REPORT:\n`;
  report += `Total repositories: ${total}\n`;
  report += `✅ Accessible: ${summary.accessible || 0}\n`;
  report += `🚫 No access to collaborators: ${summary.no_access || 0}\n`;
  report += `❓ Not found: ${summary.not_found || 0}\n`;
  report += `❌ Errors: ${summary.error || 0}\n`;

  if (Object.keys(accessTypeSummary).length > 0) {
    report += `\n🔐 ACCESS TYPE BREAKDOWN:\n`;
    report += `Direct collaborators: ${accessTypeSummary.direct || 0}\n`;
    report += `Team-based access: ${accessTypeSummary.team || 0}\n`;
    report += `Organization access: ${accessTypeSummary.organization || 0}\n`;
    report += `Unknown access type: ${accessTypeSummary.unknown || 0}\n`;
  }

  if (Object.keys(teamBreakdown).length > 0) {
    report += `\n👥 TEAM BREAKDOWN:\n`;
    Object.entries(teamBreakdown)
      .sort(([,a], [,b]) => b - a)
      .forEach(([team, count]) => {
        report += `  ${team}: ${count} access grants\n`;
      });
  }

  // Show problematic repositories
  const problematic = statuses.filter(s => s.status !== 'accessible');
  if (problematic.length > 0) {
    report += `\n🔍 PROBLEMATIC REPOSITORIES:\n`;
    problematic.forEach(status => {
      report += `  ${status.repository}: ${status.status} - ${status.error || 'Unknown error'}\n`;
    });
  }

  return report;
};

const writeAccessReport = async (content: string, filename: string): Promise<void> => {
  await fs.writeFile(filename, content, 'utf8');
  console.log(`Access report saved as ${filename}`);
};

// Main function
export const generateAccessReport = async (): Promise<void> => {
  try {
    // Validate and test GitHub token
    const token = validateGitHubToken(process.env.GITHUB_TOKEN);
    console.log('Validating GitHub token...');
    await testGitHubToken(token);

    // Read repositories list
    const repositories = await readRepositoriesList('repos.txt');
    console.log(`Found ${repositories.length} repositories to process`);

    // Process all repositories
    const allRows: AccessReportRow[] = [];
    const allStatuses: RepositoryStatus[] = [];
    
    for (const repo of repositories) {
      console.log(`Processing ${repo}...`);
      const { rows, status } = await processRepository(repo, token);
      allRows.push(...rows);
      allStatuses.push(status);
    }

    // Generate and write CSV report
    const csvContent = generateCsvContent(allRows);
    await writeAccessReport(csvContent, 'access-report.csv');

    // Show summary
    const summaryReport = generateSummaryReport(allStatuses, allRows);
    console.log(summaryReport);

    const successfulEntries = allRows.filter(r => r.status === 'success').length;
    console.log(`✓ Completed! Processed ${successfulEntries} collaborator entries across ${repositories.length} repositories.`);

    // Provide guidance if there were access issues
    const accessIssues = allStatuses.filter(s => s.status === 'no_access' || s.status === 'not_found').length;
    if (accessIssues > 0) {
      console.log(`\n💡 RECOMMENDATIONS:`);
      console.log(`- Ensure your token has 'repo' scope for private repositories`);
      console.log(`- For organization repositories, you may need organization membership`);
      console.log(`- Some repositories may require admin access to view collaborators and teams`);
      console.log(`- Verify repository names are correct and accessible`);
      console.log(`- Consider using an organization token for better team access visibility`);
    }

  } catch (error) {
    console.error('❌ Error generating access report:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
};

// Execute if this file is run directly
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  await generateAccessReport();
}
