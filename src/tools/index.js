import * as pdfTools from "./pdfTools.js";
import * as convertTools from "./convertTools.js";
import * as fileOps from "./fileOps.js";

// Re-export core file operations that were moved into fileOps.js so that
// existing namespace imports (e.g. `import * as tools from "./tools"`) keep
// working without any code changes elsewhere.
export {
  executeCommand,
  createFile,
  writeFile,
  readFile,
  listDirectory,
  searchFiles,
  getSystemInfo,
  moveFile,
  copyFile,
  createDirectory,
  appendToFile,
  readJSONFile,
  writeJSONFile,
  pathExists,
} from "./fileOps.js";

// In addition to the core fileOps helpers above, surface every PDF and conversion helper
// directly at the top-level so the agent can invoke them without the nested "tools" object.
export * from "./pdfTools.js";
export * from "./convertTools.js";

// Comprehensive tools definition with detailed metadata for AI model context
export const tools = {
  // File Operations
  executeCommand: {
    fn: fileOps.executeCommand,
    description: "Execute a shell command and return the output",
    parameters: {
      command: {
        type: "string",
        required: true,
        description: "The shell command to execute",
      },
    },
    returns:
      "Object with success, stdout, stderr, command, timestamp, and optional exitCode",
    example: "executeCommand({ command: 'ls -la' })",
  },

  createFile: {
    fn: fileOps.createFile,
    description:
      "Create a new file with optional content. Fails if file already exists.",
    parameters: {
      filePath: {
        type: "string",
        required: true,
        description: "Path where the file should be created",
      },
      content: {
        type: "string",
        required: false,
        default: "",
        description: "Initial content for the file",
      },
    },
    returns: "Object with success, path, size, timestamp, and optional error",
    example:
      "createFile({ filePath: './newfile.txt', content: 'Hello World' })",
  },

  writeFile: {
    fn: fileOps.writeFile,
    description:
      "Write content to a file, creating it if it doesn't exist, overwriting if it does",
    parameters: {
      filePath: {
        type: "string",
        required: true,
        description: "Path of the file to write to",
      },
      content: {
        type: "string",
        required: true,
        description: "Content to write to the file",
      },
    },
    returns: "Object with success, path, size, timestamp, and optional error",
    example:
      "writeFile({ filePath: './data.txt', content: 'Updated content' })",
  },

  readFile: {
    fn: fileOps.readFile,
    description: "Read the contents of a file",
    parameters: {
      filePath: {
        type: "string",
        required: true,
        description: "Path of the file to read",
      },
    },
    returns:
      "Object with success, content, path, size, modified, timestamp, and optional error",
    example: "readFile({ filePath: './data.txt' })",
  },

  listDirectory: {
    fn: fileOps.listDirectory,
    description: "List contents of a directory with detailed information",
    parameters: {
      dirPath: {
        type: "string",
        required: false,
        default: ".",
        description: "Path of the directory to list",
      },
    },
    returns:
      "Object with success, path, items array (name, type, size, modified), count, timestamp",
    example: "listDirectory({ dirPath: './src' })",
  },

  searchFiles: {
    fn: fileOps.searchFiles,
    description: "Search for files matching a pattern using find command",
    parameters: {
      pattern: {
        type: "string",
        required: true,
        description: "File name pattern to search for (supports wildcards)",
      },
      directory: {
        type: "string",
        required: false,
        default: ".",
        description: "Directory to search in",
      },
    },
    returns:
      "Object with success, pattern, directory, files array, count, timestamp",
    example: "searchFiles({ pattern: '*.js', directory: './src' })",
  },

  getSystemInfo: {
    fn: fileOps.getSystemInfo,
    description:
      "Get system information including platform, architecture, Node version, etc.",
    parameters: {},
    returns:
      "Object with success, info object (platform, architecture, nodeVersion, cwd, uptime, memory), timestamp",
    example: "getSystemInfo({})",
  },

  moveFile: {
    fn: fileOps.moveFile,
    description: "Move a file or directory from one location to another",
    parameters: {
      from: {
        type: "string",
        required: true,
        description: "Source path",
      },
      to: {
        type: "string",
        required: true,
        description: "Destination path",
      },
      overwrite: {
        type: "boolean",
        required: false,
        default: false,
        description: "Whether to overwrite if destination exists",
      },
    },
    returns: "Object with success, from, to, overwritten, and optional error",
    example:
      "moveFile({ from: './old.txt', to: './new.txt', overwrite: true })",
  },

  copyFile: {
    fn: fileOps.copyFile,
    description: "Copy a file or directory to another location",
    parameters: {
      from: {
        type: "string",
        required: true,
        description: "Source path",
      },
      to: {
        type: "string",
        required: true,
        description: "Destination path",
      },
      overwrite: {
        type: "boolean",
        required: false,
        default: false,
        description: "Whether to overwrite if destination exists",
      },
    },
    returns: "Object with success, from, to, overwritten, and optional error",
    example: "copyFile({ from: './source.txt', to: './backup.txt' })",
  },

  createDirectory: {
    fn: fileOps.createDirectory,
    description: "Create a directory and any necessary parent directories",
    parameters: {
      dirPath: {
        type: "string",
        required: true,
        description: "Path of the directory to create",
      },
      path: {
        type: "string",
        required: false,
        description: "Alternative parameter name for directory path",
      },
      recursive: {
        type: "boolean",
        required: false,
        default: true,
        description: "Whether to create parent directories as needed",
      },
    },
    returns:
      "Object with success, path, created/alreadyExisted, timestamp, and optional error",
    example: "createDirectory({ dirPath: './new/nested/dir' })",
  },

  appendToFile: {
    fn: fileOps.appendToFile,
    description:
      "Append content to the end of a file, creating it if it doesn't exist",
    parameters: {
      filePath: {
        type: "string",
        required: true,
        description: "Path of the file to append to",
      },
      content: {
        type: "string",
        required: false,
        default: "",
        description: "Content to append",
      },
    },
    returns: "Object with success, path, size, timestamp, and optional error",
    example:
      "appendToFile({ filePath: './log.txt', content: '\\nNew log entry' })",
  },

  readJSONFile: {
    fn: fileOps.readJSONFile,
    description: "Read and parse a JSON file",
    parameters: {
      filePath: {
        type: "string",
        required: true,
        description: "Path of the JSON file to read",
      },
    },
    returns:
      "Object with success, content, json (parsed object), path, size, modified, timestamp",
    example: "readJSONFile({ filePath: './config.json' })",
  },

  writeJSONFile: {
    fn: fileOps.writeJSONFile,
    description: "Write an object to a JSON file with pretty formatting",
    parameters: {
      filePath: {
        type: "string",
        required: true,
        description: "Path of the JSON file to write",
      },
      data: {
        type: "any",
        required: true,
        description: "Data to serialize as JSON",
      },
      space: {
        type: "number",
        required: false,
        default: 2,
        description: "Number of spaces for indentation",
      },
    },
    returns: "Object with success, path, size, timestamp, and optional error",
    example:
      "writeJSONFile({ filePath: './data.json', data: { key: 'value' } })",
  },

  pathExists: {
    fn: fileOps.pathExists,
    description: "Check whether a file or directory exists at the given path",
    parameters: {
      targetPath: {
        type: "string",
        required: true,
        description: "Path to check for existence",
      },
    },
    returns:
      "Object with success, path, exists (boolean), timestamp, and optional error",
    example: "pathExists({ targetPath: './somefile.txt' })",
  },

  // PDF Tools
  readPdf: {
    fn: pdfTools.readPdf,
    description: "Extract text content from a PDF file",
    parameters: {
      filePath: {
        type: "string",
        required: true,
        description: "Path to the PDF file to read",
      },
    },
    returns:
      "Object with success, path, text, info, pageCount, and optional error",
    example: "readPdf({ filePath: './document.pdf' })",
  },

  createPdf: {
    fn: pdfTools.createPdf,
    description: "Create a simple one-page PDF from text content",
    parameters: {
      content: {
        type: "string",
        required: false,
        default: "",
        description: "Text content to embed in the PDF",
      },
      outputPath: {
        type: "string",
        required: true,
        description: "Path where the PDF should be saved",
      },
    },
    returns: "Object with success, path, size, and optional error",
    example:
      "createPdf({ content: 'Hello PDF World', outputPath: './output.pdf' })",
  },

  mergePdfs: {
    fn: pdfTools.mergePdfs,
    description: "Merge multiple PDF files into a single document",
    parameters: {
      files: {
        type: "array",
        required: true,
        description: "Array of paths to PDF files to merge (minimum 2 files)",
      },
      outputPath: {
        type: "string",
        required: true,
        description: "Path for the merged output PDF",
      },
    },
    returns: "Object with success, path, size, filesMerged, and optional error",
    example:
      "mergePdfs({ files: ['./doc1.pdf', './doc2.pdf'], outputPath: './merged.pdf' })",
  },

  splitPdf: {
    fn: pdfTools.splitPdf,
    description: "Split a PDF into individual pages or specified page ranges",
    parameters: {
      filePath: {
        type: "string",
        required: true,
        description: "Path to the PDF file to split",
      },
      ranges: {
        type: "array",
        required: false,
        default: null,
        description:
          "Optional array of [start, end] page ranges (1-indexed). If not provided, splits into individual pages",
      },
      outputDir: {
        type: "string",
        required: false,
        default: "splits",
        description: "Directory to save the split PDF files",
      },
    },
    returns: "Object with success, outputDir, files array, and optional error",
    example:
      "splitPdf({ filePath: './document.pdf', ranges: [[1, 3], [4, 6]], outputDir: './splits' })",
  },

  addPdfWatermark: {
    fn: pdfTools.addPdfWatermark,
    description: "Add a semi-transparent watermark text to every page of a PDF",
    parameters: {
      filePath: {
        type: "string",
        required: true,
        description: "Path to the source PDF file",
      },
      watermarkText: {
        type: "string",
        required: false,
        default: "",
        description: "Text to use as watermark",
      },
      outputPath: {
        type: "string",
        required: true,
        description: "Path for the watermarked output PDF",
      },
    },
    returns: "Object with success, path, size, and optional error",
    example:
      "addPdfWatermark({ filePath: './doc.pdf', watermarkText: 'CONFIDENTIAL', outputPath: './watermarked.pdf' })",
  },

  // Conversion Tools
  csvToJson: {
    fn: convertTools.csvToJson,
    description: "Convert a CSV file to JSON format",
    parameters: {
      csvPath: {
        type: "string",
        required: true,
        description: "Path to the source CSV file",
      },
      jsonPath: {
        type: "string",
        required: true,
        description: "Path for the output JSON file",
      },
    },
    returns: "Object with success, path, rows, and optional error",
    example: "csvToJson({ csvPath: './data.csv', jsonPath: './data.json' })",
  },

  jsonToCsv: {
    fn: convertTools.jsonToCsv,
    description: "Convert a JSON file to CSV format",
    parameters: {
      jsonPath: {
        type: "string",
        required: true,
        description: "Path to the source JSON file",
      },
      csvPath: {
        type: "string",
        required: true,
        description: "Path for the output CSV file",
      },
    },
    returns: "Object with success, path, rows, and optional error",
    example: "jsonToCsv({ jsonPath: './data.json', csvPath: './data.csv' })",
  },

  xmlToJson: {
    fn: convertTools.xmlToJson,
    description: "Convert an XML file to JSON format",
    parameters: {
      xmlPath: {
        type: "string",
        required: true,
        description: "Path to the source XML file",
      },
      jsonPath: {
        type: "string",
        required: true,
        description: "Path for the output JSON file",
      },
    },
    returns: "Object with success, path, and optional error",
    example: "xmlToJson({ xmlPath: './data.xml', jsonPath: './data.json' })",
  },

  jsonToXml: {
    fn: convertTools.jsonToXml,
    description: "Convert a JSON file to XML format",
    parameters: {
      jsonPath: {
        type: "string",
        required: true,
        description: "Path to the source JSON file",
      },
      xmlPath: {
        type: "string",
        required: true,
        description: "Path for the output XML file",
      },
    },
    returns: "Object with success, path, and optional error",
    example: "jsonToXml({ jsonPath: './data.json', xmlPath: './data.xml' })",
  },

  markdownToPdf: {
    fn: convertTools.markdownToPdf,
    description: "Convert a Markdown file to PDF format",
    parameters: {
      mdPath: {
        type: "string",
        required: true,
        description: "Path to the source Markdown file",
      },
      pdfPath: {
        type: "string",
        required: true,
        description: "Path for the output PDF file",
      },
    },
    returns: "Object with success, path, size, and optional error",
    example:
      "markdownToPdf({ mdPath: './README.md', pdfPath: './README.pdf' })",
  },
};

export default tools;
