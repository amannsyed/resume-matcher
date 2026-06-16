<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Resume Matcher

[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-purple.svg)](https://vitejs.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%26%20Firestore-orange.svg)](https://firebase.google.com/)
[![Gemini API](https://img.shields.io/badge/Google_Gemini-API-orange.svg)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An AI-powered application to analyze job descriptions and evaluate them against your resume profiles using the Gemini API.

## Features

- **Job Description Analysis**: Automatically scrape and extract job details from URLs (via Jina AI or direct scraping) or accept manual input.
- **Resume Matching**: Evaluate your resume (or multiple resume variants) against job requirements and get an instant "Fit Score" and actionable feedback using Gemini.
- **Application History Tracking**: Keep track of your applications, fit scores, UK sponsorship status, and application statuses securely in Firebase.
- **Smart Email Generator**: Draft highly professional, context-aware responses to recruiters directly within the app.
- **Blind Mode**: Strip out company names and bias-inducing details for an objective review of the job.
- **Analytics Dashboard**: Visualize your application pipeline with interactive charts powered by Recharts.
- **PDF Export**: Export application cards and reports as PDF documents.

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| [React 19](https://reactjs.org/) | UI framework |
| TypeScript 5.8 | Type safety |
| [Vite 6](https://vitejs.dev/) | Build tool & dev server |
| [Tailwind CSS v4](https://tailwindcss.com/) | Utility-first styling |
| [Google Gemini API](https://ai.google.dev/) | AI-powered resume matching & analysis |
| [Firebase](https://firebase.google.com/) | Authentication & Firestore database |
| [Recharts](https://recharts.org/) | Data visualization & analytics |
| [Lucide React](https://lucide.dev/) | Icons |
| [Framer Motion](https://www.framer.com/motion/) | Animations |
| [localforage](https://localforage.github.io/localForage/) | Client-side storage |

## Prerequisites

- **Node.js** (v18+ recommended)
- **Gemini API Key** (Can be set in the environment or via the app's Settings UI)
- **Firebase Account** (for tracking history & authentication)

## Run Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/amannsyed/resume-matcher.git
   cd resume-matcher
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env` file in the root directory and add your keys:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Access the application:**
   Open your browser and navigate to:
   **http://localhost:3001**

   *(Note: The default development port is set to 3001 to avoid Service Worker caching conflicts with other common AI tools that default to 3000, such as Open WebUI).*

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Your Google Gemini API key | Yes |

Firebase configuration is handled within `src/firebase.ts`. Update the config object with your own Firebase project credentials.

## Build for Production

To create a production-ready static build:
```bash
npm run build
```

To preview the production build locally:
```bash
npm run preview
```

## 📜 Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the production bundle to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run clean` | Remove the `dist/` directory |
| `npm run lint` | Type-check with TypeScript |
| `npm run deploy` | Build and deploy to GitHub Pages |

## Deployment

This project is configured for deployment to **GitHub Pages**.

```bash
npm run deploy
```

This builds the app and publishes the `dist/` directory to the `gh-pages` branch.

## 📁 Project Structure

```text
resume-matcher/
├── src/
│   ├── components/
│   │   └── ui.tsx             # Reusable UI component library
│   ├── App.tsx                 # Main application component
│   ├── AuthContext.tsx         # Firebase authentication context
│   ├── firebase.ts             # Firebase configuration
│   ├── main.tsx                # React DOM entry point
│   └── index.css               # Global styles and Tailwind imports
├── public/                     # Static assets
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

Built with ❤️ using React, TypeScript, Vite, Firebase, and Google Gemini AI
