import path from 'node:path';

export type ArtifactPaths = {
  root: string;
  attachDir: string;
  bundleDir: string;
  shadowDir: string;
  javaDebugDir: string;
  runtimeDir: string;
  correlationDir: string;
};

export const buildArtifactPaths = (root: string): ArtifactPaths => ({
  root,
  attachDir: path.join(root, 'attach'),
  bundleDir: path.join(root, 'bundle'),
  shadowDir: path.join(root, 'shadow'),
  javaDebugDir: path.join(root, 'java-debug'),
  runtimeDir: path.join(root, 'runtime'),
  correlationDir: path.join(root, 'correlation')
});

