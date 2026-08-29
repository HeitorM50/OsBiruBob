{
  version,
  exportedAt,
  workspace: "file:/[REDACTED]",
  tasks: [
    .tasks[]
    | .task as $task
    | {
        task: {
          id: $task.id,
          workspace: "file:/[REDACTED]",
          parentId: $task.parentId,
          taskType: $task.taskType,
          title: "[REDACTED]",
          status: $task.status,
          firstMessage: "[REDACTED]",
          version: $task.version,
          gitSha: $task.gitSha,
          gitBranch: $task.gitBranch,
          isPinned: $task.isPinned,
          lastError: (if $task.lastError == null then null else "[REDACTED]" end),
          messageQueue: null,
          createdAt: $task.createdAt,
          updatedAt: $task.updatedAt,
          env: {
            id: $task.env.id,
            workspace: "file:/[REDACTED]",
            workspaceName: "[REDACTED]",
            scheme: $task.env.scheme,
            query: "[REDACTED]",
            language: $task.env.language,
            isPlayground: $task.env.isPlayground,
            costEffective: $task.env.costEffective,
            modeId: $task.env.modeId,
            _meta: {
              commandSecurityModel: $task.env._meta.commandSecurityModel
            },
            staticEnvInfo: {
              primaryWorkspace: "[REDACTED]",
              systemInfo: $task.env.staticEnvInfo.systemInfo
            },
            task: [
              $task.env.task[]?
              | { description: "[REDACTED]", state }
            ]
          },
          approvalConfig: {
            autoApprovalEnabled: $task.approvalConfig.autoApprovalEnabled,
            outsideWorkspaceAllowed: $task.approvalConfig.outsideWorkspaceAllowed,
            allowed_permissions: $task.approvalConfig.allowed_permissions,
            editApprovalPreviewMode: $task.approvalConfig.editApprovalPreviewMode,
            allowedExecutors: [
              $task.approvalConfig.allowedExecutors[]?
              | { toolId, approvedCommands: [], deniedCommands: [] }
            ],
            taskCommandApprovals: [
              $task.approvalConfig.taskCommandApprovals[]?
              | { toolId, approvedCommands: [] }
            ],
            forbiddenApprovalGroups: [],
            taskAllowedMcpTools: []
          },
          costs: {
            cost: $task.costs.cost,
            contextTokens: $task.costs.contextTokens,
            contextWindowBreakdown: {
              total: $task.costs.contextWindowBreakdown.total,
              reportedTotal: $task.costs.contextWindowBreakdown.reportedTotal,
              breakdown: $task.costs.contextWindowBreakdown.breakdown,
              loadedSkills: ($task.costs.contextWindowBreakdown.loadedSkills // []),
              key: "[REDACTED]"
            }
          }
        },
        messages: [
          .messages[]
          | . as $message
          | $message.data as $data
          | {
              id: $message.id,
              role: $message.role,
              createdAt: $message.createdAt,
              data: (
                {
                  id: $data.id,
                  role: $data.role,
                  content: "[REDACTED]",
                  _meta: (
                    { timestamp: $data._meta.timestamp }
                    + (if $data._meta.spend? then
                        { spend: $data._meta.spend }
                      else {} end)
                    + (if $data._meta.durationMs? then
                        { durationMs: $data._meta.durationMs }
                      else {} end)
                  )
                }
                + (if $data.envContext? then
                    { envContext: "[REDACTED]" }
                  else {} end)
                + (if $data.availableTools? then
                    { availableTools: $data.availableTools }
                  else {} end)
                + (if $data.stop? then { stop: $data.stop } else {} end)
                + (if $data.toolCalls? then
                    {
                      toolCalls: [
                        $data.toolCalls[]
                        | { id, name, arguments: {} }
                      ]
                    }
                  else {} end)
                + (if $data.toolUsage? then
                    {
                      toolUsage: {
                        signature: {
                          id: $data.toolUsage.signature.id,
                          name: $data.toolUsage.signature.name,
                          arguments: {},
                          isError: $data.toolUsage.signature.isError
                        },
                        permission: $data.toolUsage.permission,
                        isOutsideWorkspace: $data.toolUsage.isOutsideWorkspace
                      }
                    }
                  else {} end)
              )
            }
        ]
      }
  ]
}
