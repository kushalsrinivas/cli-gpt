# Enhanced CLI Agent with 4-Mode System

## Overview

The enhanced CLI agent now operates with a structured 4-mode system that provides better error handling, structured JSON output, and a more systematic approach to task execution.

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

## Usage Examples

### Basic Usage (Human-Readable Output)

```bash
# List files in current directory
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

## Configuration

### Environment Variables

- `OPENROUTER_API_KEY` - Your OpenRouter API key for AI functionality
- `CLIAGENT_MAX_ITERATIONS` - Maximum iterations (default: 10)
- `CLIAGENT_TIMEOUT` - Command timeout in ms (default: 30000)

### Setup

```bash
# Configure API key
node src/cli.js config

# Or set environment variable
export OPENROUTER_API_KEY="your-api-key-here"
```

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
# cli-gpt
