// Global variables
let contributionChartInstance = null;
let languagePieChartInstance = null;
let currentZoomLevel = 365;
let allContributionData = [];
let userSettings = {
    chartType: 'line',
    showPrivateRepos: true,
    dateFormat: 'MMM DD, YYYY',
    exportFormat: 'json',
    theme: 'dark'
};

// Load settings and theme on page load
window.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    const savedUsername = localStorage.getItem('github_username');
    const savedToken = localStorage.getItem('github_token');
    
    if (savedUsername && savedToken) {
        document.getElementById('username').value = savedUsername;
        document.getElementById('token').value = savedToken;
        login();
    }
});

function loadSettings() {
    const saved = localStorage.getItem('github_viewer_settings');
    if (saved) {
        userSettings = { ...userSettings, ...JSON.parse(saved) };
    }
    setTheme(userSettings.theme, false);
}

function saveSettings() {
    localStorage.setItem('github_viewer_settings', JSON.stringify(userSettings));
}

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
    localStorage.removeItem('github_username');
    localStorage.removeItem('github_token');

    document.getElementById('username').value = '';
    document.getElementById('token').value = '';

    document.getElementById('statsWrapper').style.display = 'none';
    document.getElementById('loginCard').style.display = 'block';
    document.getElementById('error').style.display = 'none';
    
    closeSettings();
}

async function fetchGraphQLData(username, token) {
    const query = `
        query($username: String!) {
            user(login: $username) {
                name
                login
                avatarUrl
                bio
                createdAt
                followers { totalCount }
                following { totalCount }
                starredRepositories { totalCount }
                repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: STARGAZERS, direction: DESC}) {
                    totalCount
                    nodes {
                        name
                        description
                        stargazerCount
                        forkCount
                        url
                        primaryLanguage {
                            name
                            color
                        }
                        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                            edges {
                                size
                                node {
                                    name
                                    color
                                }
                            }
                        }
                    }
                }
                contributionsCollection {
                    contributionCalendar {
                        totalContributions
                        weeks {
                            contributionDays {
                                contributionCount
                                date
                                weekday
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
                count: day.contributionCount,
                weekday: day.weekday
            });
        });
    });

    // Calculate current streak (accurate)
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = allDays.length - 1; i >= 0; i--) {
        const dayDate = new Date(allDays[i].date);
        dayDate.setHours(0, 0, 0, 0);
        
        const daysDiff = Math.floor((today - dayDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 1 && allDays[i].count > 0) {
            currentStreak++;
        } else if (currentStreak > 0 && allDays[i].count > 0) {
            currentStreak++;
        } else if (currentStreak > 0 && allDays[i].count === 0) {
            break;
        } else if (daysDiff > 1 && currentStreak === 0) {
            break;
        }
    }

    // Calculate longest streak
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

    // Fetch private repos
    let privateRepoCount = 0;
    if (userSettings.showPrivateRepos) {
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
    }

    const languageStats = calculateLanguageStats(userData.repositories.nodes);
    const topRepos = userData.repositories.nodes.slice(0, 5);
    const activityPattern = calculateActivityPattern(allDays);
    const achievements = calculateAchievements({
        totalContributions: calendar.totalContributions,
        currentStreak,
        longestStreak,
        repos: userData.repositories.totalCount,
        stars: userData.starredRepositories.totalCount,
        followers: userData.followers.totalCount,
        commits: contributions.totalCommitContributions,
        pullRequests: contributions.totalPullRequestContributions,
        createdAt: userData.createdAt
    });

    return {
        name: userData.name || userData.login,
        login: userData.login,
        avatarUrl: userData.avatarUrl,
        bio: userData.bio,
        createdAt: userData.createdAt,
        followers: userData.followers.totalCount,
        following: userData.following.totalCount,
        stars: userData.starredRepositories.totalCount,
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
        contributionDays: allDays,
        languageStats,
        topRepos,
        activityPattern,
        achievements
    };
}

function calculateLanguageStats(repos) {
    const languageMap = {};
    let totalSize = 0;

    repos.forEach(repo => {
        if (repo.languages && repo.languages.edges) {
            repo.languages.edges.forEach(edge => {
                const lang = edge.node.name;
                const size = edge.size;
                if (!languageMap[lang]) {
                    languageMap[lang] = {
                        name: lang,
                        color: edge.node.color || '#888888',
                        size: 0
                    };
                }
                languageMap[lang].size += size;
                totalSize += size;
            });
        }
    });

    const languages = Object.values(languageMap)
        .map(lang => ({
            ...lang,
            percentage: totalSize > 0 ? ((lang.size / totalSize) * 100).toFixed(1) : 0
        }))
        .sort((a, b) => b.size - a.size)
        .slice(0, 8);

    return languages;
}

function calculateActivityPattern(allDays) {
    const dayActivity = Array(7).fill(0);
    const dayCounts = Array(7).fill(0);

    allDays.forEach(day => {
        if (day.count > 0) {
            dayActivity[day.weekday] += day.count;
            dayCounts[day.weekday]++;
        }
    });

    const avgByDay = dayActivity.map((total, idx) => 
        dayCounts[idx] > 0 ? Math.round(total / dayCounts[idx]) : 0
    );

    return {
        byDay: avgByDay,
        totalByDay: dayActivity
    };
}

function calculateAchievements(stats) {
    const achievements = [];
    const accountAge = Math.floor((new Date() - new Date(stats.createdAt)) / (1000 * 60 * 60 * 24));

    if (stats.currentStreak >= 365) achievements.push({ icon: '🔥', name: 'Year Warrior', desc: '365+ day streak' });
    else if (stats.currentStreak >= 100) achievements.push({ icon: '💯', name: 'Century Streak', desc: '100+ day streak' });
    else if (stats.currentStreak >= 30) achievements.push({ icon: '🌟', name: 'Month Master', desc: '30+ day streak' });
    else if (stats.currentStreak >= 7) achievements.push({ icon: '⚡', name: 'Week Warrior', desc: '7+ day streak' });

    if (stats.totalContributions >= 5000) achievements.push({ icon: '👑', name: 'Contribution King', desc: '5000+ contributions' });
    else if (stats.totalContributions >= 2000) achievements.push({ icon: '💎', name: 'Diamond Contributor', desc: '2000+ contributions' });
    else if (stats.totalContributions >= 1000) achievements.push({ icon: '🏆', name: 'Elite Coder', desc: '1000+ contributions' });

    if (stats.repos >= 100) achievements.push({ icon: '📚', name: 'Repository Master', desc: '100+ repositories' });
    else if (stats.repos >= 50) achievements.push({ icon: '📖', name: 'Prolific Creator', desc: '50+ repositories' });
    else if (stats.repos >= 20) achievements.push({ icon: '📝', name: 'Active Builder', desc: '20+ repositories' });

    if (stats.pullRequests >= 500) achievements.push({ icon: '🚀', name: 'PR Legend', desc: '500+ pull requests' });
    else if (stats.pullRequests >= 100) achievements.push({ icon: '🎯', name: 'PR Expert', desc: '100+ pull requests' });
    else if (stats.pullRequests >= 50) achievements.push({ icon: '🎪', name: 'PR Enthusiast', desc: '50+ pull requests' });

    if (stats.followers >= 1000) achievements.push({ icon: '🌟', name: 'GitHub Celebrity', desc: '1000+ followers' });
    else if (stats.followers >= 500) achievements.push({ icon: '⭐', name: 'Rising Star', desc: '500+ followers' });
    else if (stats.followers >= 100) achievements.push({ icon: '✨', name: 'Popular Developer', desc: '100+ followers' });

    if (stats.commits >= 2000) achievements.push({ icon: '💻', name: 'Commit Machine', desc: '2000+ commits' });
    else if (stats.commits >= 1000) achievements.push({ icon: '⌨️', name: 'Serial Committer', desc: '1000+ commits' });

    if (accountAge >= 3650) achievements.push({ icon: '🎂', name: '10 Year Veteran', desc: 'Account 10+ years old' });
    else if (accountAge >= 1825) achievements.push({ icon: '🎉', name: '5 Year Member', desc: 'Account 5+ years old' });
    else if (accountAge >= 365) achievements.push({ icon: '🎊', name: 'Annual Member', desc: 'Account 1+ year old' });

    return achievements;
}

function displayStats(stats) {
    const userHeader = document.getElementById('userHeader');
    const statsGrid = document.getElementById('statsGrid');
    const chartGrid = document.getElementById('chartGrid');

    const repoText = stats.privateRepos > 0
        ? `📦 ${stats.totalRepos} repos (${stats.publicRepos} public, ${stats.privateRepos} private)`
        : `📦 ${stats.totalRepos} repositories`;

    const accountAge = Math.floor((new Date() - new Date(stats.createdAt)) / (1000 * 60 * 60 * 24));
    const accountYears = Math.floor(accountAge / 365);
    const accountDays = accountAge % 365;
    const accountAgeText = accountYears > 0 
        ? `${accountYears} year${accountYears > 1 ? 's' : ''} ${accountDays} days`
        : `${accountDays} days`;

    userHeader.innerHTML = `
        <img src="${stats.avatarUrl}" alt="${stats.login}" class="avatar">
        <div class="user-details">
            <h2>${stats.name}</h2>
            <p class="username">@${stats.login}</p>
            ${stats.bio ? `<p class="bio">${stats.bio}</p>` : ''}
            <div class="user-meta">
                <span>👥 ${stats.followers} followers</span>
                <span>👤 ${stats.following} following</span>
                <span>${repoText}</span>
                <span>⭐ ${stats.stars} stars earned</span>
                <span>🎂 ${accountAgeText} on GitHub</span>
            </div>
        </div>
    `;

    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${stats.totalContributions.toLocaleString()}</div>
            <div class="stat-label">Total Contributions</div>
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
            <div class="stat-value">${stats.commits.toLocaleString()}</div>
            <div class="stat-label">Commits</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.pullRequests.toLocaleString()}</div>
            <div class="stat-label">Pull Requests</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.issues.toLocaleString()}</div>
            <div class="stat-label">Issues</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.reviews.toLocaleString()}</div>
            <div class="stat-label">Code Reviews</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.totalRepos}</div>
            <div class="stat-label">Repositories</div>
        </div>
    `;

    chartGrid.innerHTML = '';
    stats.contributionDays.forEach(day => {
        const square = document.createElement('div');
        square.className = 'day-square';
        square.dataset.date = day.date;
        square.dataset.count = day.count;

        if (day.count === 0) square.classList.add('level-0');
        else if (day.count <= 3) square.classList.add('level-1');
        else if (day.count <= 6) square.classList.add('level-2');
        else if (day.count <= 9) square.classList.add('level-3');
        else square.classList.add('level-4');

        chartGrid.appendChild(square);
    });

    renderContributionChart(stats.contributionDays);
    addTooltipListeners();

    displayLanguageStats(stats.languageStats);
    displayTopRepos(stats.topRepos);
    displayActivityPattern(stats.activityPattern);
    displayAchievements(stats.achievements);
    setupExportButton(stats);
    
    window.currentStats = stats;
}

function displayLanguageStats(languages) {
    const barContainer = document.getElementById('languageStats');
    const pieContainer = document.getElementById('languagePieChart');
    
    if (!languages || languages.length === 0) {
        barContainer.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No language data available</p>';
        return;
    }

    const chartHTML = languages.map(lang => `
        <div class="language-item">
            <div class="language-header">
                <span class="language-dot" style="background: ${lang.color}"></span>
                <span class="language-name">${lang.name}</span>
                <span class="language-percentage">${lang.percentage}%</span>
            </div>
            <div class="language-bar">
                <div class="language-bar-fill" style="width: ${lang.percentage}%; background: ${lang.color}"></div>
            </div>
        </div>
    `).join('');

    barContainer.innerHTML = chartHTML;
    renderLanguagePieChart(languages);
}

function renderLanguagePieChart(languages) {
    const canvas = document.getElementById('languagePieChartCanvas');
    if (!canvas) return;

    if (languagePieChartInstance) {
        languagePieChartInstance.destroy();
    }

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const textColor = currentTheme === 'dark' ? '#f1f5f9' : '#0f172a';
    const borderColor = currentTheme === 'dark' ? '#1e293b' : '#ffffff';

    languagePieChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: languages.map(l => l.name),
            datasets: [{
                data: languages.map(l => parseFloat(l.percentage)),
                backgroundColor: languages.map(l => l.color),
                borderWidth: 3,
                borderColor: borderColor,
                hoverBorderWidth: 4,
                hoverBorderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: textColor,
                        padding: 15,
                        font: {
                            size: 13,
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto'
                        },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            return data.labels.map((label, i) => ({
                                text: `${label} (${data.datasets[0].data[i]}%)`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                hidden: false,
                                index: i
                            }));
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(99, 102, 241, 0.5)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.parsed}%`;
                        }
                    }
                }
            }
        }
    });
}

function displayTopRepos(repos) {
    const container = document.getElementById('topRepos');
    if (!repos || repos.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No repositories available</p>';
        return;
    }

    const reposHTML = repos.map(repo => `
        <a href="${repo.url}" target="_blank" class="repo-card">
            <div class="repo-header">
                <h4>${repo.name}</h4>
                <div class="repo-stats">
                    <span>⭐ ${repo.stargazerCount}</span>
                    <span>🔱 ${repo.forkCount}</span>
                </div>
            </div>
            ${repo.description ? `<p class="repo-description">${repo.description}</p>` : ''}
            ${repo.primaryLanguage ? `
                <div class="repo-language">
                    <span class="language-dot" style="background: ${repo.primaryLanguage.color}"></span>
                    <span>${repo.primaryLanguage.name}</span>
                </div>
            ` : ''}
        </a>
    `).join('');

    container.innerHTML = reposHTML;
}

function displayActivityPattern(pattern) {
    const container = document.getElementById('activityHeatmap');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const maxActivity = Math.max(...pattern.byDay, 1);
    
    const heatmapHTML = pattern.byDay.map((count, idx) => {
        const percentage = maxActivity > 0 ? (count / maxActivity) * 100 : 0;
        const height = Math.max(percentage, 5);
        
        const level = count === 0 ? 0 : 
                      percentage <= 25 ? 1 : 
                      percentage <= 50 ? 2 : 
                      percentage <= 75 ? 3 : 4;
        
        return `
            <div class="activity-day">
                <div class="activity-bar-container">
                    <div class="activity-bar level-${level}" style="height: ${height}%">
                        <span class="activity-count">${count}</span>
                    </div>
                </div>
                <span class="activity-label">${days[idx]}</span>
            </div>
        `;
    }).join('');

    container.innerHTML = heatmapHTML;
}

function displayAchievements(achievements) {
    const container = document.getElementById('achievementsGrid');
    if (!achievements || achievements.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Keep contributing to unlock achievements!</p>';
        return;
    }

    const achievementsHTML = achievements.map(achievement => `
        <div class="achievement-badge">
            <div class="achievement-icon">${achievement.icon}</div>
            <div class="achievement-info">
                <div class="achievement-name">${achievement.name}</div>
                <div class="achievement-desc">${achievement.desc}</div>
            </div>
        </div>
    `).join('');

    container.innerHTML = achievementsHTML;
}

function setupExportButton(stats) {
    const exportBtn = document.getElementById('exportStats');
    exportBtn.onclick = () => {
        const format = userSettings.exportFormat || 'json';
        if (format === 'json') {
            exportStatsToJSON(stats);
        } else {
            exportStatsToCSV(stats);
        }
    };
}

function exportStatsToJSON(stats) {
    const exportData = {
        user: {
            name: stats.name,
            username: stats.login,
            bio: stats.bio,
            createdAt: stats.createdAt,
            followers: stats.followers,
            following: stats.following,
            stars: stats.stars
        },
        statistics: {
            totalContributions: stats.totalContributions,
            currentStreak: stats.currentStreak,
            longestStreak: stats.longestStreak,
            commits: stats.commits,
            pullRequests: stats.pullRequests,
            issues: stats.issues,
            reviews: stats.reviews,
            repositories: stats.totalRepos
        },
        languages: stats.languageStats,
        topRepositories: stats.topRepos.map(r => ({
            name: r.name,
            stars: r.stargazerCount,
            forks: r.forkCount,
            url: r.url
        })),
        achievements: stats.achievements,
        exportedAt: new Date().toISOString()
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    downloadFile(dataStr, `github-stats-${stats.login}-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
}

function exportStatsToCSV(stats) {
    const csv = [
        ['Metric', 'Value'],
        ['Username', stats.login],
        ['Name', stats.name],
        ['Total Contributions', stats.totalContributions],
        ['Current Streak', stats.currentStreak],
        ['Longest Streak', stats.longestStreak],
        ['Commits', stats.commits],
        ['Pull Requests', stats.pullRequests],
        ['Issues', stats.issues],
        ['Code Reviews', stats.reviews],
        ['Repositories', stats.totalRepos],
        ['Followers', stats.followers],
        ['Following', stats.following],
        ['Stars Earned', stats.stars]
    ].map(row => row.join(',')).join('\n');

    downloadFile(csv, `github-stats-${stats.login}-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function showError(message) {
    const error = document.getElementById('error');
    error.textContent = message;
    error.style.display = 'block';
}

['username', 'token'].forEach(id => {
    document.getElementById(id).addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
});

function addTooltipListeners() {
    let tooltip = document.querySelector('.contribution-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'contribution-tooltip';
        document.body.appendChild(tooltip);
    }

    const daySquares = document.querySelectorAll('.day-square');
    daySquares.forEach(square => {
        square.addEventListener('mouseenter', (e) => {
            const date = e.target.dataset.date;
            const count = e.target.dataset.count;
            const contributionText = count === '1' ? 'contribution' : 'contributions';

            tooltip.innerHTML = `<span class="count">${count} ${contributionText} on ${formatDate(date, userSettings.dateFormat)}</span>`;
            tooltip.style.display = 'block';
            updateTooltipPosition(e, tooltip);
        });

        square.addEventListener('mousemove', (e) => updateTooltipPosition(e, tooltip));
        square.addEventListener('mouseleave', () => tooltip.style.display = 'none');
    });
}

function formatDate(dateString, format = 'MMM DD, YYYY') {
    const date = new Date(dateString);
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate();
    const month = date.getMonth();
    const year = date.getFullYear();
    const suffix = [1,21,31].includes(day) ? 'st' : [2,22].includes(day) ? 'nd' : [3,23].includes(day) ? 'rd' : 'th';

    if (format === 'DD/MM/YYYY') return `${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year}`;
    if (format === 'MM/DD/YYYY') return `${(month + 1).toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
    if (format === 'YYYY-MM-DD') return `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    return `${monthsShort[month]} ${day}${suffix}, ${year}`;
}

function updateTooltipPosition(e, tooltip) {
    const tooltipWidth = tooltip.offsetWidth;
    tooltip.style.left = (e.clientX - tooltipWidth / 2) + 'px';
    tooltip.style.top = (e.clientY - 60) + 'px';
}

function renderContributionChart(contributionDays) {
    const ctx = document.getElementById('contributionChart');
    if (!ctx) return;
    
    allContributionData = contributionDays;
    if (contributionChartInstance) contributionChartInstance.destroy();

    const dataToShow = contributionDays.slice(-currentZoomLevel);
    const dailyData = dataToShow.map(day => day.count);
    const dailyLabels = dataToShow.map(day => new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const chartType = userSettings.chartType || 'line';
    const isBar = chartType === 'bar';

    contributionChartInstance = new Chart(ctx.getContext('2d'), {
        type: chartType,
        data: {
            labels: dailyLabels,
            datasets: [{
                label: 'Contributions',
                data: dailyData,
                borderColor: isBar ? undefined : 'rgba(99, 102, 241, 1)',
                backgroundColor: isBar ? 'rgba(99, 102, 241, 0.8)' : 'rgba(99, 102, 241, 0.15)',
                borderWidth: isBar ? 0 : 3,
                fill: !isBar,
                tension: isBar ? 0 : 0.4,
                pointRadius: 0,
                pointHoverRadius: isBar ? 0 : 6,
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
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(99, 102, 241, 0.5)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: (context) => new Date(dataToShow[context[0].dataIndex].date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
                        label: (context) => `${context.parsed.y} contribution${context.parsed.y !== 1 ? 's' : ''}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(51, 65, 85, 0.3)', drawBorder: false },
                    ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(51, 65, 85, 0.3)', drawBorder: false },
                    ticks: { color: '#94a3b8', precision: 0 }
                }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });

    ctx.removeEventListener('wheel', handleZoom);
    ctx.addEventListener('wheel', handleZoom);
    updateZoomInfo();

    document.getElementById('resetZoom').onclick = () => {
        currentZoomLevel = 365;
        renderContributionChart(allContributionData);
        document.getElementById('resetZoom').style.display = 'none';
    };
}

function handleZoom(event) {
    event.preventDefault();
    const zoomLevels = [7, 14, 30, 60, 90, 180, 365];
    const currentIndex = zoomLevels.indexOf(currentZoomLevel);
    
    if (event.deltaY < 0 && currentIndex > 0) {
        currentZoomLevel = zoomLevels[currentIndex - 1];
    } else if (event.deltaY > 0 && currentIndex < zoomLevels.length - 1) {
        currentZoomLevel = zoomLevels[currentIndex + 1];
    }
    
    renderContributionChart(allContributionData);
    document.getElementById('resetZoom').style.display = currentZoomLevel !== 365 ? 'inline-block' : 'none';
}

function updateZoomInfo() {
    const zoomInfo = document.getElementById('zoomInfo');
    const timeTexts = { 7: 'Last 7 Days', 14: 'Last 2 Weeks', 30: 'Last Month', 60: 'Last 2 Months', 90: 'Last 3 Months', 180: 'Last 6 Months', 365: 'Last Year' };
    zoomInfo.textContent = timeTexts[currentZoomLevel] || 'Last Year';
}

// Settings Panel
function openSettings() {
    document.getElementById('settingsPanel').classList.add('active');
    loadSettingsUI();
}

function closeSettings() {
    document.getElementById('settingsPanel').classList.remove('active');
}

function loadSettingsUI() {
    document.getElementById('chartTypeSelect').value = userSettings.chartType || 'line';
    document.getElementById('showPrivateRepos').checked = userSettings.showPrivateRepos !== false;
    document.getElementById('dateFormatSelect').value = userSettings.dateFormat || 'MMM DD, YYYY';
    document.getElementById('exportFormatSelect').value = userSettings.exportFormat || 'json';
}

function applySettings() {
    userSettings.chartType = document.getElementById('chartTypeSelect').value;
    userSettings.showPrivateRepos = document.getElementById('showPrivateRepos').checked;
    userSettings.dateFormat = document.getElementById('dateFormatSelect').value;
    userSettings.exportFormat = document.getElementById('exportFormatSelect').value;
    
    saveSettings();
    
    if (window.currentStats && allContributionData.length > 0) {
        renderContributionChart(allContributionData);
        addTooltipListeners();
    }
    
    closeSettings();
}

// Theme Toggle
function toggleTheme() {
    const newTheme = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
    setTheme(newTheme, true);
    userSettings.theme = newTheme;
    saveSettings();
}

function setTheme(theme, animate = true) {
    const root = document.documentElement;
    
    if (animate) {
        root.style.transition = 'none';
        setTimeout(() => {
            root.setAttribute('data-theme', theme);
            root.style.transition = '';
        }, 0);
    } else {
        root.setAttribute('data-theme', theme);
    }
    
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    
    setTimeout(() => {
        if (contributionChartInstance) {
            contributionChartInstance.options.scales.x.ticks.color = theme === 'dark' ? '#94a3b8' : '#475569';
            contributionChartInstance.options.scales.y.ticks.color = theme === 'dark' ? '#94a3b8' : '#475569';
            contributionChartInstance.update('none');
        }
        
        if (languagePieChartInstance && window.currentStats) {
            renderLanguagePieChart(window.currentStats.languageStats);
        }
    }, 50);
}

// ========================================
// CUSTOMIZATION FUNCTIONALITY
// ========================================

let customizationState = {
    sectionOrder: [],
    hiddenSections: [],
    initialized: false
};

let sortableInstance = null;

// Load customization state from localStorage
function loadCustomizationState() {
    const saved = localStorage.getItem('github_viewer_customization');
    if (saved) {
        try {
            customizationState = JSON.parse(saved);
        } catch (e) {
            console.error('Failed to load customization state', e);
        }
    }
}

// Save customization state to localStorage
function saveCustomizationState() {
    localStorage.setItem('github_viewer_customization', JSON.stringify(customizationState));
}

// Initialize drag and drop functionality
function initializeDragAndDrop() {
    const container = document.getElementById('customizableContainer');
    if (!container || sortableInstance) return;

    sortableInstance = new Sortable(container, {
        animation: 200,
        handle: '.drag-handle',
        ghostClass: 'dragging',
        disabled: true,
        onEnd: function(evt) {
            updateSectionOrder();
        }
    });
}

// Update section order in state
function updateSectionOrder() {
    const container = document.getElementById('customizableContainer');
    const sections = container.querySelectorAll('.draggable-section:not(.hidden-section)');
    customizationState.sectionOrder = Array.from(sections).map(s => s.dataset.sectionId);
    
    // Also include hidden sections
    const hiddenSections = container.querySelectorAll('.draggable-section.hidden-section');
    hiddenSections.forEach(section => {
        if (!customizationState.sectionOrder.includes(section.dataset.sectionId)) {
            customizationState.sectionOrder.push(section.dataset.sectionId);
        }
    });
    
    saveCustomizationState();
}

// Apply saved layout
function applySavedLayout() {
    if (!customizationState.initialized || customizationState.sectionOrder.length === 0) {
        return;
    }

    const container = document.getElementById('customizableContainer');
    const sections = {};
    
    // Collect all sections
    container.querySelectorAll('.draggable-section').forEach(section => {
        sections[section.dataset.sectionId] = section;
    });

    // Reorder based on saved state
    customizationState.sectionOrder.forEach(sectionId => {
        if (sections[sectionId]) {
            container.appendChild(sections[sectionId]);
        }
    });

    // Hide sections that should be hidden
    customizationState.hiddenSections.forEach(sectionId => {
        const section = document.querySelector(`[data-section-id="${sectionId}"]`);
        if (section) {
            section.classList.add('hidden-section');
        }
    });
}

// Enter customize mode
function enterCustomizeMode() {
    // Close settings panel
    closeSettings();
    
    // Show overlay and toolbar
    document.getElementById('customizeOverlay').style.display = 'block';
    document.body.classList.add('customize-mode');
    
    // Enable drag and drop
    if (sortableInstance) {
        sortableInstance.option('disabled', false);
    }
    
    // Initialize toggle buttons
    initializeToggleButtons();
}

// Exit customize mode
function exitCustomizeMode() {
    // Hide overlay and toolbar
    document.getElementById('customizeOverlay').style.display = 'none';
    document.body.classList.remove('customize-mode');
    
    // Disable drag and drop
    if (sortableInstance) {
        sortableInstance.option('disabled', true);
    }
    
    // Save state
    updateSectionOrder();
}

// Initialize toggle buttons
function initializeToggleButtons() {
    document.querySelectorAll('.btn-toggle-section').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            const sectionId = this.dataset.section;
            toggleSectionVisibility(sectionId);
        };
    });
}

// Toggle section visibility
function toggleSectionVisibility(sectionId) {
    const section = document.querySelector(`[data-section-id="${sectionId}"]`);
    if (!section) return;

    if (section.classList.contains('hidden-section')) {
        // Show section
        section.classList.remove('hidden-section');
        customizationState.hiddenSections = customizationState.hiddenSections.filter(id => id !== sectionId);
        showTemporaryMessage(`✅ ${section.dataset.sectionName} shown`, 'success');
    } else {
        // Hide section
        section.classList.add('hidden-section');
        if (!customizationState.hiddenSections.includes(sectionId)) {
            customizationState.hiddenSections.push(sectionId);
        }
        showTemporaryMessage(`🚫 ${section.dataset.sectionName} hidden`, 'info');
    }

    saveCustomizationState();
}

// Reset layout to default
function resetLayout() {
    if (!confirm('Reset layout to default? This will restore all sections and their original order.')) {
        return;
    }
    
    customizationState.sectionOrder = [];
    customizationState.hiddenSections = [];
    customizationState.initialized = false;
    saveCustomizationState();
    
    // Remove all hidden classes
    document.querySelectorAll('.draggable-section').forEach(section => {
        section.classList.remove('hidden-section');
    });
    
    showTemporaryMessage('✨ Layout reset to default!', 'success');
}

// Show temporary message
function showTemporaryMessage(message, type = 'info') {
    const msg = document.createElement('div');
    msg.style.cssText = `
        position: fixed;
        top: 100px;
        right: 30px;
        background: ${type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 
                      type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 
                      'rgba(99, 102, 241, 0.95)'};
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        font-weight: 600;
        max-width: 300px;
    `;
    msg.textContent = message;
    document.body.appendChild(msg);
    
    setTimeout(() => {
        msg.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => msg.remove(), 300);
    }, 2500);
}

// Add animation styles
const customizationStyles = document.createElement('style');
customizationStyles.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(customizationStyles);

// Initialize customization on login
const originalLogin = login;
login = async function() {
    await originalLogin();
    
    // Load and apply customization after stats are displayed
    setTimeout(() => {
        loadCustomizationState();
        initializeDragAndDrop();
        applySavedLayout();
        
        // Mark as initialized if first time
        if (!customizationState.initialized) {
            customizationState.initialized = true;
            updateSectionOrder();
        }
    }, 500);
};

// Load customization state on page load
loadCustomizationState();
