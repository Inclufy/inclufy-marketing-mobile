-- profiles.watermark_size — visual size of the AMOS watermark chip baked
-- into free-tier publishes. 4 variants:
--   small  = 18% of image width (subtle)
--   medium = 30% (default, balanced)
--   large  = 42% (prominent)
--   xlarge = 55% (brand-forward)
--
-- NULL = use 'medium'. Resolution chain in publish-social mirrors
-- watermark_position: post.engagement.watermark_size → profile.watermark_size → 'medium'.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS watermark_size text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_watermark_size_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_watermark_size_check
      CHECK (watermark_size IS NULL OR watermark_size IN ('small','medium','large','xlarge'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.watermark_size IS
  'Visual size of the AMOS watermark chip. small|medium|large|xlarge. NULL = medium.';
