import express from "express";
import { createServer as createViteServer } from "vite";
import * as cheerio from "cheerio";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for URL Scraping
  app.post("/api/fetch-jd", async (req, res) => {
    try {
      let { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL is required" });

      // Clean the URL, just in case user pasted extra text
      const urlMatch = url.match(/https?:\/\/[^\s"']+/);
      if (urlMatch) {
         url = urlMatch[0];
      }
      url = url.trim();

      let extractedText = "";

      // Strategy 1: Jina AI Reader (Bypasses JS requirements and returns clean Markdown)
      try {
        const jinaUrl = `https://r.jina.ai/${url}`;
        const jinaRes = await fetch(jinaUrl, {
          headers: {
            "Accept": "text/plain",
            "User-Agent": "Resume-Matcher-Bot/1.0"
          }
        });
        
        if (jinaRes.ok) {
          const markdown = await jinaRes.text();
          // Verify it didn't just grab a cookie consent wall
          if (markdown.length > 200 && !markdown.includes("GSK values your privacy") && !markdown.includes("Cookie Policy")) {
            extractedText = markdown;
          }
        }
      } catch (jinaErr) {
        console.warn("Jina AI reader failed, falling back...", jinaErr);
      }

      // Strategy 2: Direct Fetch with JSON-LD extraction
      if (!extractedText) {
        let response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5"
          }
        });
        
        // Secondary fallback if WAF blocks the specific Chrome User-Agent
        if (!response.ok && response.status === 400) {
           response = await fetch(url, {
              headers: {
                 "User-Agent": "curl/7.68.0",
                 "Accept": "*/*"
              }
           });
        }
        
        if (!response.ok) {
          throw new Error(`Failed to load page. Status: ${response.status}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);

        // Try extracting standard JobPosting Schema markup first (ignores UI completely)
        $('script[type="application/ld+json"]').each((_, el) => {
          try {
            const data = JSON.parse($(el).html() || "");
            
            const findJobPosting = (obj: any): any => {
              if (!obj) return null;
              if (obj["@type"] === "JobPosting") return obj;
              if (Array.isArray(obj)) {
                for (const item of obj) {
                  const found = findJobPosting(item);
                  if (found) return found;
                }
              }
              if (obj["@graph"]) return findJobPosting(obj["@graph"]);
              return null;
            };

            const jobData = findJobPosting(data);
            if (jobData && jobData.description) {
              const cleanDescription = cheerio.load(jobData.description).text().replace(/\s+/g, " ").trim();
              extractedText = (jobData.title ? jobData.title + "\n\n" : "") + cleanDescription;
            }
          } catch(e) {}
        });

        // Fallback to DOM parsing if JSON-LD failed
        if (!extractedText || extractedText.length < 150) {
          // Aggressively remove noisy elements AND cookie banners
          $("script, style, nav, footer, header, noscript, svg, button").remove();
          $("[id*='cookie'], [class*='cookie'], [id*='consent'], [class*='consent']").remove();
          
          // Look for main content zones first
          const mainContent = $("main, [role='main'], #main-content, .job-description, .description").text().replace(/\s+/g, " ").trim();
          
          if (mainContent.length > 200) {
            extractedText = mainContent;
          } else {
            extractedText = $("body").text().replace(/\s+/g, " ").trim();
          }
        }
      }
      
      if (extractedText.length < 150) {
        throw new Error("Extracted text is far too short, likely blocked by anti-bot measures. Please paste manually.");
      }
      res.json({ text: extractedText });
    } catch (error: any) {
      console.error("Scraping error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch URL. Try pasting." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
