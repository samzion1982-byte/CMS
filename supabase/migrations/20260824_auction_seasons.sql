-- Auction seasons: auction date, close policy, and carry-forward balances.

CREATE TABLE IF NOT EXISTS public.auction_seasons (
  financial_year     text PRIMARY KEY,
  auction_date       date NOT NULL,
  next_auction_date  date,
  close_cutoff_date  date,
  status             text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'closed')),
  close_policy       text CHECK (close_policy IS NULL OR close_policy IN ('forfeit', 'carry')),
  closed_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.auction_close_balances (
  financial_year  text NOT NULL REFERENCES public.auction_seasons(financial_year) ON DELETE CASCADE,
  member_id       text NOT NULL,
  member_name     text,
  balance         numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (financial_year, member_id)
);

ALTER TABLE public.auction_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_close_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auction_seasons_authenticated_all ON public.auction_seasons;
CREATE POLICY auction_seasons_authenticated_all
  ON public.auction_seasons FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auction_close_balances_authenticated_all ON public.auction_close_balances;
CREATE POLICY auction_close_balances_authenticated_all
  ON public.auction_close_balances FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auction_seasons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auction_close_balances TO authenticated;
