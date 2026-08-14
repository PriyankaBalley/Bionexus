"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JobsPage() {
  const router = useRouter();
  const [jobId, setJobId] = useState("");
  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-1">Look up a job</h1>
      <p className="text-zinc-600 mb-4">Enter a job ID to view status, results, and download files.</p>
      <form className="card space-y-3" onSubmit={(e) => {
        e.preventDefault();
        if (jobId.trim()) router.push(`/jobs/${jobId.trim()}`);
      }}>
        <input className="input font-mono" value={jobId} onChange={e => setJobId(e.target.value)}
               placeholder="paste job id" />
        <button type="submit" className="btn btn-primary w-full">View</button>
      </form>
    </div>
  );
}
