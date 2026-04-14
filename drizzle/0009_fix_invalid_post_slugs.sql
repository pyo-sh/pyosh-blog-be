UPDATE `post_tb`
SET `slug` = CONCAT('~repair~', `id`, '~', REPLACE(UUID(), '-', ''))
WHERE TRIM(COALESCE(`slug`, '')) = ''
   OR `slug` REGEXP '^-[0-9]+$';--> statement-breakpoint

-- MySQL 제약 (ER_UPDATE_TABLE_USED, 1093): UPDATE 대상 테이블을 같은 문장의 서브쿼리에서 직접 참조할 수 없음.
-- 우회: `post_tb`를 derived table `(SELECT ...)`로 감싸면 MySQL이 materialize된 복사본으로 취급해 허용됨.
UPDATE `post_tb` AS `target`
SET `slug` = (
  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM (SELECT `id`, `slug` FROM `post_tb`) AS `other`
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
WHERE `target`.`slug` REGEXP '^~repair~[0-9]+~';
