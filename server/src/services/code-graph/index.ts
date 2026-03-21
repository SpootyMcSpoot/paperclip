export {
  indexRepository,
  findFunctions,
  findCallers,
  findCallees,
  getDependencies,
  findImpactedFiles,
  isCodeGraphConfigured,
  checkCodeGraphHealth,
} from "./code-graph-client.js";

export type {
  CodeAnalysisRequest,
  FunctionDefinition,
  Dependency,
  CallGraphNode,
  CodeGraphConfig,
} from "./code-graph-client.js";
