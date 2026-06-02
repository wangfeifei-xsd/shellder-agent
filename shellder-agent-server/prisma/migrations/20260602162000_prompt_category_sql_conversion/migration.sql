-- 扩展 PromptCategory 枚举：新增 sql_conversion
ALTER TABLE `prompt_template`
  MODIFY COLUMN `category` ENUM(
    'qa',
    'query',
    'sql_conversion',
    'connector',
    'routing',
    'runtime',
    'common'
  ) NOT NULL;

-- 将 ER 构图相关模板归类到 SQL 转化
UPDATE `prompt_template`
SET `category` = 'sql_conversion'
WHERE `prompt_key` IN (
  'connector.er_diagram.system',
  'connector.er_diagram.refine.system',
  'connector.er_diagram.user'
);
