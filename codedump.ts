/**
 * This script is used to dump the contents of a directory into a file.
 * Default output file is <directory>.txt
 *
 * Use it as follows:
 * npx ts-node codedump.ts <directory> <output file> <type> <topN>
 *
 * - directory: The directory to dump the contents of.
 * - output file: The file to write the contents to.
 * - type: The type of output to generate.
 *   - list: Only list file paths
 *   - normal: Include file contents with formatting (default)
 *   - verbose: Include file contents with additional metadata
 *   - minify: Include file contents with minimal whitespace
 * - topN: The number of largest files to include in the output.
 *
 * Optional flags:
 * --no-largest-files: Don't show largest files section
 * --show-largest-files: Show largest files section (default)
 *
 * Configuration:
 * You can create a codedump.config.ts file to customize the behavior.
 * This can be done through the CLI interface or manually.
 * The config file allows you to set:
 * - Default directory to dump
 * - Default output filename
 * - Default output format
 * - Whether to show largest files
 * - Files and directories to include/exclude
 *
 * Example:
 * npx ts-node codedump.ts .
 * npx ts-node codedump.ts . --type=minify
 * npx ts-node codedump.ts -m
 */

import * as fs from "fs";
import { promises as fsPromises } from "fs";
import * as path from "path";

// Define the CodeDumpConfig interface here for internal use
interface CodeDumpConfig {
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

// Add configuration support
let config: CodeDumpConfig | null = null;

// Try to load config file if it exists
try {
  // Check multiple possible locations for the config file
  // 1. Current working directory (for CLI usage)
  // 2. User's home directory (for global installations)
  const possibleConfigPaths = [
    path.join(process.cwd(), "codedump.config.ts"),
    path.join(process.cwd(), "codedump.config.js"),
    path.join(process.cwd(), ".codedump.config.ts"),
    path.join(process.cwd(), ".codedump.config.js"),
  ];

  // Try to find a config file in any of the possible locations
  let configPath = null;
  for (const configPath of possibleConfigPaths) {
    if (fs.existsSync(configPath)) {
      try {
        // For ESM or TypeScript, we need dynamic imports
        // This should work in both TS and JS environments
        import(configPath)
          .then((importedConfig) => {
            config = importedConfig.default;
            console.log(
              `Loaded configuration from ${path.basename(configPath)}`
            );
            // Update settings based on the loaded config
            updateConfigSettings();
          })
          .catch((err) => {
            console.error(`Error loading config from ${configPath}:`, err);
          });
        break; // Stop after finding first valid config
      } catch (err) {
        console.error(`Error importing config from ${configPath}:`, err);
      }
    }
  }
} catch (error) {
  console.warn("Could not load configuration file:", error);
}

interface FileInfo {
  size: number;
  lastModified: string;
  language?: string; // Programming language
  imports?: string[]; // List of imports/dependencies
  fileType?: string; // File classification (source, config, etc.)
  lineCount?: number; // Total lines of code
}

// List of allowed extensions
// Use config if available, otherwise use defaults
const ALLOWED_EXTENSIONS = new Set([
  // General
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".sql",
  ".graphql",
  ".proto",
  // Python
  ".py",
  ".pyx",
  ".pyd",
  ".pyo",
  ".pyc",
  ".pyw",
  ".pyi",
  // C and C++
  ".c",
  ".h",
  ".i",
  ".cpp",
  ".hpp",
  ".cc",
  ".hh",
  ".cxx",
  ".hxx",
  // Julia
  ".jl",
  // JavaScript and TypeScript
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  // Web
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  // Java and JVM languages
  ".java",
  ".kt",
  ".kts",
  ".groovy",
  ".scala",
  ".clj",
  ".cljs",
  // .NET languages
  ".cs",
  ".fs",
  ".vb",
  // Ruby
  ".rb",
  ".rake",
  ".gemspec",
  // PHP
  ".php",
  ".phtml",
  ".php3",
  ".php4",
  ".php5",
  ".phps",
  // Go
  ".go",
  // Rust
  ".rs",
  // Swift
  ".swift",
  // Shell scripting
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  // PowerShell
  ".ps1",
  ".psm1",
  ".psd1",
  // Perl
  ".pl",
  ".pm",
  // Lua
  ".lua",
  // Haskell
  ".hs",
  ".lhs",
  // R
  ".r",
  ".R",
  ".Rmd",
  // Dart
  ".dart",
  // Kotlin
  ".kt",
  ".kts",
  // Objective-C
  ".m",
  ".mm",
  // Elm
  ".elm",
  // F#
  ".fs",
  ".fsi",
  ".fsx",
  // Elixir
  ".ex",
  ".exs",
  // Erlang
  ".erl",
  ".hrl",
  // Lisp dialects
  ".lisp",
  ".cl",
  ".el",
  // Fortran
  ".f",
  ".for",
  ".f90",
  ".f95",
  ".f03",
  ".f08",
  // MATLAB/Octave
  ".m",
  ".mat",
  // Scala
  ".scala",
  ".sc",
  // Terraform
  ".tf",
  ".tfvars",
  // Ansible
  ".yml",
  ".yaml",
  // LaTeX
  ".tex",
  ".sty",
  ".cls",
]);

// List of allowed filenames without extensions
const ALLOWED_FILENAMES = new Set([
  // General
  // "readme",
  "license",
  "dockerfile",
  "makefile",
  ".gitignore",
  ".dockerignore",
  ".editorconfig",
  ".env",
  "requirements.txt",
  "package.json",
  "tsconfig.json",
  // Python
  "setup.py",
  "setup.cfg",
  "pyproject.toml",
  "pipfile",
  "manifest.in",
  ".pylintrc",
  ".flake8",
  "pytest.ini",
  "tox.ini",
  // C/C++
  "makefile",
  "cmakelist.txt",
  "cmakelist.txt",
  // Julia
  "project.toml",
  "manifest.toml",
  "juliaconfig.toml",
  // JavaScript/TypeScript
  ".npmignore",
  ".babelrc",
  ".eslintrc",
  ".prettierrc",
  "tslint.json",
  "webpack.config.js",
  "package-lock.json",
  "yarn.lock",
  // Ruby
  "gemfile",
  "rakefile",
  // PHP
  "composer.json",
  "composer.lock",
  // Go
  "go.mod",
  "go.sum",
  // Rust
  "cargo.toml",
  "cargo.lock",
  // .NET
  "packages.config",
  "nuget.config",
  // Java
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  // Docker
  "docker-compose.yml",
  "docker-compose.yaml",
  // Git
  ".gitattributes",
  // CI/CD
  ".travis.yml",
  ".gitlab-ci.yml",
  "jenkins.file",
  "azure-pipelines.yml",
  // Editor/IDE
  ".vscode",
  ".idea",
  // Elm
  "elm.json",
  // F#
  "paket.dependencies",
  "paket.lock",
  // Elixir
  "mix.exs",
  "mix.lock",
  // Erlang
  "rebar.config",
  // MATLAB/Octave
  ".octaverc",
  // Scala
  "build.sbt",
  // Terraform
  ".terraform.lock.hcl",
  // Ansible
  "ansible.cfg",
  "hosts",
  // LaTeX
  "latexmkrc",
]);

// Directories to skip
const SKIP_DIRECTORIES = new Set([
  "__pycache__",
  "node_modules",
  "venv",
  "env",
  ".venv",
  ".env",
  ".cache",
  "build",
  "dist",
  "target",
  "out",
  "bin",
  "obj",
  ".git",
  ".svn",
  ".hg",
  ".idea",
  ".vscode",
  "logs",
  "output",
  ".next",
  ".turbo",
  "migrations",
]);

// Regex patterns for directories to skip
let SKIP_DIRECTORY_PATTERNS = [
  /\.egg-info$/, // Matches directories ending with .egg-info
  /\.yarn$/,
];

// Filenames to skip
const SKIP_FILENAMES = new Set([
  "package-lock.json",
  ".DS_Store",
  ".eslintcache",
  "thumbs.db",
  ".npmrc",
  ".prettierignore",
  ".eslintignore",
  ".gitkeep",
  ".browserslistrc",
  "tsconfig.tsbuildinfo",
  ".node-version",
  ".nvmrc",
  "desktop.ini",
  "npm-debug.log",
  "sdk.ts",
]);

// Regex patterns for files to skip
let SKIP_PATTERNS = [
  /\.log(\.[0-9]+)?$/, // Matches .log, .log.1, .log.2, etc.
  /^log\./, // Matches log.txt, log.old, etc.
  /\.bak$/,
  /\.tmp$/,
  /\.temp$/,
  /\.swp$/,
  /~$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /graphql-cache\.d\.ts$/,
];

// Store output file path to avoid processing it
let outputFilePath: string = "";

// Add a class to handle gitignore rules
class GitignoreManager {
  private ignoreRulesByDir: Map<
    string,
    Array<{ pattern: string; isNegated: boolean }>
  > = new Map();

  constructor() {}

  // Load a .gitignore file and associate its rules with a directory
  async loadGitignoreFile(directory: string): Promise<void> {
    const gitignorePath = path.join(directory, ".gitignore");

    try {
      if (fs.existsSync(gitignorePath)) {
        const content = await fsPromises.readFile(gitignorePath, "utf-8");
        const rules = content
          .split(/\r?\n/)
          .filter((line) => line.trim() && !line.startsWith("#"))
          .map((line) => {
            const trimmedLine = line.trim();
            const isNegated = trimmedLine.startsWith("!");
            const pattern = isNegated ? trimmedLine.substring(1) : trimmedLine;
            return { pattern, isNegated };
          });

        this.ignoreRulesByDir.set(path.resolve(directory), rules);
      }
    } catch (error) {
      console.warn(`Error reading .gitignore at ${gitignorePath}:`, error);
    }
  }

  // Check if a path should be ignored based on gitignore rules
  shouldIgnore(filePath: string): boolean {
    const absolutePath = path.resolve(filePath);

    // Get all parent directories up to the root
    let currentDir = path.dirname(absolutePath);
    const parentDirs: string[] = [];

    while (
      currentDir.length > 0 &&
      currentDir !== path.parse(currentDir).root
    ) {
      parentDirs.push(currentDir);
      currentDir = path.dirname(currentDir);
    }

    // Start with not ignored
    let shouldBeIgnored = false;

    // Check rules from closest directory up to the root
    for (const dir of parentDirs) {
      const rules = this.ignoreRulesByDir.get(dir);
      if (!rules) continue;

      // Get the path relative to the directory with the gitignore file
      const relativePath = path.relative(dir, absolutePath);

      // Apply each rule in order
      for (const { pattern, isNegated } of rules) {
        if (
          this.matchesGitignorePattern(
            relativePath,
            pattern,
            fs.statSync(absolutePath).isDirectory()
          )
        ) {
          // If pattern matches, either ignore or un-ignore based on negation
          shouldBeIgnored = !isNegated;
        }
      }
    }

    return shouldBeIgnored;
  }

  // Custom implementation of gitignore pattern matching
  private matchesGitignorePattern(
    relativePath: string,
    pattern: string,
    isDirectory: boolean
  ): boolean {
    // Handle directory-specific patterns (ending with /)
    if (pattern.endsWith("/") && !isDirectory) {
      return false;
    }

    // Remove trailing slash if present for directories
    let cleanPattern = pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;

    // Convert gitignore pattern to regex
    let regexPattern = this.gitignorePatternToRegex(cleanPattern);

    // Test the path against the regex
    return regexPattern.test(relativePath);
  }

  // Convert a gitignore pattern to a regular expression
  private gitignorePatternToRegex(pattern: string): RegExp {
    // Escape regex special characters except those with special meaning in gitignore
    let regexStr = pattern.replace(/[.+^$|()[\]{}]/g, "\\$&");

    // Handle ** (matches any number of directories)
    regexStr = regexStr.replace(/\*\*/g, "__DOUBLE_STAR__");

    // Handle * (matches anything except /)
    regexStr = regexStr.replace(/\*/g, "[^/]*");

    // Restore ** patterns
    regexStr = regexStr.replace(/__DOUBLE_STAR__/g, ".*");

    // Handle ? (matches any single character except /)
    regexStr = regexStr.replace(/\?/g, "[^/]");

    // Handle leading slash (anchor to start)
    if (regexStr.startsWith("/")) {
      regexStr = "^" + regexStr.substring(1);
    } else {
      // If no leading slash, pattern can match at any directory level
      regexStr = "(^|.*/)" + regexStr;
    }

    // Handle trailing patterns
    if (!regexStr.endsWith("/")) {
      // Match files or directories exactly, or directories with content
      regexStr = regexStr + "(/.*)?$";
    } else {
      // If ends with /, match only directories
      regexStr = regexStr + ".*$";
    }

    return new RegExp(regexStr);
  }
}

// Initialize the GitignoreManager
const gitignoreManager = new GitignoreManager();

// Make getFileInfo async as it performs file I/O
async function getFileInfo(filePath: string): Promise<FileInfo> {
  const stats = await fsPromises.stat(filePath); // Use async stat
  const fileInfo: FileInfo = {
    size: stats.size,
    lastModified: new Date(stats.mtime)
      .toISOString()
      .replace("T", " ")
      .substring(0, 19),
  };

  // Add language detection based on extension
  const extension = path.extname(filePath).toLowerCase();
  fileInfo.language = detectLanguage(extension);

  // Add file type classification
  fileInfo.fileType = classifyFileType(filePath);

  // Add line count if file is not binary and not too large
  if (stats.size < 1024 * 1024 && !isBinaryExtension(extension)) {
    try {
      const content = await fsPromises.readFile(filePath, "utf-8"); // Use async readFile
      fileInfo.lineCount = content.split("\n").length;

      // Extract imports for certain file types
      if ([".js", ".jsx", ".ts", ".tsx"].includes(extension)) {
        fileInfo.imports = extractImports(content);
      }
    } catch (e) {
      // Silent fail on line count and imports if can't read
    }
  }

  return fileInfo;
}

// Detect language based on file extension
function detectLanguage(extension: string): string {
  const languageMap: { [key: string]: string } = {
    ".js": "JavaScript",
    ".jsx": "JavaScript (React)",
    ".ts": "TypeScript",
    ".tsx": "TypeScript (React)",
    ".py": "Python",
    ".rb": "Ruby",
    ".java": "Java",
    ".cs": "C#",
    ".go": "Go",
    ".rs": "Rust",
    ".php": "PHP",
    ".swift": "Swift",
    ".kt": "Kotlin",
    ".c": "C",
    ".cpp": "C++",
    ".h": "C/C++ Header",
    ".sh": "Shell",
    ".json": "JSON",
    ".xml": "XML",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".md": "Markdown",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".sql": "SQL",
    ".graphql": "GraphQL",
  };

  return languageMap[extension] || "Unknown";
}

// Classify file type based on name and location
function classifyFileType(filePath: string): string {
  const fileName = path.basename(filePath).toLowerCase();
  const extension = path.extname(fileName).toLowerCase();
  const pathSegments = filePath.split(path.sep);

  // Configuration files
  if (
    fileName.includes("config") ||
    fileName.includes(".config") ||
    fileName.includes("rc") ||
    fileName === ".env" ||
    ([".json", ".yaml", ".yml", ".toml", ".ini"].includes(extension) &&
      !pathSegments.some((seg) => seg.includes("src") || seg.includes("app")))
  ) {
    return "Configuration";
  }

  // Test files
  if (
    fileName.includes(".test.") ||
    fileName.includes(".spec.") ||
    pathSegments.some(
      (seg) => seg === "test" || seg === "tests" || seg === "__tests__"
    )
  ) {
    return "Test";
  }

  // Documentation
  if (
    [".md", ".markdown", ".txt", ".doc", ".pdf"].includes(extension) ||
    // fileName === "readme" ||
    fileName === "contributing" ||
    fileName === "license"
  ) {
    return "Documentation";
  }

  // Package management
  if (
    fileName === "package.json" ||
    fileName === "requirements.txt" ||
    fileName === "cargo.toml" ||
    fileName === "go.mod"
  ) {
    return "Package Management";
  }

  // Sources based on common source dirs
  if (
    pathSegments.some((seg) =>
      ["src", "app", "lib", "components", "services"].includes(seg)
    )
  ) {
    return "Source";
  }

  return "Other";
}

// Check if extension is likely binary
function isBinaryExtension(extension: string): boolean {
  const binaryExtensions = [
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".bin",
    ".o",
    ".obj",
    ".zip",
    ".tar",
    ".gz",
    ".rar",
    ".7z",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".ico",
    ".pdf",
  ];
  return binaryExtensions.includes(extension);
}

// Extract imports from JS/TS files
function extractImports(content: string): string[] {
  const imports: string[] = [];
  const importRegex =
    /import\s+(?:(?:\{[^}]*\})|(?:[^{}\s]+))\s+from\s+['"]([^'"]+)['"]/g;
  const requireRegex =
    /(?:const|let|var)\s+(?:\{[^}]*\}|\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports)]; // Remove duplicates
}

// Update the shouldSkip function to use gitignore rules
function shouldSkip(pathname: string): boolean {
  const name = path.basename(pathname);
  const nameLower = name.toLowerCase();
  const extension = path.extname(name);

  // Check if this is the output file by comparing absolute paths
  if (outputFilePath && path.resolve(pathname) === outputFilePath) {
    return true;
  }

  // Check against gitignore rules
  if (gitignoreManager.shouldIgnore(pathname)) {
    return true;
  }

  if (fs.statSync(pathname).isDirectory()) {
    // Load gitignore file in this directory if it exists
    gitignoreManager.loadGitignoreFile(pathname);

    return (
      SKIP_DIRECTORIES.has(name) ||
      SKIP_DIRECTORY_PATTERNS.some((pattern) => pattern.test(name))
    );
  }

  // Check if the filename is in the skip filenames set
  if (SKIP_FILENAMES.has(nameLower)) {
    return true;
  }

  // Check if the file matches any skip patterns
  if (SKIP_PATTERNS.some((pattern) => pattern.test(nameLower))) {
    return true;
  }

  return (
    (name.startsWith(".") && !ALLOWED_FILENAMES.has(nameLower)) ||
    (!ALLOWED_EXTENSIONS.has(extension.toLowerCase()) &&
      !ALLOWED_FILENAMES.has(nameLower))
  );
}

async function concatenateFiles(
  directory: string = ".",
  type: "list" | "normal" | "verbose" | "minify" = "normal"
): Promise<string> {
  const output: string[] = [];
  const processedPaths = new Set<string>(); // Track processed files to avoid duplicates

  async function walkDir(dir: string): Promise<void> {
    try {
      // Load gitignore file at this directory level
      await gitignoreManager.loadGitignoreFile(dir);

      const entries = await fsPromises.readdir(dir, { withFileTypes: true });

      // Sort entries to make directories come first, then files alphabetically
      const sortedEntries = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const entry of sortedEntries) {
        const fullPath = path.join(dir, entry.name);
        const canonicalPath = path.resolve(fullPath);

        // Skip if we've already processed this path (handles symlink loops)
        if (processedPaths.has(canonicalPath)) continue;
        processedPaths.add(canonicalPath);

        if (entry.isDirectory()) {
          if (!shouldSkip(fullPath)) {
            await walkDir(fullPath);
          }
        } else if (entry.isFile() && !shouldSkip(fullPath)) {
          const fileInfo = await getFileInfo(fullPath);

          if (type === "list") {
            output.push(`${fullPath}`);
          } else if (type === "minify") {
            // For minify type, add formatted file path header but minimize content whitespace
            output.push(`\n\n${"=".repeat(10)}`);
            output.push(`File: ${fullPath}`);
            output.push("=".repeat(10) + "\n");

            try {
              if (fileInfo.size > 1024 * 1024) {
                output.push(`[File content truncated - file exceeds 1MB]`);
              } else {
                const content = await fsPromises.readFile(fullPath, "utf-8");
                // Remove excessive whitespace
                const minified = content
                  .replace(/\n\s*\n\s*\n/g, "\n\n") // Remove extra blank lines
                  .replace(/[ \t]+/g, " ") // Collapse multiple spaces/tabs
                  .replace(/\s+$/gm, "") // Remove trailing whitespace
                  .trim(); // Trim leading/trailing whitespace
                output.push(minified);
              }
            } catch (e) {
              output.push(
                `Error reading file: ${
                  e instanceof Error ? e.message : String(e)
                }`
              );
            }
          } else {
            output.push(`\n\n${"=".repeat(60)}`);
            output.push(`File: ${fullPath}`);
            // verbose
            if (type === "verbose") {
              output.push(`Size: ${formatSize(fileInfo.size)}`);
              output.push(`Language: ${fileInfo.language || "Unknown"}`);
              output.push(`Type: ${fileInfo.fileType || "Unknown"}`);
              if (fileInfo.lineCount)
                output.push(`Lines: ${fileInfo.lineCount}`);
              if (fileInfo.imports && fileInfo.imports.length > 0)
                output.push(`Imports: ${fileInfo.imports.join(", ")}`);
              output.push(`Last Modified: ${fileInfo.lastModified}`);
            }
            output.push("=".repeat(60) + "\n");

            try {
              // For very large files, consider streaming or truncating
              if (fileInfo.size > 1024 * 1024) {
                // 1MB threshold
                output.push(`[File content truncated - file exceeds 1MB]`);
              } else {
                const content = await fsPromises.readFile(fullPath, "utf-8");
                output.push(content);
              }
            } catch (e) {
              output.push(
                `Error reading file: ${
                  e instanceof Error ? e.message : String(e)
                }`
              );
            }
          }
        }
      }
    } catch (error) {
      output.push(
        `Error accessing directory ${dir}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  await walkDir(directory);
  return output.join(type === "minify" ? "" : "\n");
}

// Make getLargestFiles async
async function getLargestFiles(
  directory: string = ".",
  topN: number = 10
): Promise<[number, string][]> {
  // Return a Promise
  const fileSizes: [number, string][] = [];
  const processedPaths = new Set<string>(); // Track processed files to avoid duplicates

  async function walkDir(dir: string): Promise<void> {
    // Make inner walkDir async
    try {
      // Load gitignore file at this directory level
      await gitignoreManager.loadGitignoreFile(dir); // Await async call

      const entries = await fsPromises.readdir(dir, { withFileTypes: true }); // Use async readdir

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const canonicalPath = path.resolve(fullPath);

        // Skip if we've already processed this path (handles symlink loops)
        if (processedPaths.has(canonicalPath)) continue;
        processedPaths.add(canonicalPath);

        if (entry.isDirectory()) {
          if (!shouldSkip(fullPath)) {
            // shouldSkip remains sync for now, relies on manager state
            await walkDir(fullPath); // Await recursive call
          }
        } else if (entry.isFile() && !shouldSkip(fullPath)) {
          try {
            const stats = await fsPromises.stat(fullPath); // Use async stat
            fileSizes.push([stats.size, fullPath]);
          } catch (e) {
            // Skip files we can't access
          }
        }
      }
    } catch (error) {
      // Silent fail on directories we can't access
    }
  }

  await walkDir(directory); // Await the initial call

  // Use heap or more efficient algorithm for large file lists
  return fileSizes.sort((a, b) => b[0] - a[0]).slice(0, topN);
}

function formatSize(size: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let formattedSize = size;
  let unitIndex = 0;

  while (formattedSize >= 1024 && unitIndex < units.length - 1) {
    formattedSize /= 1024;
    unitIndex++;
  }

  return `${formattedSize.toFixed(2)} ${units[unitIndex]}`;
}

async function main(): Promise<void> {
  try {
    // Parse command line arguments
    const args = parseArgs();

    // Apply configuration if available
    if (config) {
      // Directory config (don't override CLI arguments)
      if (config.directory && args.directory === ".") {
        args.directory = config.directory;
      }

      // Output filename config
      if (config.output && !args.output) {
        args.output = config.output;
      }

      // Output type config
      if (config.type && args.type === "normal") {
        args.type = config.type;
      }

      // Show largest files
      if (config.showLargestFiles !== undefined) {
        args.showLargestFiles = config.showLargestFiles;
      }
    }

    // Get the absolute path of the directory
    const absDirectory = path.resolve(args.directory);

    // Verify directory exists
    if (!fs.existsSync(absDirectory)) {
      console.error(`Error: Directory '${args.directory}' does not exist.`);
      process.exit(1);
    }

    // If output file is not specified, use the directory name
    if (!args.output) {
      // Get the last part of the path
      let dirName = path.basename(absDirectory);
      // If it's the current directory, get the parent directory name
      if (dirName === ".") {
        dirName = path.basename(process.cwd());
      }
      // Add .txt extension if not already present
      args.output = dirName.endsWith(".txt") ? dirName : `${dirName}.txt`;
    }

    // Store output file path - ensure it's an absolute path in the current working directory
    outputFilePath = path.isAbsolute(args.output)
      ? path.resolve(args.output)
      : path.join(process.cwd(), args.output);

    // Get and display largest files
    const largestFiles = await getLargestFiles(args.directory, args.topN);

    // Get main content
    const result = await concatenateFiles(args.directory, args.type);

    // Write only the main content to file without largest files summary - use the absolute path
    await fsPromises.writeFile(outputFilePath, result, "utf-8");

    // Display largest files only in console if enabled
    if (args.showLargestFiles) {
      console.log("\nLargest files in directory:");
      console.log("=".repeat(80));

      for (const [size, filePath] of largestFiles) {
        console.log(`${formatSize(size).padEnd(10)} ${filePath}`);
      }

      console.log("=".repeat(80));
    }
    console.log(
      `\nOutput for directory '${args.directory}' has been written to '${outputFilePath}'`
    );
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

function parseArgs() {
  const args = {
    directory: ".",
    type: "normal" as "list" | "normal" | "verbose" | "minify",
    output: "",
    topN: 10,
    showLargestFiles: true,
  };

  // Simple argument parser
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    // Output types
    if (argv[i] === "-l" || argv[i] === "--type=list") {
      args.type = "list";
    } else if (argv[i] === "-n" || argv[i] === "--type=normal") {
      args.type = "normal";
    } else if (argv[i] === "-v" || argv[i] === "--type=verbose") {
      args.type = "verbose";
    } else if (argv[i] === "-m" || argv[i] === "--type=minify") {
      args.type = "minify";
    }
    // Output file
    else if (argv[i] === "-o" || argv[i] === "--output") {
      if (i + 1 < argv.length) {
        args.output = argv[++i];
      }
    }
    // Top N files
    else if (argv[i] === "-t" || argv[i] === "--top-n") {
      if (i + 1 < argv.length) {
        const n = parseInt(argv[++i], 10);
        if (!isNaN(n)) args.topN = n;
      }
    }
    // Show/hide largest files
    else if (argv[i] === "--no-largest-files") {
      args.showLargestFiles = false;
    } else if (argv[i] === "--show-largest-files") {
      args.showLargestFiles = true;
    }
    // Directory (non-flag argument)
    else if (!argv[i].startsWith("-")) {
      args.directory = argv[i];
    }
  }

  return args;
}

// Run the script if this is the main module
if (require.main === module) {
  main();
}

// Export functions for use as a module
export {
  getFileInfo,
  shouldSkip,
  concatenateFiles,
  getLargestFiles,
  formatSize,
};

/**
 * Creates a config file with the default settings or current settings
 * @param directory The directory to use as default in the config
 * @param output The output filename to use as default in the config
 * @param type The output type to use as default in the config
 * @param showLargestFiles Whether to show largest files
 * @returns True if successful, false if failed
 */
export async function createConfigFile(
  directory: string = ".",
  output: string = "",
  type: "list" | "normal" | "verbose" | "minify" = "normal",
  showLargestFiles: boolean = true
): Promise<boolean> {
  try {
    const configPath = path.join(process.cwd(), "codedump.config.ts");

    // Custom configuration based on current settings
    const customConfig: CodeDumpConfig = {
      directory: directory === "." ? "" : directory,
      output,
      type,
      showLargestFiles,

      // Use default filtering options
      allowedExtensions: Array.from(ALLOWED_EXTENSIONS),
      allowedFilenames: Array.from(ALLOWED_FILENAMES),
      skipDirectories: Array.from(SKIP_DIRECTORIES),
      skipDirectoryPatterns: SKIP_DIRECTORY_PATTERNS.map((p) => p.source),
      skipFilenames: Array.from(SKIP_FILENAMES),
      skipPatterns: SKIP_PATTERNS.map((p) => p.source),
    };

    // Create a properly formatted configuration file
    const configContent = `/**
 * CodeDump Configuration File
 * 
 * This file controls the behavior of the CodeDump tool.
 * You can customize which files and directories to include or exclude.
 * Generated on: ${new Date().toISOString()}
 */

const config: CodeDumpConfig = ${
      JSON.stringify(customConfig, null, 2)
        .replace(/"([^"]+)":/g, "$1:") // Convert "key": to key:
        .replace(/\n/g, "\n  ") // Add indentation for readability
    };

export default config;

/**
 * Type definitions for CodeDump configuration
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
`;

    await fsPromises.writeFile(configPath, configContent, "utf-8");
    return true;
  } catch (error) {
    console.error("Failed to create config file:", error);
    return false;
  }
}

// Function to update the current configuration with any loaded config
function updateConfigSettings() {
  if (!config) return;

  // Update all allowed lists and skip lists if defined in config
  if (config.allowedExtensions && config.allowedExtensions.length > 0) {
    ALLOWED_EXTENSIONS.clear();
    config.allowedExtensions.forEach((ext: string) =>
      ALLOWED_EXTENSIONS.add(ext)
    );
  }

  if (config.allowedFilenames && config.allowedFilenames.length > 0) {
    ALLOWED_FILENAMES.clear();
    config.allowedFilenames.forEach((name: string) =>
      ALLOWED_FILENAMES.add(name)
    );
  }

  if (config.skipDirectories && config.skipDirectories.length > 0) {
    SKIP_DIRECTORIES.clear();
    config.skipDirectories.forEach((dir: string) => SKIP_DIRECTORIES.add(dir));
  }

  if (config.skipFilenames && config.skipFilenames.length > 0) {
    SKIP_FILENAMES.clear();
    config.skipFilenames.forEach((file: string) => SKIP_FILENAMES.add(file));
  }

  if (config.skipDirectoryPatterns && config.skipDirectoryPatterns.length > 0) {
    SKIP_DIRECTORY_PATTERNS = config.skipDirectoryPatterns.map(
      (pattern: string) => new RegExp(pattern)
    );
  }

  if (config.skipPatterns && config.skipPatterns.length > 0) {
    SKIP_PATTERNS = config.skipPatterns.map(
      (pattern: string) => new RegExp(pattern)
    );
  }
}

// Call to update settings from config
updateConfigSettings();
