(
  [.tasks[] | select(.task.parentId == null)]
  | first
) as $mainTask
| ([
    $mainTask.messages[]
    | select(.role == "user" and (.data.availableTools? != null))
    | .data.availableTools
  ] | first) as $availableTools
| {
    modeId: $mainTask.task.env.modeId,
    toolDefinitions: $mainTask.task.costs.contextWindowBreakdown.breakdown.toolDefinitions,
    toolSystemPrompts: $mainTask.task.costs.contextWindowBreakdown.breakdown.toolSystemPrompts,
    skills: $mainTask.task.costs.contextWindowBreakdown.breakdown.skills,
    projectRules: $mainTask.task.costs.contextWindowBreakdown.breakdown.projectRules,
    total: $mainTask.task.costs.contextWindowBreakdown.total,
    availableTools: (
      if $availableTools == null then null else ($availableTools | length) end
    ),
    cost: $mainTask.task.costs.cost,
    loadedSkills: ($mainTask.task.costs.contextWindowBreakdown.loadedSkills // [])
  }
