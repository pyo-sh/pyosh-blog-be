UPDATE `post_tb`
SET `slug` = CAST(`id` AS CHAR)
WHERE TRIM(COALESCE(`slug`, '')) = ''
   OR `slug` REGEXP '^-[0-9]+$';
