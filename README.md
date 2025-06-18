# Enhanced CLI Agent with 4-Mode System

## Overview

The enhanced CLI agent now operates with a structured 4-mode system that provides better error handling, structured JSON output, and a more systematic approach to task execution. It supports both OpenRouter and OpenAI as AI providers.

## Installation

```bash
# Install dependencies (includes OpenAI SDK)
npm install

# Configure your AI provider
cliagent config
```

## 4-Mode System

### 1. START Mode

- **Purpose**: Initialize task execution
- **Output**: Task description and initial setup
- **JSON Structure**:

```json
{
  "mode": "START",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "task": "user provided task description",
  "iteration": 0
}
```

### 2. THINK Mode

- **Purpose**: AI analyzes the task and plans the approach
- **Features**:
  - Multi-step reasoning (3-4 analysis cycles)
  - Confidence assessment
  - Action planning
- **JSON Structure**:

```json
{
  "mode": "THINK",
  "timestamp": "2024-01-15T10:30:01.000Z",
  "iteration": 1,
  "thinking": {
    "analysis": "Detailed analysis of the situation",
    "considerations": ["factor 1", "factor 2", "factor 3"],
    "plan": "Step-by-step plan for execution",
    "confidence": "high|medium|low"
  },
  "conclusion": "CONTINUE|COMPLETE",
  "nextAction": {
    "tool": "toolName",
    "parameters": { "param1": "value1" }
  },
  "output": "Final output if conclusion is COMPLETE"
}
```

### 3. ACTION Mode

- **Purpose**: Execute tools and commands
- **Features**:
  - Tool execution with timing
  - Error handling
  - Result capture
- **JSON Structure**:

```json
{
  "mode": "ACTION",
  "timestamp": "2024-01-15T10:30:02.000Z",
  "iteration": 1,
  "action": {
    "tool": "listDirectory",
    "parameters": {"dirPath": "/current/directory"},
    "duration": "150ms"
  },
  "result": {
    "success": true,
    "items": [...],
    "count": 5
  },
  "success": true
}
```

### 4. OBSERVE Mode

- **Purpose**: Analyze action results and determine next steps
- **Features**:
  - Result evaluation
  - Continuation logic
  - Final output extraction
- **JSON Structure**:

```json
{
  "mode": "OBSERVE",
  "timestamp": "2024-01-15T10:30:03.000Z",
  "iteration": 1,
  "observation": {
    "actionSuccess": true,
    "actionTool": "listDirectory",
    "result": {...},
    "timestamp": "2024-01-15T10:30:02.000Z"
  },
  "status": "CONTINUE|COMPLETE",
  "finalOutput": "result if status is COMPLETE"
}
```

### 5. OUTPUT Mode

- **Purpose**: Provide final results and summary
- **JSON Structure**:

```json
{
  "mode": "OUTPUT",
  "timestamp": "2024-01-15T10:30:04.000Z",
  "completed": true,
  "iterations": 2,
  "finalOutput": "Task execution results",
  "summary": {
    "totalIterations": 2,
    "actionsPerformed": 1,
    "successfulActions": 1,
    "finalStatus": "completed"
  }
}
```

## Enhanced Tools

### Core Tools

1. **executeCommand(command)** - Execute shell commands with timeout
2. **createFile(filePath, content)** - Create new files with validation
3. **writeFile(filePath, content)** - Write/overwrite files
4. **readFile(filePath)** - Read file contents with metadata
5. **deleteFile(filePath)** - Delete files safely
6. **listDirectory(dirPath)** - List directory contents with details

### New Tools

7. **searchFiles(pattern, directory)** - Search for files matching patterns
8. **getSystemInfo()** - Get comprehensive system information

### PDF Utilities

9. **readPdf(filePath)** - Extract text & metadata from a PDF.
10. **createPdf(content, outputPath)** - Generate a one-page PDF from plain text.
11. **mergePdfs(files, outputPath)** - Merge multiple PDFs.
12. **splitPdf(filePath, ranges, outputDir)** - Split a PDF into pages or ranges.
13. **addPdfWatermark(filePath, watermarkText, outputPath)** - Apply watermark across pages.

### File Conversion

14. **csvToJson(csvPath, jsonPath)** – Convert CSV ➜ JSON.
15. **jsonToCsv(jsonPath, csvPath)** – Convert JSON ➜ CSV.
16. **xmlToJson(xmlPath, jsonPath)** – Convert XML ➜ JSON.
17. **jsonToXml(jsonPath, xmlPath)** – Convert JSON ➜ XML.
18. **markdownToPdf(mdPath, pdfPath)** – Render Markdown ➜ PDF.

#### Example Conversions

```bash
# Extract PDF text
cliagent run "read.pdf filePath=report.pdf" --json

# Convert CSV to JSON
cliagent run "csvToJson csvPath=data.csv jsonPath=data.json" --json

# Markdown to PDF
cliagent run "markdownToPdf mdPath=README.md pdfPath=README.pdf" --json
```

## Usage Examples

### Interactive Mode (Recommended)

```bash
# Start interactive mode (default behavior)
node src/cli.js

# Then type your requests:
# - "list the files in the current directory"
# - "show me system information"
# - "find all .js files in the src directory"
# - Press Ctrl+C to exit
```

### Single Command Mode

```bash
# Run one task and exit
node src/cli.js run "list the files in the current directory"

# Get system information
node src/cli.js run "show me system information"

# Search for specific files
node src/cli.js run "find all .js files in the src directory"
```

### JSON Output Mode

```bash
# Enable structured JSON output
node src/cli.js run "list files" --json

# JSON output with verbose error details
node src/cli.js run "complex task" --json --verbose
```

### Programmatic Usage

```javascript
import { Agent } from "./src/agent.js";
import { config } from "./src/config.js";

const agent = new Agent(config);

// Human-readable output
const result1 = await agent.execute("list files", { json: false });

// Structured JSON output
const result2 = await agent.execute("list files", { json: true });
console.log(JSON.stringify(result2, null, 2));
```

## Error Handling

### Recoverable Errors

The agent can handle and recover from:

- File not found (ENOENT)
- Permission denied (EACCES)
- Command timeouts (ETIMEDOUT)
- Command execution failures

### Error Output Structure

```json
{
  "mode": "ERROR",
  "timestamp": "2024-01-15T10:30:05.000Z",
  "iteration": 2,
  "error": {
    "message": "Error description",
    "recoverable": true,
    "context": "Agent loop execution"
  }
}
```

## OpenAI Support

The CLI Agent now supports both OpenRouter and OpenAI as AI providers, giving you flexibility in choosing your preferred AI service.

### Supported Providers

- **OpenRouter**: Access to multiple AI models through one API (default)
- **OpenAI**: Direct access to OpenAI's models (GPT-4, GPT-3.5, etc.)

### Environment Variables

- `LLM_PROVIDER` - AI provider to use (`openrouter` or `openai`)
- `OPENROUTER_API_KEY` - Your OpenRouter API key
- `OPENAI_API_KEY` - Your OpenAI API key
- `OPENAI_ORG` - Your OpenAI organization ID (optional)
- `CLIAGENT_MAX_ITERATIONS` - Maximum iterations (default: 10)
- `CLIAGENT_TIMEOUT` - Command timeout in ms (default: 30000)

### Setup

```bash
# Configure provider and API keys interactively
cliagent config

# Or set environment variables
export LLM_PROVIDER="openai"
export OPENAI_API_KEY="sk-your-openai-key-here"
export OPENAI_ORG="org-your-organization-id"  # optional
```

### Usage with Provider Selection

```bash
# Use OpenAI for a specific task
cliagent run "analyze this code" --provider openai

# Use OpenRouter for a specific task
cliagent run "generate documentation" --provider openrouter

# Switch provider in interactive mode
cliagent interactive
# Then type: /provider
```

### Provider-Specific Models

**OpenAI Models:**

- gpt-4-turbo
- gpt-4
- gpt-3.5-turbo
- gpt-3.5-turbo-16k
- And more...

**OpenRouter Models:**

- sarvamai/sarvam-m:free
- deepseek/deepseek-r1-0528:free
- anthropic/claude-3.5-sonnet
- openai/gpt-4-turbo (via OpenRouter)
- And many more...

### Interactive Commands

In interactive mode, you can now use:

- `/provider` - Switch between OpenAI and OpenRouter
- `/model` or `/switch` - Switch AI model within current provider
- `/status` - View current provider and model settings

## Configuration

## Testing

### Run Test Suite

```bash
# Run comprehensive tests
node test-agent.js

# Test specific functionality
node src/cli.js run "test task" --json --verbose
```

### Test Cases Included

1. Directory listing with human output
2. System information gathering
3. JSON output formatting
4. Error handling scenarios
5. Multi-iteration workflows

## Advanced Features

### Iteration Control

- **Maximum Iterations**: Prevents infinite loops (default: 10)
- **Smart Completion**: Automatic task completion detection
- **Context Preservation**: Maintains state across iterations

### Output Formatting

- **Human-Readable**: Colored, formatted output for terminal use
- **JSON Mode**: Structured data for programmatic consumption
- **Verbose Mode**: Detailed error information and stack traces

### Tool Enhancement

- **Input Validation**: All tools validate inputs before execution
- **Detailed Results**: Rich metadata in all tool responses
- **Error Recovery**: Graceful handling of tool failures

## Integration Examples

### Parsing JSON Output

```javascript
// Parse agent output for automation
const output = JSON.parse(agentOutput);

switch (output.mode) {
  case "OUTPUT":
    console.log("Task completed:", output.finalOutput);
    break;
  case "ERROR":
    console.error("Task failed:", output.error.message);
    break;
}
```

### Workflow Automation

```bash
#!/bin/bash
# Automated workflow using JSON output

RESULT=$(node src/cli.js run "backup important files" --json)
STATUS=$(echo $RESULT | jq -r '.mode')

if [ "$STATUS" = "OUTPUT" ]; then
    echo "Backup completed successfully"
else
    echo "Backup failed"
    exit 1
fi
```

## Troubleshooting

### Common Issues

1. **API Key Not Set**: Configure OpenRouter API key
2. **Permission Errors**: Ensure proper file/directory permissions
3. **Timeout Issues**: Increase timeout for long-running commands
4. **JSON Parse Errors**: Check for malformed AI responses

### Debug Mode

```bash
# Enable verbose output for debugging
node src/cli.js run "problematic task" --verbose --json
```

## Performance Considerations

- **Iteration Limits**: Prevents runaway processes
- **Command Timeouts**: Prevents hanging on long operations
- **Memory Management**: Efficient handling of large outputs
- **Error Recovery**: Graceful degradation on failures

## Future Enhancements

- [ ] Plugin system for custom tools
- [ ] Parallel action execution
- [ ] Advanced reasoning patterns
- [ ] Integration with more AI providers
- [ ] Web interface for agent management

## Session Management & Retrieval-Augmented Generation (RAG)

The agent now supports **persistent sessions** that maintain a rolling context window on disk and inject the most relevant snippets back into the prompt for better reasoning.

### Commands

```bash
# Create a new session
cliagent new-session

# Run a task inside that session
cliagent run "How do I add RAG?" --session <id>

# Show what the model remembers so far
cliagent show-context <id>

# Clear the context window
cliagent clear-context <id>
```

### Configuration

| Key                 | Description                                 | Default              |
| ------------------- | ------------------------------------------- | -------------------- |
| CONTEXT_WINDOW_SIZE | Max JSONL lines per session                 | 4000                 |
| RAG_TOP_K           | Number of snippets injected                 | 3                    |
| RAG_STRATEGY        | Retrieval strategy (`keyword`, `embedding`) | keyword              |
| SESSIONS_DIR        | Directory for sessions                      | ~/.cliagent/sessions |

Update these values via `cliagent config` or by editing your `.env` file.

### Flow Diagram

1. Each mode output is appended to `context_window.jsonl`.
2. Before THINK, top-K snippets are fetched via `fast-fuzzy` keyword search.
