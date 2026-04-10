"use client";

import { useState } from "react";

export default function ComplaintUpload() {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");

  async function handleUpload(event) {
    event.preventDefault();

    if (!file) {
      setMessage("Please choose a PDF first.");
      return;
    }

    setIsUploading(true);
    setMessage("");
    setUploadedUrl("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/complice", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Upload failed.");
      }

      setMessage(result.message || "Uploaded successfully.");
      setUploadedUrl(result.file?.secureUrl || "");
      setFile(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form onSubmit={handleUpload} className="mt-3 space-y-2">
      <label
        className="block text-xs font-medium text-slate-800"
        htmlFor="complaint-pdf"
      >
        Upload Complaint PDF
      </label>
      <input
        id="complaint-pdf"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        className="block w-full text-xs text-slate-700 file:mr-2 file:rounded-md file:border-0 file:bg-slate-900 file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-slate-700"
      />
      <button
        type="submit"
        disabled={isUploading}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isUploading ? "Uploading..." : "Submit PDF"}
      </button>
      {message ? <p className="text-xs text-slate-700">{message}</p> : null}
      {uploadedUrl ? (
        <a
          href={uploadedUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-xs font-medium text-blue-700 underline"
        >
          View uploaded PDF
        </a>
      ) : null}
    </form>
  );
}
