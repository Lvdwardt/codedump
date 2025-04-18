# CodeDump

A tool to dump your codebase contents into a single file for easy sharing, analysis, or documentation.

## Installation

```bash
# Install globally
npm install -g codedump.ts

# Or run directly with npx
npx codedump.ts
```

## Usage

### Interactive CLI Mode

The easiest way to use CodeDump is through its interactive CLI:

```bash
codedump.ts
```

This will start an interactive menu where you can:

- Select the directory to dump
- Configure output settings
- Customize which files to include/exclude
- Create a configuration file

### Command Line Arguments

```bash
# Basic usage
codedump.ts <directory>

# Specify output file
codedump.ts <directory> -o output.txt

# Use a specific output format
codedump.ts <directory> --type=verbose
```

### Output Formats

- `list`: Only list file paths
- `normal`: Include file contents with formatting (default)
- `verbose`: Include file contents with additional metadata
- `minify`: Include file contents with minimal whitespace

### Additional Options

- `--no-largest-files`: Don't show the largest files section
- `--show-largest-files`: Show the largest files section (default)

## Configuration

You can create a configuration file to customize CodeDump's behavior. This allows you to set defaults for all options and customize which files and directories are included or excluded.

### Creating a Config File

1. Create a file named `codedump.config.ts` (or `codedump.config.js`) in your project's root directory
2. Or use the interactive CLI to create one for you

### Example Configuration

```typescript
import { CodeDumpConfig } from "codedump/types";

const config: CodeDumpConfig = {
  // Main settings
  directory: "src", // Default directory to dump
  output: "my-code", // Default output filename (without extension)
  type: "verbose", // Default output format
  showLargestFiles: true, // Show largest files at beginning of dump

  // Customize files to include/exclude
  allowedExtensions: [".ts", ".js", ".md"], // Only include these extensions
  skipDirectories: ["node_modules", "dist"], // Skip these directories
  skipFilenames: [".DS_Store"], // Skip these files
};

export default config;
```

## License

MIT
