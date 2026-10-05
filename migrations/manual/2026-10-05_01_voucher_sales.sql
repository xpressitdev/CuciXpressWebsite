BEGIN;
CREATE TABLE IF NOT EXISTS voucher_sales (
  id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  sale_date date NOT NULL,
  buyer text NOT NULL CHECK (length(trim(buyer)) > 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents > 0),
  total_cents integer NOT NULL CHECK (total_cents::bigint = quantity::bigint * unit_price_cents),
  branch_id integer REFERENCES branches(id),
  payment_method text NOT NULL DEFAULT 'unspecified'
    CHECK (payment_method IN ('unspecified','cash','bank_transfer','card','qr_code')),
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','void')),
  void_reason text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'void' OR length(trim(void_reason)) > 0)
);
CREATE INDEX IF NOT EXISTS voucher_sales_date_branch_idx ON voucher_sales(sale_date,branch_id) WHERE status='active';
COMMIT;
