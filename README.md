<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Resume Matcher

An AI-powered application to analyze job descriptions and evaluate them against your resume profiles using the Gemini API.

## Features

- **Job Description Analysis**: Automatically scrape and extract job details from URLs (via Jina AI or direct scraping) or accept manual input.
- **Resume Matching**: Evaluate your resume (or multiple resume variants) against job requirements and get an instant "Fit Score" and actionable feedback using Gemini.
- **Application History Tracking**: Keep track of your applications, fit scores, UK sponsorship status, and application statuses securely in Firebase.
- **Smart Email Generator**: Draft highly professional, context-aware responses to recruiters directly within the app.
- **Blind Mode**: Strip out company names and bias-inducing details for an objective review of the job.

## Prerequisites

- **Node.js** (v18+ recommended)
- **Gemini API Key** (Can be set in the environment or via the app's Settings UI)
- **Firebase Account** (for tracking history & authentication)

## Run Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up Environment Variables**:
   Create a `.env` file in the root directory and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```

4. **Access the application**:
   Open your browser and navigate to:
   **http://localhost:3001**

   *(Note: The default development port is set to 3001 to avoid Service Worker caching conflicts with other common AI tools that default to 3000, such as Open WebUI).*

## Build for Production

To create a production-ready static build:
```bash
npm run build
```

You can then run the built application using:
```bash
npm start
```
