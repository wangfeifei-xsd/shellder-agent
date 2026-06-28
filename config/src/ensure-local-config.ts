import { copyFileSync, existsSync } from 'fs';
import { basename } from 'path';

function log(message: string): void {
  console.log(`[shellder-config] ${message}`);
}

/** 本地开发：从提交模板复制 gitignore 配置文件（不存在时才写入） */
export function ensureLocalConfigFiles(paths: {
  envLocal: string;
  envExample: string;
  ymlLocal: string;
  ymlDocker: string;
}): void {
  const { envLocal, envExample, ymlLocal, ymlDocker } = paths;
  const configLabel = (filePath: string) =>
    `config/${basename(filePath)}`;

  if (!existsSync(envLocal) && existsSync(envExample)) {
    copyFileSync(envExample, envLocal);
    log(`created ${configLabel(envLocal)} from ${basename(envExample)}`);
  }

  if (!existsSync(ymlLocal) && existsSync(ymlDocker)) {
    copyFileSync(ymlDocker, ymlLocal);
    log(`created ${configLabel(ymlLocal)} from ${basename(ymlDocker)}`);
  }
}

export function shouldEnsureLocalConfigFiles(): boolean {
  if (process.env.SHELLDER_CONFIG_SOURCE === 'docker') return false;
  if (process.env.NODE_ENV === 'production') return false;
  return true;
}
