export type JavaMethodDescriptor = {
  className: string;
  packageName: string;
  methodName: string;
};

export type JavaDebugProfile = {
  methodsInclude: string;
  agentPropertiesPath: string;
  methodsFilePath: string;
  logbackConfigPath: string;
};

