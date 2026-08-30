# Redacts the demo fixture shipped inside the published bundle.
#
# The demo fixture is a real Bob export: it carries absolute paths from the
# machine that produced it and the system prompt lists locally installed skills.
# Both would be readable by anyone who opens the published page.
#
# Unlike scripts/sanitize-bob-export.jq, this filter keeps only the minimum
# structured arguments required by the detectors. Message bodies, task prompts,
# patches, file contents and other free-form arguments are removed.
#
# _meta.changes, _meta.fileMtimes and _meta.cwd are dropped entirely: they are
# undocumented and key paths there are not reachable by a value-level gsub.
# Defensive final pass.
#
# Subtask sessions embed a NESTED message array at
# .tasks[].messages[].data.messages[] carrying the delegated subtask transcript,
# including _meta.fileMtimes whose OBJECT KEYS are absolute file:// paths. The
# per-message transforms above only reach the top-level messages array, so this
# pass walks the whole document and drops those undocumented _meta fields
# wherever they appear, at any depth.
def strip_meta_leaks:
  walk(
    if type == "object" and has("_meta") and (._meta | type) == "object"
    then ._meta |= del(.fileMtimes, .changes, .cwd)
    else .
    end
  );

def redact_paths:
  walk(
    if type == "string" then
      gsub("/home/[^/\"]+"; "/workspace")
      | gsub("/Users/[^/\"]+"; "/workspace")
      | gsub("[A-Za-z]:\\\\Users\\\\[^\\\\\"]+"; "/workspace")
    else . end
  );

def safe_arguments:
  if .name == "execute_command" then
    {command: (.arguments.command // "[REDACTED]")}
  elif (.name == "read_file" or .name == "list_files" or .name == "write_file") then
    ({path: (.arguments.path // "[REDACTED]")}
      + (if .name == "list_files" and .arguments.recursive? != null
         then {recursive: .arguments.recursive} else {} end))
  elif .name == "apply_diff" then
    {path: (.arguments.path // "[REDACTED]")}
  else
    {}
  end;

.workspace = "file:/workspace/bob-demo"
| .tasks |= map(
    .task.title = "[REDACTED]"
    | .task.firstMessage = "[REDACTED]"
    | .task.lastError = (if .task.lastError == null then null else "[REDACTED]" end)
    | .task.messageQueue = null
    | .task.workspace = "file:/workspace/bob-demo"
    | .task.env.workspace = "/workspace/bob-demo"
    | .task.env.workspaceName = "[REDACTED]"
    | .task.env.query = "[REDACTED]"
    | .task.env.task = ((.task.env.task // []) | map(.description = "[REDACTED]"))
    | .task.env.staticEnvInfo.primaryWorkspace = "/workspace/bob-demo"
    | .task.approvalConfig.allowedExecutors = ((.task.approvalConfig.allowedExecutors // []) | map(.approvedCommands = [] | .deniedCommands = []))
    | .task.approvalConfig.taskCommandApprovals = ((.task.approvalConfig.taskCommandApprovals // []) | map(.approvedCommands = []))
    | .messages |= map(
        .data.content = "[REDACTED]"
        | if .data.envContext? then .data.envContext = "[REDACTED]" else . end
        | if .data.toolCalls? then
            .data.toolCalls |= map(.arguments = (safe_arguments | redact_paths))
          else . end
        | if .data.toolUsage?.signature?.arguments? then
            .data.toolUsage.signature.arguments = {}
          else . end
        | if .data._meta? then
            .data._meta = (
              {timestamp: .data._meta.timestamp}
              + (if .data._meta.spend? then {spend: .data._meta.spend} else {} end)
              + (if .data._meta.durationMs? then {durationMs: .data._meta.durationMs} else {} end)
            )
          else . end
      )
  )
| redact_paths
| strip_meta_leaks
