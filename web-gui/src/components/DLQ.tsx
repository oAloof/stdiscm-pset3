import { useEffect, useState } from "react";
import { fetchDlqStatus, retryDlqJob, deleteDlqJob, clearDlq, DlqJob as DlqJobType } from "../api/client";

export default function DLQ() {
  const [jobs, setJobs] = useState<DlqJobType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null); // jobId being processed

  const loadJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchDlqStatus();
      console.log("Jobs:", data)
      setJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load DLQ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const handleRetry = async (jobId: string) => {
    try {
      setProcessing(jobId);
      await retryDlqJob(jobId);
      setJobs(jobs.filter(j => j.jobId !== jobId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to retry job");
    } finally {
      setProcessing(null);
    }
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm("Are you sure you want to delete this job?")) return;
    try {
      setProcessing(jobId);
      await deleteDlqJob(jobId);
      setJobs(jobs.filter(j => j.jobId !== jobId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete job");
    } finally {
      setProcessing(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to clear all failed jobs?")) return;
    try {
      setProcessing("all");
      await clearDlq();
      setJobs([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to clear DLQ");
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="overflow-x-auto p-5">
      {loading && <p className="text-center py-4">Loading DLQ jobs...</p>}
      {error && <p className="text-center py-4 text-red-600">Error: {error}</p>}

      {!loading && !error && (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Error</th>
                <th>Attempts</th>
                <th>Producer ID</th>
                <th>Failed At</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.jobId}>
                  <td>{job.filename}</td>
                  <td className="max-w-xs truncate">{job.error}</td>
                  <td>{job.attempts}</td>
                  <td>{job.producerId}</td>
                  <td>{new Date(job.failedAt).toLocaleString()}</td>
                  <td className="flex gap-2 justify-end">
                    <button
                      className="btn btn-primary btn-xs"
                      disabled={processing === job.jobId}
                      onClick={() => handleRetry(job.jobId)}
                    >
                      {processing === job.jobId ? "Retrying..." : "Retry"}
                    </button>
                    <button
                      className="btn btn-secondary btn-xs"
                      disabled={processing === job.jobId}
                      onClick={() => handleDelete(job.jobId)}
                    >
                      {processing === job.jobId ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-between">
            <button
              className="btn btn-accent btn-sm"
              disabled={processing === "all"}
              onClick={handleClearAll}
            >
              {processing === "all" ? "Clearing..." : "Clear All"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
