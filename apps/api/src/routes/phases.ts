import {
  phaseFeatureSchema,
  phaseTransferSchema,
  type CycleStatus,
  type PhaseTransferResult,
  type PhaseDto,
  type PhaseFeatureDto,
  type PhaseTreeDto,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
import {
  execute,
  insertedId,
  isoDate,
  select,
  selectOne,
  withTransaction,
  type Db,
} from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { idParam, parseBody } from '../lib/validation.js'
import { applyCaseUpdate, copyCase } from './test-cases.js'
import type { AppEnv } from '../types.js'

/**
 * The scenario library laid out like Google Drive (ADR 0019): every Fase is a folder, its
 * features are folders inside it, and the scenarios are the files. Scenarios not saved in a
 * Fase yet sit in "Belum masuk fase".
 */
export async function phaseTree(db: Db, projectId: string): Promise<PhaseTreeDto> {
  const [cycles, counts, unsorted, linked, uats] = await Promise.all([
    select<{
      id: string
      cycle_code: string
      title: string
      status_code: CycleStatus
      starts_on: Date | null
      ends_on: Date | null
    }>(
      db,
      `SELECT id, cycle_code, title, status_code, starts_on, ends_on FROM test_cycles
        WHERE project_id = ?
        ORDER BY starts_on IS NULL, starts_on, id`,
      [projectId],
    ),
    select<{
      cycle_id: string | null
      module_id: string
      module_code: string
      name: string
      n: number
      ready: number
    }>(
      db,
      `SELECT tc.cycle_id, m.id AS module_id, m.module_code, m.name,
              COUNT(*) AS n, SUM(tc.case_status = 'READY') AS ready
         FROM test_cases tc JOIN modules m ON m.id = tc.module_id
        WHERE tc.project_id = ? AND tc.case_status <> 'ARCHIVED'
        GROUP BY tc.cycle_id, m.id, m.module_code, m.name`,
      [projectId],
    ),
    select<{ cycle_id: string | null; n: number }>(
      db,
      `SELECT cycle_id, COUNT(*) AS n FROM test_cases
        WHERE project_id = ? AND module_id IS NULL AND case_status <> 'ARCHIVED'
        GROUP BY cycle_id`,
      [projectId],
    ),
    select<{ cycle_id: string; module_id: string; module_code: string; name: string }>(
      db,
      `SELECT wf.cycle_id, m.id AS module_id, m.module_code, m.name
         FROM workshop_features wf
         JOIN test_cycles c ON c.id = wf.cycle_id
         JOIN modules m ON m.id = wf.module_id
        WHERE c.project_id = ?`,
      [projectId],
    ),
    select<{ cycle_id: string | null; n: number }>(
      db,
      'SELECT cycle_id, COUNT(*) AS n FROM test_runs WHERE project_id = ? GROUP BY cycle_id',
      [projectId],
    ),
  ])
  const same = (a: string | null, b: string | null) => (a === null ? b === null : String(a) === b)
  const phase = (
    id: string | null,
    info: Omit<PhaseDto, 'id' | 'scenarios' | 'unsorted' | 'uats' | 'features'>,
  ): PhaseDto => {
    const features = new Map<string, PhaseFeatureDto>()
    for (const row of counts.filter((r) => same(r.cycle_id, id))) {
      features.set(String(row.module_id), {
        module: { id: String(row.module_id), module_code: row.module_code, name: row.name },
        scenarios: Number(row.n),
        ready: Number(row.ready ?? 0),
      })
    }
    // Empty feature folders an Admin created in this Fase.
    for (const row of linked.filter((r) => id !== null && String(r.cycle_id) === id)) {
      if (!features.has(String(row.module_id))) {
        features.set(String(row.module_id), {
          module: { id: String(row.module_id), module_code: row.module_code, name: row.name },
          scenarios: 0,
          ready: 0,
        })
      }
    }
    const list = [...features.values()].sort((a, b) =>
      a.module.name.localeCompare(b.module.name, 'id'),
    )
    const loose = Number(unsorted.find((r) => same(r.cycle_id, id))?.n ?? 0)
    return {
      id,
      ...info,
      scenarios: list.reduce((sum, f) => sum + f.scenarios, 0) + loose,
      unsorted: loose,
      uats: Number(uats.find((r) => same(r.cycle_id, id))?.n ?? 0),
      features: list,
    }
  }
  return {
    phases: cycles.map((c) =>
      phase(String(c.id), {
        cycle_code: c.cycle_code,
        title: c.title,
        status_code: c.status_code,
        starts_on: isoDate(c.starts_on),
        ends_on: isoDate(c.ends_on),
      }),
    ),
    unassigned: phase(null, {
      cycle_code: null,
      title: null,
      status_code: null,
      starts_on: null,
      ends_on: null,
    }),
  }
}

export function phaseRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.get('/', requirePermission('case.read'), async (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json(await phaseTree(pool, c.get('project').id))
  })

  /**
   * Copy or move whole feature folders - every scenario in them - to another Fase, like Salin /
   * Pindahkan in Google Drive (ADR 0020). A copy keeps Ready scenarios Ready; a move keeps the
   * scenarios themselves (archived ones too). Open UATs of the target Fase pick up the Ready
   * scenarios of the features they test; UATs of the old Fase keep what they already have.
   */
  routes.post('/transfer', requirePermission('case.write'), async (c) => {
    const project = c.get('project')
    const input = await parseBody(c, phaseTransferSchema)
    const moduleIds = [...new Set(input.module_ids)]
    const result = await withTransaction(pool, async (conn) => {
      for (const [field, cycleId] of [
        ['from_cycle_id', input.from_cycle_id],
        ['to_cycle_id', input.to_cycle_id],
      ] as const) {
        if (cycleId === null) continue
        const cycle = await selectOne(
          conn,
          'SELECT 1 FROM test_cycles WHERE id = ? AND project_id = ?',
          [cycleId, project.id],
        )
        if (!cycle) {
          throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
            { field, message: 'Cycle not found in this project' },
          ])
        }
      }
      const known = await select<{ id: string; name: string }>(
        conn,
        `SELECT id, name FROM modules WHERE project_id = ? AND id IN (${moduleIds.map(() => '?').join(', ')})`,
        [project.id, ...moduleIds],
      )
      if (known.length !== moduleIds.length) {
        throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
          { field: 'module_ids', message: 'Feature not found in this project' },
        ])
      }
      const out: PhaseTransferResult = { features: moduleIds.length, scenarios: 0 }
      for (const moduleId of moduleIds) {
        const cases = await select<{ id: string; case_status: string }>(
          conn,
          `SELECT id, case_status FROM test_cases
            WHERE project_id = ? AND module_id = ? AND deleted_at IS NULL
              AND ${input.from_cycle_id === null ? 'cycle_id IS NULL' : 'cycle_id = ?'}
            ORDER BY case_code`,
          input.from_cycle_id === null
            ? [project.id, moduleId]
            : [project.id, moduleId, input.from_cycle_id],
        )
        if (cases.length > 2000) {
          throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
            { field: 'module_ids', message: 'Too many scenarios in one feature (max 2000)' },
          ])
        }
        for (const row of cases) {
          if (input.mode === 'copy') {
            if (row.case_status === 'ARCHIVED') continue
            await copyCase(conn, c, String(row.id), {
              cycleId: input.to_cycle_id,
              keepStatus: true,
            })
            out.scenarios += 1
          } else if (row.case_status === 'ARCHIVED') {
            // An archived scenario cannot be edited; it simply goes along with its folder.
            await execute(conn, 'UPDATE test_cases SET cycle_id = ? WHERE id = ?', [
              input.to_cycle_id,
              row.id,
            ])
            out.scenarios += 1
          } else if (
            await applyCaseUpdate(conn, c, String(row.id), { cycle_id: input.to_cycle_id })
          ) {
            out.scenarios += 1
          }
        }
        // The folder itself, even when it is empty.
        if (input.to_cycle_id !== null) {
          await execute(
            conn,
            'INSERT IGNORE INTO workshop_features (cycle_id, module_id, state_code) VALUES (?, ?, ?)',
            [input.to_cycle_id, moduleId, 'OPEN'],
          )
        }
        if (input.mode === 'move' && input.from_cycle_id !== null) {
          await execute(
            conn,
            'DELETE FROM workshop_features WHERE cycle_id = ? AND module_id = ?',
            [input.from_cycle_id, moduleId],
          )
        }
      }
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'module',
        entityId: moduleIds[0]!,
        action: input.mode === 'copy' ? 'COPY' : 'MOVE',
        newValues: {
          features: known.map((m) => m.name),
          from_cycle_id: input.from_cycle_id,
          to_cycle_id: input.to_cycle_id,
          scenarios: out.scenarios,
        },
      })
      return out
    })
    return c.json(result)
  })

  /** A feature folder in a Fase: an existing feature of the project, or a new one. */
  routes.post('/:cycleId/features', requirePermission('module.manage'), async (c) => {
    const project = c.get('project')
    const cycleId = idParam(c, 'cycleId')
    const input = await parseBody(c, phaseFeatureSchema)
    const cycle = await selectOne(
      pool,
      'SELECT 1 FROM test_cycles WHERE id = ? AND project_id = ?',
      [cycleId, project.id],
    )
    if (!cycle) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    await withTransaction(pool, async (conn) => {
      let module = await selectOne<{ id: string }>(
        conn,
        'SELECT id FROM modules WHERE project_id = ? AND module_code = ?',
        [project.id, input.module_code],
      )
      if (!module) {
        if (!input.name) {
          throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
            { field: 'name', message: 'A new feature needs a name' },
          ])
        }
        const result = await execute(
          conn,
          'INSERT INTO modules (project_id, module_code, name) VALUES (?, ?, ?)',
          [project.id, input.module_code, input.name],
        )
        module = { id: insertedId(result) }
        await writeAudit(conn, c, {
          projectId: project.id,
          entityType: 'module',
          entityId: module.id,
          action: 'CREATE',
          newValues: { module_code: input.module_code, name: input.name, cycle_id: cycleId },
        })
      }
      await execute(
        conn,
        'INSERT IGNORE INTO workshop_features (cycle_id, module_id, state_code) VALUES (?, ?, ?)',
        [cycleId, module.id, 'OPEN'],
      )
    })
    return c.json(await phaseTree(pool, project.id), 201)
  })

  return routes
}
