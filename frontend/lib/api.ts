import axios from "axios";

// Production: Render/backend URL from Vercel environment variable
// Local: FastAPI running on port 8000
const BACKEND_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/+$/, "").replace(/\/api$/, "");

const API_BASE_URL = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface JobResponse {
  job_id: string;
  status: string;
  message?: string;
}

export interface JobStatus {
  job_id: string;
  status: "PENDING" | "STARTED" | "SUCCESS" | "FAILURE" | "REVOKED";
  progress: number;
  result?: any;
  error?: string;
}


// ===============================
// Submit APIs
// ===============================

export const submitRetrieval = (data: any) =>
  api.post<JobResponse>("/retrieve", data).then((r) => r.data);

export const submitPromoter = (data: any) =>
  api.post<JobResponse>("/promoter/analyze", data).then((r) => r.data);

export const submitSgrna = (data: any) =>
  api.post<JobResponse>("/sgrna/design", data).then((r) => r.data);

export const submitProtParam = (data: any) =>
  api.post<JobResponse>("/protparam", data).then((r) => r.data);

export const submitSecondaryStructure = (data: any) =>
  api.post<JobResponse>("/secondary-structure", data).then((r) => r.data);

export const submitORFPrediction = (data: any) =>
  api.post<JobResponse>("/orf", data).then((r) => r.data);

export const submitPhylogeny = (data: any) =>
  api.post<JobResponse>("/phylogeny", data).then((r) => r.data);

export const submitTransmembrane = (data: any) =>
  api.post<JobResponse>("/transmembrane", data).then((r) => r.data);

export const submitLocalization = (data: any) =>
  api.post<JobResponse>("/localization", data).then((r) => r.data);


// ===============================
// Job APIs
// ===============================

export const getJobStatus = (jobId: string) =>
  api.get<JobStatus>(`/jobs/${jobId}`).then((r) => r.data);

export const listJobFiles = (jobId: string) =>
  api
    .get<{
      job_id: string;
      files: {
        name: string;
        size: number;
        url: string;
      }[];
    }>(`/jobs/${jobId}/files`)
    .then((r) => r.data);


// ===============================
// File download
// ===============================

export const downloadUrl = (jobId: string, path: string) =>
  `${API_BASE_URL}/jobs/${jobId}/download/${path}`;


export const fetchFileText = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) {
      throw new Error(`Failed to fetch file (${r.status})`);
    }

    return r.text();
  });


// ===============================
// Resolve backend URL
// ===============================

function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== "string") {
    return input;
  }

  // Already absolute URL
  if (
    input.startsWith("http://") ||
    input.startsWith("https://")
  ) {
    return input;
  }

  // Example:
  // /api/orf/example
  if (input.startsWith("/api")) {
    return `${BACKEND_URL}${input}`;
  }

  // Example:
  // /orf/example
  if (input.startsWith("/")) {
    return `${API_BASE_URL}${input}`;
  }

  return `${API_BASE_URL}/${input}`;
}


// ===============================
// fetch JSON helper
// ===============================

export async function fetchJson(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<any> {

  let res: Response;

  try {

    const finalUrl = resolveApiUrl(input);

    res = await fetch(finalUrl, init);

  } catch (error) {

    console.error("Backend connection error:", error);

    throw new Error(
      "Could not reach the backend API. Please check whether the backend server is running."
    );
  }

  const text = await res.text();

  let data: any = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {

      if (!res.ok) {
        throw new Error(
          `Backend returned ${res.status} ${res.statusText}: ${text.slice(
            0,
            200
          )}`
        );
      }

      throw new Error(
        `Backend returned a non-JSON response: ${text.slice(0, 200)}`
      );
    }
  }

  if (!res.ok) {

    const message =
      data?.detail ||
      data?.message ||
      data?.error ||
      `Request failed (${res.status})`;

    throw new Error(message);
  }

  return data;
}