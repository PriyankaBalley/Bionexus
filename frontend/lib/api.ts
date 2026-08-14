import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

export interface JobResponse { job_id: string; status: string; message?: string }
export interface JobStatus {
  job_id: string;
  status: "PENDING" | "STARTED" | "SUCCESS" | "FAILURE" | "REVOKED";
  progress: number;
  result?: any;
  error?: string;
}

export const submitRetrieval = (data: any) =>
  api.post<JobResponse>("/retrieve", data).then(r => r.data);

export const submitPromoter = (data: any) =>
  api.post<JobResponse>("/promoter/analyze", data).then(r => r.data);

export const submitSgrna = (data: any) =>
  api.post<JobResponse>("/sgrna/design", data).then(r => r.data);

export const getJobStatus = (jobId: string) =>
  api.get<JobStatus>(`/jobs/${jobId}`).then(r => r.data);

export const listJobFiles = (jobId: string) =>
  api.get<{ job_id: string; files: { name: string; size: number; url: string }[] }>(
    `/jobs/${jobId}/files`,
  ).then(r => r.data);

export const downloadUrl = (jobId: string, path: string) =>
  `/api/jobs/${jobId}/download/${path}`;

export const fetchFileText = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`Failed to fetch file (${r.status})`);
    return r.text();
  });

// Wraps `fetch` + `.json()` so a non-JSON error body (e.g. a plain-text
// "Internal Server Error" page returned when the backend/proxy target is
// unreachable) surfaces as a clear message instead of a raw
// "Unexpected token 'I', "Internal S"... is not valid JSON" parse error.
export async function fetchJson(input: RequestInfo, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new Error("Could not reach the backend API. Is the server running?");
  }
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(
          `Backend returned ${res.status} ${res.statusText || ""} instead of JSON `
          + `(is the API server / worker running?): ${text.slice(0, 200)}`
        );
      }
      throw new Error(`Backend returned a non-JSON response: ${text.slice(0, 200)}`);
    }
  }
  if (!res.ok) {
    throw new Error(data?.detail || `Request failed (${res.status})`);
  }
  return data;
}
