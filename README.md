# 🔥 GitHub Streak Viewer

A beautiful, modern web application to track and visualize your GitHub contribution streaks, stats, and activity patterns. Built with vanilla JavaScript and powered by GitHub's GraphQL API for maximum accuracy.

![GitHub Streak Viewer](https://img.shields.io/badge/Status-Active-success)
![License](https://img.shields.io/badge/License-Proprietary-red)

## 🌐 Live Demo

**Try it now:** [https://github-streak-viewer.vercel.app/](https://github-streak-viewer.vercel.app/)

Experience the app live without any installation required!

## 🚀 Demo

![GitHub Streak Viewer Demo](./demo.gif)

> Instantly visualize your GitHub contribution streaks and activity using the GitHub GraphQL API.

## ✨ Features

- **Real-time GitHub Stats**: Fetch comprehensive statistics directly from GitHub's GraphQL API
- **Contribution Streaks**: Track your current and longest contribution streaks
- **Visual Calendar**: Interactive contribution calendar showing your activity over the past year
- **Private Repository Support**: View both public and private repository counts with proper authentication
- **Auto-login**: Securely saves credentials locally for convenience
- **Responsive Design**: Beautiful UI that works seamlessly across all devices
- **Dark Theme**: Eye-friendly dark mode with gradient accents

## 📊 Statistics Displayed

- Total Contributions (last year)
- Commit Count
- Current Contribution Streak
- Longest Contribution Streak
- Pull Requests Created
- Issues Opened
- Pull Request Reviews
- Repository Count (Public & Private)
- Follower Count

## 🚀 Getting Started

### Quick Start

The easiest way to use the application is to visit the live deployment:

👉 **[https://github-streak-viewer.vercel.app/](https://github-streak-viewer.vercel.app/)**

### Local Installation

If you want to run it locally:

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- A GitHub account
- A GitHub Personal Access Token

### Installation

1. Clone this repository:
```bash
git clone https://github.com/SENODROOM/GitHub-Streak-Viewer.git
cd github-streak-viewer
```

2. Open `index.html` in your web browser, or serve it using a local server:
```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (http-server)
npx http-server
```

3. Navigate to `http://localhost:8000` in your browser

## 🔑 Generating a GitHub Token

To use this application, you'll need a GitHub Personal Access Token:

1. Visit [GitHub Token Settings](https://github.com/settings/tokens/new?scopes=read:user,repo)
2. Give your token a descriptive name (e.g., "Streak Viewer")
3. Select the following scopes:
   - `read:user` - Read user profile data
   - `repo` - Access repository data (required for private repos)
4. Click "Generate token"
5. Copy the token (you won't be able to see it again!)

⚠️ **Security Note**: Your token is stored locally in your browser's localStorage. Never share your token with others.

## 💻 Usage

1. Enter your GitHub username
2. Paste your Personal Access Token
3. Click "Get My Stats"
4. View your beautiful GitHub statistics!

The application will remember your credentials for future visits. Use the "Logout" button to clear saved data.

## 🎨 Customization

The application uses CSS custom properties for easy theming. Edit `styles.css` to customize colors:

```css
:root {
    --primary: #6366f1;
    --secondary: #8b5cf6;
    --accent: #ec4899;
    --success: #10b981;
    --error: #ef4444;
    --bg-dark: #0f172a;
    --bg-card: #1e293b;
    --text-primary: #f1f5f9;
    --text-secondary: #94a3b8;
    --border: #334155;
}
```

## 🏗️ Project Structure

```
github-streak-viewer/
├── index.html          # Main HTML file
├── styles.css          # Styling and animations
├── script.js           # Program Logic
├── android-chrome-512x512.png  # Favicon
└── README.md           # This file
```

## 🔒 Privacy & Security

- All data is fetched directly from GitHub's API
- Your credentials are stored locally in your browser (localStorage)
- No data is sent to any third-party servers
- The application runs entirely client-side

## 🛠️ Technologies Used

- **HTML5** - Structure
- **CSS3** - Styling with modern features (Grid, Flexbox, Custom Properties)
- **Vanilla JavaScript** - Logic and API interactions
- **GitHub GraphQL API** - Data source

## 📝 API Rate Limits

GitHub's API has rate limits:
- **Authenticated requests**: 5,000 requests per hour
- **Unauthenticated requests**: 60 requests per hour

This application uses authenticated requests, so you should have plenty of headroom for normal usage.

## 📜 License

This project is licensed under a Proprietary License. All rights reserved.

**You may:**
- View the source code for educational purposes
- Run the application locally for personal use

**You may NOT:**
- Modify or create derivative works
- Distribute or redistribute the code
- Use for commercial purposes

See the LICENSE file for complete terms and conditions.

## 🙏 Acknowledgments

- Inspired by GitHub's native contribution graph
- Built with love for the developer community
- Special thanks to GitHub for providing the GraphQL API

## 📧 Contact

For questions or feedback, please open an issue on GitHub.

---

⭐ If you find this project useful, please consider giving it a star on GitHub!