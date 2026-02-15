export type FileCategory = "code" | "previewable" | "binary";

const PREVIEWABLE_EXTENSIONS = new Set([
  "md",
  "markdown",
  "html",
  "htm",
  "svg",
]);

const BINARY_EXTENSIONS = new Set([
  // Images
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  // Video
  "mp4",
  "webm",
  "ogg",
  "avi",
  "mov",
  // Audio
  "mp3",
  "wav",
  "flac",
  "aac",
  // Documents
  "pdf",
  // Archives
  "zip",
  "tar",
  "gz",
  "7z",
  "rar",
  // Fonts
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
]);

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "svg",
]);

export function getFileExtension(filePath: string): string {
  return filePath.split(".").pop()?.toLowerCase() || "";
}

export function categorizeFile(filePath: string): FileCategory {
  const ext = getFileExtension(filePath);
  if (BINARY_EXTENSIONS.has(ext)) return "binary";
  if (PREVIEWABLE_EXTENSIONS.has(ext)) return "previewable";
  return "code";
}

export function isTextFile(filePath: string): boolean {
  return categorizeFile(filePath) !== "binary";
}

export function hasPreviewMode(filePath: string): boolean {
  return categorizeFile(filePath) === "previewable";
}

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(getFileExtension(filePath));
}
