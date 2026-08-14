import JobStatus from "@/components/JobStatus";

export default function JobDetail({ params }: { params: { id: string } }) {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Job</h1>
      <p className="font-mono text-sm text-zinc-500 mb-4">{params.id}</p>
      <JobStatus jobId={params.id} />
    </div>
  );
}
