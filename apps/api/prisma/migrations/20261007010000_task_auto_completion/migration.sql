-- Task auto-completion for rows saved before the rule existed (shared deriveCompletion, packages/shared/src/task-tree.ts):
-- a task with a table (FIELDS with ≥ 1 row) and / or sub tasks is done exactly when its table is fully filled AND all of
-- its sub tasks are done; a task with neither keeps its stored state. Data only, no schema change.
-- Active proposals (DRAFT / IN_PROGRESS / ON_HOLD) get the full rule. Closed ones (COMPLETED / CANCELLED) only gain the
-- ticks the rule implies and never lose one, so finished history stays; reopening a proposal re-derives (changeStatus).
-- Depth is at most 3, so leaves go first, then level-2 parents, then level-1 parents. A task that becomes done takes its
-- last edit (a parent: or its latest-finished child, whichever is later) as completion time, and that edit's author
-- from the activity log (else the proposal owner) as completer; one that re-opens loses both. A value counts as filled
-- when it has a character JS String.prototype.trim() keeps (the bracket below is exactly trim's set, ASCII escapes only).

-- 1. Leaves with a table: done = every row filled.
WITH last AS (
  -- Latest editor of each task in the activity log (once, not per row).
  SELECT DISTINCT ON (a.entity_id) a.entity_id, a.actor_id
  FROM "activity_logs" a
  WHERE a.entity_type = 'TASK'
  ORDER BY a.entity_id, a.created_at DESC, a.id DESC
),
s AS (
  SELECT t.id, p.status IN ('DRAFT', 'IN_PROGRESS', 'ON_HOLD') AS active, COALESCE(last.actor_id, p.owner_id) AS completer,
         NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.detail_fields) e WHERE COALESCE(e->>'value', '') !~ '[^ \t\n\v\f\r\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]') AS done
  FROM "tasks" t
  JOIN "proposals" p ON p.id = t.proposal_id
  LEFT JOIN last ON last.entity_id = t.id::text
  WHERE t.description_format = 'FIELDS' AND jsonb_array_length(t.detail_fields) > 0
    AND NOT EXISTS (SELECT 1 FROM "tasks" c WHERE c.parent_id = t.id)
)
UPDATE "tasks" t
SET is_done = s.done,
    completed_at = CASE WHEN s.done THEN t.updated_at END,
    completed_by_id = CASE WHEN s.done THEN s.completer END
FROM s
WHERE t.id = s.id AND t.is_done IS DISTINCT FROM s.done AND (s.active OR s.done);

-- 2. Level-2 parents: done = own table filled (if any) AND every child done.
WITH last AS (
  -- Latest editor of each task in the activity log (once, not per row).
  SELECT DISTINCT ON (a.entity_id) a.entity_id, a.actor_id
  FROM "activity_logs" a
  WHERE a.entity_type = 'TASK'
  ORDER BY a.entity_id, a.created_at DESC, a.id DESC
),
lc AS (
  -- Each parent's latest-finished child (children are final: lower levels ran first).
  SELECT DISTINCT ON (c.parent_id) c.parent_id, c.completed_at, c.completed_by_id
  FROM "tasks" c
  WHERE c.parent_id IS NOT NULL AND c.is_done AND c.completed_at IS NOT NULL
  ORDER BY c.parent_id, c.completed_at DESC, c.id DESC
),
s AS (
  SELECT t.id, p.status IN ('DRAFT', 'IN_PROGRESS', 'ON_HOLD') AS active,
         GREATEST(t.updated_at, lc.completed_at) AS finished,
         CASE WHEN lc.completed_at > t.updated_at THEN COALESCE(lc.completed_by_id, last.actor_id, p.owner_id)
              ELSE COALESCE(last.actor_id, p.owner_id) END AS completer,
         (NOT (t.description_format = 'FIELDS' AND jsonb_array_length(t.detail_fields) > 0)
            OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.detail_fields) e WHERE COALESCE(e->>'value', '') !~ '[^ \t\n\v\f\r\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]'))
         AND NOT EXISTS (SELECT 1 FROM "tasks" c WHERE c.parent_id = t.id AND NOT c.is_done) AS done
  FROM "tasks" t
  JOIN "proposals" p ON p.id = t.proposal_id
  LEFT JOIN last ON last.entity_id = t.id::text
  LEFT JOIN lc ON lc.parent_id = t.id
  WHERE t.level = 2 AND EXISTS (SELECT 1 FROM "tasks" c WHERE c.parent_id = t.id)
)
UPDATE "tasks" t
SET is_done = s.done,
    completed_at = CASE WHEN s.done THEN s.finished END,
    completed_by_id = CASE WHEN s.done THEN s.completer END
FROM s
WHERE t.id = s.id AND t.is_done IS DISTINCT FROM s.done AND (s.active OR s.done);

-- 3. Level-1 parents: same rule, over the level-2 results.
WITH last AS (
  -- Latest editor of each task in the activity log (once, not per row).
  SELECT DISTINCT ON (a.entity_id) a.entity_id, a.actor_id
  FROM "activity_logs" a
  WHERE a.entity_type = 'TASK'
  ORDER BY a.entity_id, a.created_at DESC, a.id DESC
),
lc AS (
  -- Each parent's latest-finished child (children are final: lower levels ran first).
  SELECT DISTINCT ON (c.parent_id) c.parent_id, c.completed_at, c.completed_by_id
  FROM "tasks" c
  WHERE c.parent_id IS NOT NULL AND c.is_done AND c.completed_at IS NOT NULL
  ORDER BY c.parent_id, c.completed_at DESC, c.id DESC
),
s AS (
  SELECT t.id, p.status IN ('DRAFT', 'IN_PROGRESS', 'ON_HOLD') AS active,
         GREATEST(t.updated_at, lc.completed_at) AS finished,
         CASE WHEN lc.completed_at > t.updated_at THEN COALESCE(lc.completed_by_id, last.actor_id, p.owner_id)
              ELSE COALESCE(last.actor_id, p.owner_id) END AS completer,
         (NOT (t.description_format = 'FIELDS' AND jsonb_array_length(t.detail_fields) > 0)
            OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.detail_fields) e WHERE COALESCE(e->>'value', '') !~ '[^ \t\n\v\f\r\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]'))
         AND NOT EXISTS (SELECT 1 FROM "tasks" c WHERE c.parent_id = t.id AND NOT c.is_done) AS done
  FROM "tasks" t
  JOIN "proposals" p ON p.id = t.proposal_id
  LEFT JOIN last ON last.entity_id = t.id::text
  LEFT JOIN lc ON lc.parent_id = t.id
  WHERE t.level = 1 AND EXISTS (SELECT 1 FROM "tasks" c WHERE c.parent_id = t.id)
)
UPDATE "tasks" t
SET is_done = s.done,
    completed_at = CASE WHEN s.done THEN s.finished END,
    completed_by_id = CASE WHEN s.done THEN s.completer END
FROM s
WHERE t.id = s.id AND t.is_done IS DISTINCT FROM s.done AND (s.active OR s.done);
