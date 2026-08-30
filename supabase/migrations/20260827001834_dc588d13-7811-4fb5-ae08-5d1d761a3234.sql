CREATE OR REPLACE FUNCTION public.server_token_ok(_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.secure_settings
    WHERE key = 'server_access_token'
      AND length(btrim(value)) >= 20
      AND btrim(value) = btrim(coalesce(_token, ''))
  );
$$;
REVOKE ALL ON FUNCTION public.server_token_ok(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.server_secure_settings(_token text, _keys text[])
RETURNS TABLE (key text, value text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.server_token_ok(_token) THEN
    RAISE EXCEPTION 'invalid server token';
  END IF;
  RETURN QUERY SELECT s.key, s.value FROM public.secure_settings s WHERE s.key = ANY (_keys);
END;
$$;
REVOKE ALL ON FUNCTION public.server_secure_settings(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.server_secure_settings(text, text[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.server_record_pending_subscription(_token text, _user_id uuid, _plan_id text, _amount_paise integer, _order_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.server_token_ok(_token) THEN
    RAISE EXCEPTION 'invalid server token';
  END IF;
  INSERT INTO public.subscriptions (user_id, plan_id, amount_paise, razorpay_order_id, status)
  VALUES (_user_id, _plan_id, _amount_paise, _order_id, 'pending')
  ON CONFLICT (razorpay_order_id) DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.server_record_pending_subscription(text, uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.server_record_pending_subscription(text, uuid, text, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.server_activate_subscription(_token text, _order_id text, _payment_id text, _user_id uuid DEFAULT NULL)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sub public.subscriptions;
  _days integer;
  _now timestamptz := now();
  _expires timestamptz;
BEGIN
  IF NOT public.server_token_ok(_token) THEN
    RAISE EXCEPTION 'invalid server token';
  END IF;

  SELECT * INTO _sub FROM public.subscriptions
  WHERE razorpay_order_id = _order_id AND (_user_id IS NULL OR user_id = _user_id)
  LIMIT 1;

  IF _sub.id IS NULL THEN RETURN NULL; END IF;
  IF _sub.status = 'active' THEN RETURN _sub.expires_at; END IF;

  SELECT duration_days INTO _days FROM public.plans WHERE id = _sub.plan_id;
  _expires := _now + make_interval(days => coalesce(_days, 30));

  UPDATE public.subscriptions
  SET status = 'active',
      razorpay_payment_id = coalesce(_payment_id, razorpay_payment_id),
      starts_at = _now, expires_at = _expires, updated_at = _now
  WHERE id = _sub.id;

  RETURN _expires;
END;
$$;
REVOKE ALL ON FUNCTION public.server_activate_subscription(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.server_activate_subscription(text, text, text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.server_mark_subscription(_token text, _status text, _order_id text DEFAULT NULL, _payment_id text DEFAULT NULL, _expire_now boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _now timestamptz := now();
BEGIN
  IF NOT public.server_token_ok(_token) THEN
    RAISE EXCEPTION 'invalid server token';
  END IF;
  IF _status NOT IN ('pending','failed','cancelled','refunded') THEN
    RAISE EXCEPTION 'unsupported status';
  END IF;
  UPDATE public.subscriptions
  SET status = _status,
      expires_at = CASE WHEN _expire_now THEN _now ELSE expires_at END,
      updated_at = _now
  WHERE (_payment_id IS NOT NULL AND razorpay_payment_id = _payment_id)
     OR (_payment_id IS NULL AND _order_id IS NOT NULL AND razorpay_order_id = _order_id);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.server_mark_subscription(text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.server_mark_subscription(text, text, text, text, boolean) TO anon, authenticated;