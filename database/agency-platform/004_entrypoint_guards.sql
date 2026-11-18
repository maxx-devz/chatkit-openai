-- A newly provisioned legacy AOC client receives ownership in its creation
-- transaction. Existing or ambiguous records still require the reviewed backfill.
CREATE FUNCTION agency_platform.adopt_new_aoc_client(actor text, target bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE owning bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.portal_users u
    JOIN public.portal_admins a ON a.user_id=u.id AND a.is_active WHERE u.external_id=actor) THEN
    RAISE EXCEPTION 'Workspace access is unavailable' USING ERRCODE='42501';
  END IF;
  SELECT s.aoc_agency_id INTO owning FROM agency_platform.backfill_state s
    JOIN agency_platform.agencies a ON a.id=s.aoc_agency_id AND a.is_active
    WHERE s.id=1 AND s.active FOR UPDATE OF s;
  IF owning IS NULL OR NOT EXISTS(SELECT 1 FROM public.portal_clients
       WHERE id=target AND created_at>=transaction_timestamp())
     OR EXISTS(SELECT 1 FROM public.portal_clients c WHERE c.id<>target AND NOT EXISTS(
       SELECT 1 FROM agency_platform.client_ownership o WHERE o.client_id=c.id AND o.agency_id=owning))
     OR EXISTS(SELECT 1 FROM agency_platform.client_ownership WHERE client_id=target) THEN
    RAISE EXCEPTION 'Workspace access is unavailable' USING ERRCODE='42501';
  END IF;
  INSERT INTO agency_platform.client_ownership(agency_id,client_id) VALUES(owning,target);
  -- The caller re-saves the new client inside this transaction, letting the
  -- Stage 04 trigger classify its row with the assigned ownership.
END $$;
REVOKE ALL ON FUNCTION agency_platform.adopt_new_aoc_client(text,bigint) FROM PUBLIC;
