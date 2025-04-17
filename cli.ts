#!/usr/bin/env node

import { promises as fs } from "fs";
import * as path from "path";
import * as readline from "readline";
import {
  concatenateFiles,
  getLargestFiles,
  formatSize,
  createConfigFile,
} from "./codedump";
import * as fsSync from "fs";
import { CodeDumpConfig } from "./types";

interface CliOptions {
  directory: string;
  output: string;
  type: "list" | "normal" | "verbose" | "minify";
  showLargestFiles: boolean;
}

// Function to load configuration file
async function loadConfigFile(): Promise<CodeDumpConfig | null> {
  try {
    // Check multiple possible locations for the config file
    const possibleConfigPaths = [
      path.join(process.cwd(), "codedump.config.ts"),
      path.join(process.cwd(), "codedump.config.js"),
      path.join(process.cwd(), ".codedump.config.ts"),
      path.join(process.cwd(), ".codedump.config.js"),
    ];

    // Try each config path
    for (const configPath of possibleConfigPaths) {
      if (fsSync.existsSync(configPath)) {
        try {
          // Dynamic import works for both TS and JS files
          const importedConfig = await import(configPath);
          console.log(`Loaded configuration from ${path.basename(configPath)}`);
          return importedConfig.default;
        } catch (err) {
          console.error(`Error loading config from ${configPath}:`, err);
        }
      }
    }
  } catch (error) {
    console.warn("Could not load configuration file:", error);
  }
  return null;
}

class TerminalInterface {
  private options: CliOptions = {
    directory: ".",
    output: "",
    type: "normal",
    showLargestFiles: true,
  };

  private menuIndex = 0;
  private inSettingsMenu = false;
  private mainMenuItems = [
    "Directory to dump",
    "Settings",
    "Start dump",
    "Exit",
  ];
  private settingsMenuItems = [
    "Output filename",
    "Output format",
    "Show largest files",
    "Create config file",
    "Back",
    "Start dump",
    "Exit",
  ];

  private typeOptions = ["list", "normal", "verbose", "minify"];
  private typeDescriptions = [
    "Only list file paths",
    "Include file contents with formatting (default)",
    "Include file contents with additional metadata",
    "Include file contents with minimal whitespace",
  ];

  // ANSI escape codes for terminal control
  private readonly CLEAR_LINE = "\x1B[2K\r";
  private readonly HIDE_CURSOR = "\x1B[?25l";
  private readonly SHOW_CURSOR = "\x1B[?25h";
  private readonly MOVE_UP = "\x1B[1A";
  private readonly CYAN = "\x1B[36m";
  private readonly GREEN = "\x1B[32m";
  private readonly YELLOW = "\x1B[33m";
  private readonly RED = "\x1B[31m";
  private readonly RESET = "\x1B[0m";
  private readonly BOLD = "\x1B[1m";

  private rl: readline.Interface;
  private globalKeypressHandler: (str: string, key: readline.Key) => void =
    () => {};
  private isProcessingInput = false;
  private isOutputCustomized = false; // Track if output has been manually set

  constructor() {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private clearScreen(): void {
    console.clear();
  }

  private printTitle(): void {
    console.log(`${this.CYAN}${this.BOLD}
 ██████  ██████  ██████  ███████ ██████  ██    ██ ███    ███ ██████  
██      ██    ██ ██   ██ ██      ██   ██ ██    ██ ████  ████ ██   ██ 
██      ██    ██ ██   ██ █████   ██   ██ ██    ██ ██ ████ ██ ██████  
██      ██    ██ ██   ██ ██      ██   ██ ██    ██ ██  ██  ██ ██      
 ██████  ██████  ██████  ███████ ██████   ██████  ██      ██ ██      
${this.RESET}                                                                 
${this.YELLOW}A tool to dump your codebase contents into a file${this.RESET}
`);
  }

  private renderMenu(): void {
    this.clearScreen();
    this.printTitle();

    // Determine displayed output filename
    let displayOutput;
    if (this.isOutputCustomized) {
      // User has set a custom filename
      displayOutput = this.options.output;
      if (!displayOutput.endsWith(".txt")) {
        displayOutput += ".txt";
      }
    } else {
      // Auto-generate the filename based on directory
      displayOutput = `${this.getAutoFilename()}.txt (auto)`;
    }

    // Check if a config file exists
    const configPath = path.join(process.cwd(), "codedump.config.ts");
    const configExists = fsSync.existsSync(configPath);

    console.log(`${this.YELLOW}Current settings:${this.RESET}`);
    console.log(`  Directory: ${this.options.directory}`);
    console.log(`  Output filename: ${displayOutput}`);
    console.log(`  Output format: ${this.options.type}`);
    console.log(
      `  Show largest files: ${this.options.showLargestFiles ? "Yes" : "No"}`
    );
    console.log(
      `  Configuration file: ${
        configExists ? this.GREEN + "Loaded" + this.RESET : "Not found"
      }\n`
    );

    if (this.inSettingsMenu) {
      console.log(`${this.YELLOW}Settings:${this.RESET}`);
      this.settingsMenuItems.forEach((item, index) => {
        // Add an empty line before "Back" and "Start dump"
        if (index === 3 || index === 4) {
          console.log("");
        }

        if (index === this.menuIndex) {
          console.log(`  ${this.GREEN}▶ ${item}${this.RESET}`);
        } else {
          console.log(`    ${item}`);
        }
      });
    } else {
      console.log(`${this.YELLOW}Select an option:${this.RESET}`);
      this.mainMenuItems.forEach((item, index) => {
        // Add an empty line before "Start dump"
        if (index === 2) {
          console.log("");
        }

        if (index === this.menuIndex) {
          console.log(`  ${this.GREEN}▶ ${item}${this.RESET}`);
        } else {
          console.log(`    ${item}`);
        }
      });
    }

    console.log(
      `\n${this.YELLOW}Use arrow keys to navigate, Enter to select${this.RESET}`
    );
  }

  private async handleMenuSelection(): Promise<void> {
    this.isProcessingInput = true;

    if (this.inSettingsMenu) {
      switch (this.menuIndex) {
        case 0: // Output filename
          await this.promptForOutputFile();
          break;
        case 1: // Output format
          await this.promptForOutputType();
          break;
        case 2: // Show largest files
          await this.promptForShowLargestFiles();
          break;
        case 3: // Create config file
          await this.createConfigFile();
          break;
        case 4: // Back
          this.inSettingsMenu = false;
          this.menuIndex = 0;
          break;
        case 5: // Start dump (from settings)
          await this.startDump();
          break;
        case 6: // Exit (from settings)
          this.exit();
          break;
      }
    } else {
      switch (this.menuIndex) {
        case 0: // Directory
          await this.promptForDirectory();
          break;
        case 1: // Settings
          this.inSettingsMenu = true;
          this.menuIndex = 0;
          break;
        case 2: // Start dump
          await this.startDump();
          break;
        case 3: // Exit
          this.exit();
          break;
      }
    }

    this.isProcessingInput = false;
  }

  private async promptForDirectory(): Promise<void> {
    this.clearScreen();
    this.printTitle();
    console.log(
      `${this.YELLOW}Enter the directory to dump (current: ${this.options.directory}):${this.RESET}`
    );

    // Temporarily remove keypress listener
    process.stdin.removeListener("keypress", this.globalKeypressHandler);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    const answer = await new Promise<string>((resolve) => {
      this.rl.question("> ", (ans) => {
        resolve(ans);
      });
    });

    // Restore raw mode and keypress handler
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.on("keypress", this.globalKeypressHandler);

    if (answer.trim()) {
      try {
        const stats = await fs.stat(answer);
        if (stats.isDirectory()) {
          this.options.directory = answer;

          // Only reset output if not manually customized
          if (!this.isOutputCustomized) {
            this.options.output = ""; // Reset to empty to ensure auto behavior
          }
        } else {
          await this.showMessage(
            `${this.RED}Error: ${answer} is not a directory${this.RESET}`
          );
        }
      } catch (err) {
        await this.showMessage(
          `${this.RED}Error: ${answer} does not exist${this.RESET}`
        );
      }
    }
  }

  private async promptForOutputFile(): Promise<void> {
    this.clearScreen();
    this.printTitle();

    // Get auto-generated filename for display
    let autoFilename = this.getAutoFilename();

    console.log(
      `${this.YELLOW}Enter the output filename (current: ${
        this.isOutputCustomized ? this.options.output : autoFilename + " (auto)"
      }):${this.RESET}`
    );
    console.log(
      `Leave empty to use auto-generated filename based on directory.`
    );

    // Temporarily remove keypress listener
    process.stdin.removeListener("keypress", this.globalKeypressHandler);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    const answer = await new Promise<string>((resolve) => {
      this.rl.question("> ", (ans) => {
        resolve(ans);
      });
    });

    // Restore raw mode and keypress handler
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.on("keypress", this.globalKeypressHandler);

    if (answer.trim()) {
      this.options.output = answer;
      this.isOutputCustomized = true;
    } else {
      // Reset to auto mode
      this.options.output = "";
      this.isOutputCustomized = false;
    }
  }

  private async promptForOutputType(): Promise<void> {
    this.clearScreen();
    this.printTitle();
    console.log(`${this.YELLOW}Select output format:${this.RESET}`);

    let typeIndex = this.typeOptions.indexOf(this.options.type);
    if (typeIndex === -1) typeIndex = 1; // Default to normal

    const renderTypeOptions = () => {
      console.clear();
      this.printTitle();
      console.log(`${this.YELLOW}Select output format:${this.RESET}`);

      this.typeOptions.forEach((type, index) => {
        if (index === typeIndex) {
          console.log(
            `  ${this.GREEN}▶ ${type}${this.RESET} - ${this.typeDescriptions[index]}`
          );
        } else {
          console.log(`    ${type} - ${this.typeDescriptions[index]}`);
        }
      });

      console.log(
        `\n${this.YELLOW}Use arrow keys to navigate, Enter to select${this.RESET}`
      );
    };

    renderTypeOptions();

    // Temporarily remove global keypress handler
    process.stdin.removeListener("keypress", this.globalKeypressHandler);

    return new Promise<void>((resolve) => {
      const handleKeypress = (str: string, key: readline.Key) => {
        if (key.name === "up" && typeIndex > 0) {
          typeIndex--;
          renderTypeOptions();
        } else if (
          key.name === "down" &&
          typeIndex < this.typeOptions.length - 1
        ) {
          typeIndex++;
          renderTypeOptions();
        } else if (key.name === "return") {
          this.options.type = this.typeOptions[typeIndex] as any;
          process.stdin.removeListener("keypress", handleKeypress);
          // Restore global keypress handler
          process.stdin.on("keypress", this.globalKeypressHandler);
          resolve();
        }
      };

      process.stdin.on("keypress", handleKeypress);
    });
  }

  private async promptForShowLargestFiles(): Promise<void> {
    this.clearScreen();
    this.printTitle();

    // Create options for Yes/No
    const options = ["Yes", "No"];
    let selectedIndex = this.options.showLargestFiles ? 0 : 1;

    const renderOptions = () => {
      console.clear();
      this.printTitle();
      console.log(`${this.YELLOW}Show largest files in dump:${this.RESET}`);
      console.log(
        `Displays the 5 largest files at the beginning of the dump file.\n`
      );

      options.forEach((option, index) => {
        if (index === selectedIndex) {
          console.log(`  ${this.GREEN}▶ ${option}${this.RESET}`);
        } else {
          console.log(`    ${option}`);
        }
      });

      console.log(
        `\n${this.YELLOW}Use arrow keys to navigate, Enter to select${this.RESET}`
      );
    };

    renderOptions();

    // Wait for selection
    await new Promise<void>((resolve) => {
      const handleKeypress = (str: string, key: readline.Key) => {
        if (key.name === "up" && selectedIndex > 0) {
          selectedIndex--;
          renderOptions();
        } else if (key.name === "down" && selectedIndex < options.length - 1) {
          selectedIndex++;
          renderOptions();
        } else if (key.name === "return") {
          this.options.showLargestFiles = selectedIndex === 0;
          process.stdin.removeListener("keypress", handleKeypress);
          resolve();
        }
      };

      // Temporarily remove global keypress handler
      process.stdin.removeListener("keypress", this.globalKeypressHandler);
      process.stdin.on("keypress", handleKeypress);
    });

    // Restore global keypress handler
    process.stdin.on("keypress", this.globalKeypressHandler);
  }

  private async createConfigFile(): Promise<void> {
    this.clearScreen();
    this.printTitle();

    const configPath = path.join(process.cwd(), "codedump.config.ts");
    const configExists = fsSync.existsSync(configPath);

    if (configExists) {
      console.log(
        `${this.YELLOW}Warning: A configuration file already exists at:${this.RESET}`
      );
      console.log(configPath);
      console.log(
        "\nCreating a new config file will overwrite the existing one."
      );
      console.log(`${this.YELLOW}Do you want to continue? (y/n)${this.RESET}`);

      // Temporarily remove keypress listener
      process.stdin.removeListener("keypress", this.globalKeypressHandler);

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }

      const answer = await new Promise<string>((resolve) => {
        this.rl.question("> ", (ans) => {
          resolve(ans.toLowerCase());
        });
      });

      // Restore raw mode and keypress handler
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.on("keypress", this.globalKeypressHandler);

      if (answer !== "y" && answer !== "yes") {
        await this.showMessage(
          `${this.YELLOW}Config file creation cancelled.${this.RESET}`
        );
        return;
      }
    }

    console.log(
      `${this.YELLOW}Creating configuration file with current settings...${this.RESET}`
    );

    try {
      const success = await createConfigFile(
        this.options.directory,
        this.options.output,
        this.options.type,
        this.options.showLargestFiles
      );

      if (success) {
        await this.showMessage(
          `${this.GREEN}Config file created successfully at:${this.RESET}\n${configPath}`
        );
      } else {
        await this.showMessage(
          `${this.RED}Failed to create config file.${this.RESET}`
        );
      }
    } catch (error) {
      await this.showMessage(
        `${this.RED}Error creating config file: ${
          error instanceof Error ? error.message : String(error)
        }${this.RESET}`
      );
    }
  }

  private async startDump(): Promise<void> {
    this.clearScreen();
    this.printTitle();
    console.log(`${this.YELLOW}Starting dump process...${this.RESET}`);

    try {
      // Verify directory exists
      try {
        await fs.access(this.options.directory);
      } catch (err) {
        throw new Error(
          `Directory '${this.options.directory}' does not exist.`
        );
      }

      // If output file is not specified or using auto mode, use the directory name
      let outputFile = this.options.output;
      if (!this.isOutputCustomized || !outputFile) {
        outputFile = this.getAutoFilename();
      }

      // Add .txt extension if not already present
      if (!outputFile.endsWith(".txt")) {
        outputFile += ".txt";
      }

      let largestFiles: [number, string][] = [];

      if (this.options.showLargestFiles) {
        console.log(`${this.YELLOW}Getting largest files...${this.RESET}`);

        // Get largest files
        largestFiles = getLargestFiles(
          this.options.directory,
          5 // Always show 5 files
        );
      }

      console.log(`\n${this.YELLOW}Generating dump file...${this.RESET}`);

      // Get main content
      const result = concatenateFiles(
        this.options.directory,
        this.options.type
      );

      // Write only the main content to file
      await fs.writeFile(outputFile, result, "utf-8");

      if (this.options.showLargestFiles) {
        console.log(`\n${this.YELLOW}Largest files in directory:${this.RESET}`);
        console.log("=".repeat(80));

        for (const [size, filePath] of largestFiles) {
          console.log(`${formatSize(size).padEnd(10)} ${filePath}`);
        }

        console.log("=".repeat(80));
      }

      await this.showMessage(
        `${this.GREEN}Success: Output has been written to '${outputFile}'${this.RESET}`
      );
    } catch (error) {
      await this.showMessage(
        `${this.RED}Error: ${
          error instanceof Error ? error.message : String(error)
        }${this.RESET}`
      );
    }
  }

  private async showMessage(message: string): Promise<void> {
    console.log(`\n${message}`);
    console.log(`\n${this.YELLOW}Press any key to continue...${this.RESET}`);

    // Temporarily remove the global keypress listener
    process.stdin.removeListener("keypress", this.globalKeypressHandler);

    return new Promise<void>((resolve) => {
      const handleKeypress = () => {
        process.stdin.removeListener("keypress", handleKeypress);
        // Restore the global keypress listener
        process.stdin.on("keypress", this.globalKeypressHandler);
        resolve();
      };

      process.stdin.once("keypress", handleKeypress);
    });
  }

  private exit(): void {
    // Clear screen one last time
    this.clearScreen();

    // Reset cursor and terminal state
    process.stdout.write(this.SHOW_CURSOR);

    // Simple goodbye message
    console.log(`${this.CYAN}Thank you for using CodeDump!${this.RESET}`);

    this.rl.close();
    process.exit(0);
  }

  public async start(): Promise<void> {
    // Hide cursor at startup
    process.stdout.write(this.HIDE_CURSOR);

    // Clear screen
    this.clearScreen();

    this.renderMenu();

    this.globalKeypressHandler = (str, key) => {
      if (key.ctrl && key.name === "c") {
        process.stdout.write(this.SHOW_CURSOR);
        this.exit();
      } else if (
        !this.isProcessingInput &&
        key.name === "up" &&
        this.menuIndex > 0
      ) {
        this.menuIndex--;
        this.renderMenu();
      } else if (
        !this.isProcessingInput &&
        key.name === "down" &&
        this.menuIndex <
          (this.inSettingsMenu
            ? this.settingsMenuItems.length - 1
            : this.mainMenuItems.length - 1)
      ) {
        this.menuIndex++;
        this.renderMenu();
      } else if (!this.isProcessingInput && key.name === "return") {
        this.handleMenuSelection().then(() => {
          this.renderMenu();
        });
      }
    };

    process.stdin.on("keypress", this.globalKeypressHandler);

    // Ensure terminal is restored on unexpected exit
    process.on("exit", () => {
      process.stdout.write(this.SHOW_CURSOR);
    });

    process.on("SIGINT", () => {
      this.exit();
    });

    process.on("SIGTERM", () => {
      this.exit();
    });
  }

  // Helper to get auto-generated filename
  private getAutoFilename(): string {
    let dirName = path.basename(path.resolve(this.options.directory));
    if (dirName === ".") {
      dirName = path.basename(process.cwd());
    }
    return dirName;
  }

  // Add a method to apply config values
  public applyConfig(config: CodeDumpConfig): void {
    if (config.directory) {
      this.options.directory = config.directory;
    }

    if (config.output) {
      this.options.output = config.output;
      this.isOutputCustomized = true;
    }

    if (config.type) {
      this.options.type = config.type;
    }

    if (config.showLargestFiles !== undefined) {
      this.options.showLargestFiles = config.showLargestFiles;
    }
  }
}

(async () => {
  try {
    // Load configuration file if it exists
    const config = await loadConfigFile();

    const cli = new TerminalInterface();

    // Apply configuration if loaded
    if (config) {
      cli.applyConfig(config);
    }

    await cli.start();
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
})();
