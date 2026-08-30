# Redacts the demo fixture shipped inside the published bundle.
#
# The demo fixture is a real Bob export: it carries absolute paths from the
# machine that produced it and the system prompt lists locally installed skills.
# Both would be readable by anyone who opens the published page.
#
# Unlike scripts/sanitize-bob-export.jq, this filter keeps
# toolCalls[].arguments intact, because the MCP detector parses the shell
# commands stored there. Only the fields that actually leak are redacted.
#
# _meta.changes, _meta.fileMtimes and _meta.cwd are dropped entirely: they are
# undocumented and key paths there are not reachable by a value-level gsub.
def redact_paths:
  walk(if type == "string" then gsub("/home/[^/\"]+"; "/home/user") else . end);

.workspace = "file:/workspace/bob-demo"
| .tasks |= map(
    .task.workspace = "file:/workspace/bob-demo"
    | .task.env.workspace = "/workspace/bob-demo"
    | .task.env.staticEnvInfo.primaryWorkspace = "/workspace/bob-demo"
    | .messages |= map(
        if .role == "system"
        then .data.content = "[REDACTED — system prompt omitted from the public demo fixture]"
        else .
        end
        | if .data._meta? then .data._meta |= del(.changes, .fileMtimes, .cwd) else . end
      )
  )
| redact_paths
