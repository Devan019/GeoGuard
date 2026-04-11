export const getSeverityLevel = (count = 0) => {
  if (count > 5) return "high";
  if (count > 2) return "medium";
  return "low";
};

export const getFeatureSeverity = (feature) => {
  const violationCount = (feature?.properties?.violations || []).length;
  if (feature?.properties?.is_compliant) return "compliant";
  if (violationCount > 2) return "high";
  if (violationCount > 0) return "medium";
  return "low";
};

export const getSeverityColors = (severity) => {
  if (severity === "compliant") {
    return {
      card: "bg-emerald-50 border-emerald-200 text-emerald-700",
      badge: "bg-emerald-200 text-emerald-800",
      progress: "bg-emerald-500",
    };
  }

  if (severity === "high") {
    return {
      card: "bg-red-50 border-red-200 text-red-700",
      badge: "bg-red-200 text-red-800",
      progress: "bg-red-500",
    };
  }

  if (severity === "medium") {
    return {
      card: "bg-yellow-50 border-yellow-200 text-yellow-700",
      badge: "bg-yellow-200 text-yellow-800",
      progress: "bg-yellow-500",
    };
  }

  return {
    card: "bg-blue-50 border-blue-200 text-blue-700",
    badge: "bg-blue-200 text-blue-800",
    progress: "bg-blue-500",
  };
};
