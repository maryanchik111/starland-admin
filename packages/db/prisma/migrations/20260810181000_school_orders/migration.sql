-- Director-level gap review (2026-08-10-staff-and-status-model.md, Task 2):
-- a single registry for every order (наказ) a Ukrainian school issues to
-- formalize enrollment/exclusion/graduation/hiring/dismissal/leave/award
-- decisions. Enrollment and employee status changes reference this table
-- instead of duplicating number/date fields on each entity.

-- CreateTable
CREATE TABLE "school_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" TEXT NOT NULL,
    "issued_on" DATE NOT NULL,
    "kind" "order_kind" NOT NULL,
    "title" TEXT NOT NULL,
    "file_path" TEXT,
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "school_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_orders_kind_issued_on_idx" ON "school_orders"("kind", "issued_on");

-- RLS: enable on every new table in the same migration that creates it.
alter table school_orders enable row level security;

-- Same audience as staff/student records already covered by staff.read /
-- students.read — orders are the paper trail behind those decisions, not a
-- separately scoped domain.
create policy school_orders_read on school_orders
  for select using (has_scope('staff.read', 'global') or has_scope('students.read', 'global'));

-- Private bucket for scanned orders, same rule as people-photos (§4.15):
-- path in the DB, signed URL at read time, never a public link.
insert into storage.buckets (id, name, public)
values ('school-documents', 'school-documents', false)
on conflict (id) do nothing;
