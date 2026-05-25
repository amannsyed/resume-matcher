import React, { useState, useRef, useEffect } from "react";
import localforage from "localforage";

// Backend API URL — change this to your deployed job-intelligence URL for production
const API_BASE_URL = "http://localhost:8000";

import { useAuth } from "./AuthContext";
import { db, OperationType, handleFirestoreError } from "./firebase";
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from "firebase/firestore";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
  cn,
} from "./components/ui";
import { ArrowLeft, Upload, FileText, CheckCircle, AlertCircle, XCircle, Search, RefreshCw, Briefcase, Building, History, BarChart3, Menu, X, Link as LinkIcon, Download, BookOpen, PenTool, Plus, Trash2, Wand2, Settings, Copy, Check } from "lucide-react";
import Markdown from "react-markdown";

type ParameterFit = {
  name: string;
  score: number;
  reason: string;
};

export type ApplicationStatus = 
  | "Saved" 
  | "Applied" 
  | "Interview" 
  | "Round 1" 
  | "Round 2" 
  | "Round 3" 
  | "Final Round" 
  | "Offer"
  | "Rejected"
  | "Ghosted"
  | "Withdrawn";

type FitAnalysisResult = {
  id: string;
  timestamp: string;
  companyName: string;
  jobTitle: string;
  fitScore: number;
  fitDecision: "Apply" | "Maybe Apply" | "Not Apply";
  parameters: ParameterFit[];
  companyContext: string;
  strengths: string[];
  weaknesses: string[];
  coverLetter?: string | null;
  learningPath?: string | null;
  interviewPrep?: string | null;
  ukSponsorshipStatus?: "Yes" | "No" | "Unknown" | "Not Checked";
  applicationStatus?: ApplicationStatus;
  notes?: string;
  topSkills?: { name: string; hasSkill: boolean; type?: "Hard" | "Soft" }[];
  jobDescription?: string;
  resumeText?: string;
  atsParseability?: { isParseable: boolean; issues: string[]; suggestions: string[] };
  resumeTailoring?: { originalPoint: string; suggestedPoint: string; reason: string }[];
  jdUrl?: string;
  resumeProfileName?: string;
};

type ResumeProfile = {
  id: string;
  name: string;
  text: string;
  file?: {
    mimeType: string;
    data: string;
    name: string;
  } | null;
};

export default function App() {
  const { user, signIn, signOut, loading } = useAuth();
  const handleSignIn = async () => {
    try {
      await signIn();
    } catch (error: any) {
      console.error("Sign in failed:", error);
      alert(`Sign in failed: ${error.message || error}`);
    }
  };
  const [currentView, setCurrentView] = useState<"analysis" | "history">("analysis");
  const [activeTab, setActiveTab] = useState<"overview" | "fitAnalysis" | "skillsAndAts" | "market" | "jobDescription" | "coverLetter" | "learningPath" | "interviewPrep">("overview");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [history, setHistory] = useState<FitAnalysisResult[]>([]);
  const [jobDescription, setJobDescription] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  const [resumeProfiles, setResumeProfiles] = useState<ResumeProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("default");

  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<{
    mimeType: string;
    data: string; // Base64
    name: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingExtra, setIsGeneratingExtra] = useState<"coverLetter" | "learningPath" | "interviewPrep" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FitAnalysisResult | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [checkUKSponsorship, setCheckUKSponsorship] = useState(false);
  const [isManualSponsorship, setIsManualSponsorship] = useState(false);
  const [autoSelectBestResume, setAutoSelectBestResume] = useState(false);
  const [currentApplicationStatus, setCurrentApplicationStatus] = useState<ApplicationStatus>("Saved");

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(0);
  const [tempModel, setTempModel] = useState(0);

  const MODEL_OPTIONS = [
    { name: "DeepSeek V4 Pro", tag: "Recommended" },
    { name: "DeepSeek V4 Flash", tag: "Fast" },
    { name: "GLM 5.1", tag: "" },
    { name: "GLM 5", tag: "" },
    { name: "Qwen3.6-35B-A3B", tag: "" },
    { name: "Kimi K2.6", tag: "" },
  ];

  const [editingJobTitleId, setEditingJobTitleId] = useState<string | null>(null);
  const [editingJobTitleValue, setEditingJobTitleValue] = useState("");
  const [showInputs, setShowInputs] = useState(true);

  // New states
  const [isBlindMode, setIsBlindMode] = useState(false);
  const [isEmailGeneratorOpen, setIsEmailGeneratorOpen] = useState(false);
  const [emailThread, setEmailThread] = useState("");
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);

  // History Filters
  const [historySearch, setHistorySearch] = useState("");
  const [historyMinScore, setHistoryMinScore] = useState(0);
  const [historySponsorship, setHistorySponsorship] = useState<"All" | "Yes" | "No" | "Unknown">("All");
  const [historyStatus, setHistoryStatus] = useState<"All" | ApplicationStatus>("All");
  const [historyDecision, setHistoryDecision] = useState<"All" | "Apply" | "Maybe Apply" | "Not Apply">("All");
  const [historyPage, setHistoryPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isAddManualOpen, setIsAddManualOpen] = useState(false);
  const [manualEntry, setManualEntry] = useState({
    companyName: "",
    jobTitle: "",
    fitScore: 70,
    fitDecision: "Maybe Apply" as "Apply" | "Maybe Apply" | "Not Apply",
    ukSponsorshipStatus: "Unknown" as "Yes" | "No" | "Unknown" | "Not Checked",
    applicationStatus: "Saved" as ApplicationStatus,
    jdUrl: ""
  });

  const isCancelledRef = useRef(false);

  const handleCancelAnalyze = () => {
    isCancelledRef.current = true;
    setIsLoading(false);
    setError("Analysis cancelled.");
  };

  const handleCopy = (text: string, id: string = "jd") => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredHistory = history.filter(h => {
    const matchesSearch = 
      h.companyName.toLowerCase().includes(historySearch.toLowerCase()) || 
      h.jobTitle.toLowerCase().includes(historySearch.toLowerCase());
    const matchesScore = h.fitScore >= historyMinScore;
    const matchesSponsorship = 
      historySponsorship === "All" || h.ukSponsorshipStatus === historySponsorship;
    const matchesStatus = 
      historyStatus === "All" || h.applicationStatus === historyStatus;
    const matchesDecision = 
      historyDecision === "All" || h.fitDecision === historyDecision;
    
    return matchesSearch && matchesScore && matchesSponsorship && matchesStatus && matchesDecision;
  });

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / ITEMS_PER_PAGE));
  const paginatedHistory = filteredHistory.slice((historyPage - 1) * ITEMS_PER_PAGE, historyPage * ITEMS_PER_PAGE);

  useEffect(() => {
    if (historyPage > totalPages && totalPages > 0) {
      setHistoryPage(totalPages);
    }
  }, [totalPages, historyPage]);


  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load from cache on mount
    const loadCache = async () => {
      try {
        const cachedProfiles = await localforage.getItem("resumeProfiles");
        if (cachedProfiles) {
          const profiles = cachedProfiles as ResumeProfile[];
          setResumeProfiles(profiles);
          if (profiles.length > 0) {
            setActiveProfileId(profiles[0].id);
            setResumeText(profiles[0].text);
            setResumeFile(profiles[0].file || null);
          }
        } else {
          // Legacy migration
          const cachedFile = await localforage.getItem("resumeFile");
          const cachedText = await localforage.getItem("resumeText");
          if (cachedFile || cachedText) {
            setResumeFile(cachedFile as any);
            setResumeText(cachedText as string || "");
            const defaultProfile = {
              id: "default",
              name: "My Resume",
              text: cachedText as string || "",
              file: cachedFile as any
            };
            setResumeProfiles([defaultProfile]);
            setActiveProfileId("default");
          }
        }
        const cachedHistory = await localforage.getItem("history");
        if (cachedHistory && !user) {
          setHistory(cachedHistory as FitAnalysisResult[]);
        }
        
        const cachedModel = await localforage.getItem("selectedModel");
        if (cachedModel !== null && cachedModel !== undefined) {
          setSelectedModel(cachedModel as number);
          setTempModel(cachedModel as number);
        }
      } catch (err) {
        console.error("Failed to load resume from cache", err);
      }
    };
    loadCache();
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const historyRef = collection(db, `users/${user.uid}/history`);
    const q = query(historyRef, orderBy("timestamp", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fbHistory: FitAnalysisResult[] = [];
      snapshot.forEach((doc) => {
        fbHistory.push(doc.data() as FitAnalysisResult);
      });
      setHistory(fbHistory);
      localforage.setItem("history", fbHistory);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/history`);
    });
    
    return () => unsubscribe();
  }, [user]);

  const saveProfilesToCache = async (profiles: ResumeProfile[]) => {
    setResumeProfiles(profiles);
    await localforage.setItem("resumeProfiles", profiles);
  };

  const handleSaveSettings = async () => {
    setSelectedModel(tempModel);
    await localforage.setItem("selectedModel", tempModel);
    setIsSettingsOpen(false);
  };

  const callLLM = async (messages: { role: string; content: string }[], options?: { responseFormat?: string; temperature?: number; maxTokens?: number }): Promise<string> => {
    const res = await fetch(`${API_BASE_URL}/api/llm/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        model_index: selectedModel,
        response_format: options?.responseFormat || null,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 8192,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail));
    }
    const data = await res.json();
    return data.text;
  };

  const handleFetchJD = async () => {
    if (!jdUrl.trim()) return;
    setIsFetchingUrl(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/fetch-jd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jdUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch JD");
      setJobDescription(data.text);
      
      // Attempt to auto-extract company name
      try {
        const extracted = await callLLM([
          { role: "user", content: `Extract ONLY the Company Name from this job description. Do not include any other text, quotes, or punctuation. If you cannot reliably determine the company name, reply with exactly "UNKNOWN".\n\nJob Description snippet:\n${data.text.substring(0, 3000)}` }
        ]);
        const trimmed = extracted.trim();
        if (trimmed && trimmed !== "UNKNOWN") {
          setCompanyName(trimmed);
        }
      } catch (extractErr) {
        console.error("Company extraction failed:", extractErr);
      }
    } catch (err: any) {
      console.error(err);
      setError("Extraction failed. Please paste the job description manually.");
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const autoDetectCompany = async () => {
    if (!jobDescription || isFetchingUrl) return;
    setIsFetchingUrl(true);
    try {
      const extracted = await callLLM([
        { role: "user", content: `Extract ONLY the Company Name from this job description. Do not include any other text, quotes, or punctuation. If you cannot reliably determine the company name, reply with exactly "UNKNOWN".\n\nJob Description snippet:\n${jobDescription.substring(0, 3000)}` }
      ]);
      const trimmed = extracted.trim();
      if (trimmed && trimmed !== "UNKNOWN") {
        setCompanyName(trimmed);
      } else {
        alert("Could not detect company name from the description.");
      }
    } catch (extractErr) {
      console.error("Company extraction failed:", extractErr);
      alert("Failed to auto-detect company name.");
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const updateActiveProfile = async (updates: Partial<ResumeProfile>) => {
    let currentProfiles = [...resumeProfiles];
    if (currentProfiles.length === 0) {
      currentProfiles = [{ id: "default", name: "My Resume", text: "", file: null }];
      setActiveProfileId("default");
    }
    
    // Safety check, ensure active profile exists
    if (!currentProfiles.find(p => p.id === activeProfileId)) {
      setActiveProfileId(currentProfiles[0].id);
    }
    
    const updatedProfiles = currentProfiles.map(p => 
      p.id === activeProfileId ? { ...p, ...updates } : p
    );
    
    await saveProfilesToCache(updatedProfiles);
  };

  const handleProfileChange = (profileId: string) => {
    const p = resumeProfiles.find(x => x.id === profileId);
    if (p) {
      setActiveProfileId(profileId);
      setResumeText(p.text);
      setResumeFile(p.file || null);
    }
  };

  const createNewProfile = async () => {
    const id = crypto.randomUUID();
    const newProfile: ResumeProfile = { id, name: `Resume Variant ${resumeProfiles.length + 1}`, text: "" };
    const updated = [newProfile, ...resumeProfiles];
    await saveProfilesToCache(updated);
    setActiveProfileId(id);
    setResumeText("");
    setResumeFile(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      const fileObj = {
        mimeType: file.type,
        data: base64,
        name: file.name,
      };
      setResumeFile(fileObj);
      setResumeText("");
      
      await updateActiveProfile({ file: fileObj, text: "" });
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!jobDescription.trim()) {
      setError("Job description is required.");
      return;
    }
    
    // Check if we have any valid resume data
    const hasActiveResume = Boolean(resumeText.trim() || resumeFile);
    const hasProfilesToSearch = autoSelectBestResume && resumeProfiles.some(p => p.text.trim() || p.file);

    if (!hasActiveResume && !hasProfilesToSearch) {
      setError("Please provide your resume by uploading a PDF or pasting the text.");
      return;
    }

    setIsLoading(true);
    isCancelledRef.current = false;
    setError(null);
    setResult(null);

    try {
      let targetText = resumeText;
      let targetFile = resumeFile;
      let targetProfileId = activeProfileId;

      if (autoSelectBestResume && resumeProfiles.length > 1) {
        let selectionPrompt = `You are an expert recruiter. I have ${resumeProfiles.length} resume variants. Compare them against the Job Description and select the BEST fit. Return a JSON object with 'bestProfileId' (the ID of the selected resume) and 'reason'.\n\nJob Description:\n${jobDescription.substring(0, 3000)}\n\n`;

        for (const profile of resumeProfiles) {
          selectionPrompt += `\n\n--- RESUME VARIANT [ID: ${profile.id}] (Name: ${profile.name}) ---\n`;
          selectionPrompt += profile.text.substring(0, 3000) || "(PDF uploaded — text not available)";
        }

        try {
          const selectionRaw = await callLLM(
            [{ role: "user", content: selectionPrompt }],
            { responseFormat: "json" }
          );
          if (isCancelledRef.current) return;
          
          const jsonMatch = selectionRaw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          const cleanText = jsonMatch ? jsonMatch[1].trim() : selectionRaw.trim();
          
          const selectionJson = JSON.parse(cleanText);
          if (selectionJson.bestProfileId) {
            const bestProfile = resumeProfiles.find(p => p.id === selectionJson.bestProfileId);
            if (bestProfile) {
              targetText = bestProfile.text;
              targetFile = bestProfile.file || null;
              targetProfileId = bestProfile.id;
              
              // Ensure UI reflects the chosen variant and we update its text/ID
              setActiveProfileId(bestProfile.id);
              setResumeText(bestProfile.text);
              setResumeFile(bestProfile.file || null);
            }
          }
        } catch (e) {
          console.error("Auto-select failed, falling back to active resume", e);
        }
      }

      const resumeContent = targetText || "(PDF uploaded — please paste the resume text for best results)";

      const systemPrompt = `You are an expert technical recruiter and career coach. You MUST respond with ONLY valid JSON matching this exact schema — no markdown, no explanation, no code fences, just the raw JSON object:

{
  "fitScore": <integer 0-100>,
  "fitDecision": "<exactly 'Apply', 'Maybe Apply', or 'Not Apply'>",
  "parameters": [
    { "name": "<string>", "score": <integer 0-10>, "reason": "<string>" }
  ],
  "companyContext": "<markdown string about company culture, salary range, growth opportunities>",
  "strengths": ["<string>", ...],
  "weaknesses": ["<string>", ...],
  "ukSponsorshipStatus": "<exactly 'Yes', 'No', or 'Unknown'>",
  "extractedJobTitle": "<string>",
  "topSkills": [
    { "name": "<string>", "hasSkill": <boolean>, "type": "<'Hard' or 'Soft'>" }
  ],
  "atsParseability": {
    "isParseable": <boolean>,
    "issues": ["<string>", ...],
    "suggestions": ["<string>", ...]
  },
  "resumeTailoring": [
    { "originalPoint": "<string>", "suggestedPoint": "<string>", "reason": "<string>" }
  ]
}

Requirements:
- Evaluate the fit based on exactly 10 parameters (Technical Skills, Experience Level, Education, Culture Fit, Industry Knowledge, Tooling, Problem Solving, Soft Skills, Leadership, Communication, or other relevant ones based on the JD).
- Extract the top 10 most critical skills for this role and note whether the candidate has each skill.
- Analyze the resume for ATS compliance.
- Suggest 3-5 rewritten bullet points that better align with the JD terminology.
${isBlindMode ? "\nCRITICAL BLIND MODE: Analyze purely on skills and experience. Ignore all demographic details (name, location, graduation years, identifying markers). Focus 100% on skill alignment." : ""}`;

      const userPrompt = `Company Name: ${companyName || "Extract from JD if possible"}

Job Description:
${jobDescription}

Resume:
${resumeContent}`;

      const fetchVisaStatus = async (): Promise<{ status: string, reason: string } | null> => {
        if (!checkUKSponsorship || isManualSponsorship || !companyName.trim()) return null;
        try {
          const res = await fetch(`${API_BASE_URL}/api/check-visa`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ company_name: companyName, country: "UK" })
          });
          if (!res.ok) throw new Error("Failed to check visa");
          const data = await res.json();
          return { status: data.sponsors_visa, reason: data.reason };
        } catch (e) {
          console.error("Visa check failed", e);
          return null;
        }
      };

      const fetchMarketIntel = async (): Promise<string | null> => {
        if (!companyName.trim()) return null;
        try {
          // Attempt to extract Job Title early for better searching
          let tempJobTitle = jobDescription.split("\n")[0].slice(0, 50) || "Job Role";
          
          const res = await fetch(`${API_BASE_URL}/api/market-intel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ company_name: companyName, job_title: tempJobTitle })
          });
          if (!res.ok) throw new Error("Failed to fetch market intel");
          const data = await res.json();
          return data.market_intel;
        } catch (e) {
          console.error("Market Intel fetch failed", e);
          return null;
        }
      };

      const [rawText, visaData, liveMarketIntel] = await Promise.all([
        callLLM(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          { responseFormat: "json", maxTokens: 16384 }
        ),
        fetchVisaStatus(),
        fetchMarketIntel()
      ]);
      if (isCancelledRef.current) return;

      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const cleanText = jsonMatch ? jsonMatch[1].trim() : rawText.trim();

      if (cleanText) {
        const rawJson = JSON.parse(cleanText);
        
        let finalSponsorship = isManualSponsorship ? "Yes" : (checkUKSponsorship ? "Unknown" : "Not Checked");
        let contextAddition = "";
        
        if (visaData) {
           finalSponsorship = visaData.status;
           contextAddition = `\n\n---\n**Live Visa Sponsorship Check:** ${visaData.status} - ${visaData.reason}`;
        } else if (rawJson.ukSponsorshipStatus && !isManualSponsorship && checkUKSponsorship) {
           finalSponsorship = rawJson.ukSponsorshipStatus;
        }

        // Use the live market intel if available, otherwise fall back to what the LLM generated.
        const baseCompanyContext = liveMarketIntel ? `**Live Market Intelligence:**\n\n${liveMarketIntel}` : rawJson.companyContext;

        const newResult: FitAnalysisResult = {
          ...rawJson,
          companyContext: baseCompanyContext,
          id: crypto.randomUUID(),
          userId: user?.uid,
          timestamp: new Date().toISOString(),
          companyName: companyName || "Unknown Company",
          jobTitle: rawJson.extractedJobTitle || jobDescription.split("\n")[0].slice(0, 50) || "Job Role",
          jobDescription,
          resumeText: targetText,
          jdUrl: jdUrl || undefined,
          ukSponsorshipStatus: finalSponsorship as any,
          applicationStatus: currentApplicationStatus,
          resumeProfileName: resumeProfiles.find(p => p.id === targetProfileId)?.name || "Unknown Profile",
        };
        
        if (contextAddition) {
           newResult.companyContext = newResult.companyContext + contextAddition;
        }
        
        setResult(newResult);
        setShowInputs(false);
        
        // Update history
        const newHistory = [newResult, ...history];
        setHistory(newHistory);
        await localforage.setItem("history", newHistory);
        
        // Save to DB
        if (user) {
          try {
            await setDoc(doc(db, `users/${user.uid}/history`, newResult.id), newResult);
          } catch (dbErr: any) {
            handleFirestoreError(dbErr, OperationType.CREATE, `users/${user.uid}/history/${newResult.id}`);
          }
        }

        setActiveTab("overview");
      } else {
        throw new Error("No response received from the model.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during analysis.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateEmail = async () => {
    if (!emailThread.trim()) return;
    setIsGeneratingEmail(true);
    setGeneratedEmail("");
    try {
      const ctxDate = new Date().toISOString();
      const prompt = `You are a professional, confident, and highly emotionally intelligent job candidate. 
You need to write a reply email to a recruiter/hiring manager based on the provided email chain context.

Today's date/time is: ${ctxDate}

STRICT HUMAN AND PROFESSIONAL RULES:
1. Research/Show you know the company: If applicable, subtly demonstrate you understand the role's problems or the company's recent news.
2. If following up after an interview, assume it must be sent within 24 hours.
3. Quantify achievements if mentioning past work.
4. If asked about salary, state it clearly and confidently without apology.
5. Make the interviewer/recruiter feel smart and respected.
6. Always close by asking specifically about the next steps or providing clear availability.
7. Treat all parties (including coordinators/receptionists) with equal respect.
8. NEVER badmouth a previous employer.
9. If you are following up after 7 days of silence, assume "silence is not rejection" and be polite, reiterating interest.
10. The goal is to make the decision to hire you feel EASY for them. Keep it concise, natural, and highly human.

Draft the reply email. Provide ONLY the email text (including subject if needed), no extra commentary.

Email Chain Context:
${emailThread}`;

      const responseText = await callLLM([
        { role: "user", content: prompt },
      ]);

      if (responseText) {
        setGeneratedEmail(responseText);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to generate email.");
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  const handleGenerateExtra = async (type: "coverLetter" | "learningPath" | "interviewPrep") => {
    if (!result) return;
    setIsGeneratingExtra(type);
    
    try {
      let prompt = "";
      if (type === "coverLetter") {
        prompt = `You are an expert career coach. Based on the following Fit Analysis Report, job description, and resume, write a highly tailored, professional Cover Letter bridging the candidate's specific experience to the job's needs. Also, provide a short bulleted list of suggested resume tweaks (Resume Tailoring Actions) at the end. Use markdown format.`;
      } else if (type === "learningPath") {
        prompt = `You are an expert career coach and technical mentor. Based on the following Fit Analysis Report, the candidate is missing some skills compared to the JD. Create a 'Learning Path' bridging these gaps. Include specific topic areas to learn, suggested project ideas, and an estimated timeline (e.g. Weekend sprint vs 1 month). Use markdown format.`;
      } else if (type === "interviewPrep") {
        prompt = `You are an expert technical interviewer and career coach. Based on the provided Fit Analysis Report, Job Description, and Candidate Resume, generate the top most likely interview questions the candidate will face. 
Specifically, generate the most likely STAR-method (Situation, Task, Action, Result) behavioral questions they will be asked based on their exact weaknesses, along with suggested talking points using their resume history.
For each question, provide 1-2 bullet points with concise hints or talking points specific to the candidate's actual experience on how to answer it. Format as Markdown. Group them by categories like Technical, Behavioural (STAR-focused), Experience-focused, etc.`;
      }

      const ctx = `
Job Role: ${result.jobTitle}
Company: ${result.companyName}

Fit Analysis Summary:
Score: ${result.fitScore}/100
Strengths: ${result.strengths.join(", ")}
Weaknesses: ${result.weaknesses.join(", ")}

Target Job Description:
${jobDescription.substring(0, 1500)} // Truncated for length

Candidate Resume Summary:
${resumeText ? resumeText.substring(0, 1500) : "Review based on above strengths/weaknesses"}
`;

      const responseText = await callLLM([
        { role: "user", content: `${prompt}\n\n${ctx}` },
      ]);

      if (responseText) {
        const updatedResult = { ...result, [type]: responseText };
        setResult(updatedResult);
        
        const updatedHistory = history.map(h => h.id === result.id ? updatedResult : h);
        setHistory(updatedHistory);
        await localforage.setItem("history", updatedHistory);
        
        // Save to DB
        if (user) {
          try {
            await updateDoc(doc(db, `users/${user.uid}/history`, result.id), updatedResult);
          } catch (dbErr: any) {
            handleFirestoreError(dbErr, OperationType.UPDATE, `users/${user.uid}/history/${result.id}`);
          }
        }

        setActiveTab(type);
      }
    } catch (err) {
      console.error(err);
      alert(`Failed to generate ${type === 'coverLetter' ? 'Cover Letter' : 'Learning Path'}. Check console for details.`);
    } finally {
      setIsGeneratingExtra(null);
    }
  };

  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    setDeleteConfirmId(id);
  };

  const handleUpdateHistoryItem = async (id: string, updates: Partial<FitAnalysisResult>) => {
    const updatedHistory = history.map(h => {
      if (h.id === id) {
        const updated = { ...h, ...updates };
        // If updating the active result, update that too
        if (result?.id === id) setResult(updated);
        return updated;
      }
      return h;
    });
    setHistory(updatedHistory);
    await localforage.setItem("history", updatedHistory);
    
    // Save to DB
    if (user) {
      try {
        await updateDoc(doc(db, `users/${user.uid}/history`, id), updates);
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.UPDATE, `users/${user.uid}/history/${id}`);
      }
    }
  };

  const handleAddManualHistory = async () => {
    if (!user) return;
    if (!manualEntry.companyName || !manualEntry.jobTitle) {
      alert("Company Name and Job Title are required.");
      return;
    }

    const newItem: FitAnalysisResult = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      companyName: manualEntry.companyName,
      jobTitle: manualEntry.jobTitle,
      fitScore: manualEntry.fitScore,
      fitDecision: manualEntry.fitDecision,
      parameters: [],
      companyContext: "Manually added record",
      strengths: [],
      weaknesses: [],
      applicationStatus: manualEntry.applicationStatus,
      ukSponsorshipStatus: manualEntry.ukSponsorshipStatus,
      jdUrl: manualEntry.jdUrl,
      jobDescription: "Manually added record",
      resumeText: "Manually added record",
      resumeProfileName: "Manual Entry",
    };

    try {
      const newHistory = [newItem, ...history];
      setHistory(newHistory);
      await localforage.setItem("history", newHistory);
      
      const docRef = doc(db, `users/${user.uid}/history`, newItem.id);
      await setDoc(docRef, newItem);
      
      setIsAddManualOpen(false);
      setManualEntry({
        companyName: "",
        jobTitle: "",
        fitScore: 70,
        fitDecision: "Maybe Apply",
        ukSponsorshipStatus: "Unknown",
        applicationStatus: "Saved",
        jdUrl: ""
      });
    } catch (error) {
      console.error("Error adding manual entry:", error);
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/history/${newItem.id}`);
    }
  };

  const confirmDeleteHistory = async () => {
    if (!deleteConfirmId) return;
    const newHistory = history.filter(h => h.id !== deleteConfirmId);
    setHistory(newHistory);
    await localforage.setItem("history", newHistory);
    
    // Delete from DB
    if (user) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/history`, deleteConfirmId));
      } catch (dbErr: any) {
        handleFirestoreError(dbErr, OperationType.DELETE, `users/${user.uid}/history/${deleteConfirmId}`);
      }
    }

    if (result?.id === deleteConfirmId) {
      setResult(null); // Clear active result if it was exactly this one
    }
    setDeleteConfirmId(null);
  };

  const cancelDeleteHistory = () => {
    setDeleteConfirmId(null);
  };

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case "Apply":
        return "bg-[#D4AF37]/10 border-[#D4AF37]/30 text-white";
      case "Maybe Apply":
        return "bg-white/5 border-white/20 text-white/80";
      case "Not Apply":
        return "bg-[#FF4444]/10 border-[#FF4444]/30 text-[#FF4444]";
      default:
        return "bg-[#111] border-white/5 text-white/50";
    }
  };

  const getDecisionIcon = (decision: string) => {
    switch (decision) {
      case "Apply":
        return <CheckCircle className="w-5 h-5 mr-3 text-[#D4AF37]" />;
      case "Maybe Apply":
        return <AlertCircle className="w-5 h-5 mr-3 text-white/60" />;
      case "Not Apply":
        return <XCircle className="w-5 h-5 mr-3 text-[#FF4444]" />;
      default:
        return null;
    }
  };

  if (!user && !loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#E5E5E5] flex flex-col justify-center items-center font-sans">
        <div className="max-w-md w-full space-y-8 p-6 text-center border border-white/10 rounded bg-[#111]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-tr from-[#D4AF37] to-[#8E6E17] rounded-sm flex items-center justify-center font-serif font-bold text-black text-3xl">R</div>
            <h1 className="text-3xl font-serif italic text-white tracking-tight">Resume Matcher</h1>
            <p className="mt-2 text-sm text-white/50">
              Welcome. Please sign in to securely store your job analysis history in the cloud.
            </p>
          </div>
          <Button 
            onClick={handleSignIn}
            className="w-full bg-[#D4AF37] text-black hover:bg-[#8E6E17] font-bold uppercase tracking-widest text-xs"
          >
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E5E5E5] flex flex-col font-sans">
      <nav className="border-b border-white/10 px-4 md:px-8 py-4 flex justify-between items-center bg-[#0F0F0F] sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-tr from-[#D4AF37] to-[#8E6E17] rounded-sm flex items-center justify-center font-serif font-bold text-black text-xl">R</div>
          <span className="font-serif text-xl tracking-wide uppercase text-white">Resume <span className="font-light opacity-50 text-sm">Matcher</span></span>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex gap-6 items-center text-[10px] uppercase tracking-widest text-white/60 font-medium">
          <button 
            onClick={() => {
              setResult(null);
              setJobDescription("");
              setCompanyName("");
              setJdUrl("");
              setShowInputs(true);
              setCurrentView("analysis");
            }}
            className="pb-1 transition-colors hover:text-white flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Analyze New Role
          </button>
          <button 
            onClick={() => setCurrentView("analysis")}
            className={cn("pb-1 transition-colors hover:text-white", currentView === "analysis" && "text-[#D4AF37] border-b border-[#D4AF37]")}
          >
            Analysis
          </button>
          <button 
            onClick={() => setCurrentView("history")}
            className={cn("pb-1 transition-colors hover:text-white", currentView === "history" && "text-[#D4AF37] border-b border-[#D4AF37]")}
          >
            Historical Data
          </button>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="pb-1 transition-colors hover:text-white"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button 
            onClick={signOut}
            className="pb-1 transition-colors hover:text-[#FF4444]"
            title="Sign Out"
          >
            Sign Out
          </button>
        </div>

        {/* Mobile Nav Trigger */}
        <button 
          className="md:hidden text-white/60"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[65px] bg-[#0A0A0A] z-[49] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex flex-col p-6 space-y-4">
            <button 
              onClick={() => { 
                setResult(null);
                setJobDescription("");
                setCompanyName("");
                setJdUrl("");
                setShowInputs(true);
                setCurrentView("analysis");
                setIsMobileMenuOpen(false); 
              }}
              className="p-4 text-left border rounded-sm tracking-widest uppercase text-xs font-bold border-white/10 text-white/60 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Analyze New Role
            </button>
            <button 
              onClick={() => { setCurrentView("analysis"); setIsMobileMenuOpen(false); }}
              className={cn("p-4 text-left border rounded-sm tracking-widest uppercase text-xs font-bold", currentView === "analysis" ? "bg-[#D4AF37]/10 border-[#D4AF37]/40 text-[#D4AF37]" : "border-white/10 text-white/60")}
            >
              Analysis
            </button>
            <button 
              onClick={() => { setCurrentView("history"); setIsMobileMenuOpen(false); }}
              className={cn("p-4 text-left border rounded-sm tracking-widest uppercase text-xs font-bold", currentView === "history" ? "bg-[#D4AF37]/10 border-[#D4AF37]/40 text-[#D4AF37]" : "border-white/10 text-white/60")}
            >
              Historical Data
            </button>
            <button 
              onClick={() => { setIsSettingsOpen(true); setIsMobileMenuOpen(false); }}
              className="p-4 text-left border rounded-sm tracking-widest uppercase text-xs font-bold border-white/10 text-white/60 flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full min-w-0 p-4 md:p-6 lg:p-8 space-y-8">
        {currentView === "analysis" ? (
          <React.Fragment>
            <header className="mb-8">
              <h1 className="text-3xl font-serif italic text-white">Strategic Alignment Matrix</h1>
              <p className="mt-2 text-sm text-white/50 max-w-2xl">
                Upload your resume and the job description. Our AI will analyze your fit, break down your strengths, and search the web for real-world company context to help you decide your next move.
              </p>
            </header>

            <div className={cn("grid grid-cols-1 gap-8", (!showInputs && result) ? "lg:max-w-5xl lg:mx-auto" : "lg:grid-cols-2")}>
          {/* LEFT: Inputs */}
          <div className={cn("space-y-6 flex flex-col h-full", (!showInputs && result) && "hidden")}>
            <Card className="flex-1 bg-[#111] border-none shadow-none ring-1 ring-white/5">
              <CardHeader className="border-white/5">
                <CardTitle className="inline-flex items-center gap-2 text-[#D4AF37]">
                  <Briefcase className="w-4 h-4 opacity-80" />
                  Target Role
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <Label htmlFor="companyName">Company Name (Optional)</Label>
                    {jobDescription.trim() && (
                      <button 
                        type="button"
                        onClick={autoDetectCompany}
                        disabled={isFetchingUrl}
                        className="text-[10px] text-[#D4AF37] hover:bg-[#D4AF37]/10 px-2 flex items-center gap-1 rounded uppercase tracking-widest font-bold transition-colors disabled:opacity-50"
                      >
                        {isFetchingUrl ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                        Auto-Detect
                      </button>
                    )}
                  </div>
                  <Input
                    id="companyName"
                    placeholder="e.g. Google, Acme Corp..."
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                  <div className="flex items-start gap-2 pt-2 pb-1">
                    <input 
                      type="checkbox" 
                      id="blindMode"
                      className="mt-1 accent-[#D4AF37] w-3 h-3 bg-white/5 border-white/20 rounded-sm"
                      checked={isBlindMode}
                      onChange={(e) => setIsBlindMode(e.target.checked)}
                    />
                    <div>
                      <Label htmlFor="blindMode" className="cursor-pointer text-[11px] font-bold tracking-wide">
                        "Blind" Mode (Bias Reduction)
                      </Label>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">
                        AI ignores demographic details for a purely objective skill analysis
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 pt-2 pb-1">
                    <input 
                      type="checkbox" 
                      id="ukSponsorship"
                      className="mt-1 accent-[#D4AF37] w-3 h-3 bg-white/5 border-white/20 rounded-sm disabled:opacity-50"
                      checked={checkUKSponsorship}
                      disabled={isManualSponsorship}
                      onChange={(e) => setCheckUKSponsorship(e.target.checked)}
                    />
                    <div>
                      <Label htmlFor="ukSponsorship" className={cn("cursor-pointer text-[11px] font-bold tracking-wide", isManualSponsorship && "opacity-50")}>
                        Check for UK Sponsorship Eligibility
                      </Label>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">
                        AI will perform a live web search to verify sponsor status (May increase analysis time)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 pt-2 pb-1">
                    <input 
                      type="checkbox" 
                      id="manualSponsorship"
                      className="mt-1 accent-[#D4AF37] w-3 h-3 bg-white/5 border-white/20 rounded-sm"
                      checked={isManualSponsorship}
                      onChange={(e) => {
                        setIsManualSponsorship(e.target.checked);
                        if (e.target.checked) setCheckUKSponsorship(false);
                      }}
                    />
                    <div>
                      <Label htmlFor="manualSponsorship" className="cursor-pointer text-[11px] font-bold tracking-wide">
                        Visa Sponsorship Already Verified
                      </Label>
                      <p className="text-[10px] text-[#D4AF37] uppercase tracking-widest mt-1 font-bold">
                        Bypasses AI web search and marks as "Sponsored"
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">
                    Provides better web search context
                  </p>
                </div>

                <div className="flex items-start gap-2 pt-2 pb-1 border-t border-white/5 mt-4">
                  <input 
                    type="checkbox" 
                    id="autoSelectResume"
                    className="mt-1 accent-[#D4AF37] w-3 h-3 bg-white/5 border-white/20 rounded-sm disabled:opacity-50"
                    checked={autoSelectBestResume}
                    disabled={resumeProfiles.length <= 1}
                    onChange={(e) => setAutoSelectBestResume(e.target.checked)}
                  />
                  <div>
                    <Label htmlFor="autoSelectResume" className={cn("cursor-pointer text-[11px] font-bold tracking-wide", resumeProfiles.length <= 1 && "opacity-50")}>
                      Auto-Select Best Resume Variant
                    </Label>
                    <p className="text-[10px] text-[#D4AF37] uppercase tracking-widest mt-1 font-bold">
                      Compare all profiles and evaluate using the best match
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pb-2">
                  <Label htmlFor="currentStatus" className="text-[10px] uppercase font-bold tracking-widest text-white/50">Initial Application Status</Label>
                  <select 
                    id="currentStatus"
                    value={currentApplicationStatus}
                    onChange={(e) => setCurrentApplicationStatus(e.target.value as ApplicationStatus)}
                    className="w-full h-9 px-3 text-sm bg-[#0A0A0A] border border-white/10 text-white rounded-md focus:outline-none focus:border-[#D4AF37]"
                  >
                    <option value="Saved">Saved</option>
                    <option value="Applied">Applied</option>
                    <option value="Interview">Interview</option>
                    <option value="Round 1">Round 1</option>
                    <option value="Round 2">Round 2</option>
                    <option value="Round 3">Round 3</option>
                    <option value="Final Round">Final Round</option>
                    <option value="Offer">Offer</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Ghosted">Ghosted</option>
                    <option value="Withdrawn">Withdrawn</option>
                  </select>
                </div>

                <div className="space-y-2 flex-1 flex flex-col">
                  <div className="flex justify-between items-end">
                    <Label htmlFor="jd">Job Description *</Label>
                    {jobDescription && (
                      <button 
                        onClick={() => handleCopy(jobDescription)}
                        className="text-[10px] text-white/40 hover:text-[#D4AF37] flex items-center gap-1 transition-colors"
                      >
                        {copiedId === "jd" ? (
                          <React.Fragment>
                            <Check className="w-3 h-3 text-green-400" />
                            <span className="text-green-400">Copied!</span>
                          </React.Fragment>
                        ) : (
                          <React.Fragment>
                            <Copy className="w-3 h-3" />
                            <span>Copy Text</span>
                          </React.Fragment>
                        )}
                      </button>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Paste a JD Link (e.g. greenhouse.io/...)" 
                      value={jdUrl} 
                      onChange={(e) => setJdUrl(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={handleFetchJD} disabled={isFetchingUrl || !jdUrl.trim()} variant="outline" className="shrink-0 border-white/20 text-[#D4AF37] hover:bg-[#D4AF37]/10">
                      {isFetchingUrl ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                    </Button>
                  </div>

                  <div className="flex items-center gap-4 py-1">
                    <span className="text-white/10 flex-1 border-b border-white/10"></span>
                    <span className="text-white/30 text-[9px] font-bold uppercase tracking-[0.2em]">or paste text directly</span>
                    <span className="text-white/10 flex-1 border-b border-white/10"></span>
                  </div>

                  <Textarea
                    id="jd"
                    className="flex-1 min-h-[160px] resize-y"
                    placeholder="Paste the full job description here..."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="flex-1 bg-[#111] border-none shadow-none ring-1 ring-white/5">
              <CardHeader className="border-white/5 flex flex-row items-center justify-between pb-3">
                <CardTitle className="inline-flex items-center gap-2 text-[#D4AF37]">
                  <FileText className="w-4 h-4 opacity-80" />
                  Your Resume
                </CardTitle>
                
                {resumeProfiles.length > 0 && (
                  <div className="flex items-center gap-2">
                    <select 
                      className="bg-[#1A1A1A] text-white/80 border border-white/10 rounded-sm text-xs px-2 py-1 outline-none"
                      value={activeProfileId}
                      onChange={(e) => handleProfileChange(e.target.value)}
                    >
                      {resumeProfiles.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button onClick={createNewProfile} className="p-1 hover:bg-white/10 rounded-sm text-white/50 transition-colors" title="New Profile">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4 flex flex-col h-full">
                {resumeProfiles.length > 0 && (
                  <div className="space-y-2 pb-2">
                     <Input 
                       className="text-xs h-8 bg-transparent border-white/5 border-b focus:border-[#D4AF37]/50 rounded-none px-0 shadow-none border-t-0 border-l-0 border-r-0"
                       value={resumeProfiles.find(p => p.id === activeProfileId)?.name || ""}
                       onChange={(e) => {
                         const updated = resumeProfiles.map(p => p.id === activeProfileId ? { ...p, name: e.target.value } : p);
                         updateActiveProfile({ name: e.target.value });
                       }}
                       placeholder="Profile Name"
                     />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Upload PDF Resume</Label>
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-dashed border-white/20 hover:border-white/40 text-white/70"
                    >
                      <Upload className="w-4 h-4 mr-2 opacity-70" />
                      {resumeFile ? "Change PDF" : "Choose PDF"}
                    </Button>
                    <input
                      title="Upload Resume PDF optionally"
                      type="file"
                      accept="application/pdf"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                  {resumeFile && (
                    <div className="flex justify-between items-center bg-[#D4AF37]/10 text-[#D4AF37] px-3 py-2 rounded-sm border border-[#D4AF37]/20 text-xs mt-2">
                      <span className="truncate">{resumeFile.name}</span>
                      <button
                        title="Remove attached resume file"
                        className="text-[#D4AF37] hover:text-[#FF4444] transition-colors"
                        onClick={async () => {
                          setResumeFile(null);
                          await updateActiveProfile({ file: null });
                        }}
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 py-2">
                  <span className="text-white/10 flex-1 border-b border-white/10"></span>
                  <span className="text-white/30 text-[10px] font-bold uppercase tracking-[0.2em]">or paste text</span>
                  <span className="text-white/10 flex-1 border-b border-white/10"></span>
                </div>

                <div className="space-y-2 flex-1 flex flex-col">
                  <Textarea
                    className="flex-1 min-h-[120px] resize-y"
                    placeholder="Paste your resume text here..."
                    value={resumeText}
                    onChange={(e) => {
                      setResumeText(e.target.value);
                      if (e.target.value) {
                        setResumeFile(null);
                      }
                    }}
                    onBlur={async () => {
                      await updateActiveProfile({ text: resumeText, file: resumeFile });
                    }}
                    disabled={!!resumeFile}
                  />
                </div>
              </CardContent>
            </Card>

            {isLoading ? (
              <Button
                size="lg"
                className="w-full shadow-lg transition-all flex items-center justify-between px-6 bg-white/5 hover:bg-white/10"
                onClick={handleCancelAnalyze}
                variant="outline"
              >
                <div className="flex items-center text-white/70">
                  <RefreshCw className="w-4 h-4 mr-3 animate-spin" />
                  Analyzing Fit & Researching Role...
                </div>
                <div className="flex items-center text-red-400 font-bold uppercase tracking-widest text-xs">
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </div>
              </Button>
            ) : (
              <Button
                size="lg"
                className="w-full shadow-lg hover:shadow-[#D4AF37]/20 transition-all bg-white text-black hover:bg-[#D4AF37] hover:text-black"
                onClick={handleAnalyze}
              >
                <Search className="w-4 h-4 mr-3 opacity-70" />
                Execute Analysis
              </Button>
            )}

            {error && (
              <div className="p-4 bg-[#FF4444]/10 text-[#FF4444] border border-[#FF4444]/20 rounded-sm text-xs flex items-start gap-3 uppercase tracking-widest leading-relaxed font-bold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* RIGHT: Results */}
          <div className="h-full">
            {result ? (
              <div id="report-container" className="space-y-6 flex flex-col h-full animate-in fade-in slide-in-from-bottom-8 duration-700">
                
                <div className="mb-2">
                  <h2 className="text-2xl font-serif text-white">{result.jobTitle}</h2>
                  <p className="text-sm text-white/50">{result.companyName || "Unknown Company"}</p>
                  {result.jdUrl && (
                    <a href={result.jdUrl} target="_blank" rel="noreferrer" className="text-sm text-[#D4AF37] hover:underline mt-1 inline-block">
                      View Job Description Original Post
                    </a>
                  )}
                </div>

                {/* Tabs Navigation */}
                <div className="flex justify-between items-center border-b border-white/10 print:hidden">
                  <div className="flex overflow-x-auto custom-scrollbar hide-scrollbar gap-2 pb-2">
                    <button
                      onClick={() => setActiveTab("overview")}
                      className={cn("px-4 py-2 text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 rounded-t-sm", activeTab === "overview" ? "border-[#D4AF37] text-[#D4AF37] bg-white/5" : "border-transparent text-white/50 hover:text-white hover:bg-white/5")}
                    >
                      Overview
                    </button>
                    <button
                      onClick={() => setActiveTab("fitAnalysis")}
                      className={cn("px-4 py-2 text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 rounded-t-sm", activeTab === "fitAnalysis" ? "border-[#D4AF37] text-[#D4AF37] bg-white/5" : "border-transparent text-white/50 hover:text-white hover:bg-white/5")}
                    >
                      Fit Analysis
                    </button>
                    <button
                      onClick={() => setActiveTab("skillsAndAts")}
                      className={cn("px-4 py-2 text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 rounded-t-sm", activeTab === "skillsAndAts" ? "border-[#D4AF37] text-[#D4AF37] bg-white/5" : "border-transparent text-white/50 hover:text-white hover:bg-white/5")}
                    >
                      Skills & ATS
                    </button>
                    <button
                      onClick={() => setActiveTab("jobDescription")}
                      className={cn("px-4 py-2 text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 rounded-t-sm", activeTab === "jobDescription" ? "border-[#D4AF37] text-[#D4AF37] bg-white/5" : "border-transparent text-white/50 hover:text-white hover:bg-white/5")}
                    >
                      Job Description
                    </button>
                    <button
                      onClick={() => setActiveTab("market")}
                      className={cn("px-4 py-2 text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 rounded-t-sm", activeTab === "market" ? "border-[#D4AF37] text-[#D4AF37] bg-white/5" : "border-transparent text-white/50 hover:text-white hover:bg-white/5")}
                    >
                      Market Intel
                    </button>
                    {(result.coverLetter || isGeneratingExtra === "coverLetter") && (
                      <button
                        onClick={() => setActiveTab("coverLetter")}
                        className={cn("px-4 py-2 text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 rounded-t-sm", activeTab === "coverLetter" ? "border-[#D4AF37] text-[#D4AF37] bg-white/5" : "border-transparent text-white/50 hover:text-white hover:bg-white/5")}
                      >
                        Cover Letter
                      </button>
                    )}
                    {(result.learningPath || isGeneratingExtra === "learningPath") && (
                      <button
                        onClick={() => setActiveTab("learningPath")}
                        className={cn("px-4 py-2 text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 rounded-t-sm", activeTab === "learningPath" ? "border-[#D4AF37] text-[#D4AF37] bg-white/5" : "border-transparent text-white/50 hover:text-white hover:bg-white/5")}
                      >
                        Learning Path
                      </button>
                    )}
                    {(result.interviewPrep || isGeneratingExtra === "interviewPrep") && (
                      <button
                        onClick={() => setActiveTab("interviewPrep")}
                        className={cn("px-4 py-2 text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 rounded-t-sm", activeTab === "interviewPrep" ? "border-[#D4AF37] text-[#D4AF37] bg-white/5" : "border-transparent text-white/50 hover:text-white hover:bg-white/5")}
                      >
                        Interview Prep
                      </button>
                    )}
                  </div>
                  {result.jobDescription && (
                    <div className="pb-1 flex items-center gap-2">
                      {!showInputs && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowInputs(true)}
                          className="h-8 text-xs bg-transparent border-white/20 text-white/70 hover:bg-white/5 hover:text-white"
                        >
                          <PenTool className="w-3 h-3 mr-2" />
                          Edit Inputs
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAnalyze}
                        disabled={isLoading}
                        className="h-8 text-xs bg-transparent border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37]/10"
                      >
                        {isLoading ? <RefreshCw className="w-3 h-3 mr-2 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-2" />}
                        Regenerate
                      </Button>
                    </div>
                  )}
                </div>

                {activeTab === "overview" && (
                  <div className="space-y-6 animate-in fade-in">
                    {/* Score & Decision Header */}
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch">
                      <Card className="flex-1 bg-[#D4AF37]/10 border-[#D4AF37]/30">
                        <CardContent className="flex flex-col items-center justify-center p-6 text-center h-full">
                          <div className="text-[10px] text-[#D4AF37] uppercase tracking-[0.2em] mb-2 font-bold">Overall Match</div>
                          <div className="text-6xl font-black font-serif italic text-white flex items-baseline">
                            {result.fitScore}
                            <span className="text-2xl text-white/40 not-italic font-sans ml-1">/100</span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className={cn("flex-1", getDecisionColor(result.fitDecision))}>
                        <CardContent className="flex flex-col items-center justify-center p-6 text-center h-full">
                          <div className="text-[10px] uppercase tracking-[0.2em] mb-3 opacity-80 font-bold">Recommendation</div>
                          <div className="text-2xl font-serif italic flex items-center tracking-wide">
                            {getDecisionIcon(result.fitDecision)}
                            {result.fitDecision}
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="flex-1 bg-white/5 border-white/10">
                        <CardContent className="flex flex-col items-center justify-center p-6 text-center h-full">
                          <div className="text-[10px] text-white/50 uppercase tracking-[0.2em] mb-2 font-bold flex items-center justify-center gap-1">
                            Resume Variant
                          </div>
                          <div className="text-sm font-medium text-white/80 whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]">
                            {result.resumeProfileName || "Unknown Profile"}
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="flex-1 bg-white/5 border-white/10">
                        <CardContent className="flex flex-col items-center justify-center p-6 text-center h-full">
                          <div className="text-[10px] text-white/50 uppercase tracking-[0.2em] mb-2 font-bold flex items-center justify-center gap-1">
                            UK Sponsorship
                          </div>
                          <select 
                            value={result.ukSponsorshipStatus || "Not Checked"}
                            onChange={(e) => handleUpdateHistoryItem(result.id, { ukSponsorshipStatus: e.target.value as any })}
                            className={cn(
                              "bg-transparent text-xl font-serif italic text-center outline-none cursor-pointer hover:opacity-80 transition-opacity",
                              result.ukSponsorshipStatus === "Yes" ? "text-green-400" :
                              result.ukSponsorshipStatus === "No" ? "text-red-400" : "text-white/70"
                            )}
                          >
                            <option value="Yes" className="bg-[#0A0A0A] text-green-400 text-sm py-2">Yes</option>
                            <option value="No" className="bg-[#0A0A0A] text-red-400 text-sm py-2">No</option>
                            <option value="Unknown" className="bg-[#0A0A0A] text-white/70 text-sm py-2">Unknown</option>
                            <option value="Not Checked" className="bg-[#0A0A0A] text-white/50 text-sm py-2">Not Checked</option>
                          </select>
                        </CardContent>
                      </Card>

                      <Card className="flex-1 bg-white/5 border-white/10">
                        <CardContent className="flex flex-col items-center justify-center p-6 text-center h-full">
                          <div className="text-[10px] text-white/50 uppercase tracking-[0.2em] mb-2 font-bold flex items-center justify-center gap-1">
                            Application Status
                          </div>
                          <select 
                            value={result.applicationStatus || "Saved"}
                            onChange={(e) => handleUpdateHistoryItem(result.id, { applicationStatus: e.target.value as ApplicationStatus })}
                            className="bg-transparent text-xl font-serif italic text-white text-center outline-none cursor-pointer focus:text-[#D4AF37] transition-colors"
                          >
                            <option value="Saved" className="bg-[#0A0A0A] text-sm py-2">Saved</option>
                            <option value="Applied" className="bg-[#0A0A0A] text-sm py-2">Applied</option>
                            <option value="Interview" className="bg-[#0A0A0A] text-sm py-2">Interview</option>
                            <option value="Round 1" className="bg-[#0A0A0A] text-sm py-2">Round 1</option>
                            <option value="Round 2" className="bg-[#0A0A0A] text-sm py-2">Round 2</option>
                            <option value="Round 3" className="bg-[#0A0A0A] text-sm py-2">Round 3</option>
                            <option value="Final Round" className="bg-[#0A0A0A] text-sm py-2">Final Round</option>
                            <option value="Offer" className="bg-[#0A0A0A] text-sm py-2">Offer</option>
                            <option value="Rejected" className="bg-[#0A0A0A] text-sm py-2">Rejected</option>
                            <option value="Ghosted" className="bg-[#0A0A0A] text-sm py-2">Ghosted</option>
                            <option value="Withdrawn" className="bg-[#0A0A0A] text-sm py-2">Withdrawn</option>
                          </select>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <Card className="bg-[#111] border-white/5 ring-1 ring-[#D4AF37]/20 shadow-none">
                        <CardHeader className="pb-3 border-b border-white/5">
                          <CardTitle className="text-[#D4AF37] flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" /> Strengths
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                          <ul className="space-y-3">
                            {result.strengths.map((str, i) => (
                              <li key={i} className="text-xs text-white/70 flex items-start gap-3 leading-relaxed">
                               <span className="text-[#D4AF37] mt-0.5 opacity-80 text-[10px]">■</span>
                               <span>{str}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                      <Card className="bg-[#111] border-white/5 ring-1 ring-[#FF4444]/20 shadow-none">
                        <CardHeader className="pb-3 border-b border-white/5">
                          <CardTitle className="text-[#FF4444] flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" /> Areas for Improvement
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                          <ul className="space-y-3">
                            {result.weaknesses.map((wk, i) => (
                              <li key={i} className="text-xs text-white/70 flex items-start gap-3 leading-relaxed">
                                <span className="text-[#FF4444] mt-0.5 opacity-80 text-[10px]">■</span>
                                <span>{wk}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Candidate Notes */}
                    <Card className="bg-[#111] border-white/5 ring-1 ring-white/5 shadow-none mt-4 mb-4">
                      <CardHeader className="pb-3 border-b border-white/5">
                        <CardTitle className="flex items-center gap-2">
                          <PenTool className="w-4 h-4 text-white/50" /> Personal Notes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <Textarea
                          placeholder="Add your interview prep notes, contact names, or application thoughts here..."
                          value={result.notes || ""}
                          onChange={(e) => handleUpdateHistoryItem(result.id, { notes: e.target.value })}
                          className="min-h-[120px] bg-[#0A0A0A] border-white/10 focus:border-[#D4AF37] text-white resize-y"
                        />
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Job Description Tab */}
                {activeTab === "jobDescription" && (
                  <div className="space-y-6 animate-in fade-in">
                    <Card className="bg-[#111] border-white/5 ring-1 ring-white/5 shadow-none mt-4">
                      <CardHeader className="border-b border-white/5 pb-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle>Job Description Original Text</CardTitle>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleCopy(result.jobDescription, "result-jd")}
                          className="h-8 px-2 text-white/50 hover:text-[#D4AF37] hover:bg-white/5"
                        >
                          {copiedId === "result-jd" ? (
                            <Check className="w-4 h-4 text-green-400 mr-1.5" />
                          ) : (
                            <Copy className="w-4 h-4 mr-1.5" />
                          )}
                          <span className="text-xs uppercase tracking-widest font-bold">
                            {copiedId === "result-jd" ? "Copied" : "Copy"}
                          </span>
                        </Button>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="prose prose-sm prose-invert max-w-none">
                          <Markdown>{result.jobDescription}</Markdown>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {activeTab === "fitAnalysis" && (
                  <div className="space-y-6 animate-in fade-in">
                    {/* Graph / Chart */}
                    <Card className="bg-[#111] border-white/5 ring-1 ring-white/5 shadow-none">
                      <CardHeader className="border-b border-white/5 pb-4">
                        <CardTitle>Fit Breakdown</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                          {result.parameters.map((param, i) => (
                            <div key={i} className="space-y-1.5 flex flex-col justify-center">
                              <div className="flex justify-between text-xs font-medium uppercase tracking-wider">
                                <span className="text-white/70">{param.name}</span>
                                <span className={cn(
                                  param.score >= 8 ? "text-[#D4AF37]" :
                                  param.score >= 5 ? "text-white/60" :
                                  "text-[#FF4444]"
                                )}>{param.score}/10</span>
                              </div>
                              <div className="h-1.5 w-full bg-black rounded-full overflow-hidden border border-white/5 relative">
                                <div 
                                  className={cn(
                                    "absolute top-0 left-0 h-full rounded-full transition-all duration-1000",
                                    param.score >= 8 ? "bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.4)]" :
                                    param.score >= 5 ? "bg-white/40" :
                                    "bg-[#FF4444]"
                                  )}
                                  style={{ width: `${(param.score / 10) * 100}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Parameter Details */}
                    <Card className="bg-[#111] border-white/5 ring-1 ring-white/5 shadow-none">
                      <CardHeader className="border-b border-white/5 pb-4">
                        <CardTitle>Parameter Analysis</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                          {result.parameters.map((param, i) => (
                            <div key={i} className="flex gap-4 items-start p-3 bg-white/5 hover:bg-white/10 rounded-sm transition-colors border border-white/5">
                              <div className={cn(
                                "flex items-center justify-center w-10 h-10 rounded-sm font-bold text-xs shrink-0 bg-black/50 border",
                                param.score >= 8 ? "text-[#D4AF37] border-[#D4AF37]/30" :
                                param.score >= 5 ? "text-white/70 border-white/20" :
                                "text-[#FF4444] border-[#FF4444]/30"
                              )}>
                                {param.score}
                              </div>
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <h4 className="font-semibold text-[13px] text-white tracking-wide">{param.name}</h4>
                                </div>
                                <p className="text-xs text-white/50 leading-relaxed font-light">{param.reason}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {activeTab === "skillsAndAts" && (
                  <div className="space-y-6 animate-in fade-in">
                    {result.topSkills && result.topSkills.length > 0 && (
                      <Card className="bg-[#111] border-white/5 ring-1 ring-white/5 shadow-none mt-4">
                        <CardHeader className="border-b border-white/5 pb-4 flex flex-row items-center justify-between">
                          <CardTitle>ATS Keyword Matcher</CardTitle>
                          <div className="text-[10px] text-white/50 uppercase tracking-widest font-bold">
                            Candidate has {result.topSkills.filter(s => s.hasSkill).length} / {result.topSkills.length}
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                          <div className="flex gap-4 mb-2 text-xs">
                            <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-[#D4AF37]" /> Found</span>
                            <span className="flex items-center gap-1.5"><XCircle className="w-3 h-3 text-white/40" /> Missing</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {result.topSkills.map((skill, i) => (
                              <span 
                                key={i} 
                                className={cn(
                                  "px-3 py-1.5 rounded-sm text-xs border flex items-center gap-2",
                                  skill.hasSkill 
                                    ? "bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30" 
                                    : "bg-white/5 text-white/40 border-white/10"
                                )}
                              >
                                {skill.hasSkill ? <CheckCircle className="w-3 h-3 opacity-70" /> : <XCircle className="w-3 h-3 opacity-50" />}
                                <span className={skill.hasSkill ? "text-white/90" : "text-white/60 line-through decoration-white/30"}>{skill.name}</span>
                                {skill.type && (
                                  <span className="text-[9px] uppercase tracking-wider opacity-60 bg-black/50 px-1 py-0.5 rounded leading-none">{skill.type}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {result.atsParseability && (
                      <Card className="bg-[#111] border-white/5 ring-1 ring-white/5 shadow-none mt-4">
                        <CardHeader className="border-b border-white/5 pb-4">
                          <CardTitle className="flex items-center gap-2">
                            {result.atsParseability.isParseable ? <CheckCircle className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-[#FF4444]" />}
                            Formatting & ATS Parseability
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {result.atsParseability.issues.length > 0 && (
                            <div>
                              <h4 className="text-xs font-bold text-[#FF4444] uppercase tracking-widest mb-2 border-b border-[#FF4444]/20 pb-1">Potential Issues</h4>
                              <ul className="space-y-1.5">
                                {result.atsParseability.issues.map((issue, i) => (
                                  <li key={i} className="text-xs text-white/60 flex gap-2"><span className="text-[#FF4444] mt-0.5">•</span> {issue}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {result.atsParseability.suggestions.length > 0 && (
                            <div>
                              <h4 className="text-xs font-bold text-[#D4AF37] uppercase tracking-widest mb-2 border-b border-[#D4AF37]/20 pb-1">Fix Suggestions</h4>
                              <ul className="space-y-1.5">
                                {result.atsParseability.suggestions.map((suggestion, i) => (
                                  <li key={i} className="text-xs text-white/60 flex gap-2"><span className="text-[#D4AF37] mt-0.5">•</span> {suggestion}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {result.atsParseability.issues.length === 0 && result.atsParseability.isParseable && (
                            <p className="text-xs text-white/60 col-span-2">Looks good! No major ATS parsing issues detected.</p>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {result.resumeTailoring && result.resumeTailoring.length > 0 && (
                       <Card className="bg-[#111] border-white/5 ring-1 ring-white/5 shadow-none mt-4">
                       <CardHeader className="border-b border-white/5 pb-4">
                         <CardTitle>Resume Rewriter / Tailoring Suggestions</CardTitle>
                       </CardHeader>
                       <CardContent className="pt-4">
                         <div className="space-y-4">
                           {result.resumeTailoring.map((item, i) => (
                             <div key={i} className="p-3 bg-white/5 border border-white/10 rounded-sm space-y-2">
                               <div>
                                 <span className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">Original Bullet</span>
                                 <p className="text-xs text-white/70 italic">"{item.originalPoint}"</p>
                               </div>
                               <div className="pl-3 border-l-2 border-[#D4AF37]">
                                 <span className="text-[10px] uppercase tracking-wider text-[#D4AF37] block mb-1">Tailored for Job</span>
                                 <p className="text-sm font-medium text-white">"{item.suggestedPoint}"</p>
                                 <p className="text-[11px] text-white/50 mt-1.5"><strong>Why:</strong> {item.reason}</p>
                               </div>
                             </div>
                           ))}
                         </div>
                       </CardContent>
                     </Card>
                    )}
                  </div>
                )}

                {activeTab === "market" && (
                  <div className="space-y-6 animate-in fade-in">
                    {/* Company & Role Insights (Web Search Results) */}
                    <Card className="bg-[#0D0D0D] border-l-2 border-l-[#D4AF37] border-y-white/5 border-r-white/5 ring-0 rounded-none h-full print:border-none">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-[#D4AF37] text-xs">
                          <Building className="w-4 h-4" />
                          Market Intelligence
                        </CardTitle>
                        <p className="text-[9px] text-white/30 tracking-[0.2em] uppercase mt-1">Live web context</p>
                      </CardHeader>
                      <CardContent>
                        <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-p:text-white/70 prose-a:text-[#D4AF37] hover:prose-a:text-[#b0902c] prose-headings:text-white prose-strong:text-white">
                          <Markdown>{result.companyContext}</Markdown>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {activeTab === "coverLetter" && (
                  <div className="space-y-6 animate-in fade-in">
                    {result.coverLetter ? (
                      <Card className="bg-[#111] border-white/5 ring-1 ring-white/5 shadow-none print:break-inside-avoid shadow-inner">
                        <CardHeader className="border-b border-white/5 pb-4">
                          <CardTitle className="flex items-center gap-2 text-white/90">
                            <PenTool className="w-4 h-4 text-[#D4AF37]" />
                            Tailoring Strategy & Cover Letter
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-p:text-white/70 prose-a:text-[#D4AF37] hover:prose-a:text-[#b0902c] prose-headings:text-white prose-strong:text-white">
                            <Markdown>{result.coverLetter}</Markdown>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-12 text-center rounded-sm border border-dashed border-white/10 bg-white/[0.02] h-full">
                         <RefreshCw className="w-8 h-8 text-[#D4AF37] animate-spin mb-4" />
                         <p className="text-sm text-white/70 mb-2">Drafting your cover letter & tailoring notes...</p>
                         <p className="text-xs text-white/40">This takes just a few seconds.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "learningPath" && (
                  <div className="space-y-6 animate-in fade-in">
                    {result.learningPath ? (
                      <Card className="bg-[#111] border-white/5 ring-1 ring-white/5 shadow-none print:break-inside-avoid">
                        <CardHeader className="border-b border-white/5 pb-4">
                          <CardTitle className="flex items-center gap-2 text-white/90">
                            <BookOpen className="w-4 h-4 text-[#D4AF37]" />
                            Upskilling Learning Path
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-p:text-white/70 prose-a:text-[#D4AF37] hover:prose-a:text-[#b0902c] prose-headings:text-white prose-strong:text-white">
                            <Markdown>{result.learningPath}</Markdown>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-12 text-center rounded-sm border border-dashed border-white/10 bg-white/[0.02] h-full">
                         <RefreshCw className="w-8 h-8 text-[#D4AF37] animate-spin mb-4" />
                         <p className="text-sm text-white/70 mb-2">Analyzing skill gaps and generating learning path...</p>
                         <p className="text-xs text-white/40">This takes just a few seconds.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "interviewPrep" && (
                  <div className="space-y-6 animate-in fade-in">
                    {result.interviewPrep ? (
                      <Card className="bg-[#111] border-white/5 ring-1 ring-white/5 shadow-none print:break-inside-avoid shadow-inner">
                        <CardHeader className="border-b border-white/5 pb-4">
                          <CardTitle className="flex items-center gap-2 text-white/90">
                            <Search className="w-4 h-4 text-[#D4AF37]" />
                            Interview Preparation (Top 30 Questions)
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-p:text-white/70 prose-a:text-[#D4AF37] hover:prose-a:text-[#b0902c] prose-headings:text-white prose-strong:text-white">
                            <Markdown>{result.interviewPrep}</Markdown>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-12 text-center rounded-sm border border-dashed border-white/10 bg-white/[0.02] h-full">
                         <RefreshCw className="w-8 h-8 text-[#D4AF37] animate-spin mb-4" />
                         <p className="text-sm text-white/70 mb-2">Anticipating interview questions based on your resume...</p>
                         <p className="text-xs text-white/40">This takes just a few seconds.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Print and Actions row (hide when printing) */}
                <div className="flex flex-wrap gap-4 pt-4 border-t border-white/10 print:hidden">
                  <Button 
                    variant="outline" 
                    className="flex-1 border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37]/10"
                    onClick={() => handleGenerateExtra("coverLetter")}
                    disabled={isGeneratingExtra !== null}
                  >
                    {isGeneratingExtra === "coverLetter" ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <PenTool className="w-4 h-4 mr-2" />}
                    Write Cover Letter
                  </Button>
                  <Button 
                    variant="outline"
                    className="flex-1 border-white/20 text-white/70 hover:bg-white/5"
                    onClick={() => setIsEmailGeneratorOpen(true)}
                  >
                    <PenTool className="w-4 h-4 mr-2" />
                    Reply to Email
                  </Button>
                  <Button 
                    variant="outline"
                    className="flex-1 border-white/20 text-white/70 hover:bg-white/5"
                    onClick={() => handleGenerateExtra("learningPath")}
                    disabled={isGeneratingExtra !== null}
                  >
                    {isGeneratingExtra === "learningPath" ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <BookOpen className="w-4 h-4 mr-2" />}
                    Learning Path
                  </Button>
                  <Button 
                    variant="outline"
                    className="flex-1 border-white/20 text-white/70 hover:bg-white/5"
                    onClick={() => handleGenerateExtra("interviewPrep")}
                    disabled={isGeneratingExtra !== null}
                  >
                    {isGeneratingExtra === "interviewPrep" ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                    Interview Prep
                  </Button>
                  <Button 
                    variant="outline"
                    className="w-full md:w-auto border-white/20 text-white/70 hover:bg-white/5"
                    onClick={() => {
                      Promise.all([
                        import('html-to-image'),
                        import('jspdf')
                      ]).then(([htmlToImage, jsPDF]) => {
                        const element = document.getElementById('report-container');
                        if (!element) return;
                        
                        htmlToImage.toCanvas(element, { backgroundColor: '#0A0A0A', pixelRatio: 2 })
                          .then((canvas) => {
                            const imgData = canvas.toDataURL('image/jpeg', 0.98);
                            const pdf = new jsPDF.jsPDF({
                              orientation: 'portrait',
                              unit: 'in',
                              format: 'letter'
                            });
                            
                            const margin = 0.5;
                            const imgWidth = pdf.internal.pageSize.getWidth() - margin * 2;
                            const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
                            const imgHeight = (canvas.height * imgWidth) / canvas.width;
                            
                            let heightLeft = imgHeight;
                            let position = margin;
                            
                            pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
                            heightLeft -= pageHeight;
                            
                            while (heightLeft > 0) {
                              position -= pageHeight;
                              pdf.addPage();
                              pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
                              heightLeft -= pageHeight;
                            }
                            
                            pdf.save(`${result.jobTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.pdf`);
                          })
                          .catch((err) => {
                            console.error('Error generating PDF:', err);
                            alert('An error occurred while generating the PDF. Please try again.');
                          });
                      });
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center rounded-sm border border-dashed border-white/10 bg-white/[0.02]">
                <div className="w-14 h-14 bg-white/5 text-white/30 rounded-sm flex items-center justify-center mb-6 ring-1 ring-white/10 shadow-lg">
                  <Search className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-serif italic text-white mb-2">Awaiting Parameters</h3>
                <p className="text-xs text-white/40 max-w-xs leading-relaxed uppercase tracking-widest">
                  Input target role details and source resume to initiate analysis
                </p>
              </div>
            )}
          </div>
        </div>
      </React.Fragment>
    ) : (
          <div className="animate-in fade-in duration-700">
            <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-serif italic text-white uppercase tracking-tighter">Historical Data</h1>
                <p className="mt-2 text-sm text-white/50">Your past analysis reports, stored locally for your review.</p>
              </div>
              <Button 
                onClick={() => setIsAddManualOpen(true)}
                className="bg-[#D4AF37] hover:bg-[#B8962E] text-black font-bold uppercase tracking-widest text-xs h-9"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Manual Role
              </Button>
            </header>

            {isAddManualOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                <Card className="w-full max-w-lg bg-[#111] border-white/10 ring-1 ring-white/10 shadow-2xl overflow-hidden">
                  <CardHeader className="border-b border-white/5 pb-4 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-serif italic text-white">Manual History Entry</CardTitle>
                      <p className="text-xs text-white/40 uppercase tracking-widest mt-1">Add a role without AI analysis</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setIsAddManualOpen(false)} className="text-white/40 hover:text-white">
                      <X className="w-5 h-5" />
                    </Button>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="manual-company" className="text-[10px] uppercase font-bold tracking-widest text-white/50">Company Name *</Label>
                        <Input 
                          id="manual-company"
                          placeholder="e.g. Google"
                          value={manualEntry.companyName}
                          onChange={(e) => setManualEntry(prev => ({ ...prev, companyName: e.target.value }))}
                          className="h-9 bg-[#0A0A0A] border-white/10 text-white text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="manual-title" className="text-[10px] uppercase font-bold tracking-widest text-white/50">Job Title *</Label>
                        <Input 
                          id="manual-title"
                          placeholder="e.g. Senior Software Engineer"
                          value={manualEntry.jobTitle}
                          onChange={(e) => setManualEntry(prev => ({ ...prev, jobTitle: e.target.value }))}
                          className="h-9 bg-[#0A0A0A] border-white/10 text-white text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold tracking-widest text-white/50">Fit Match Score: {manualEntry.fitScore}%</Label>
                        <input 
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={manualEntry.fitScore}
                          onChange={(e) => setManualEntry(prev => ({ ...prev, fitScore: parseInt(e.target.value) }))}
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D4AF37] mt-3"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold tracking-widest text-white/50">Match Decision</Label>
                        <select 
                          value={manualEntry.fitDecision}
                          onChange={(e) => setManualEntry(prev => ({ ...prev, fitDecision: e.target.value as any }))}
                          className="w-full h-9 px-3 text-sm bg-[#0A0A0A] border border-white/10 text-white rounded-md focus:outline-none focus:border-[#D4AF37]"
                        >
                          <option value="Apply">Apply</option>
                          <option value="Maybe Apply">Maybe Apply</option>
                          <option value="Not Apply">Not Apply</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold tracking-widest text-white/50">UK Visa Sponsorship</Label>
                        <select 
                          value={manualEntry.ukSponsorshipStatus}
                          onChange={(e) => setManualEntry(prev => ({ ...prev, ukSponsorshipStatus: e.target.value as any }))}
                          className="w-full h-9 px-3 text-sm bg-[#0A0A0A] border border-white/10 text-white rounded-md focus:outline-none focus:border-[#D4AF37]"
                        >
                          <option value="Yes">Sponsored (Yes)</option>
                          <option value="No">Not Sponsored (No)</option>
                          <option value="Unknown">Unknown</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold tracking-widest text-white/50">Application Status</Label>
                        <select 
                          value={manualEntry.applicationStatus}
                          onChange={(e) => setManualEntry(prev => ({ ...prev, applicationStatus: e.target.value as any }))}
                          className="w-full h-9 px-3 text-sm bg-[#0A0A0A] border border-white/10 text-white rounded-md focus:outline-none focus:border-[#D4AF37]"
                        >
                          <option value="Saved">Saved</option>
                          <option value="Applied">Applied</option>
                          <option value="Interview">Interview</option>
                          <option value="Round 1">Round 1</option>
                          <option value="Round 2">Round 2</option>
                          <option value="Round 3">Round 3</option>
                          <option value="Final Round">Final Round</option>
                          <option value="Offer">Offer</option>
                          <option value="Rejected">Rejected</option>
                          <option value="Ghosted">Ghosted</option>
                          <option value="Withdrawn">Withdrawn</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2">
                       <Label className="text-[10px] uppercase font-bold tracking-widest text-white/50">JD URL (Optional)</Label>
                       <Input 
                          placeholder="https://..."
                          value={manualEntry.jdUrl}
                          onChange={(e) => setManualEntry(prev => ({ ...prev, jdUrl: e.target.value }))}
                          className="h-9 bg-[#0A0A0A] border-white/10 text-white text-sm"
                        />
                    </div>
                  </CardContent>
                  <CardContent className="p-6 pt-0 flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setIsAddManualOpen(false)} className="border-white/10 text-white">
                      Cancel
                    </Button>
                    <Button onClick={handleAddManualHistory} className="bg-[#D4AF37] hover:bg-[#B8962E] text-black font-bold px-6">
                      Save Record
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {history.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <Card className="bg-[#111] border-none ring-1 ring-white/5 shadow-none">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1">Total Analyses</div>
                    <div className="text-3xl font-serif text-white">{history.length}</div>
                  </CardContent>
                </Card>
                <Card className="bg-[#111] border-none ring-1 ring-white/5 shadow-none">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1">Avg Match Score</div>
                    <div className="text-3xl font-serif text-[#D4AF37]">
                      {history.length > 0 ? Math.round(history.reduce((acc, curr) => acc + curr.fitScore, 0) / history.length) : 0}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-[#111] border-none ring-1 ring-white/5 shadow-none">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1">Recommended to Apply</div>
                    <div className="text-3xl font-serif text-white">
                      {history.filter(h => h.fitDecision === "Apply").length}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-[#111] border-none ring-1 ring-white/5 shadow-none">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1">Interviews/Offers</div>
                    <div className="text-3xl font-serif text-white">
                      {history.filter(h => 
                        h.applicationStatus?.includes("Interview") || 
                        h.applicationStatus?.includes("Round") || 
                        h.applicationStatus === "Offer"
                      ).length}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {history.length > 0 && (
              <div className="mb-6 p-4 bg-white/[0.02] border border-white/5 rounded-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-[10px] uppercase tracking-widest text-white/40 font-bold truncate">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
                      <Input 
                        placeholder="Company or position..." 
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        className="h-8 pl-8 text-xs bg-[#0A0A0A] border-white/10 text-white focus:border-[#D4AF37]"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-[10px] uppercase tracking-widest text-white/40 font-bold truncate">Min Score: {historyMinScore}%</Label>
                    <input 
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={historyMinScore}
                      onChange={(e) => setHistoryMinScore(parseInt(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D4AF37] mt-2"
                    />
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-[10px] uppercase tracking-widest text-white/40 font-bold truncate">Visa Sponsorship</Label>
                    <select 
                      value={historySponsorship}
                      onChange={(e) => setHistorySponsorship(e.target.value as any)}
                      className="w-full h-8 px-2 text-xs bg-[#0A0A0A] border border-white/10 text-white rounded-sm focus:outline-none focus:border-[#D4AF37]"
                    >
                      <option value="All">All Statuses</option>
                      <option value="Yes">Sponsored (Yes)</option>
                      <option value="No">Not Sponsored (No)</option>
                      <option value="Unknown">Unknown</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-[10px] uppercase tracking-widest text-white/40 font-bold truncate">Decision</Label>
                    <select 
                      value={historyDecision}
                      onChange={(e) => {
                        setHistoryDecision(e.target.value as any);
                        setHistoryPage(1);
                      }}
                      className="w-full h-8 px-2 text-xs bg-[#0A0A0A] border border-white/10 text-white rounded-sm focus:outline-none focus:border-[#D4AF37]"
                    >
                      <option value="All">All Decisions</option>
                      <option value="Apply">Apply</option>
                      <option value="Maybe Apply">Maybe Apply</option>
                      <option value="Not Apply">Not Apply</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-[10px] uppercase tracking-widest text-white/40 font-bold truncate">Application Status</Label>
                    <select 
                      value={historyStatus}
                      onChange={(e) => {
                        setHistoryStatus(e.target.value as any);
                        setHistoryPage(1);
                      }}
                      className="w-full h-8 px-2 text-xs bg-[#0A0A0A] border border-white/10 text-white rounded-sm focus:outline-none focus:border-[#D4AF37]"
                    >
                      <option value="All">All Statuses</option>
                      <option value="Saved">Saved</option>
                      <option value="Applied">Applied</option>
                      <option value="Interview">Interview</option>
                      <option value="Round 1">Round 1</option>
                      <option value="Round 2">Round 2</option>
                      <option value="Round 3">Round 3</option>
                      <option value="Final Round">Final Round</option>
                      <option value="Offer">Offer</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Ghosted">Ghosted</option>
                      <option value="Withdrawn">Withdrawn</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {history.length > 0 ? (
              <div className="overflow-x-auto custom-scrollbar border border-white/10 bg-[#111] rounded-xl shadow-2xl">
                <table className="w-full text-left whitespace-nowrap">
                  <thead className="bg-[#0A0A0A] text-[10px] uppercase tracking-widest text-white/40 border-b border-white/10">
                    <tr>
                      <th className="px-6 py-4 font-medium">Company & Role</th>
                      <th className="px-6 py-4 font-medium text-center">Fit Score</th>
                      <th className="px-6 py-4 font-medium">Decision</th>
                      <th className="px-6 py-4 font-medium">Resume</th>
                      <th className="px-6 py-4 font-medium">UK Visa</th>
                      <th className="px-6 py-4 font-medium">Application Status</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {paginatedHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-[#D4AF37] text-[10px] uppercase tracking-[0.2em] font-bold">
                              {h.companyName}
                            </span>
                            {editingJobTitleId === h.id ? (
                              <input
                                autoFocus
                                type="text"
                                className="text-white font-serif italic text-base mt-0.5 bg-[#0A0A0A] border border-[#D4AF37] rounded px-1 w-full max-w-[250px] focus:outline-none"
                                value={editingJobTitleValue}
                                onChange={(e) => setEditingJobTitleValue(e.target.value)}
                                onBlur={() => {
                                  handleUpdateHistoryItem(h.id, { jobTitle: editingJobTitleValue });
                                  setEditingJobTitleId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleUpdateHistoryItem(h.id, { jobTitle: editingJobTitleValue });
                                    setEditingJobTitleId(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingJobTitleId(null);
                                  }
                                }}
                              />
                            ) : (
                              <span 
                                className="text-white font-serif italic text-base mt-0.5 truncate max-w-[250px] cursor-pointer hover:text-[#D4AF37] transition-colors" 
                                title="Click to edit job role"
                                onClick={() => {
                                  setEditingJobTitleId(h.id);
                                  setEditingJobTitleValue(h.jobTitle);
                                }}
                              >
                                {h.jobTitle}
                              </span>
                            )}
                            <span className="text-[10px] text-white/20 font-mono italic mt-1">
                              {new Date(h.timestamp).toLocaleDateString()}
                            </span>
                            {h.jdUrl && (
                              <a href={h.jdUrl} target="_blank" rel="noreferrer" className="text-[10px] text-[#D4AF37] hover:underline mt-1 truncate max-w-[250px]">
                                Link to Job Description
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center">
                            <div className="text-xl font-serif italic text-white flex items-baseline">
                              {h.fitScore}
                              <span className="text-[10px] not-italic opacity-30 ml-0.5">/100</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "w-2 h-2 rounded-full",
                              h.fitDecision === "Apply" ? "bg-[#D4AF37]" : h.fitDecision === "Maybe Apply" ? "bg-white/40" : "bg-red-500"
                            )}></span>
                            <span className="text-[10px] uppercase tracking-widest text-white/60 font-bold">{h.fitDecision}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] bg-white/5 border border-white/10 px-2 py-1 rounded text-white/70 italic font-medium whitespace-nowrap">
                            {h.resumeProfileName || "Unknown Profile"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-2">
                             <select
                               value={h.ukSponsorshipStatus || "Unknown"}
                               onChange={(e) => handleUpdateHistoryItem(h.id, { ukSponsorshipStatus: e.target.value as any })}
                               className={cn(
                                 "text-[10px] bg-[#0A0A0A] border rounded px-1.5 py-1 focus:outline-none focus:border-[#D4AF37] transition-colors cursor-pointer text-center font-bold uppercase tracking-tight",
                                 h.ukSponsorshipStatus === "Yes" ? "!text-green-400 border-green-400/30" :
                                 h.ukSponsorshipStatus === "No" ? "!text-red-400 border-red-400/30" :
                                 "!text-white/50 border-white/10"
                               )}
                             >
                               <option value="Yes" className="bg-[#0A0A0A] text-green-400">Sponsored</option>
                               <option value="No" className="bg-[#0A0A0A] text-red-400">No Sponsor</option>
                               <option value="Unknown" className="bg-[#0A0A0A] text-white/50">Unknown</option>
                               <option value="Not Checked" className="bg-[#0A0A0A] text-white/30">Not Checked</option>
                             </select>
                           </div>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={h.applicationStatus || "Saved"}
                            onChange={(e) => handleUpdateHistoryItem(h.id, { applicationStatus: e.target.value as ApplicationStatus })}
                            className={cn(
                              "text-xs bg-[#0A0A0A] border border-white/10 rounded px-2 py-1.5 focus:outline-none focus:border-[#D4AF37] transition-colors cursor-pointer",
                              h.applicationStatus === "Offer" ? "text-green-400 border-green-400/30 font-bold" :
                              h.applicationStatus === "Rejected" ? "text-red-400 border-red-400/30" :
                              h.applicationStatus === "Applied" ? "text-blue-400 border-blue-400/30" :
                              h.applicationStatus?.includes("Round") || h.applicationStatus === "Interview" ? "text-purple-400 border-purple-400/30" :
                              "text-white/70"
                            )}
                          >
                            <option value="Saved">Saved</option>
                            <option value="Applied">Applied</option>
                            <option value="Interview">Interview</option>
                            <option value="Round 1">Round 1</option>
                            <option value="Round 2">Round 2</option>
                            <option value="Round 3">Round 3</option>
                            <option value="Final Round">Final Round</option>
                            <option value="Offer">Offer</option>
                            <option value="Rejected">Rejected</option>
                            <option value="Ghosted">Ghosted</option>
                            <option value="Withdrawn">Withdrawn</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() => { 
                                setResult(h); 
                                if (h.jobDescription) setJobDescription(h.jobDescription);
                                if (h.companyName) setCompanyName(h.companyName);
                                if (h.resumeText) setResumeText(h.resumeText);
                                setCurrentView("analysis"); 
                                setShowInputs(false);
                              }}
                              className="h-8 text-xs bg-transparent border-white/10 hover:bg-white/5 text-white/70 hover:text-white"
                            >
                              View Report
                            </Button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteHistory(h.id, e)}
                              className="text-white/20 hover:text-red-500 transition-colors p-2 rounded-sm hover:bg-white/5 flex items-center justify-center bg-black/20 ring-1 ring-white/5 opacity-0 group-hover:opacity-100 focus:opacity-100"
                              title="Delete History"
                            >
                              <Trash2 className="w-4 h-4 cursor-pointer" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredHistory.length === 0 && (
                  <div className="p-12 text-center bg-white/[0.01]">
                    <Search className="w-8 h-8 text-white/10 mx-auto mb-4" />
                    <p className="text-white/40 font-serif italic">No matching records found</p>
                    <button 
                      onClick={() => {
                        setHistorySearch("");
                        setHistoryMinScore(0);
                        setHistorySponsorship("All");
                        setHistoryStatus("All");
                        setHistoryDecision("All");
                        setHistoryPage(1);
                      }}
                      className="text-[#D4AF37] text-[10px] uppercase tracking-widest mt-4 hover:underline"
                    >
                      Clear all filters
                    </button>
                  </div>
                )}
                {filteredHistory.length > 0 && totalPages > 1 && (
                  <div className="p-4 border-t border-white/10 flex justify-between items-center bg-[#0A0A0A]">
                    <span className="text-xs text-white/40">
                      Showing {(historyPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(historyPage * ITEMS_PER_PAGE, filteredHistory.length)} of {filteredHistory.length}
                    </span>
                    <div className="flex gap-2">
                       <Button
                          variant="outline"
                          size="sm"
                          disabled={historyPage === 1}
                          onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                          className="h-8 text-xs bg-transparent border-white/10 text-white/70 hover:bg-white/5"
                       >
                         Previous
                       </Button>
                       <Button
                          variant="outline"
                          size="sm"
                          disabled={historyPage === totalPages}
                          onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                          className="h-8 text-xs bg-transparent border-white/10 text-white/70 hover:bg-white/5"
                       >
                         Next
                       </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-20 border border-dashed border-white/5 rounded-sm bg-white/[0.01]">
                <div className="w-12 h-12 rounded-sm bg-white/5 flex items-center justify-center text-white/20 mb-4">
                  <History />
                </div>
                <h3 className="text-lg font-serif italic text-white/60">No Analysis History</h3>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/20 mt-2 text-center max-w-xs">Complete your first alignment check to populate your historical archive.</p>
              </div>
            )}
          </div>
        )}
      </main>
      
      {/* Status Bar */}
      <footer className="bg-[#0F0F0F] px-8 py-3 border-t border-white/5 flex justify-between items-center text-[10px] uppercase tracking-widest text-white/30 mt-auto">
        <span>Ready for analysis</span>
        <span>Connected to AI Studio</span>
        <span>© 2026 Resume Match AI</span>
      </footer>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111] border border-white/10 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-10 h-10 rounded-full bg-[#FF4444]/10 text-[#FF4444] flex items-center justify-center mb-4 border border-[#FF4444]/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-serif text-white mb-2">Delete Analysis</h2>
              <p className="text-sm text-white/60 leading-relaxed">
                Are you sure you want to delete this specific historical analysis from your records? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 px-6 py-4 bg-white/[0.02] border-t border-white/5">
              <Button 
                variant="outline" 
                onClick={cancelDeleteHistory}
                className="flex-1 border-white/10 text-white hover:bg-white/5"
              >
                Cancel
              </Button>
              <Button 
                variant="default"
                onClick={confirmDeleteHistory}
                className="flex-1 bg-[#FF4444] text-white hover:bg-[#FF4444]/90 hover:shadow-[0_0_15px_rgba(255,68,68,0.3)] transition-all border-none"
              >
                Delete Record
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111] border border-white/10 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-serif text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-[#D4AF37]" />
                  Settings
                </h2>
                <button onClick={() => setIsSettingsOpen(false)} className="text-white/50 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-white/80">Primary Model</Label>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">
                    Multi-provider fallback — if primary fails, next model is tried automatically
                  </p>
                  <select
                    value={tempModel}
                    onChange={(e) => setTempModel(Number(e.target.value))}
                    className="flex h-10 w-full rounded-md border border-white/10 bg-[#0A0A0A] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37]"
                  >
                    {MODEL_OPTIONS.map((m, i) => (
                      <option key={i} value={i}>
                        {m.name}{m.tag ? ` (${m.tag})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-white/40 italic">
                    API keys are managed server-side for security.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 px-6 py-4 bg-white/[0.02] border-t border-white/5">
              <Button 
                variant="outline" 
                onClick={() => {
                  setTempModel(selectedModel);
                  setIsSettingsOpen(false);
                }}
                className="border-white/10 text-white hover:bg-white/5"
              >
                Cancel
              </Button>
              <Button 
                variant="default"
                onClick={handleSaveSettings}
                className="bg-[#D4AF37] text-black hover:bg-[#b5952f] transition-all border-none font-bold tracking-wide"
              >
                Save Settings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Email Generator Modal */}
      {isEmailGeneratorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111] border border-white/10 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-white/5 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-xl font-serif text-white flex items-center gap-2">
                  <PenTool className="w-5 h-5 text-[#D4AF37]" />
                  Reply to Email
                </h2>
                <p className="text-[11px] text-white/50 mt-1 uppercase tracking-widest font-bold">Paste the latest email thread from the recruiter to generate a highly professional, human response.</p>
              </div>
              <button 
                onClick={() => setIsEmailGeneratorOpen(false)} 
                className="text-white/50 hover:text-white transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
               <div>
                  <Label className="text-white/80">Email Thread Context</Label>
                  <Textarea 
                    rows={6}
                    placeholder="Hi there, we'd like to schedule..." 
                    value={emailThread}
                    onChange={(e) => setEmailThread(e.target.value)}
                    className="mt-2 bg-[#0A0A0A] border-white/10 focus:border-[#D4AF37] focus:ring-[#D4AF37]/20 resize-none font-mono text-xs text-white/70"
                  />
               </div>

               <div className="flex justify-end">
                 <Button
                    onClick={handleGenerateEmail}
                    disabled={isGeneratingEmail || !emailThread.trim()}
                    className="bg-[#D4AF37] text-black"
                 >
                   {isGeneratingEmail ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                   Generate Reply
                 </Button>
               </div>

               {generatedEmail && (
                 <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                    <Label className="text-[#D4AF37]">Generated Response</Label>
                    <div className="p-4 bg-black/50 border border-white/10 rounded-sm font-sans text-sm text-white/90 whitespace-pre-wrap">
                      {generatedEmail}
                    </div>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
