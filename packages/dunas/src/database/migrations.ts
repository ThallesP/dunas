import type { Database } from "./database.ts"

const migrations = [
  {
    id: "0001_init",
    sql: `
      CREATE TABLE dunas_customer (
        id text PRIMARY KEY,
        name text,
        email text,
        tax_id text,
        phone text,
        metadata jsonb NOT NULL DEFAULT '{}',
        usage_anchor_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE dunas_subscription (
        id text PRIMARY KEY,
        customer_id text NOT NULL REFERENCES dunas_customer(id),
        plan_id text NOT NULL,
        plan_group text NOT NULL,
        status text NOT NULL,
        amount_in_cents integer NOT NULL,
        billing_interval text NOT NULL,
        current_period_start timestamptz,
        current_period_end timestamptz,
        cancel_at_period_end boolean NOT NULL DEFAULT false,
        canceled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX dunas_subscription_customer_idx ON dunas_subscription (customer_id, status);

      CREATE TABLE dunas_charge (
        id text PRIMARY KEY,
        customer_id text NOT NULL REFERENCES dunas_customer(id),
        subscription_id text REFERENCES dunas_subscription(id),
        reason text NOT NULL,
        provider text NOT NULL,
        provider_charge_id text NOT NULL,
        amount_in_cents integer NOT NULL,
        status text NOT NULL,
        br_code text NOT NULL,
        qr_code_image_url text,
        payment_url text,
        period_start timestamptz,
        period_end timestamptz,
        expires_at timestamptz NOT NULL,
        paid_at timestamptz,
        synced_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (provider, provider_charge_id)
      );
      CREATE INDEX dunas_charge_subscription_idx ON dunas_charge (subscription_id, status);

      CREATE TABLE dunas_usage (
        customer_id text NOT NULL REFERENCES dunas_customer(id),
        feature_id text NOT NULL,
        used bigint NOT NULL DEFAULT 0,
        window_start timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (customer_id, feature_id)
      );

      CREATE TABLE dunas_usage_event (
        id text PRIMARY KEY,
        customer_id text NOT NULL REFERENCES dunas_customer(id),
        feature_id text NOT NULL,
        amount bigint NOT NULL,
        idempotency_key text UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      );

    `,
  },
  {
    id: "0002_payment_methods",
    sql: `
      ALTER TABLE dunas_subscription ADD COLUMN method text NOT NULL DEFAULT 'pix';
      ALTER TABLE dunas_subscription ADD COLUMN checkout text NOT NULL DEFAULT 'embedded';
      ALTER TABLE dunas_subscription ADD COLUMN provider text;
      ALTER TABLE dunas_subscription ADD COLUMN provider_subscription_id text;
      CREATE UNIQUE INDEX dunas_subscription_provider_idx
        ON dunas_subscription (provider, provider_subscription_id);

      ALTER TABLE dunas_charge ADD COLUMN method text NOT NULL DEFAULT 'pix';
      ALTER TABLE dunas_charge ADD COLUMN checkout text NOT NULL DEFAULT 'embedded';
      ALTER TABLE dunas_charge ALTER COLUMN br_code DROP NOT NULL
    `,
  },
]

export async function migrate(database: Database) {
  await database.query(`
    CREATE TABLE IF NOT EXISTS dunas_migration (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const applied = await database.query<{ id: string }>("SELECT id FROM dunas_migration")
  const appliedIds = new Set(applied.map(({ id }) => id))
  const pending = migrations.filter(({ id }) => !appliedIds.has(id))

  for (const { id, sql } of pending) {
    await database.transaction(async (tx) => {
      for (const statement of sql
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)) {
        await tx.query(statement)
      }
      await tx.query("INSERT INTO dunas_migration (id) VALUES ($1)", [id])
    })
  }

  return { applied: pending.map(({ id }) => id) }
}
