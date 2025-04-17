/**
 * Type definitions for CodeDump
 */

export interface CodeDumpConfig {
  // Main settings
  directory?: string; // Directory to dump, empty = current directory
  output?: string; // Output filename, empty = auto (directory name)
  type?: "list" | "normal" | "verbose" | "minify"; // Output format
  showLargestFiles?: boolean; // Show largest files at beginning of dump

  // File and directory filtering
  allowedExtensions?: string[]; // File extensions to include (with dot)
  allowedFilenames?: string[]; // Specific filenames to include
  skipDirectories?: string[]; // Directory names to skip
  skipDirectoryPatterns?: string[]; // Regex patterns for directories to skip
  skipFilenames?: string[]; // Specific filenames to skip
  skipPatterns?: string[]; // Regex patterns for files to skip
}
