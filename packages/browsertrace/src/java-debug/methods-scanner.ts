import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { listFilesRecursive } from '../utils/fs.js';
import { HarnessError } from '../types/errors.js';
import type { JavaMethodDescriptor } from '../types/java-debug.js';

const execFileAsync = promisify(execFile);

const includedPackageFragments = ['.app.', '.service.', '.domain.', '.manager.', '.adapter.', '.client.', '.repository.', '.job.', '.handler.'];
const excludedPackageFragments = ['.config.', '.dto.', '.vo.', '.po.', '.entity.', '.generated.', '.exception.', '.constant.'];

const shouldIncludeClass = (className: string): boolean =>
  includedPackageFragments.some((fragment) => className.includes(fragment)) &&
  !excludedPackageFragments.some((fragment) => className.includes(fragment));

const shouldIncludeMethod = (methodName: string): boolean =>
  !/^(<init>|<clinit>|get[A-Z].*|set[A-Z].*|is[A-Z].*|toString|hashCode|equals|lambda\$.*|access\$.*)$/.test(methodName);

const toClassName = (classesDir: string, filePath: string): string =>
  path.relative(classesDir, filePath).replace(/\.class$/, '').split(path.sep).join('.');

export class MethodsScanner {
  public async scan(classesDir: string, basePackage?: string): Promise<JavaMethodDescriptor[]> {
    try {
      const files = await listFilesRecursive(classesDir);
      const classFiles = files.filter((filePath) => filePath.endsWith('.class') && !filePath.includes('$'));
      const descriptors: JavaMethodDescriptor[] = [];
      for (const classFile of classFiles) {
        const className = toClassName(classesDir, classFile);
        if (basePackage && !className.startsWith(basePackage)) {
          continue;
        }
        if (!shouldIncludeClass(`.${className}.`)) {
          continue;
        }

        const { stdout } = await execFileAsync('javap', ['-classpath', classesDir, '-p', className]);
        const matches = stdout.matchAll(/(?:public|protected|private).*? ([A-Za-z0-9_$]+)\(.*\);/g);
        for (const match of matches) {
          const methodName = match[1];
          if (!shouldIncludeMethod(methodName)) {
            continue;
          }
          descriptors.push({
            className,
            packageName: className.split('.').slice(0, -1).join('.'),
            methodName
          });
        }
      }

      return descriptors;
    } catch (error) {
      throw new HarnessError('java_methods_scan_failed', error instanceof Error ? error.message : 'Failed to scan classes');
    }
  }
}
