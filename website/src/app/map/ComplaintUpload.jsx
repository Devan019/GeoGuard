"use client";

import { useState, useRef, useEffect } from "react";
import { UploadCloud, FileText, X, Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
// Import the socket hook
import { useSocket } from "@/context/SocketContext";

export default function ComplaintUpload() {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" }); // type: 'success' | 'error' | ''
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  
  // New state to track live websocket messages
  const [socketStatus, setSocketStatus] = useState("");
  
  const fileInputRef = useRef(null);
  const { receiveMessage } = useSocket();

  useEffect(() => {
    const unsubStart = receiveMessage("RULES_EXTRACTION_STARTED", (payload) => {
      setSocketStatus(payload.message || "Rules are getting generated...");
      setIsUploading(true);
    });

    const unsubSuccess = receiveMessage("RULES_EXTRACTION_SUCCESS", (payload) => {
      setSocketStatus(""); 
      setIsUploading(false); 
      setMessage({ type: "success", text: payload.message || "Rules are generated successfully!" });
    });

    const unsubError = receiveMessage("RULES_EXTRACTION_ERROR", (payload) => {
      setSocketStatus("");
      setIsUploading(false);
      setMessage({ type: "error", text: payload.message || "Failed to generate rules." });
    });

    return () => {
      unsubStart();
      unsubSuccess();
      unsubError();
    };
  }, [receiveMessage]);

  async function handleUpload(event) {
    event.preventDefault();

    if (!file) {
      setMessage({ type: "error", text: "Please select a PDF document first." });
      return;
    }

    setIsUploading(true);
    setMessage({ type: "", text: "" });
    setSocketStatus("Uploading document..."); // Initial status before backend takes over
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
        throw new Error(result.error || "Failed to process document.");
      }

      setUploadedUrl(result.file?.secureUrl || "");
      
      // Note: We DO NOT set isUploading to false here immediately.
      // We wait for the RULES_EXTRACTION_SUCCESS websocket event to turn it off.
      setFile(null);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Upload failed." });
      setIsUploading(false);
      setSocketStatus("");
    }
  }

  // Drag and Drop Handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === "application/pdf") {
      setFile(droppedFile);
      setMessage({ type: "", text: "" });
    } else {
      setMessage({ type: "error", text: "Please upload a valid PDF file." });
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setMessage({ type: "", text: "" });
    }
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <form onSubmit={handleUpload} className="flex flex-col gap-4">
      
      {/* DRAG & DROP ZONE */}
      {!file ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all duration-300 ${
            isDragging 
              ? "border-blue-500 bg-blue-50/50" 
              : "border-slate-300 bg-white/40 hover:bg-white/70 hover:border-slate-400"
          }`}
        >
          <div className={`mb-3 rounded-full p-3 transition-colors ${isDragging ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
            <UploadCloud size={24} />
          </div>
          <p className="text-sm font-semibold text-slate-700">Click to upload or drag and drop</p>
          <p className="mt-1 text-xs text-slate-500">PDF documents only (max 10MB)</p>
          
          <input
            ref={fileInputRef}
            id="complaint-pdf"
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      ) : (
        /* SELECTED FILE CARD */
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="rounded-lg bg-rose-100 p-2 text-rose-600">
              <FileText size={20} />
            </div>
            <div className="flex flex-col truncate">
              <span className="truncate text-sm font-semibold text-slate-800">{file.name}</span>
              <span className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
          </div>
          <button 
            type="button" 
            onClick={clearFile}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* STATUS MESSAGES */}
      {message.text && !isUploading && (
        <div className={`flex items-center gap-2 rounded-xl p-3 text-sm font-medium ${
          message.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
        }`}>
          {message.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {message.text}
        </div>
      )}

      {/* VIEW UPLOADED FILE LINK */}
      {uploadedUrl && !isUploading && (
        <a
          href={uploadedUrl}
          target="_blank"
          rel="noreferrer"
          className="group flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:text-blue-600 shadow-sm"
        >
          <ExternalLink size={16} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
          View Processed PDF
        </a>
      )}

      {/* SUBMIT BUTTON */}
      <button
        type="submit"
        disabled={isUploading || !file}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-md"
      >
        {isUploading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            {socketStatus || "Extracting Rules..."}
          </>
        ) : (
          "Run Compliance Engine"
        )}
      </button>

    </form>
  );
}