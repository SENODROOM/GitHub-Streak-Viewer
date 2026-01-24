// Check for saved credentials on page load
window.addEventListener('DOMContentLoaded', () => {
    const savedUsername = localStorage.getItem('github_username');
    const savedToken = localStorage.getItem('github_token');

    if (savedUsername && savedToken) {
        document.getElementById('username').value = savedUsername;
        document.getElementById('token').value = savedToken;
        login();
    }
});

async function login() {
    const username = document.getElementById('username').value.trim();
    const token = document.getElementById('token').value.trim();
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const loginCard = document.getElementById('loginCard');
    const statsWrapper = document.getElementById('statsWrapper');

    if (!username) {
        showError('Please enter a GitHub username');
        return;
    }

    if (!token) {
        showError('Personal Access Token is required');
        return;
    }

    loading.style.display = 'block';
    error.style.display = 'none';

    try {
        const statsData = await fetchGraphQLData(username, token);

        // Save credentials to localStorage
        localStorage.setItem('github_username', username);
        localStorage.setItem('github_token', token);

        loading.style.display = 'none';
        loginCard.style.display = 'none';
        displayStats(statsData);
        statsWrapper.style.display = 'block';

    } catch (err) {
        loading.style.display = 'none';
        showError(err.message || 'Failed to fetch GitHub stats');
    }
}

function logout() {
    // Clear localStorage
    localStorage.removeItem('github_username');
    localStorage.removeItem('github_token');

    // Reset form
    document.getElementById('username').value = '';
    document.getElementById('token').value = '';

    // Hide stats and show login
    document.getElementById('statsWrapper').style.display = 'none';
    document.getElementById('loginCard').style.display = 'block';
    document.getElementById('error').style.display = 'none';
}

async function fetchGraphQLData(username, token) {
    const query = `
                query($username: String!) {
                    user(login: $username) {
                        name
                        login
                        avatarUrl
                        bio
                        followers { totalCount }
                        repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC) {
                            totalCount
                        }
                        contributionsCollection {
                            contributionCalendar {
                                totalContributions
                                weeks {
                                    contributionDays {
                                        contributionCount
                                        date
                                    }
                                }
                            }
                            totalCommitContributions
                            totalIssueContributions
                            totalPullRequestContributions
                            totalPullRequestReviewContributions
                        }
                    }
                }
            `;

    const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            'Authorization': `bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables: { username } })
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Invalid token. Please check your credentials.');
        }
        throw new Error('Failed to fetch data from GitHub');
    }

    const result = await response.json();

    if (result.errors) {
        throw new Error(result.errors[0].message || 'GraphQL query failed');
    }

    if (!result.data || !result.data.user) {
        throw new Error('User not found');
    }

    return processGraphQLData(result.data.user, token);
}

async function processGraphQLData(userData, token) {
    const contributions = userData.contributionsCollection;
    const calendar = contributions.contributionCalendar;

    const allDays = [];
    calendar.weeks.forEach(week => {
        week.contributionDays.forEach(day => {
            allDays.push({
                date: day.date,
                count: day.contributionCount
            });
        });
    });

    let currentStreak = 0;
    const today = new Date().toISOString().split('T')[0];

    for (let i = allDays.length - 1; i >= 0; i--) {
        if (allDays[i].count > 0) {
            currentStreak++;
        } else if (allDays[i].date < today) {
            break;
        }
    }

    let longestStreak = 0;
    let tempStreak = 0;

    allDays.forEach(day => {
        if (day.count > 0) {
            tempStreak++;
            longestStreak = Math.max(longestStreak, tempStreak);
        } else {
            tempStreak = 0;
        }
    });

    let privateRepoCount = 0;
    try {
        const reposQuery = `
                    query($username: String!) {
                        user(login: $username) {
                            repositories(first: 100, ownerAffiliations: OWNER, privacy: PRIVATE) {
                                totalCount
                            }
                        }
                    }
                `;

        const reposResponse = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: {
                'Authorization': `bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: reposQuery,
                variables: { username: userData.login }
            })
        });

        const reposResult = await reposResponse.json();
        if (reposResult.data?.user) {
            privateRepoCount = reposResult.data.user.repositories.totalCount;
        }
    } catch (e) {
        console.log('Could not fetch private repos');
    }

    return {
        name: userData.name || userData.login,
        login: userData.login,
        avatarUrl: userData.avatarUrl,
        bio: userData.bio,
        followers: userData.followers.totalCount,
        publicRepos: userData.repositories.totalCount,
        privateRepos: privateRepoCount,
        totalRepos: userData.repositories.totalCount + privateRepoCount,
        totalContributions: calendar.totalContributions,
        commits: contributions.totalCommitContributions,
        issues: contributions.totalIssueContributions,
        pullRequests: contributions.totalPullRequestContributions,
        reviews: contributions.totalPullRequestReviewContributions,
        currentStreak,
        longestStreak,
        contributionDays: allDays
    };
}

function displayStats(stats) {
    const userHeader = document.getElementById('userHeader');
    const statsGrid = document.getElementById('statsGrid');
    const chartGrid = document.getElementById('chartGrid');

    const repoText = stats.privateRepos > 0
        ? `📦 ${stats.totalRepos} repos (${stats.publicRepos} public, ${stats.privateRepos} private)`
        : `📦 ${stats.totalRepos} repositories`;

    userHeader.innerHTML = `
                <img src="${stats.avatarUrl}" alt="${stats.login}" class="avatar">
                <div class="user-details">
                    <h2>${stats.name}</h2>
                    <p class="username">@${stats.login}</p>
                    ${stats.bio ? `<p class="bio">${stats.bio}</p>` : ''}
                    <div class="user-meta">
                        <span>${repoText}</span>
                        <span>•</span>
                        <span>👥 ${stats.followers} followers</span>
                    </div>
                </div>
            `;

    statsGrid.innerHTML = `
                <div class="stat-card">
                    <div class="stat-value">${stats.totalContributions.toLocaleString()}</div>
                    <div class="stat-label">Total Contributions</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.commits.toLocaleString()}</div>
                    <div class="stat-label">Commits</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.currentStreak}</div>
                    <div class="stat-label">Current Streak</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.longestStreak}</div>
                    <div class="stat-label">Longest Streak</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.pullRequests.toLocaleString()}</div>
                    <div class="stat-label">Pull Requests</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.issues.toLocaleString()}</div>
                    <div class="stat-label">Issues</div>
                </div>
            `;

    chartGrid.innerHTML = stats.contributionDays.map(day => {
        let level = 0;
        if (day.count > 0) level = 1;
        if (day.count > 3) level = 2;
        if (day.count > 6) level = 3;
        if (day.count > 10) level = 4;
        return `<div class="day-square level-${level}" title="${day.date}: ${day.count} contributions"></div>`;
    }).join('');
}

function showError(message) {
    const error = document.getElementById('error');
    error.textContent = message;
    error.style.display = 'block';
}

// Enter key listeners
['username', 'token'].forEach(id => {
    document.getElementById(id).addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
});