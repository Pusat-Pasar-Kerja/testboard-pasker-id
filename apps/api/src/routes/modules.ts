import { moduleCreateSchema, moduleUpdateSchema, type ModuleDto } from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
import {
  execute,
  insertedId,
  isDuplicateKey,
  select,
  selectOne,
  withTransaction,
  type Db,
} from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { idParam, parseBody } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

async function listModules(db: Db, projectId: string, moduleId?: string): Promise<ModuleDto[]> {
  const rows = await select<{
    id: string
    module_code: string
    name: string
    description: string | null
  }>(
    db,
    `SELECT id, module_code, name, description FROM modules
      WHERE project_id = ? AND (? IS NULL OR id = ?) ORDER BY module_code`,
    [projectId, moduleId ?? null, moduleId ?? null],
  )
  return rows.map((row) => ({ ...row, id: String(row.id) }))
}

export function moduleRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.get('/', requirePermission('project.read'), async (c) =>
    c.json(await listModules(pool, c.get('project').id)),
  )

  routes.post('/', requirePermission('module.manage'), async (c) => {
    const project = c.get('project')
    const input = await parseBody(c, moduleCreateSchema)
    const moduleId = await withTransaction(pool, async (conn) => {
      try {
        const result = await execute(
          conn,
          'INSERT INTO modules (project_id, module_code, name, description) VALUES (?, ?, ?, ?)',
          [project.id, input.module_code, input.name, input.description ?? null],
        )
        const id = insertedId(result)
        await writeAudit(conn, c, {
          projectId: project.id,
          entityType: 'module',
          entityId: id,
          action: 'CREATE',
          newValues: input,
        })
        return id
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new AppError(409, 'CONFLICT', 'Module code already exists in this project.', [
            { field: 'module_code', message: 'Already used' },
          ])
        }
        throw error
      }
    })
    const [created] = await listModules(pool, project.id, moduleId)
    return c.json(created, 201)
  })

  routes.patch('/:moduleId', requirePermission('module.manage'), async (c) => {
    const project = c.get('project')
    const moduleId = idParam(c, 'moduleId')
    const input = await parseBody(c, moduleUpdateSchema)
    await withTransaction(pool, async (conn) => {
      const before = await selectOne(
        conn,
        'SELECT module_code, name, description FROM modules WHERE id = ? AND project_id = ? FOR UPDATE',
        [moduleId, project.id],
      )
      if (!before) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      try {
        await execute(
          conn,
          `UPDATE modules SET module_code = COALESCE(?, module_code), name = COALESCE(?, name),
                  description = IF(?, ?, description)
            WHERE id = ? AND project_id = ?`,
          [
            input.module_code?.toUpperCase() ?? null,
            input.name ?? null,
            input.description !== undefined ? 1 : 0,
            input.description ?? null,
            moduleId,
            project.id,
          ],
        )
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new AppError(409, 'CONFLICT', 'Module code already exists in this project.', [
            { field: 'module_code', message: 'Already used' },
          ])
        }
        throw error
      }
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'module',
        entityId: moduleId,
        action: 'UPDATE',
        oldValues: before,
        newValues: input,
      })
    })
    const [updated] = await listModules(pool, project.id, moduleId)
    return c.json(updated)
  })

  return routes
}
