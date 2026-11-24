/**
 * Fill the LOCAL development database with the same FICTITIOUS demo data the web prototype
 * uses (apps/web/src/mocks/seed.ts), so the real API can be explored with realistic data.
 *
 *   npm run db:seed
 *
 * Refuses to run against anything but a loopback database, or in production. Accounts get
 * one random password, written only to .local-db/dev-accounts.txt (git-ignored).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { hashPassword } from '../src/auth/passwords.js'
import { loadConfig } from '../src/config/env.js'
import { createPool } from '../src/db/pool.js'
import { execute, insertedId, selectOne, withTransaction } from '../src/db/tx.js'
import { temporaryPassword } from '../src/lib/crypto.js'
import { createMockDb } from '../../web/src/mocks/seed.js'

if (existsSync('.env')) process.loadEnvFile('.env')
const config = loadConfig(process.env)
if (!config.db || !['127.0.0.1', 'localhost', '::1'].includes(config.db.host)) {
  console.error('[seed] Refusing: only a LOCAL database may be seeded.')
  process.exit(1)
}
if (config.nodeEnv === 'production') {
  console.error('[seed] Refusing: NODE_ENV=production.')
  process.exit(1)
}

const mock = createMockDb()
const pool = createPool(config.db)

try {
  if (await selectOne(pool, 'SELECT 1 FROM projects WHERE project_code = ?', ['DEMO-KARIR'])) {
    console.log('[seed] Demo data already present; nothing to do.')
    process.exit(0)
  }

  const password = temporaryPassword()
  const passwordHash = await hashPassword(password)
  const accounts: string[] = []

  await withTransaction(pool, async (conn) => {
    const userIds = new Map<string, string>()
    for (const user of mock.users) {
      const result = await execute(
        conn,
        "INSERT INTO users (display_name, email, password_hash, auth_provider) VALUES (?, ?, ?, 'LOCAL')",
        [user.display_name, user.email, passwordHash],
      )
      userIds.set(user.id, insertedId(result))
      accounts.push(user.email)
    }
    const superAdmin = await execute(
      conn,
      "INSERT INTO users (display_name, email, password_hash, auth_provider) VALUES ('Demo Super Admin', 'superadmin@demo.invalid', ?, 'LOCAL')",
      [passwordHash],
    )
    await execute(
      conn,
      "INSERT INTO user_system_roles (user_id, role_code) VALUES (?, 'SUPER_ADMIN')",
      [insertedId(superAdmin)],
    )
    accounts.unshift('superadmin@demo.invalid (Super Admin)')
    const u = (id: string | null) => (id ? (userIds.get(id) ?? null) : null)

    const projectIds = new Map<string, string>()
    const moduleIds = new Map<string, string>()
    const caseIds = new Map<string, string>()
    const runIds = new Map<string, string>()
    const runCaseIds = new Map<string, string>()
    const executionIds = new Map<string, string>()
    const suiteIds = new Map<string, string>()

    for (const p of mock.projects) {
      const result = await execute(
        conn,
        'INSERT INTO projects (project_code, name, description, created_by) VALUES (?, ?, ?, ?)',
        [p.project_code, p.name, p.description, u('1')],
      )
      projectIds.set(p.id, insertedId(result))
      for (const m of p.members) {
        await execute(
          conn,
          'INSERT INTO project_members (project_id, user_id, role_code) VALUES (?, ?, ?)',
          [projectIds.get(p.id), u(m.userId), m.role],
        )
      }
    }
    // Same as migration 0013 (ADR 0017): project Admins and QA Leads become website Admins.
    await execute(
      conn,
      `INSERT INTO user_system_roles (user_id, role_code)
       SELECT DISTINCT m.user_id, 'ADMIN' FROM project_members m
        WHERE m.role_code IN ('ADMIN', 'QA_LEAD')
          AND NOT EXISTS (SELECT 1 FROM user_system_roles r WHERE r.user_id = m.user_id)`,
    )
    await execute(
      conn,
      "UPDATE project_members SET role_code = 'TESTER' WHERE role_code IN ('ADMIN', 'QA_LEAD')",
    )
    for (const m of mock.modules) {
      const result = await execute(
        conn,
        'INSERT INTO modules (project_id, module_code, name) VALUES (?, ?, ?)',
        [projectIds.get(m.projectId), m.module_code, m.name],
      )
      moduleIds.set(m.id, insertedId(result))
    }
    for (const c of mock.cases) {
      const suiteKey = `${c.projectId}:${c.suiteName}`
      if (!suiteIds.has(suiteKey)) {
        const suite = await execute(
          conn,
          'INSERT INTO test_suites (project_id, module_id, name, reference_document, created_by) VALUES (?, ?, ?, ?, ?)',
          [
            projectIds.get(c.projectId),
            moduleIds.get(c.moduleId),
            c.suiteName,
            `FSD ${c.suiteName} (fiktif)`,
            u('2'),
          ],
        )
        suiteIds.set(suiteKey, insertedId(suite))
      }
      const result = await execute(
        conn,
        `INSERT INTO test_cases
           (project_id, module_id, suite_id, case_code, category, title, requirement_refs,
            priority_code, test_type_code, actor_label, preconditions, test_steps_text,
            expected_result, case_status, current_version, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectIds.get(c.projectId),
          moduleIds.get(c.moduleId),
          suiteIds.get(suiteKey),
          c.case_code,
          c.category,
          c.title,
          c.requirement_refs,
          c.priority_code,
          c.test_type_code,
          c.actor_label,
          c.preconditions,
          c.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
          c.expected_result,
          c.case_status,
          c.current_version,
          u(c.createdBy),
          u(c.updatedBy),
          new Date(c.created_at),
          new Date(c.updated_at),
        ],
      )
      const caseId = insertedId(result)
      caseIds.set(c.id, caseId)
      const revisions =
        c.revisions.length > 0
          ? c.revisions
          : [
              {
                revision_number: 1,
                changedBy: c.createdBy,
                change_reason: 'Created',
                changed_at: c.created_at,
              },
            ]
      for (const r of revisions) {
        await execute(
          conn,
          `INSERT INTO test_case_revisions (test_case_id, revision_number, snapshot_json, changed_by, change_reason, changed_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            caseId,
            r.revision_number,
            JSON.stringify({ case_code: c.case_code, title: c.title, version: r.revision_number }),
            u(r.changedBy),
            r.change_reason,
            new Date(r.changed_at),
          ],
        )
      }
    }
    const cycleIds = new Map<string, string>()
    for (const cy of mock.cycles) {
      const result = await execute(
        conn,
        "INSERT INTO test_cycles (project_id, cycle_code, title, status_code) VALUES (?, ?, ?, 'ACTIVE')",
        [projectIds.get(cy.projectId), cy.cycle_code, cy.title],
      )
      cycleIds.set(cy.id, insertedId(result))
    }
    for (const r of mock.runs) {
      const result = await execute(
        conn,
        `INSERT INTO test_runs (project_id, cycle_id, run_code, name, environment_name, build_version,
                                environment_url, status_code, starts_at, ends_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectIds.get(r.projectId),
          cycleIds.get(r.cycleId),
          r.run_code,
          r.name,
          r.environment_name,
          r.build_version,
          r.environment_url,
          r.status_code,
          r.starts_at ? new Date(r.starts_at) : null,
          r.ends_at ? new Date(r.ends_at) : null,
          u('2'),
        ],
      )
      runIds.set(r.id, insertedId(result))
    }
    for (const rc of mock.runCases) {
      const c = mock.cases.find((x) => x.id === rc.caseId)
      const result = await execute(
        conn,
        `INSERT INTO test_run_cases (test_run_id, test_case_id, assigned_to, case_version, case_snapshot_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          runIds.get(rc.runId),
          caseIds.get(rc.caseId),
          u(rc.assignedTo),
          rc.case_version,
          JSON.stringify({
            case_code: c?.case_code,
            title: c?.title,
            expected_result: c?.expected_result,
          }),
          rc.sort_order,
        ],
      )
      runCaseIds.set(rc.id, insertedId(result))
    }
    for (const e of mock.executions) {
      const result = await execute(
        conn,
        `INSERT INTO test_executions (run_case_id, attempt_number, execution_kind, result_status, actual_result, tester_id, tested_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          runCaseIds.get(e.runCaseId),
          e.attempt_number,
          e.execution_kind,
          e.result_status,
          e.actual_result,
          u(e.testerId),
          new Date(e.tested_at),
        ],
      )
      executionIds.set(e.id, insertedId(result))
    }
    for (const d of mock.defects) {
      const result = await execute(
        conn,
        `INSERT INTO defects (project_id, module_id, bug_code, title, description, steps_to_reproduce,
                              expected_behavior, actual_behavior, severity_code, priority_code, status_code,
                              source_kind, environment_name, build_version, browser_name, reported_by,
                              assigned_to, fixed_in_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectIds.get(d.projectId),
          d.moduleId ? moduleIds.get(d.moduleId) : null,
          d.bug_code,
          d.title.slice(0, 500),
          d.description,
          d.steps_to_reproduce,
          d.expected_behavior,
          d.actual_behavior,
          d.severity_code,
          d.priority_code,
          d.status_code,
          d.source_kind,
          d.environment_name,
          d.build_version,
          d.browser_name,
          u(d.reportedBy),
          u(d.assignedTo),
          d.fixed_in_version,
          new Date(d.created_at),
          new Date(d.updated_at),
        ],
      )
      const defectId = insertedId(result)
      for (const eid of d.executionIds) {
        await execute(
          conn,
          'INSERT INTO defect_execution_links (defect_id, execution_id) VALUES (?, ?)',
          [defectId, executionIds.get(eid)],
        )
      }
      for (const h of d.history) {
        await execute(
          conn,
          'INSERT INTO defect_status_history (defect_id, from_status, to_status, changed_by, change_comment, changed_at) VALUES (?, ?, ?, ?, ?, ?)',
          [defectId, h.from, h.to, u(h.by), h.comment, new Date(h.at)],
        )
      }
      for (const cm of d.comments) {
        await execute(
          conn,
          'INSERT INTO defect_comments (defect_id, author_id, body, created_at) VALUES (?, ?, ?, ?)',
          [defectId, u(cm.authorId), cm.body, new Date(cm.created_at)],
        )
      }
    }

    // The Drive-like structure (ADR 0019), filled the same way migration 0015 fills it:
    // scenarios sit in the Fase of their UAT, a UAT tests the features of its scenarios, and
    // the people who were given scenarios take part in that UAT.
    await execute(
      conn,
      `UPDATE test_cases tc
         JOIN (SELECT rc.test_case_id, MIN(r.cycle_id) AS cycle_id
                 FROM test_run_cases rc JOIN test_runs r ON r.id = rc.test_run_id
                WHERE r.cycle_id IS NOT NULL
                GROUP BY rc.test_case_id) x ON x.test_case_id = tc.id
          SET tc.cycle_id = x.cycle_id
        WHERE tc.cycle_id IS NULL`,
    )
    await execute(
      conn,
      `UPDATE test_cases tc
         JOIN (SELECT project_id, MIN(id) AS cycle_id FROM test_cycles
                GROUP BY project_id HAVING COUNT(*) = 1) one ON one.project_id = tc.project_id
          SET tc.cycle_id = one.cycle_id
        WHERE tc.cycle_id IS NULL`,
    )
    await execute(
      conn,
      `INSERT IGNORE INTO uat_features (run_id, module_id, state_code)
       SELECT DISTINCT rc.test_run_id, tc.module_id, 'OPEN'
         FROM test_run_cases rc JOIN test_cases tc ON tc.id = rc.test_case_id
        WHERE tc.module_id IS NOT NULL`,
    )
    await execute(
      conn,
      "UPDATE project_members SET role_code = 'TESTER' WHERE role_code IN ('DEVELOPER', 'VIEWER')",
    )
    await execute(
      conn,
      `INSERT INTO workshop_table_members (run_id, table_id, sort_order, display_name, user_id)
       SELECT x.run_id, NULL, 0, LEFT(u.display_name, 100), u.id
         FROM (SELECT trc.test_run_id AS run_id, trc.assigned_to AS user_id
                 FROM test_run_cases trc WHERE trc.assigned_to IS NOT NULL
               UNION
               SELECT trc.test_run_id, e.tester_id
                 FROM test_executions e JOIN test_run_cases trc ON trc.id = e.run_case_id
                WHERE e.tester_id IS NOT NULL) x
         JOIN users u ON u.id = x.user_id
         JOIN test_runs r ON r.id = x.run_id
         JOIN project_members pm
           ON pm.project_id = r.project_id AND pm.user_id = u.id AND pm.role_code = 'TESTER'
        WHERE NOT EXISTS (SELECT 1 FROM user_system_roles s WHERE s.user_id = u.id)`,
    )
  })

  const dir = new URL('../../../.local-db/', import.meta.url)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    new URL('dev-accounts.txt', dir),
    [
      'TestBoard LOCAL development accounts (fictitious demo data). Never use these anywhere else.',
      `Password for every account: ${password}`,
      '',
      ...accounts,
      '',
    ].join('\n'),
  )
  console.log(
    `[seed] Inserted ${mock.projects.length} projects, ${mock.cases.length} test cases, ${mock.runs.length} runs, ${mock.defects.length} bugs.`,
  )
  console.log('[seed] Accounts and their local password: .local-db/dev-accounts.txt')
} finally {
  await pool.end()
}
