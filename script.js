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

    // Render the line chart
    renderContributionChart(stats.contributionDays);

    chartGrid.innerHTML = stats.contributionDays.map(day => {
        let level = 0;
        if (day.count > 0) level = 1;
        if (day.count > 3) level = 2;
        if (day.count > 6) level = 3;
        if (day.count > 10) level = 4;
        const contributionText = day.count === 1 ? 'contribution' : 'contributions';
        return `<div class="day-square level-${level}" data-date="${day.date}" data-count="${day.count}"></div>`;
    }).join('');

    // Add hover tooltip functionality
    addTooltipListeners();
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

function addTooltipListeners() {
    const tooltip = document.createElement('div');
    tooltip.className = 'contribution-tooltip';
    document.body.appendChild(tooltip);

    const daySquares = document.querySelectorAll('.day-square');

    daySquares.forEach(square => {
        square.addEventListener('mouseenter', (e) => {
            const date = e.target.dataset.date;
            const count = e.target.dataset.count;
            const contributionText = count === '1' ? 'contribution' : 'contributions';

            tooltip.innerHTML = `
                <span class="count">${count} ${contributionText} on ${formatDate(date)}.</span>
            `;
            tooltip.style.display = 'block';
            updateTooltipPosition(e, tooltip);
        });

        square.addEventListener('mousemove', (e) => {
            updateTooltipPosition(e, tooltip);
        });

        square.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    });
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const day = date.getDate();
    const suffix = day === 1 || day === 21 || day === 31 ? 'st' :
        day === 2 || day === 22 ? 'nd' :
            day === 3 || day === 23 ? 'rd' : 'th';

    return `${months[date.getMonth()]} ${day}${suffix}`;
}

function updateTooltipPosition(e, tooltip) {
    const x = e.clientX;
    const y = e.clientY;

    // Position tooltip above the cursor, centered
    const tooltipWidth = tooltip.offsetWidth;
    tooltip.style.left = (x - tooltipWidth / 2) + 'px';
    tooltip.style.top = (y - 60) + 'px';
}
let contributionChartInstance = null;

function renderContributionChart(contributionDays) {
    const ctx = document.getElementById('contributionChart').getContext('2d');

    // Destroy previous chart instance if it exists
    if (contributionChartInstance) {
        contributionChartInstance.destroy();
    }

    // Prepare daily data
    const dailyData = contributionDays.map(day => day.count);
    const dailyLabels = contributionDays.map(day => {
        const date = new Date(day.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    contributionChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dailyLabels,
            datasets: [{
                label: 'Contributions',
                data: dailyData,
                borderColor: 'rgba(99, 102, 241, 1)',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointBackgroundColor: 'rgba(99, 102, 241, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverBackgroundColor: 'rgba(139, 92, 246, 1)',
                pointHoverBorderColor: '#fff',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.5,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(99, 102, 241, 0.5)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: function (context) {
                            const index = context[0].dataIndex;
                            const date = new Date(contributionDays[index].date);
                            return date.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            });
                        },
                        label: function (context) {
                            const count = context.parsed.y;
                            return `${count} contribution${count !== 1 ? 's' : ''}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(51, 65, 85, 0.3)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(51, 65, 85, 0.3)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        precision: 0
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}