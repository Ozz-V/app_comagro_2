-- Fix: add primary key to chat_user_metrics so upsert works correctly
-- Without this, the upsert silently fails and no counters or bans are ever saved.

-- 1. Remove any duplicate rows keeping the most recent one (just in case)
DELETE FROM public.chat_user_metrics
WHERE ctid NOT IN (
  SELECT MAX(ctid)
  FROM public.chat_user_metrics
  GROUP BY user_id
);

-- 2. Add primary key on user_id
ALTER TABLE public.chat_user_metrics
  ADD CONSTRAINT chat_user_metrics_pkey PRIMARY KEY (user_id);

-- 3. Set default max_requests to 20 for all existing rows that have NULL or old default of 10
UPDATE public.chat_user_metrics
  SET max_requests = 20
  WHERE max_requests IS NULL OR max_requests = 10;
