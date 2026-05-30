-- 知识库 pathy 代理：租户 wiki 路径绑定
ALTER TABLE `knowledge_base` ADD COLUMN `pathy_wiki_prefix` VARCHAR(256) NULL AFTER `description`;
