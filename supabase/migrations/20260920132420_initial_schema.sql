create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  type text not null,
  technologies text[] not null default '{}',
  purpose text,
  description text,
  current_state text
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  status text not null default 'TODO',
  priority integer not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint tasks_status_check check (status in ('TODO', 'IN_PROGRESS', 'DONE')),
  constraint tasks_priority_check check (priority > 0),
  constraint tasks_completed_at_check check (
    (status = 'DONE' and completed_at is not null)
    or (status <> 'DONE')
  )
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  type text not null,
  source text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activities_source_check check (source in ('USER', 'BOT', 'GITHUB'))
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  decision text not null,
  reason text,
  consequences text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  constraint decisions_status_check
    check (status in ('ACTIVE', 'SUPERSEDED', 'REVERTED'))
);

create table public.github_repositories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner text not null,
  repository text not null,
  url text not null,
  default_branch text not null default 'main',
  connected_at timestamptz not null default now()
);