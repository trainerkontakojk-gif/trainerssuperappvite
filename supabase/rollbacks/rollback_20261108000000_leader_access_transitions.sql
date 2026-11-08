-- Roll back only after deploying the previous API service implementation.
DROP FUNCTION IF EXISTS public.transition_leader_access(uuid,uuid,text,uuid[],text);
