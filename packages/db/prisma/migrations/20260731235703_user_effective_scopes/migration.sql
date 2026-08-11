-- CreateTable
CREATE TABLE "user_effective_scopes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "permission_code" TEXT NOT NULL,
    "scope_type" "scope_type" NOT NULL,
    "scope_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_effective_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_effective_scopes_user_id_permission_code_scope_type_idx" ON "user_effective_scopes"("user_id", "permission_code", "scope_type");

-- CreateIndex
CREATE UNIQUE INDEX "user_effective_scopes_user_id_permission_code_scope_type_sc_key" ON "user_effective_scopes"("user_id", "permission_code", "scope_type", "scope_id");

-- Enable RLS
ALTER TABLE user_effective_scopes ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only select their own rows
CREATE POLICY user_effective_scopes_own ON user_effective_scopes
  FOR SELECT
  USING (user_id = (SELECT id FROM app_users WHERE auth_user_id = auth.uid()));

-- SQL helper functions
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM app_users WHERE auth_user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION has_scope(
  p_permission text,
  p_scope_type scope_type,
  p_scope_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_effective_scopes s
    WHERE s.user_id = current_app_user_id()
      AND s.permission_code = p_permission
      AND s.scope_type = p_scope_type
      AND (p_scope_id IS NULL OR s.scope_id = p_scope_id)
  )
$$;
