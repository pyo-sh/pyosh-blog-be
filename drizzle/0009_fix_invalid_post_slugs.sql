UPDATE `post_tb`
SET `slug` = CONCAT('__repair__', `id`, '__', REPLACE(UUID(), '-', ''))
WHERE TRIM(COALESCE(`slug`, '')) = ''
   OR `slug` REGEXP '^-[0-9]+$';--> statement-breakpoint

UPDATE `post_tb` AS `target`
SET `slug` = (
  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM `post_tb` AS `other`
      WHERE `other`.`slug` = CAST(`target`.`id` AS CHAR)
        AND `other`.`id` <> `target`.`id`
    ) THEN CAST(`target`.`id` AS CHAR)
    ELSE CONCAT(
      CAST(`target`.`id` AS CHAR),
      '-legacy-',
      LOWER(REPLACE(UUID(), '-', ''))
    )
  END
)
WHERE `target`.`slug` REGEXP '^__repair__';
