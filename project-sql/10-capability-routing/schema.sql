USE `agent_platform`;

CREATE TABLE IF NOT EXISTS `agent_platform`.`capability` (
  `id`                      CHAR(36)     NOT NULL COMMENT '主键',
  `tenant_id`               CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
  `type`                    ENUM('qa', 'query', 'action', 'workflow') NOT NULL
                            COMMENT '能力类型：问答型/查询型/操作型/流程型',
  `name`                    VARCHAR(128) NOT NULL COMMENT '能力名称（租户内唯一）',
  `description`             VARCHAR(512) NULL COMMENT '能力描述',
  `applicable_system`       VARCHAR(256) NULL COMMENT '适用系统/业务场景',
  `dependent_tools`         JSON         NULL COMMENT '依赖的工具 ID 列表（string[]）',
  `permission_requirements` JSON         NULL COMMENT '权限要求（permissionScope 列表，string[]）',
  `priority`                INTEGER      NOT NULL DEFAULT 100 COMMENT '路由优先级，数值越小越优先',
  `status`                  ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用/停用',
  `created_at`              DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at`              DATETIME(3)  NOT NULL COMMENT '更新时间',

  UNIQUE INDEX `capability_tenant_id_name_key` (`tenant_id`, `name`),
  INDEX `capability_tenant_id_idx` (`tenant_id`),
  INDEX `capability_type_idx` (`type`),
  INDEX `capability_status_idx` (`status`),
  INDEX `capability_tenant_id_type_status_idx` (`tenant_id`, `type`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='能力目录';

CREATE TABLE IF NOT EXISTS `agent_platform`.`routing_rule` (
  `id`                CHAR(36)     NOT NULL COMMENT '主键',
  `tenant_id`         CHAR(36)     NOT NULL COMMENT '所属租户，→ tenant.id',
  `capability_id`     CHAR(36)     NOT NULL COMMENT '关联能力，→ capability.id',
  `name`              VARCHAR(128) NOT NULL COMMENT '规则名称',
  `description`       VARCHAR(512) NULL COMMENT '规则说明',
  `conditions`        JSON         NOT NULL COMMENT '匹配条件 DSL（JSON）：keywords/patterns/intents',
  `tool_ids`          JSON         NULL COMMENT '命中时可调用的工具 ID 列表（string[]）',
  `priority`          INTEGER      NOT NULL DEFAULT 100 COMMENT '同能力内优先级，数值越小越优先',
  `need_confirmation` BOOLEAN      NOT NULL DEFAULT false COMMENT '是否需人工确认（路由级）',
  `status`            ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled' COMMENT '启用/停用',
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at`        DATETIME(3)  NOT NULL COMMENT '更新时间',

  INDEX `routing_rule_tenant_id_idx` (`tenant_id`),
  INDEX `routing_rule_capability_id_idx` (`capability_id`),
  INDEX `routing_rule_tenant_id_status_priority_idx` (`tenant_id`, `status`, `priority`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='能力路由规则';

ALTER TABLE `agent_platform`.`capability` ADD CONSTRAINT `capability_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `agent_platform`.`routing_rule` ADD CONSTRAINT `routing_rule_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `agent_platform`.`tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `agent_platform`.`routing_rule` ADD CONSTRAINT `routing_rule_capability_id_fkey`
    FOREIGN KEY (`capability_id`) REFERENCES `agent_platform`.`capability`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
