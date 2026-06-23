export interface RepairWorkflowNode {
    id: string;
    label: string;
    isTerminal?: boolean;
    allowedNext?: string[];
    allowedFeatures?: string[];
    [key: string]: unknown;
}

export interface RepairWorkflowConfig {
    id: string;
    name: string;
    nodes: RepairWorkflowNode[];
    [key: string]: unknown;
}
